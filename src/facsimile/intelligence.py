from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from .models import BreakoutCandidate, FundamentalSnapshot, OHLCVBar


class CandidateTier(str, Enum):
    A_PLUS = "A+"
    A = "A"
    B = "B"
    WATCH_1 = "W1"
    WATCH_2 = "W2"
    REJECTED = "X"


class ScoreEvidence(BaseModel):
    score: float = Field(ge=0, le=100)
    positives: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)


class IntelligenceScores(BaseModel):
    technical_health: ScoreEvidence
    setup_quality: ScoreEvidence
    breakout_trigger: ScoreEvidence
    relative_strength: ScoreEvidence
    catalyst: ScoreEvidence
    growth: ScoreEvidence
    profitability: ScoreEvidence
    financial_health: ScoreEvidence
    fundamental_quality: ScoreEvidence
    dilution_safety: ScoreEvidence
    liquidity: ScoreEvidence
    trade_risk: ScoreEvidence
    overall: float = Field(ge=0, le=100)


class CandidateIntelligence(BaseModel):
    tier: CandidateTier
    tier_reason: str
    rank_key: tuple[float, float, float, float, float]
    scores: IntelligenceScores
    facts: dict[str, Any] = Field(default_factory=dict)


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _period_return(bars: list[OHLCVBar], periods: int) -> float | None:
    if len(bars) <= periods:
        return None
    start = bars[-(periods + 1)].close
    if start <= 0:
        return None
    return (bars[-1].close / start) - 1.0


def relative_strength_score(
    bars: list[OHLCVBar],
    benchmark: list[OHLCVBar] | None,
) -> ScoreEvidence:
    if not benchmark:
        return ScoreEvidence(
            score=50,
            cautions=["SPY benchmark unavailable; relative strength is neutral."],
        )

    spreads: list[float] = []
    positives: list[str] = []
    cautions: list[str] = []
    for periods, label in ((4, "1M"), (13, "3M"), (26, "6M"), (52, "12M")):
        stock_return = _period_return(bars, periods)
        benchmark_return = _period_return(benchmark, periods)
        if stock_return is None or benchmark_return is None:
            continue
        spread = stock_return - benchmark_return
        spreads.append(spread)
        message = f"{label} relative return {spread * 100:+.1f} points vs SPY"
        (positives if spread > 0 else cautions).append(message)

    if not spreads:
        return ScoreEvidence(
            score=50,
            cautions=["Insufficient matched history for relative strength."],
        )
    score = _clamp(50 + (sum(spreads) / len(spreads)) * 120)
    return ScoreEvidence(
        score=round(score, 1),
        positives=positives,
        cautions=cautions,
    )


def technical_score(candidate: BreakoutCandidate) -> ScoreEvidence:
    metrics = candidate.metrics
    positives: list[str] = []
    cautions: list[str] = []
    score = 0.0
    close = float(candidate.entry_price or 0)

    ma_value = metrics.get("ma_value")
    if isinstance(ma_value, (int, float)) and close > float(ma_value):
        score += 25
        positives.append("Price is above the 20-week moving average")
    else:
        cautions.append("20-week moving-average confirmation is absent")

    macd = metrics.get("macd")
    signal = metrics.get("macd_signal")
    if isinstance(macd, (int, float)) and isinstance(signal, (int, float)) and macd > signal:
        score += 30
        positives.append("Weekly MACD line is above signal")
    else:
        cautions.append("Weekly MACD confirmation is absent")

    prior_high = metrics.get("prior_high")
    if isinstance(prior_high, (int, float)) and prior_high > 0:
        if close >= float(prior_high):
            score += 25
            positives.append("Close is at or above the prior 10-week high")
        else:
            score += _clamp(close / float(prior_high) * 25)
            cautions.append("Close remains below the prior 10-week high")

    volume = metrics.get("volume_vs_average")
    if isinstance(volume, (int, float)):
        score += min(20, _clamp(float(volume) / 1.5 * 20))
        if volume >= 1.5:
            positives.append(f"Relative volume is {volume:.2f}x")
        else:
            cautions.append(f"Relative volume is only {volume:.2f}x")

    return ScoreEvidence(
        score=round(_clamp(score), 1),
        positives=positives,
        cautions=cautions,
    )


