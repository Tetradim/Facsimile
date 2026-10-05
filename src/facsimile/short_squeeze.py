from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from .models import CandidateState, GateResult


class ShortSqueezeConfig(BaseModel):
    min_short_float_pct: float = Field(default=0.15, ge=0, le=1)
    min_days_to_cover: float = Field(default=3.0, ge=0)
    min_relative_volume: float = Field(default=1.50, ge=0)
    min_daily_dollar_volume: float = Field(default=500_000, ge=0)
    min_trigger_return_pct: float = Field(default=0.03, ge=-1, le=3)
    max_trigger_extension_pct: float = Field(default=0.25, gt=0, le=5)
    max_float_shares: float | None = Field(default=200_000_000, gt=0)
    require_price_trigger: bool = True
    require_relative_volume: bool = True
    require_liquidity: bool = True

    @model_validator(mode="after")
    def validate_trigger_window(self) -> "ShortSqueezeConfig":
        if self.max_trigger_extension_pct < self.min_trigger_return_pct:
            raise ValueError(
                "max_trigger_extension_pct must be >= min_trigger_return_pct"
            )
        return self


class ShortSqueezeSnapshot(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    as_of: datetime
    price: float = Field(gt=0)
    short_float_pct: float = Field(ge=0, le=1)
    days_to_cover: float = Field(ge=0)
    float_shares: float | None = Field(default=None, gt=0)
    relative_volume: float | None = Field(default=None, ge=0)
    average_daily_dollar_volume: float | None = Field(default=None, ge=0)
    borrow_fee_pct: float | None = Field(default=None, ge=0)
    utilization_pct: float | None = Field(default=None, ge=0, le=1)
    return_5d_pct: float | None = Field(default=None, ge=-1, le=10)
    return_20d_pct: float | None = Field(default=None, ge=-1, le=10)
    breakout_pct: float | None = Field(default=None, ge=-1, le=10)
    distance_to_52w_high_pct: float | None = Field(default=None, ge=0, le=1)
    source_evidence: dict[str, str] = Field(default_factory=dict)


class ShortSqueezeScore(BaseModel):
    pressure: float = Field(ge=0, le=100)
    borrow: float = Field(ge=0, le=100)
    float_score: float = Field(ge=0, le=100)
    trigger: float = Field(ge=0, le=100)
    liquidity: float = Field(ge=0, le=100)
    overall: float = Field(ge=0, le=100)


class ShortSqueezeCandidate(BaseModel):
    schema_version: str = "facsimile.short_squeeze_candidate.v1"
    symbol: str
    as_of: datetime
    state: CandidateState
    snapshot: ShortSqueezeSnapshot
    scores: ShortSqueezeScore
    gates: list[GateResult] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    evidence: dict[str, str] = Field(default_factory=dict)


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _gate(
    name: str,
    passed: bool,
    value: float | str | bool | None,
    threshold: float | str | None,
    detail: str = "",
) -> GateResult:
    return GateResult(
        name=name,
        passed=passed,
        value=value,
        threshold=threshold,
        detail=detail,
    )


class ShortSqueezeEngine:
    """Rank supplied short-interest evidence without inventing provider data.

    Short sale volume is intentionally not accepted as a substitute for
    short-interest percentage or days-to-cover.
    """

    def __init__(
        self,
        config: ShortSqueezeConfig | None = None,
    ) -> None:
        self.config = config or ShortSqueezeConfig()

    def evaluate(
        self,
        snapshot: ShortSqueezeSnapshot,
    ) -> ShortSqueezeCandidate:
        cfg = self.config

        trigger_return = (
            snapshot.breakout_pct
            if snapshot.breakout_pct is not None
            else snapshot.return_5d_pct
        )

        gates = [
            _gate(
                "short_float",
                snapshot.short_float_pct >= cfg.min_short_float_pct,
                snapshot.short_float_pct,
                cfg.min_short_float_pct,
                "Reported short interest as a share of float.",
            ),
            _gate(
                "days_to_cover",
                snapshot.days_to_cover >= cfg.min_days_to_cover,
                snapshot.days_to_cover,
                cfg.min_days_to_cover,
                "Reported short-interest ratio / days to cover.",
            ),
        ]

        if cfg.max_float_shares is not None:
            gates.append(
                _gate(
                    "float_size",
                    snapshot.float_shares is not None
                    and snapshot.float_shares <= cfg.max_float_shares,
                    snapshot.float_shares,
                    cfg.max_float_shares,
                    "Smaller floats can amplify forced covering but increase risk.",
                )
            )

        if cfg.require_relative_volume:
            gates.append(
                _gate(
                    "relative_volume",
                    snapshot.relative_volume is not None
                    and snapshot.relative_volume >= cfg.min_relative_volume,
                    snapshot.relative_volume,
                    cfg.min_relative_volume,
                )
            )

        if cfg.require_liquidity:
            gates.append(
                _gate(
                    "dollar_liquidity",
                    snapshot.average_daily_dollar_volume is not None
                    and snapshot.average_daily_dollar_volume
                    >= cfg.min_daily_dollar_volume,
                    snapshot.average_daily_dollar_volume,
                    cfg.min_daily_dollar_volume,
                )
            )

        if cfg.require_price_trigger:
            gates.extend(
                [
                    _gate(
                        "price_trigger",
                        trigger_return is not None
                        and trigger_return >= cfg.min_trigger_return_pct,
                        trigger_return,
                        cfg.min_trigger_return_pct,
                        "Uses breakout_pct when available, otherwise 5-day return.",
                    ),
                    _gate(
                        "extension_control",
                        trigger_return is not None
                        and trigger_return <= cfg.max_trigger_extension_pct,
                        trigger_return,
                        cfg.max_trigger_extension_pct,
                    ),
                ]
            )

        hard_pass = all(gate.passed for gate in gates)

        pressure_score = _clamp(
            (
                snapshot.short_float_pct
                / max(cfg.min_short_float_pct * 2.0, 0.01)
            )
            * 55
            + (
                snapshot.days_to_cover
                / max(cfg.min_days_to_cover * 2.0, 1.0)
            )
            * 45
        )

        if snapshot.borrow_fee_pct is None and snapshot.utilization_pct is None:
            borrow_score = 50.0
        else:
            fee_score = (
                _clamp(snapshot.borrow_fee_pct / 0.50 * 100)
                if snapshot.borrow_fee_pct is not None
                else 50.0
            )
            utilization_score = (
                _clamp(snapshot.utilization_pct * 100)
                if snapshot.utilization_pct is not None
                else 50.0
            )
            borrow_score = fee_score * 0.55 + utilization_score * 0.45

        if snapshot.float_shares is None:
            float_score = 50.0
        else:
            reference = cfg.max_float_shares or 200_000_000
            float_score = _clamp(
                100 - (snapshot.float_shares / reference) * 70
            )

        trigger_components: list[float] = []
        if trigger_return is not None:
            trigger_components.append(
                _clamp(
                    trigger_return
                    / max(cfg.min_trigger_return_pct * 3, 0.01)
                    * 100
                )
            )
        if snapshot.relative_volume is not None:
            trigger_components.append(
                _clamp(snapshot.relative_volume / 3.0 * 100)
            )
        if snapshot.distance_to_52w_high_pct is not None:
            trigger_components.append(
                _clamp(
                    (1 - snapshot.distance_to_52w_high_pct / 0.30)
                    * 100
                )
            )
        trigger_score = (
            sum(trigger_components) / len(trigger_components)
            if trigger_components
            else 0.0
        )

        if snapshot.average_daily_dollar_volume is None:
            liquidity_score = 40.0
        elif snapshot.average_daily_dollar_volume >= 10_000_000:
            liquidity_score = 95.0
        elif snapshot.average_daily_dollar_volume >= 3_000_000:
            liquidity_score = 80.0
        elif snapshot.average_daily_dollar_volume >= 1_000_000:
            liquidity_score = 65.0
        elif snapshot.average_daily_dollar_volume >= 500_000:
            liquidity_score = 50.0
        else:
            liquidity_score = 20.0

        overall = _clamp(
            pressure_score * 0.35
            + borrow_score * 0.20
            + float_score * 0.10
            + trigger_score * 0.25
            + liquidity_score * 0.10
        )

        if hard_pass:
            state = CandidateState.CONFIRMED
        elif (
            snapshot.short_float_pct >= cfg.min_short_float_pct
            and snapshot.days_to_cover >= cfg.min_days_to_cover
        ):
            state = CandidateState.DEVELOPING
        else:
            state = CandidateState.REJECTED

        failed = [gate.name for gate in gates if not gate.passed]
        reasons = (
            []
            if hard_pass
            else [f"failed gate: {name}" for name in failed]
        )

        evidence = {
            **snapshot.source_evidence,
            "short_interest_semantics": (
                "Requires reported short interest / float and days-to-cover. "
                "Daily short-sale volume is not treated as short interest."
            ),
        }

        return ShortSqueezeCandidate(
            symbol=snapshot.symbol.upper(),
            as_of=snapshot.as_of,
            state=state,
            snapshot=snapshot,
            scores=ShortSqueezeScore(
                pressure=round(pressure_score, 1),
                borrow=round(borrow_score, 1),
                float_score=round(float_score, 1),
                trigger=round(trigger_score, 1),
                liquidity=round(liquidity_score, 1),
                overall=round(overall, 1),
            ),
            gates=gates,
            reasons=reasons,
            evidence=evidence,
        )
