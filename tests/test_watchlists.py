from datetime import datetime, timezone

from facsimile.live_data import LiveScanRequest
from facsimile.watchlists import (
    WatchlistCreate,
    WatchlistSnapshot,
    WatchlistStore,
    _change_events,
)


def _snapshot(
    *,
    state: str = "developing",
    tier: str = "W1",
    overall: float = 82,
    strategy_match: bool | None = True,
) -> WatchlistSnapshot:
    return WatchlistSnapshot(
        symbol="TEST",
        state=state,
        tier=tier,
        overall=overall,
        catalyst=70,
        price=1.25,
        strategy_match=strategy_match,
        as_of=datetime(2026, 10, 2, tzinfo=timezone.utc),
    )


def test_watchlist_store_round_trip(tmp_path):
    store = WatchlistStore(tmp_path / "watchlists.sqlite3")
    created = store.create(
        WatchlistCreate(
            name="Medical movers",
            scan_request=LiveScanRequest(
                min_price=0.1,
                max_price=2.5,
                sector="Medical",
            ),
        )
    )

    rows = store.list()

    assert len(rows) == 1
    assert rows[0].id == created.id
    assert rows[0].scan_request.max_price == 2.5

    store.delete(created.id)
    assert store.list() == []


def test_watchlist_emits_state_tier_strategy_and_score_events():
    previous = _snapshot(
        state="developing",
        tier="W2",
        overall=68,
        strategy_match=False,
    )
    current = _snapshot(
        state="confirmed",
        tier="A",
        overall=88,
        strategy_match=True,
    )

    events = _change_events(previous, current)
    event_types = {event["event_type"] for event in events}

    assert "state_change" in event_types
    assert "tier_change" in event_types
    assert "strategy_match_change" in event_types
    assert "score_move" in event_types
    assert "confirmed_breakout" in event_types


def test_new_rejected_nonmatch_does_not_create_noise():
    events = _change_events(
        None,
        _snapshot(
            state="rejected",
            tier="X",
            overall=30,
            strategy_match=False,
        ),
    )

    assert events == []
