from datetime import datetime, timezone

from facsimile.live_data import (
    LiveProfile,
    LiveScanRequest,
    LiveScanResponse,
    LiveScanRow,
)
from facsimile.models import BreakoutCandidate, CandidateState
from facsimile.watchlists import WatchlistCreate, WatchlistStore


def _response(state: CandidateState) -> LiveScanResponse:
    candidate = BreakoutCandidate(
        symbol="TEST",
        as_of=datetime(2026, 10, 2, tzinfo=timezone.utc),
        state=state,
    )
    row = LiveScanRow(
        profile=LiveProfile(
            symbol="TEST",
            company="Test Therapeutics",
            price=1.25,
            sector="Healthcare",
        ),
        candidate=candidate,
        catalyst_score=0,
        data_sources=["test"],
    )
    return LiveScanResponse(
        generated_at=datetime.now(timezone.utc),
        query=LiveScanRequest(),
        discovered_count=1,
        scanned_count=1,
        rows=[row],
        providers=[],
        warnings=[],
    )


class FakeService:
    def __init__(self) -> None:
        self.responses = [
            _response(CandidateState.DEVELOPING),
            _response(CandidateState.CONFIRMED),
        ]

    def scan_weekly_breakout(self, request):
        return self.responses.pop(0)


def test_watchlist_refresh_records_new_match_and_state_change(tmp_path):
    store = WatchlistStore(tmp_path / "watchlists.json")
    watchlist = store.create(
        WatchlistCreate(
            name="Medical Watch",
            scan_request=LiveScanRequest(),
        )
    )
    service = FakeService()

    first = store.refresh(watchlist.id, service)
    assert [event.kind for event in first.new_events] == ["new_match"]
    assert first.watchlist.snapshots[0].state == "developing"

    second = store.refresh(watchlist.id, service)
    assert "state_changed" in [
        event.kind for event in second.new_events
    ]
    assert second.watchlist.snapshots[0].state == "confirmed"

    reloaded = WatchlistStore(tmp_path / "watchlists.json").list()
    assert len(reloaded) == 1
    assert reloaded[0].events[0].kind == "state_changed"