def setup_score(candidate: BreakoutCandidate) -> ScoreEvidence:
    if candidate.box is None:
        return ScoreEvidence(score=0, cautions=["No qualifying consolidation box."])

    box = candidate.box
    positives: list[str] = []
    cautions: list[str] = []
    tightness = _clamp((1 - box.width_pct / 0.18) * 45)
    duration = _clamp(box.bars / 12 * 30)
    natr_value = candidate.metrics.get("natr_14")
    volatility = (
        _clamp((1 - float(natr_value) / 0.15) * 25)
        if isinstance(natr_value, (int, float))
        else 12.5
    )

    if box.width_pct <= 0.12:
        positives.append(f"Tight {box.width_pct * 100:.1f}% body box")
    elif box.width_pct <= 0.18:
        positives.append(f"Acceptable {box.width_pct * 100:.1f}% body box")
    else:
        cautions.append(f"Wide {box.width_pct * 100:.1f}% body box")

    if box.bars >= 8:
        positives.append(f"{box.bars}-week base has time to mature")
    else:
        cautions.append(f"Only {box.bars} weeks in the base")

    return ScoreEvidence(
        score=round(_clamp(tightness + duration + volatility), 1),
        positives=positives,
        cautions=cautions,
    )


def trigger_score(candidate: BreakoutCandidate) -> ScoreEvidence:
    score = candidate.scores.breakout if candidate.scores else 0
    positives: list[str] = []
    cautions: list[str] = []
    breakout = candidate.metrics.get("close_above_box_pct")
    location = candidate.metrics.get("close_location")
    wick = candidate.metrics.get("upper_wick_ratio")

    if isinstance(breakout, (int, float)):
        if breakout >= 0.02:
            positives.append(f"Close cleared resistance by {breakout * 100:.1f}%")
        else:
            cautions.append(f"Resistance clearance is only {breakout * 100:.1f}%")
    if isinstance(location, (int, float)):
        if location >= 0.80:
            positives.append(f"Close location is strong at {location * 100:.0f}%")
        else:
            cautions.append("Breakout candle did not close near its high")
    if isinstance(wick, (int, float)):
        if wick <= 0.35:
            positives.append(f"Upper wick is contained at {wick * 100:.1f}%")
        else:
            cautions.append(f"Upper wick shows {wick * 100:.1f}% rejection")

    return ScoreEvidence(
        score=round(float(score), 1),
        positives=positives,
        cautions=cautions,
    )


def growth_score(
    fundamentals: FundamentalSnapshot | None,
) -> ScoreEvidence:
    if fundamentals is None:
        return ScoreEvidence(
            score=50,
            cautions=["Growth data unavailable; score held neutral."],
        )

    parts: list[float] = []
    positives: list[str] = []
    cautions: list[str] = []

    if fundamentals.revenue_growth is not None:
        value = fundamentals.revenue_growth
        parts.append(_clamp(50 + value * 160))
        if value > 0.15:
            positives.append(f"Revenue growth is {value * 100:.1f}%")
        elif value < 0:
            cautions.append(f"Revenue is contracting {abs(value) * 100:.1f}%")

    if fundamentals.earnings_growth is not None:
        value = fundamentals.earnings_growth
        parts.append(_clamp(50 + value * 110))
        if value > 0.15:
            positives.append(f"Earnings growth is {value * 100:.1f}%")
        elif value < 0:
            cautions.append(f"Earnings growth is negative {value * 100:.1f}%")

    if not parts:
        return ScoreEvidence(
            score=50,
            cautions=["Provider returned no usable growth metrics."],
        )

    return ScoreEvidence(
        score=round(sum(parts) / len(parts), 1),
        positives=positives,
        cautions=cautions,
    )


