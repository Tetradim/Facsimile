from datetime import datetime, timedelta, timezone

from facsimile.models import OHLCVBar
from facsimile.position_manager import (
    ManagedPosition,
    PositionState,
    WeeklyPositionManager,
)


def _bearish_bars() -> list[OHLCVBar]:
    start = datetime(2025, 1, 3, tzinfo=timezone.utc)
    closes = [80 + index * 1.4 for index in range(34)]
    closes.extend([126, 124, 121, 117, 113, 109])
    rows = []
    previous = closes[0]
    for index, close in enumerate(closes):
        open_ = previous
        high = max(open_, close) * 1.01
        low = min(open_, close) * 0.985
        rows.append(
            OHLCVBar(
                timestamp=start + timedelta(days=index * 7),
                open=open_,
                high=high,
                low=low,
                close=close,
                volume=1_000_000,
            )
        )
        previous = close
    return rows


def test_confirmed_bearish_macd_can_only_tighten_stop():
    position = ManagedPosition(
        symbol="TEST",
        opened_at=datetime(2025, 1, 3, tzinfo=timezone.utc),
        entry_price=100,
        initial_stop=80,
        current_stop=80,
        bearish_macd_weeks=1,
    )

    update = WeeklyPositionManager().evaluate(
        position,
        _bearish_bars(),
    )

    assert update.position.current_stop >= position.current_stop
    assert update.position.state in {
        PositionState.MACD_BEARISH_CONFIRMED,
        PositionState.TIGHTENED,
    }
    if update.stop_changed:
        assert update.position.current_stop > position.current_stop


def test_stop_hit_is_processed_before_new_ratchet():
    bars = _bearish_bars()
    last = bars[-1]
    bars[-1] = last.model_copy(
        update={"low": 84.0}
    )
    position = ManagedPosition(
        symbol="TEST",
        opened_at=datetime(2025, 1, 3, tzinfo=timezone.utc),
        entry_price=100,
        initial_stop=85,
        current_stop=85,
    )

    update = WeeklyPositionManager().evaluate(position, bars)

    assert update.position.state == PositionState.STOP_HIT
    assert update.stop_changed is False
    assert update.stop_hit_price is not None
