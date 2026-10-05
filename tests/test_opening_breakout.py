from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from facsimile.models import CandidateState, OHLCVBar
from facsimile.opening_breakout import (
    OpeningBreakoutConfig,
    OpeningBreakoutEngine,
)


ET = ZoneInfo("America/New_York")


def _bar(minutes: int, open_: float, high: float, low: float, close: float, volume: float) -> OHLCVBar:
    return OHLCVBar(
        timestamp=datetime(2026, 10, 2, 9, 30, tzinfo=ET) + timedelta(minutes=minutes),
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )


def test_opening_breakout_confirms_clean_breakout():
    bars = [
        _bar(0, 10.00, 10.12, 9.96, 10.08, 100_000),
        _bar(5, 10.08, 10.18, 10.03, 10.15, 110_000),
        _bar(10, 10.15, 10.20, 10.10, 10.18, 115_000),
        _bar(15, 10.19, 10.50, 10.18, 10.46, 320_000),
    ]
    prior = [
        OHLCVBar(
            timestamp=datetime(2026, 10, 1, 9, 45, tzinfo=ET),
            open=9.8,
            high=9.9,
            low=9.7,
            close=9.85,
            volume=140_000,
        )
    ]

    result = OpeningBreakoutEngine().evaluate("TEST", bars, prior)

    assert result.state == CandidateState.CONFIRMED
    assert result.entry_price == 10.46
    assert result.opening_range is not None
    assert result.opening_range.high == 10.20
    assert result.relative_volume is not None
    assert result.relative_volume > 1.5
    assert result.vwap is not None
    assert result.scores is not None
    assert result.scores.overall > 50


def test_opening_breakout_rejects_weak_volume_when_required():
    bars = [
        _bar(0, 10.00, 10.12, 9.96, 10.08, 100_000),
        _bar(5, 10.08, 10.18, 10.03, 10.15, 110_000),
        _bar(10, 10.15, 10.20, 10.10, 10.18, 115_000),
        _bar(15, 10.19, 10.50, 10.18, 10.46, 100_000),
    ]
    prior = [
        OHLCVBar(
            timestamp=datetime(2026, 10, 1, 9, 45, tzinfo=ET),
            open=9.8,
            high=9.9,
            low=9.7,
            close=9.85,
            volume=140_000,
        )
    ]

    result = OpeningBreakoutEngine().evaluate("TEST", bars, prior)

    assert result.state == CandidateState.REJECTED
    assert any(reason == "failed gate: relative_volume" for reason in result.reasons)


def test_opening_range_without_post_range_bar_is_developing():
    bars = [
        _bar(0, 10.00, 10.12, 9.96, 10.08, 100_000),
        _bar(5, 10.08, 10.18, 10.03, 10.15, 110_000),
        _bar(10, 10.15, 10.20, 10.10, 10.18, 115_000),
    ]

    result = OpeningBreakoutEngine(
        OpeningBreakoutConfig(opening_range_minutes=15)
    ).evaluate("TEST", bars)

    assert result.state == CandidateState.DEVELOPING
    assert result.opening_range is not None
    assert "no post-range bar yet" in result.reasons[0]
