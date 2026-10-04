from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Any

from pydantic import BaseModel, Field

from .breakout import WeeklyBreakoutEngine
from .intelligence import build_candidate_intelligence
from .models import BreakoutConfig, FundamentalSnapshot, OHLCVBar
from .strategy import StrategyDefinition, evaluate_strategy


class BacktestProfile(BaseModel):
    symbol: str
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None


class BacktestRequest(BaseModel):
    profile: BacktestProfile
    weekly_bars: list[OHLCVBar]
    benchmark_bars: list[OHLCVBar] = Field(default_factory=list)
    strategy: StrategyDefinition | None = None
    config: BreakoutConfig | None = None
    fundamentals: FundamentalSnapshot | None = None
    max_holding_weeks: int = Field(default=12, ge=1, le=104)
    initial_equity: float = Field(default=10_000.0, gt=0)
    position_size_pct: float = Field(default=1.0, gt=0, le=1)
    slippage_pct: float = Field(default=0.001, ge=0, le=0.05)


class BacktestMatch(BaseModel):
    signal_time: Any
    symbol: str
    tier: str
    overall: float
    entry_reference: float
    structural_stop: float | None
    strategy_passed: bool
    failed_reasons: list[str] = Field(default_factory=list)


class BacktestTrade(BaseModel):
    symbol: str
    signal_time: Any
    entry_time: Any
    entry_price: float
    stop_price: float | None
    exit_time: Any
    exit_price: float
    exit_reason: str
    return_pct: float
    holding_weeks: int
    tier: str
    overall: float


class EquityPoint(BaseModel):
    timestamp: Any
    equity: float
    drawdown_pct: float


class BacktestResponse(BaseModel):
    schema_version: str = "facsimile.backtest.v1"
    symbol: str
    matches_count: int
    trades_count: int
    wins: int
    losses: int
    win_rate: float
    average_return_pct: float
    median_return_pct: float
    profit_factor: float | None
    max_drawdown_pct: float
    ending_equity: float
    total_return_pct: float
    matches: list[BacktestMatch]
    trades: list[BacktestTrade]
    equity_curve: list[EquityPoint]
    notes: list[str] = Field(default_factory=list)


@dataclass
class _OpenTrade:
    signal_index: int
    entry_index: int
    entry_price: float
    stop_price: float | None
    tier: str
    overall: float


def _facts(
    profile: BacktestProfile,
    candidate: Any,
    intelligence: Any,
) -> dict[str, Any]:
    return {
        "price": candidate.entry_price,
        "sector": profile.sector or "",
        "industry": profile.industry or "",
        "market_cap": profile.market_cap,
        "state": candidate.state.value,
        "catalyst_score": 0,
        "recent_news_count": 0,
        "dilution_risk": intelligence.facts.get("dilution_risk", "low"),
        "stop_risk_pct": candidate.stop_risk_pct,
        "box_bars": candidate.box.bars if candidate.box else None,
        "box_width_pct": candidate.box.width_pct if candidate.box else None,
        "close_above_box_pct": candidate.metrics.get("close_above_box_pct"),
        "close_location": candidate.metrics.get("close_location"),
        "upper_wick_ratio": candidate.metrics.get("upper_wick_ratio"),
        "volume_vs_average": candidate.metrics.get("volume_vs_average"),
        "cash_runway_years": intelligence.facts.get("cash_runway_years"),
        "scores": {
            "overall": intelligence.scores.overall,
            "technical": intelligence.scores.technical_health.score,
            "setup": intelligence.scores.setup_quality.score,
            "trigger": intelligence.scores.breakout_trigger.score,
            "relative_strength": intelligence.scores.relative_strength.score,
            "catalyst": intelligence.scores.catalyst.score,
            "growth": intelligence.scores.growth.score,
            "profitability": intelligence.scores.profitability.score,
            "financial_health": intelligence.scores.financial_health.score,
            "fundamental": intelligence.scores.fundamental_quality.score,
            "dilution_safety": intelligence.scores.dilution_safety.score,
            "liquidity": intelligence.scores.liquidity.score,
            "trade_risk": intelligence.scores.trade_risk.score,
        },
        "tier": intelligence.tier.value,
    }


def _benchmark_until(
    benchmark: list[OHLCVBar],
    timestamp: Any,
) -> list[OHLCVBar]:
    return [bar for bar in benchmark if bar.timestamp <= timestamp]


def _exit_trade(
    trade: _OpenTrade,
    bars: list[OHLCVBar],
    max_holding_weeks: int,
    slippage_pct: float,
) -> BacktestTrade:
    last_index = min(
        len(bars) - 1,
        trade.entry_index + max_holding_weeks - 1,
    )
    exit_index = last_index
    exit_reason = "max_holding"
    exit_price = bars[last_index].close * (1 - slippage_pct)

    if trade.stop_price is not None:
        for index in range(trade.entry_index, last_index + 1):
            bar = bars[index]
            if bar.low <= trade.stop_price:
                exit_index = index
                # Weekly data cannot resolve intrabar path. Assume stop fill plus
                # slippage, bounded by the week's open for gap-down realism.
                base = min(bar.open, trade.stop_price)
                exit_price = base * (1 - slippage_pct)
                exit_reason = "structural_stop"
                break

    return_pct = (exit_price / trade.entry_price) - 1.0
    return BacktestTrade(
        symbol="",
        signal_time=bars[trade.signal_index].timestamp,
        entry_time=bars[trade.entry_index].timestamp,
        entry_price=trade.entry_price,
        stop_price=trade.stop_price,
        exit_time=bars[exit_index].timestamp,
        exit_price=exit_price,
        exit_reason=exit_reason,
        return_pct=return_pct,
        holding_weeks=exit_index - trade.entry_index + 1,
        tier=trade.tier,
        overall=trade.overall,
    )


