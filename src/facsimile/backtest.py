from __future__ import annotations

from collections.abc import Callable
from statistics import median

from pydantic import BaseModel, Field

from .breakout import WeeklyBreakoutEngine
from .intelligence import build_candidate_intelligence
from .models import BreakoutConfig, OHLCVBar
from .strategy import (
    LogicMode,
    StrategyDefinition,
    StrategyGroup,
    evaluate_strategy,
)


HISTORICAL_FIELDS = {
    "price",
    "state",
    "stop_risk_pct",
    "box_bars",
    "box_width_pct",
    "close_above_box_pct",
    "close_location",
    "upper_wick_ratio",
    "volume_vs_average",
    "scores.overall",
    "scores.technical",
    "scores.setup",
    "scores.trigger",
    "scores.relative_strength",
    "scores.liquidity",
    "scores.trade_risk",
    "tier",
}


class BacktestRequest(BaseModel):
    symbols: list[str] = Field(min_length=1, max_length=40)
    strategy: StrategyDefinition | None = None
    config: BreakoutConfig | None = None
    lookback_weeks: int = Field(default=156, ge=52, le=520)
    forward_weeks: int = Field(default=4, ge=1, le=26)
    cooldown_weeks: int = Field(default=4, ge=0, le=52)
    include_developing: bool = False
    require_full_strategy_coverage: bool = False


class BacktestCoverage(BaseModel):
    supported_fields: list[str]
    omitted_fields: list[str] = Field(default_factory=list)
    full_coverage: bool


class BacktestEvent(BaseModel):
    symbol: str
    as_of: str
    state: str
    tier: str
    intelligence_score: float
    entry_price: float
    exit_price: float
    forward_return_pct: float
    max_favorable_excursion_pct: float
    max_adverse_excursion_pct: float
    stop_risk_pct: float | None = None


class BacktestStats(BaseModel):
    signals: int
    win_rate_pct: float
    average_return_pct: float
    median_return_pct: float
    best_return_pct: float
    worst_return_pct: float
    average_mfe_pct: float
    average_mae_pct: float


class BacktestResponse(BaseModel):
    request: BacktestRequest
    coverage: BacktestCoverage
    stats: BacktestStats
    events: list[BacktestEvent]
    errors: list[str] = Field(default_factory=list)


def _strategy_coverage(
    strategy: StrategyDefinition | None,
) -> tuple[StrategyDefinition | None, BacktestCoverage]:
    if strategy is None:
        return None, BacktestCoverage(
            supported_fields=sorted(HISTORICAL_FIELDS),
            omitted_fields=[],
            full_coverage=True,
        )

    omitted: set[str] = set()

    def filtered(group: StrategyGroup) -> StrategyGroup:
        conditions = []
        for condition in group.conditions:
            if condition.field in HISTORICAL_FIELDS:
                conditions.append(condition)
            else:
                omitted.add(condition.field)
        return StrategyGroup(mode=group.mode, conditions=conditions)

    reduced = StrategyDefinition(
        name=strategy.name,
        description=strategy.description,
        all_of=filtered(strategy.all_of),
        any_of=filtered(strategy.any_of),
        none_of=filtered(strategy.none_of),
        metadata={
            **strategy.metadata,
            "historical_coverage": "partial" if omitted else "full",
        },
    )
    return reduced, BacktestCoverage(
        supported_fields=sorted(HISTORICAL_FIELDS),
        omitted_fields=sorted(omitted),
        full_coverage=not omitted,
    )


def _facts(candidate, intelligence) -> dict[str, object]:
    return {
        "price": candidate.entry_price,
        "state": candidate.state.value,
        "stop_risk_pct": candidate.stop_risk_pct,
        "box_bars": candidate.box.bars if candidate.box else None,
        "box_width_pct": candidate.box.width_pct if candidate.box else None,
        "close_above_box_pct": candidate.metrics.get("close_above_box_pct"),
        "close_location": candidate.metrics.get("close_location"),
        "upper_wick_ratio": candidate.metrics.get("upper_wick_ratio"),
        "volume_vs_average": candidate.metrics.get("volume_vs_average"),
        "scores": {
            "overall": intelligence.scores.overall,
            "technical": intelligence.scores.technical_health.score,
            "setup": intelligence.scores.setup_quality.score,
            "trigger": intelligence.scores.breakout_trigger.score,
            "relative_strength": intelligence.scores.relative_strength.score,
            "liquidity": intelligence.scores.liquidity.score,
            "trade_risk": intelligence.scores.trade_risk.score,
        },
        "tier": intelligence.tier.value,
    }


