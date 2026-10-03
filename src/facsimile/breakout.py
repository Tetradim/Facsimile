from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone

from .indicators import close_location, macd, natr, relative_volume, sma, upper_wick_ratio
from .models import (
    BreakoutCandidate,
    BreakoutConfig,
    CandidateState,
    ConsolidationBox,
    FundamentalSnapshot,
    GateResult,
    OHLCVBar,
    ScoreCard,
    VolumeMode,
)


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _gate(
    name: str,
    passed: bool,
    value: float | str | bool | None = None,
    threshold: float | str | None = None,
    detail: str = "",
) -> GateResult:
    return GateResult(
        name=name,
        passed=passed,
        value=value,
        threshold=threshold,
        detail=detail,
    )


class WeeklyBreakoutEngine:
    """Detect and rank completed-week consolidation breakouts.

    The engine is deliberately free of brokerage and alert-transport concerns.
    It accepts point-in-time market/fundamental data and returns evidence-rich
    candidates that Sentinel Edge can later ingest.
    """

    def __init__(self, config: BreakoutConfig | None = None) -> None:
        self.config = config or BreakoutConfig()

    def evaluate(
        self,
        symbol: str,
        weekly_bars: Sequence[OHLCVBar],
        fundamentals: FundamentalSnapshot | None = None,
    ) -> BreakoutCandidate:
        bars = sorted(weekly_bars, key=lambda bar: bar.timestamp)
        cfg = self.config

        required = max(
            cfg.ma_period + 1,
            35,
            cfg.high_lookback + cfg.min_box_bars + 1,
        )
        if len(bars) < required:
            return BreakoutCandidate(
                symbol=symbol.upper(),
                as_of=bars[-1].timestamp if bars else datetime.now(timezone.utc),
                state=CandidateState.REJECTED,
                reasons=[f"insufficient weekly history: need at least {required} bars"],
            )

        current = bars[-1]
        previous = bars[-2]
        box = self._find_box(bars[:-1])
        if box is None:
            return BreakoutCandidate(
                symbol=symbol.upper(),
                as_of=current.timestamp,
                state=CandidateState.REJECTED,
                reasons=["no qualifying consolidation box found"],
            )

        closes_before_current = [bar.close for bar in bars[:-1]]
        ma_value = sma(closes_before_current, cfg.ma_period)
        macd_line, macd_signal = macd(closes_before_current)
        prior_high = max(
            bar.high for bar in bars[-(cfg.high_lookback + 1) : -1]
        )

        weekly_gain = (current.close / previous.close) - 1.0
        breakout_over_box = (current.close / box.body_high) - 1.0
        location = close_location(current)
        wick = upper_wick_ratio(current)
        previous_vol_ratio, average_vol_ratio = relative_volume(
            bars,
            cfg.volume_average_bars,
        )
        volume_reference = (
            average_vol_ratio
            if average_vol_ratio is not None
            else previous_vol_ratio
        )

        stop = box.body_low + cfg.structural_stop_position * (
            box.body_high - box.body_low
        )
        stop_risk = (
            (current.close - stop) / current.close
            if current.close > stop
            else 0.0
        )

        gates: list[GateResult] = [
            _gate(
                "box_width",
                box.width_pct <= cfg.max_box_width_pct,
                box.width_pct,
                cfg.max_box_width_pct,
            ),
            _gate(
                "close_above_box",
                breakout_over_box >= cfg.min_close_above_box_pct,
                breakout_over_box,
                cfg.min_close_above_box_pct,
            ),
            _gate(
                "weekly_gain_min",
                weekly_gain >= cfg.min_weekly_gain_pct,
                weekly_gain,
                cfg.min_weekly_gain_pct,
            ),
            _gate(
                "weekly_gain_max",
                weekly_gain <= cfg.max_weekly_gain_pct,
                weekly_gain,
                cfg.max_weekly_gain_pct,
            ),
            _gate(
                "close_location",
                location >= cfg.min_close_location,
                location,
                cfg.min_close_location,
            ),
            _gate(
                "upper_wick",
                wick <= cfg.max_upper_wick_ratio,
                wick,
                cfg.max_upper_wick_ratio,
            ),
            _gate(
                "structural_risk",
                0 < stop_risk <= cfg.max_stop_risk_pct,
                stop_risk,
                cfg.max_stop_risk_pct,
            ),
        ]

        if cfg.require_ma20:
            gates.append(
                _gate(
                    "trend_ma",
                    ma_value is not None and current.close > ma_value,
                    current.close,
                    ma_value,
                )
            )

        if cfg.require_macd_bullish:
            gates.append(
                _gate(
                    "macd_bullish",
                    (
                        macd_line is not None
                        and macd_signal is not None
                        and macd_line > macd_signal
                    ),
                    macd_line,
                    macd_signal,
                )
            )

        if cfg.require_lookback_high:
            gates.append(
                _gate(
                    "lookback_high",
                    current.close >= prior_high,
                    current.close,
                    prior_high,
                )
            )

        if cfg.volume_mode == VolumeMode.HARD_GATE:
            gates.append(
                _gate(
                    "volume",
                    (
                        volume_reference is not None
                        and volume_reference >= cfg.min_volume_ratio
                    ),
                    volume_reference,
                    cfg.min_volume_ratio,
                )
            )

        hard_pass = all(gate.passed for gate in gates)
        developing = current.high > box.body_high and current.close <= box.body_high

        if hard_pass:
            state = CandidateState.CONFIRMED
        elif developing:
            state = CandidateState.DEVELOPING
        else:
            state = CandidateState.REJECTED

        quality_score, growth_score = self._fundamental_scores(fundamentals)
        momentum_score = self._momentum_score(
            current=current,
            ma_value=ma_value,
            macd_line=macd_line,
            macd_signal=macd_signal,
            volume_ratio=volume_reference,
            prior_high=prior_high,
        )
        breakout_score = self._breakout_score(
            box=box,
            breakout_over_box=breakout_over_box,
            close_loc=location,
            wick_ratio=wick,
            volume_ratio=volume_reference,
        )
        risk_score = (
            _clamp(
                100.0
                * (1.0 - (stop_risk / cfg.max_stop_risk_pct))
            )
            if stop_risk > 0
            else 0.0
        )

        positional_parts = [momentum_score]
        positional_parts.extend(
            value
            for value in (quality_score, growth_score)
            if value is not None
        )
        positional = sum(positional_parts) / len(positional_parts)
        entry = (breakout_score * 0.65) + (risk_score * 0.35)
        overall = (positional * 0.50) + (entry * 0.50)

        failed = [gate.name for gate in gates if not gate.passed]
        reasons = [] if hard_pass else [
            f"failed gate: {name}" for name in failed
        ]

        return BreakoutCandidate(
            symbol=symbol.upper(),
            as_of=current.timestamp,
            state=state,
            box=box,
            entry_price=current.close,
            structural_stop=stop,
            stop_risk_pct=stop_risk,
            gates=gates,
            scores=ScoreCard(
                quality=quality_score,
                growth=growth_score,
                momentum=momentum_score,
                breakout=breakout_score,
                risk=risk_score,
                positional=positional,
                entry=entry,
                overall=overall,
            ),
            metrics={
                "weekly_gain_pct": weekly_gain,
                "close_above_box_pct": breakout_over_box,
                "close_location": location,
                "upper_wick_ratio": wick,
                "volume_vs_previous": previous_vol_ratio,
                "volume_vs_average": average_vol_ratio,
                "ma_value": ma_value,
                "macd": macd_line,
                "macd_signal": macd_signal,
                "prior_high": prior_high,
                "natr_14": natr(bars[:-1], 14),
            },
            reasons=reasons,
            metadata={
                "engine": "weekly_consolidation_breakout",
                "execution": "none",
                "data_contract": "completed_weekly_bars",
            },
        )

    def _find_box(
        self,
        history: Sequence[OHLCVBar],
    ) -> ConsolidationBox | None:
        cfg = self.config
        best: ConsolidationBox | None = None
        max_lookback = min(cfg.max_box_bars, len(history))

        for size in range(cfg.min_box_bars, max_lookback + 1):
            window = history[-size:]
            body_high = max(max(bar.open, bar.close) for bar in window)
            body_low = min(min(bar.open, bar.close) for bar in window)
            if body_low <= 0:
                continue

            width = (body_high - body_low) / body_low
            if width > cfg.max_box_width_pct:
                continue

            candidate = ConsolidationBox(
                start=window[0].timestamp,
                end=window[-1].timestamp,
                bars=size,
                body_low=body_low,
                body_high=body_high,
                width_pct=width,
            )

            if best is None:
                best = candidate
            elif candidate.width_pct < best.width_pct:
                best = candidate
            elif (
                candidate.width_pct == best.width_pct
                and candidate.bars > best.bars
            ):
                best = candidate

        return best

    def _fundamental_scores(
        self,
        fundamentals: FundamentalSnapshot | None,
    ) -> tuple[float | None, float | None]:
        if fundamentals is None:
            return None, None

        quality_parts: list[float] = []
        if fundamentals.piotroski_f_score is not None:
            quality_parts.append(
                (fundamentals.piotroski_f_score / 9.0) * 100.0
            )
        if fundamentals.return_on_equity is not None:
            quality_parts.append(
                _clamp((fundamentals.return_on_equity / 0.25) * 100.0)
            )
        if fundamentals.operating_margin is not None:
            quality_parts.append(
                _clamp((fundamentals.operating_margin / 0.25) * 100.0)
            )
        if fundamentals.debt_to_equity is not None:
            quality_parts.append(
                _clamp(100.0 - fundamentals.debt_to_equity * 50.0)
            )

        growth_parts: list[float] = []
        if fundamentals.revenue_growth is not None:
            growth_parts.append(
                _clamp((fundamentals.revenue_growth / 0.30) * 100.0)
            )
        if fundamentals.earnings_growth is not None:
            growth_parts.append(
                _clamp((fundamentals.earnings_growth / 0.40) * 100.0)
            )

        quality = (
            sum(quality_parts) / len(quality_parts)
            if quality_parts
            else None
        )
        growth = (
            sum(growth_parts) / len(growth_parts)
            if growth_parts
            else None
        )
        return quality, growth

    def _momentum_score(
        self,
        *,
        current: OHLCVBar,
        ma_value: float | None,
        macd_line: float | None,
        macd_signal: float | None,
        volume_ratio: float | None,
        prior_high: float,
    ) -> float:
        score = 0.0
        score += 25.0 if ma_value is not None and current.close > ma_value else 0.0
        score += (
            30.0
            if (
                macd_line is not None
                and macd_signal is not None
                and macd_line > macd_signal
            )
            else 0.0
        )
        score += (
            25.0
            if current.close >= prior_high
            else _clamp((current.close / prior_high) * 25.0, 0.0, 25.0)
        )
        if volume_ratio is not None:
            score += _clamp(
                (volume_ratio / 1.5) * 20.0,
                0.0,
                20.0,
            )
        return _clamp(score)

    def _breakout_score(
        self,
        *,
        box: ConsolidationBox,
        breakout_over_box: float,
        close_loc: float,
        wick_ratio: float,
        volume_ratio: float | None,
    ) -> float:
        cfg = self.config
        tightness = _clamp(
            (1.0 - box.width_pct / cfg.max_box_width_pct) * 25.0,
            0.0,
            25.0,
        )
        duration = _clamp(
            (box.bars / cfg.max_box_bars) * 15.0,
            0.0,
            15.0,
        )
        strength = _clamp(
            (
                breakout_over_box
                / max(cfg.min_close_above_box_pct, 0.005)
            )
            * 20.0,
            0.0,
            20.0,
        )
        close_quality = _clamp(close_loc * 20.0, 0.0, 20.0)
        wick_quality = _clamp(
            (1.0 - wick_ratio) * 10.0,
            0.0,
            10.0,
        )
        volume = _clamp(
            (((volume_ratio or 0.0) / 1.5) * 10.0),
            0.0,
            10.0,
        )
        return _clamp(
            tightness
            + duration
            + strength
            + close_quality
            + wick_quality
            + volume
        )