def run_backtest(request: BacktestRequest) -> BacktestResponse:
    bars = sorted(request.weekly_bars, key=lambda bar: bar.timestamp)
    benchmark = sorted(
        request.benchmark_bars,
        key=lambda bar: bar.timestamp,
    )
    engine = WeeklyBreakoutEngine(request.config)
    required = max(
        engine.config.ma_period + 1,
        35,
        engine.config.high_lookback + engine.config.min_box_bars + 1,
    )

    matches: list[BacktestMatch] = []
    trades: list[BacktestTrade] = []
    next_available_entry_index = required

    for signal_index in range(required - 1, len(bars) - 1):
        history = bars[: signal_index + 1]
        candidate = engine.evaluate(
            request.profile.symbol,
            history,
            request.fundamentals,
        )
        benchmark_history = _benchmark_until(
            benchmark,
            candidate.as_of,
        )
        intelligence = build_candidate_intelligence(
            candidate,
            history,
            benchmark_history,
            [],
            0,
            request.fundamentals,
        )
        facts = _facts(
            request.profile,
            candidate,
            intelligence,
        )
        evaluation = (
            evaluate_strategy(request.strategy, facts)
            if request.strategy is not None
            else None
        )
        strategy_passed = (
            evaluation.passed
            if evaluation is not None
            else candidate.state.value == "confirmed"
        )

        if candidate.state.value == "confirmed":
            matches.append(
                BacktestMatch(
                    signal_time=candidate.as_of,
                    symbol=request.profile.symbol.upper(),
                    tier=intelligence.tier.value,
                    overall=intelligence.scores.overall,
                    entry_reference=float(candidate.entry_price or 0),
                    structural_stop=candidate.structural_stop,
                    strategy_passed=strategy_passed,
                    failed_reasons=(
                        evaluation.failed_reasons
                        if evaluation is not None
                        else []
                    ),
                )
            )

        if not strategy_passed or candidate.state.value != "confirmed":
            continue

        entry_index = signal_index + 1
        if entry_index < next_available_entry_index:
            continue

        entry_bar = bars[entry_index]
        entry_price = entry_bar.open * (1 + request.slippage_pct)
        if entry_price <= 0:
            continue

        trade = _exit_trade(
            _OpenTrade(
                signal_index=signal_index,
                entry_index=entry_index,
                entry_price=entry_price,
                stop_price=candidate.structural_stop,
                tier=intelligence.tier.value,
                overall=intelligence.scores.overall,
            ),
            bars,
            request.max_holding_weeks,
            request.slippage_pct,
        )
        trade.symbol = request.profile.symbol.upper()
        trades.append(trade)
        exit_index = next(
            (
                index
                for index, bar in enumerate(bars)
                if bar.timestamp == trade.exit_time
            ),
            entry_index,
        )
        next_available_entry_index = exit_index + 1

    equity = request.initial_equity
    peak = equity
    equity_curve: list[EquityPoint] = []
    positive_gross = 0.0
    negative_gross = 0.0
    returns: list[float] = []

    for trade in trades:
        position_equity = equity * request.position_size_pct
        pnl = position_equity * trade.return_pct
        equity += pnl
        peak = max(peak, equity)
        drawdown = (equity / peak) - 1.0 if peak > 0 else 0.0
        equity_curve.append(
            EquityPoint(
                timestamp=trade.exit_time,
                equity=equity,
                drawdown_pct=drawdown,
            )
        )
        returns.append(trade.return_pct)
        if pnl >= 0:
            positive_gross += pnl
        else:
            negative_gross += abs(pnl)

    wins = sum(1 for value in returns if value > 0)
    losses = sum(1 for value in returns if value <= 0)
    win_rate = wins / len(returns) if returns else 0.0
    average_return = (
        sum(returns) / len(returns)
        if returns
        else 0.0
    )
    median_return = median(returns) if returns else 0.0
    profit_factor = (
        positive_gross / negative_gross
        if negative_gross > 0
        else None
    )
    max_drawdown = min(
        (point.drawdown_pct for point in equity_curve),
        default=0.0,
    )

    notes = [
        "Signals use only completed weekly bars available at each historical point.",
        "Entries occur at the next weekly open plus configured slippage.",
        "Weekly bars cannot determine intrabar stop path; stop fills use the worse of stop or weekly open.",
    ]
    if request.fundamentals is not None:
        notes.append(
            "Fundamentals are static for this request unless point-in-time snapshots are supplied externally; do not treat them as historical point-in-time fundamentals."
        )
    if request.strategy is not None:
        uses_context = any(
            condition.field in {
                "catalyst_score",
                "recent_news_count",
                "dilution_risk",
            }
            for group in (
                request.strategy.all_of,
                request.strategy.any_of,
                request.strategy.none_of,
            )
            for condition in group.conditions
        )
        if uses_context:
            notes.append(
                "Historical catalyst/news/dilution context is not reconstructed in this first backtester; those facts are neutral/empty, so context-dependent rules may intentionally produce no trades."
            )

    return BacktestResponse(
        symbol=request.profile.symbol.upper(),
        matches_count=len(matches),
        trades_count=len(trades),
        wins=wins,
        losses=losses,
        win_rate=win_rate,
        average_return_pct=average_return,
        median_return_pct=median_return,
        profit_factor=profit_factor,
        max_drawdown_pct=max_drawdown,
        ending_equity=equity,
        total_return_pct=(equity / request.initial_equity) - 1.0,
        matches=matches,
        trades=trades,
        equity_curve=equity_curve,
        notes=notes,
    )
