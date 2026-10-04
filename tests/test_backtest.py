from datetime import datetime, timedelta, timezone

import pytest

from facsimile.backtest import BacktestRequest, _strategy_coverage, run_backtest
from facsimile.models import OHLCVBar
from facsimile.strategy import (
    FilterOperator,
    LogicMode,
    StrategyCondition,
    StrategyDefinition,
    StrategyGroup,
)


def _bars(step: float = 0.005) -> list[OHLCVBar]:
    start = datetime(2024, 1, 5, tzinfo=timezone.utc)
    close = 1.0
    rows = []
    for index in range(90):
        prior = close
        close = prior * (1 + step)
        if index in {55, 72}:
            close = prior * 1.06
        open_ = prior * 1.002
        high = max(open_, close) * 1.004
        low = min(open_, close) * 0.992
        rows.append(
            OHLCVBar(
                timestamp=start + timedelta(days=index * 7),
                open=open_,
                high=high,
                low=low,
                close=close,
                volume=2_000_000 if index not in {55, 72} else 4_000_000,
            )
        )
    return rows


def test_backtest_reports_unsupported_point_in_time_fields():
    strategy = StrategyDefinition(
        name="mixed",
        all_of=StrategyGroup(
            mode=LogicMode.ALL,
            conditions=[
                StrategyCondition(
                    field="scores.technical",
                    operator=FilterOperator.GTE,
                    value=70,
                ),
                StrategyCondition(
                    field="catalyst_score",
                    operator=FilterOperator.GTE,
                    value=70,
                ),
            ],
        ),
    )

    reduced, coverage = _strategy_coverage(strategy)

    assert reduced is not None
    assert coverage.full_coverage is False
    assert coverage.omitted_fields == ["catalyst_score"]
    assert [
        condition.field
        for condition in reduced.all_of.conditions
    ] == ["scores.technical"]


def test_backtest_can_require_full_coverage():
    strategy = StrategyDefinition(
        name="catalyst-only",
        all_of=StrategyGroup(
            mode=LogicMode.ALL,
            conditions=[
                StrategyCondition(
                    field="catalyst_score",
                    operator=FilterOperator.GTE,
                    value=70,
                )
            ],
        ),
    )

    with pytest.raises(ValueError, match="catalyst_score"):
        run_backtest(
            BacktestRequest(
                symbols=["TEST"],
                strategy=strategy,
                require_full_strategy_coverage=True,
            ),
            lambda symbol: _bars(),
            _bars(step=0.003),
        )


def test_backtest_produces_forward_excursion_statistics():
    result = run_backtest(
        BacktestRequest(
            symbols=["TEST"],
            lookback_weeks=80,
            forward_weeks=4,
            cooldown_weeks=4,
        ),
        lambda symbol: _bars(),
        _bars(step=0.003),
    )

    assert result.stats.signals >= 1
    assert result.events
    assert result.stats.best_return_pct >= result.stats.worst_return_pct
    assert all(
        event.max_favorable_excursion_pct
        >= event.max_adverse_excursion_pct
        for event in result.events
    )
