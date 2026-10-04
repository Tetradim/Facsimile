from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class VolumeMode(str, Enum):
    DISABLED = "disabled"
    SCORE_ONLY = "score_only"
    HARD_GATE = "hard_gate"


class CandidateState(str, Enum):
    REJECTED = "rejected"
    DEVELOPING = "developing"
    CONFIRMED = "confirmed"


class OHLCVBar(BaseModel):
    timestamp: datetime
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_range(self) -> "OHLCVBar":
        if self.high < max(self.open, self.close, self.low):
            raise ValueError("high must be >= open, close and low")
        if self.low > min(self.open, self.close, self.high):
            raise ValueError("low must be <= open, close and high")
        return self


class FundamentalSnapshot(BaseModel):
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    operating_margin: float | None = None
    gross_margin: float | None = None
    return_on_equity: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    operating_cashflow: float | None = None
    free_cashflow: float | None = None
    piotroski_f_score: int | None = Field(default=None, ge=0, le=9)


class BreakoutConfig(BaseModel):
    timeframe: str = "1w"
    min_box_bars: int = Field(default=6, ge=3, le=52)
    max_box_bars: int = Field(default=12, ge=3, le=104)
    max_box_width_pct: float = Field(default=0.12, gt=0, le=1)
    ma_period: int = Field(default=20, ge=2, le=200)
    high_lookback: int = Field(default=10, ge=2, le=104)

    min_close_above_box_pct: float = Field(default=0.01, ge=0, le=0.25)
    min_weekly_gain_pct: float = Field(default=0.02, ge=-0.5, le=1)
    max_weekly_gain_pct: float = Field(default=0.20, gt=0, le=3)
    min_close_location: float = Field(default=0.75, ge=0, le=1)
    max_upper_wick_ratio: float = Field(default=0.50, ge=0, le=1)

    volume_mode: VolumeMode = VolumeMode.SCORE_ONLY
    min_volume_ratio: float = Field(default=1.0, ge=0)
    volume_average_bars: int = Field(default=6, ge=1, le=52)

    structural_stop_position: float = Field(default=0.33, ge=0, le=1)
    max_stop_risk_pct: float = Field(default=0.20, gt=0, le=1)

    require_ma20: bool = True
    require_macd_bullish: bool = True
    require_lookback_high: bool = True

    @model_validator(mode="after")
    def validate_windows(self) -> "BreakoutConfig":
        if self.max_box_bars < self.min_box_bars:
            raise ValueError("max_box_bars must be >= min_box_bars")
        if self.max_weekly_gain_pct < self.min_weekly_gain_pct:
            raise ValueError("max_weekly_gain_pct must be >= min_weekly_gain_pct")
        return self


class ConsolidationBox(BaseModel):
    start: datetime
    end: datetime
    bars: int
    body_low: float
    body_high: float
    width_pct: float


class GateResult(BaseModel):
    name: str
    passed: bool
    value: float | str | bool | None = None
    threshold: float | str | None = None
    detail: str = ""


class ScoreCard(BaseModel):
    quality: float | None = Field(default=None, ge=0, le=100)
    growth: float | None = Field(default=None, ge=0, le=100)
    momentum: float = Field(ge=0, le=100)
    breakout: float = Field(ge=0, le=100)
    risk: float = Field(ge=0, le=100)
    positional: float = Field(ge=0, le=100)
    entry: float = Field(ge=0, le=100)
    overall: float = Field(ge=0, le=100)


class BreakoutCandidate(BaseModel):
    schema_version: str = "facsimile.breakout_candidate.v1"
    symbol: str
    as_of: datetime
    state: CandidateState
    box: ConsolidationBox | None = None
    entry_price: float | None = None
    structural_stop: float | None = None
    stop_risk_pct: float | None = None
    gates: list[GateResult] = Field(default_factory=list)
    scores: ScoreCard | None = None
    metrics: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    reasons: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