def profitability_score(
    fundamentals: FundamentalSnapshot | None,
) -> ScoreEvidence:
    if fundamentals is None:
        return ScoreEvidence(
            score=50,
            cautions=["Profitability data unavailable; score held neutral."],
        )

    parts: list[float] = []
    positives: list[str] = []
    cautions: list[str] = []

    if fundamentals.gross_margin is not None:
        value = fundamentals.gross_margin
        parts.append(_clamp(value / 0.75 * 100))
        if value >= 0.50:
            positives.append(f"Gross margin is {value * 100:.1f}%")
        elif value < 0.20:
            cautions.append(f"Gross margin is low at {value * 100:.1f}%")

    if fundamentals.operating_margin is not None:
        value = fundamentals.operating_margin
        parts.append(_clamp(50 + value * 180))
        if value > 0:
            positives.append(f"Operating margin is positive at {value * 100:.1f}%")
        elif value < -0.30:
            cautions.append(f"Operating margin is {value * 100:.1f}%")

    if fundamentals.return_on_equity is not None:
        value = fundamentals.return_on_equity
        parts.append(_clamp(50 + value * 120))
        if value > 0.10:
            positives.append(f"ROE is {value * 100:.1f}%")
        elif value < 0:
            cautions.append(f"ROE is negative at {value * 100:.1f}%")

    if not parts:
        return ScoreEvidence(
            score=50,
            cautions=["Provider returned no usable profitability metrics."],
        )

    return ScoreEvidence(
        score=round(sum(parts) / len(parts), 1),
        positives=positives,
        cautions=cautions,
    )


def financial_health_score(
    fundamentals: FundamentalSnapshot | None,
) -> tuple[ScoreEvidence, float | None]:
    if fundamentals is None:
        return (
            ScoreEvidence(
                score=50,
                cautions=["Financial-health data unavailable; score held neutral."],
            ),
            None,
        )

    parts: list[float] = []
    positives: list[str] = []
    cautions: list[str] = []
    cash_runway_years: float | None = None

    if fundamentals.current_ratio is not None:
        ratio = fundamentals.current_ratio
        parts.append(_clamp(ratio / 2.0 * 100))
        if ratio >= 1.5:
            positives.append(f"Current ratio is {ratio:.2f}")
        elif ratio < 1.0:
            cautions.append(f"Current ratio is weak at {ratio:.2f}")

    if fundamentals.debt_to_equity is not None:
        ratio = max(0.0, fundamentals.debt_to_equity)
        parts.append(_clamp(100 - ratio * 45))
        if ratio <= 0.5:
            positives.append(f"Debt/equity is contained at {ratio:.2f}")
        elif ratio >= 1.5:
            cautions.append(f"Debt/equity is elevated at {ratio:.2f}")

    if fundamentals.total_cash is not None and fundamentals.total_debt is not None:
        cash = max(0.0, fundamentals.total_cash)
        debt = max(0.0, fundamentals.total_debt)
        if cash >= debt:
            parts.append(90)
            positives.append("Cash is at or above total debt")
        elif debt > 0:
            cash_to_debt = cash / debt
            parts.append(_clamp(cash_to_debt * 80))
            cautions.append(
                f"Cash covers only {cash_to_debt * 100:.0f}% of total debt"
            )

    if (
        fundamentals.total_cash is not None
        and fundamentals.operating_cashflow is not None
    ):
        cash = max(0.0, fundamentals.total_cash)
        operating_cashflow = fundamentals.operating_cashflow
        if operating_cashflow < 0 and cash > 0:
            cash_runway_years = cash / abs(operating_cashflow)
            parts.append(_clamp(cash_runway_years / 2.0 * 100))
            if cash_runway_years >= 2:
                positives.append(
                    f"Estimated operating-cash runway is {cash_runway_years:.1f} years"
                )
            elif cash_runway_years >= 1:
                positives.append(
                    f"Estimated operating-cash runway is {cash_runway_years:.1f} years"
                )
            elif cash_runway_years < 0.5:
                cautions.append(
                    f"Estimated operating-cash runway is only {cash_runway_years:.1f} years"
                )
            else:
                cautions.append(
                    f"Estimated operating-cash runway is {cash_runway_years:.1f} years"
                )
        elif operating_cashflow >= 0:
            parts.append(90)
            positives.append("Operating cash flow is positive")

    if fundamentals.free_cashflow is not None:
        if fundamentals.free_cashflow >= 0:
            parts.append(90)
            positives.append("Free cash flow is positive")
        else:
            parts.append(35)
            cautions.append("Free cash flow is negative")

    if not parts:
        return (
            ScoreEvidence(
                score=50,
                cautions=["Provider returned no usable balance-sheet/cash-flow metrics."],
            ),
            cash_runway_years,
        )

    return (
        ScoreEvidence(
            score=round(sum(parts) / len(parts), 1),
            positives=positives,
            cautions=cautions,
        ),
        cash_runway_years,
    )


