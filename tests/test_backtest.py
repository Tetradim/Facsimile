from datetime import datetime, timedelta, timezone

from facsimile.backtest import BacktestProfile, BacktestRequest, run_backtest
from facsimile.models import (
    BreakoutCandidate,
    CandidateState,
    ConsolidationBox,
    OHLCVBar,
    ScoreCard,
)


def _bars() -> list[OHLCVBar]:
    start = datetime(2025, 1, 3, tzinfo=timezone.utc)
    rows: list[OHLCVBar] = []
    for index in range(42):
        open_ = 10 + index * 0.1
        rows.append(
            OHLCVBar(
                timestamp=start + timedelta(days=7 * index),
                open=open_,
                high=open_ + 0.8,
                low=open_ - 0.5,
                close=open_ + 0.3,
                volume=1_000_000,
            )
        )
    return rows


def _candidate(history: list[OHLCVBar]) -> BreakoutCandidate:
    current = history[-1]
    if len(history) != 35:
        return BreakoutCandidate(
            symbol="TEST",
            as_of=current.timestamp,
            state=CandidateState.REJECTED,
            reasons=["not signal week"],
        )
    return BreakoutCandidate(
        symbol="TEST",
        as_of=current.timestamp,
        state=CandidateState.CONFIRMED,
        box=ConsolidationBox(
            start=history[-8].timestamp,
            end=history[-2].timestamp,
            bars=7,
            body_low=current.close - 1.0,
            body_high=current.close - 0.2,
            width_pct=0.06,
        ),
        entry_price=current.close,
        structural_stop=current.close - 0.4,
        stop_risk_pct=0.03,
        scores=ScoreCard(
            quality=70,
            growth=70,
            momentum=90,
            breakout=90,
            risk=90,
            positional=82,
            entry=90,
            overall=86,
        ),
        metrics={
            "ma_value": current.close - 2,
            "macd": 1.0,
            "macd_signal": 0.5,
            "prior_high": current.close - 0.1,
            "volume_vs_average": 2.0,
            "close_above_box_pct": 0.03,
            "close_location": 0.90,
            "upper_wick_ratio": 0.10,
            "natr_14": 0.05,
        },
    )


def test_backtest_enters_next_week_open(monkeypatch):
    bars = _bars()

    def fake_evaluate(self, symbol, history, fundamentals=None):
        return _candidate(list(history))

    monkeypatch.setattr(
        "facsimile.backtest.WeeklyBreakoutEngine.evaluate",
        fake_evaluate,
    )

    result = run_backtest(
        BacktestRequest(
            profile=BacktestProfile(symbol="TEST"),
            weekly_bars=bars,
            max_holding_weeks=2,
            slippage_pct=0,
        )
    )

    assert result.trades_count == 1
    trade = result.trades[0]
    signal_index = 34
    entry_index = 35
    assert trade.signal_time == bars[signal_index].timestamp
    assert trade.entry_time == bars[entry_index].timestamp
    assert trade.entry_price == bars[entry_index].open
    assert trade.entry_time > trade.signal_time
