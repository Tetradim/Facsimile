from datetime import datetime, timedelta, timezone

from facsimile.breakout import WeeklyBreakoutEngine
from facsimile.models import (
    BreakoutConfig,
    CandidateState,
    OHLCVBar,
    VolumeMode,
)


def make_bar(
    i: int,
    open_: float,
    high: float,
    low: float,
    close: float,
    volume: float = 1_000_000,
) -> OHLCVBar:
    return OHLCVBar(
        timestamp=(
            datetime(2025, 1, 3, tzinfo=timezone.utc)
            + timedelta(days=i * 7)
        ),
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )


def history_with_breakout() -> list[OHLCVBar]:
    bars: list[OHLCVBar] = []
    price = 70.0

    for i in range(34):
        close = price + i * 0.9
        bars.append(
            make_bar(
                i,
                close - 0.6,
                close + 1.4,
                close - 1.4,
                close,
                900_000 + i * 2_000,
            )
        )

    base = 101.0
    for j in range(8):
        i = len(bars)
        close = base + (0.5 if j % 2 else -0.3)
        bars.append(
            make_bar(
                i,
                close - 0.4,
                104.0,
                98.5,
                close,
                1_000_000,
            )
        )

    i = len(bars)
    bars.append(
        make_bar(
            i,
            103.0,
            111.5,
            102.5,
            110.5,
            1_700_000,
        )
    )
    return bars


def test_confirms_clean_weekly_breakout() -> None:
    config = BreakoutConfig(
        min_box_bars=6,
        max_box_bars=8,
        max_box_width_pct=0.08,
        min_weekly_gain_pct=0.02,
        min_close_above_box_pct=0.01,
        volume_mode=VolumeMode.HARD_GATE,
        min_volume_ratio=1.2,
    )
    result = WeeklyBreakoutEngine(config).evaluate(
        "TEST",
        history_with_breakout(),
    )

    assert result.state == CandidateState.CONFIRMED
    assert result.box is not None
    assert result.box.bars >= 6
    assert result.structural_stop is not None
    assert (
        result.stop_risk_pct is not None
        and result.stop_risk_pct < 0.20
    )
    assert (
        result.scores is not None
        and result.scores.breakout > 50
    )
    assert all(gate.passed for gate in result.gates)


def test_rejects_failed_close_above_resistance() -> None:
    bars = history_with_breakout()
    last = bars[-1]
    bars[-1] = last.model_copy(
        update={"close": 102.0, "high": 104.5}
    )

    config = BreakoutConfig(
        min_box_bars=6,
        max_box_bars=8,
        max_box_width_pct=0.08,
    )
    result = WeeklyBreakoutEngine(config).evaluate(
        "TEST",
        bars,
    )

    assert result.state != CandidateState.CONFIRMED
    assert any(
        gate.name == "close_above_box" and not gate.passed
        for gate in result.gates
    )