def fundamental_score(
    growth: ScoreEvidence,
    profitability: ScoreEvidence,
    financial_health: ScoreEvidence,
) -> ScoreEvidence:
    score = (
        growth.score * 0.30
        + profitability.score * 0.25
        + financial_health.score * 0.45
    )
    positives = (
        growth.positives[:1]
        + profitability.positives[:1]
        + financial_health.positives[:2]
    )
    cautions = (
        growth.cautions[:1]
        + profitability.cautions[:1]
        + financial_health.cautions[:2]
    )
    return ScoreEvidence(
        score=round(_clamp(score), 1),
        positives=positives,
        cautions=cautions,
    )


def dilution_score(news: list[Any]) -> tuple[ScoreEvidence, str]:
    text = " ".join(
        f"{getattr(item, 'title', '')} {getattr(item, 'summary', '')}"
        for item in news
    ).lower()
    rules = [
        ("424b5", 45, "Recent 424B5 offering filing detected"),
        ("s-1", 38, "Recent S-1 registration detected"),
        ("s-3", 28, "Recent S-3 shelf registration detected"),
        ("at-the-market", 35, "ATM financing language detected"),
        (" warrant", 20, "Warrant-related financing language detected"),
        ("convertible", 22, "Convertible financing language detected"),
        ("reverse split", 25, "Reverse-split language detected"),
        ("going concern", 25, "Going-concern language detected"),
        ("offering", 20, "Recent offering language detected"),
        ("financing", 12, "Recent financing language detected"),
    ]

    risk = 0.0
    cautions: list[str] = []
    seen: set[str] = set()
    for term, points, message in rules:
        if term in text and message not in seen:
            risk += points
            cautions.append(message)
            seen.add(message)

    risk = min(100, risk)
    label = (
        "extreme" if risk >= 75 else
        "high" if risk >= 50 else
        "moderate" if risk >= 25 else
        "low"
    )
    positives = (
        ["No obvious dilution warning found in recent evidence"]
        if risk == 0 else []
    )
    return (
        ScoreEvidence(
            score=round(100 - risk, 1),
            positives=positives,
            cautions=cautions,
        ),
        label,
    )


def liquidity_score(
    bars: list[OHLCVBar],
    candidate: BreakoutCandidate,
) -> ScoreEvidence:
    recent = bars[-8:]
    if not recent:
        return ScoreEvidence(score=0, cautions=["No volume history available."])

    avg_daily = (
        sum(bar.close * bar.volume for bar in recent)
        / len(recent)
        / 5
    )
    positives: list[str] = []
    cautions: list[str] = []
    if avg_daily >= 5_000_000:
        score = 85
        positives.append(f"Approx. daily dollar volume USD {avg_daily / 1_000_000:.1f}M")
    elif avg_daily >= 1_000_000:
        score = 70
        positives.append(f"Approx. daily dollar volume USD {avg_daily / 1_000_000:.1f}M")
    elif avg_daily >= 500_000:
        score = 55
        cautions.append(f"Approx. daily dollar volume only USD {avg_daily / 1_000:.0f}K")
    elif avg_daily >= 100_000:
        score = 35
        cautions.append(f"Thin liquidity around USD {avg_daily / 1_000:.0f}K daily")
    else:
        score = 15
        cautions.append("Very thin dollar-volume profile")

    volume = candidate.metrics.get("volume_vs_average")
    if isinstance(volume, (int, float)) and volume >= 1.5:
        score += 10
        positives.append(f"Breakout volume is {volume:.2f}x recent average")

    return ScoreEvidence(
        score=round(_clamp(score), 1),
        positives=positives,
        cautions=cautions,
    )