def _benchmark_until(
    benchmark: list[OHLCVBar],
    timestamp,
) -> list[OHLCVBar]:
    return [bar for bar in benchmark if bar.timestamp <= timestamp]


def run_backtest(
    request: BacktestRequest,
    bars_for_symbol: Callable[[str], list[OHLCVBar]],
    benchmark_bars: list[OHLCVBar],
) -> BacktestResponse:
    strategy, coverage = _strategy_coverage(request.strategy)
    if (
        request.require_full_strategy_coverage
        and not coverage.full_coverage
    ):
        raise ValueError(
            "Historical data does not cover strategy fields: "
            + ", ".join(coverage.omitted_fields)
        )

    config = request.config or BreakoutConfig()
    engine = WeeklyBreakoutEngine(config)
    events: list[BacktestEvent] = []
    errors: list[str] = []

    for raw_symbol in request.symbols:
        symbol = raw_symbol.strip().upper()
        if not symbol:
            continue
        try:
            bars = bars_for_symbol(symbol)
        except Exception as exc:
            errors.append(f"{symbol}: {exc}")
            continue

        if len(bars) < 40 + request.forward_weeks:
            errors.append(f"{symbol}: insufficient weekly history")
            continue

        bars = bars[-(request.lookback_weeks + 60):]
        next_allowed_index = 0

        for index in range(35, len(bars) - request.forward_weeks):
            if index < next_allowed_index:
                continue

            history = bars[: index + 1]
            candidate = engine.evaluate(symbol, history, None)
            allowed_state = (
                candidate.state.value == "confirmed"
                or (
                    request.include_developing
                    and candidate.state.value == "developing"
                )
            )
            if not allowed_state or candidate.entry_price is None:
                continue

            benchmark_history = _benchmark_until(
                benchmark_bars,
                candidate.as_of,
            )
            intelligence = build_candidate_intelligence(
                candidate,
                history,
                benchmark_history,
                [],
                0,
                None,
            )

            if strategy is not None:
                evaluation = evaluate_strategy(
                    strategy,
                    _facts(candidate, intelligence),
                )
                if not evaluation.passed:
                    continue

            entry = candidate.entry_price
            forward = bars[
                index + 1 : index + request.forward_weeks + 1
            ]
            if not forward:
                continue
            exit_price = forward[-1].close
            forward_return = (exit_price / entry) - 1
            max_high = max(bar.high for bar in forward)
            min_low = min(bar.low for bar in forward)
            mfe = (max_high / entry) - 1
            mae = (min_low / entry) - 1

            events.append(
                BacktestEvent(
                    symbol=symbol,
                    as_of=candidate.as_of.isoformat(),
                    state=candidate.state.value,
                    tier=intelligence.tier.value,
                    intelligence_score=intelligence.scores.overall,
                    entry_price=round(entry, 6),
                    exit_price=round(exit_price, 6),
                    forward_return_pct=round(forward_return * 100, 3),
                    max_favorable_excursion_pct=round(mfe * 100, 3),
                    max_adverse_excursion_pct=round(mae * 100, 3),
                    stop_risk_pct=(
                        round(candidate.stop_risk_pct * 100, 3)
                        if candidate.stop_risk_pct is not None
                        else None
                    ),
                )
            )
            next_allowed_index = index + request.cooldown_weeks + 1

    returns = [event.forward_return_pct for event in events]
    mfes = [event.max_favorable_excursion_pct for event in events]
    maes = [event.max_adverse_excursion_pct for event in events]
    count = len(events)

    stats = BacktestStats(
        signals=count,
        win_rate_pct=(
            round(sum(value > 0 for value in returns) / count * 100, 2)
            if count
            else 0.0
        ),
        average_return_pct=(
            round(sum(returns) / count, 3) if count else 0.0
        ),
        median_return_pct=(
            round(float(median(returns)), 3) if count else 0.0
        ),
        best_return_pct=round(max(returns), 3) if count else 0.0,
        worst_return_pct=round(min(returns), 3) if count else 0.0,
        average_mfe_pct=(
            round(sum(mfes) / count, 3) if count else 0.0
        ),
        average_mae_pct=(
            round(sum(maes) / count, 3) if count else 0.0
        ),
    )

    return BacktestResponse(
        request=request,
        coverage=coverage,
        stats=stats,
        events=sorted(
            events,
            key=lambda item: (item.as_of, item.symbol),
            reverse=True,
        ),
        errors=errors,
    )