def trade_risk_score(
    candidate: BreakoutCandidate,
    liquidity: ScoreEvidence,
) -> ScoreEvidence:
    positives: list[str] = []
    cautions: list[str] = []
    structural = candidate.stop_risk_pct
    if structural is None:
        structural_score = 0
        cautions.append("No structural stop risk could be calculated")
    else:
        structural_score = _clamp(100 * (1 - structural / 0.20))
        if structural <= 0.10:
            positives.append(f"Structural stop risk is only {structural * 100:.1f}%")
        elif structural <= 0.15:
            positives.append(f"Structural stop risk is acceptable at {structural * 100:.1f}%")
        else:
            cautions.append(f"Structural stop risk is elevated at {structural * 100:.1f}%")

    natr_value = candidate.metrics.get("natr_14")
    volatility_score = (
        _clamp(100 * (1 - float(natr_value) / 0.25))
        if isinstance(natr_value, (int, float))
        else 50
    )
    score = structural_score * 0.55 + volatility_score * 0.20 + liquidity.score * 0.25
    return ScoreEvidence(
        score=round(_clamp(score), 1),
        positives=positives,
        cautions=cautions,
    )


def candidate_tier(
    state: str,
    overall: float,
) -> tuple[CandidateTier, str, float]:
    if state == "confirmed":
        if overall >= 90:
            return CandidateTier.A_PLUS, "Confirmed breakout with 90+ intelligence score", 5
        if overall >= 85:
            return CandidateTier.A, "Confirmed breakout with 85+ intelligence score", 4
        return CandidateTier.B, "Confirmed breakout; lower composite quality", 3
    if state == "developing":
        if overall >= 80:
            return CandidateTier.WATCH_1, "High-quality developing setup", 2
        return CandidateTier.WATCH_2, "Developing setup that still needs improvement", 1
    return CandidateTier.REJECTED, "One or more mandatory breakout gates failed", 0


def build_candidate_intelligence(
    candidate: BreakoutCandidate,
    bars: list[OHLCVBar],
    benchmark_bars: list[OHLCVBar] | None,
    news: list[Any],
    catalyst_score: float,
    fundamentals: FundamentalSnapshot | None = None,
) -> CandidateIntelligence:
    technical = technical_score(candidate)
    setup = setup_score(candidate)
    trigger = trigger_score(candidate)
    relative = relative_strength_score(bars, benchmark_bars)
    growth = growth_score(fundamentals)
    profitability = profitability_score(fundamentals)
    financial_health, cash_runway_years = financial_health_score(
        fundamentals
    )
    fundamental = fundamental_score(
        growth,
        profitability,
        financial_health,
    )
    dilution, dilution_risk = dilution_score(news)
    liquidity = liquidity_score(bars, candidate)
    trade_risk = trade_risk_score(candidate, liquidity)

    catalyst = ScoreEvidence(score=round(_clamp(catalyst_score), 1))
    if catalyst_score >= 70:
        catalyst.positives.append("High-impact or recent catalyst evidence")
    elif catalyst_score >= 40:
        catalyst.positives.append("Meaningful recent catalyst evidence")
    elif catalyst_score > 0:
        catalyst.cautions.append("Catalyst evidence is relatively weak")
    else:
        catalyst.cautions.append("No catalyst evidence scored")

    overall = round(
        _clamp(
            technical.score * 0.14
            + setup.score * 0.14
            + trigger.score * 0.16
            + relative.score * 0.10
            + catalyst.score * 0.12
            + fundamental.score * 0.10
            + dilution.score * 0.08
            + liquidity.score * 0.07
            + trade_risk.score * 0.09
        ),
        1,
    )

    tier, tier_reason, tier_weight = candidate_tier(
        candidate.state.value,
        overall,
    )
    stop_risk = candidate.stop_risk_pct if candidate.stop_risk_pct is not None else 1.0

    return CandidateIntelligence(
        tier=tier,
        tier_reason=tier_reason,
        rank_key=(
            tier_weight,
            overall,
            catalyst.score,
            liquidity.score,
            -stop_risk,
        ),
        scores=IntelligenceScores(
            technical_health=technical,
            setup_quality=setup,
            breakout_trigger=trigger,
            relative_strength=relative,
            catalyst=catalyst,
            growth=growth,
            profitability=profitability,
            financial_health=financial_health,
            fundamental_quality=fundamental,
            dilution_safety=dilution,
            liquidity=liquidity,
            trade_risk=trade_risk,
            overall=overall,
        ),
        facts={
            "dilution_risk": dilution_risk,
            "recent_news_count": len(news),
            "stop_risk_pct": candidate.stop_risk_pct,
            "box_bars": candidate.box.bars if candidate.box else None,
            "box_width_pct": candidate.box.width_pct if candidate.box else None,
            "cash_runway_years": cash_runway_years,
        },
    )
