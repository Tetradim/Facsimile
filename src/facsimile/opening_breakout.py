from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, model_validator

from .indicators import close_location, upper_wick_ratio
from .models import CandidateState, GateResult, OHLCVBar


EASTERN = ZoneInfo("America/New_York")


class OpeningBreakoutConfig(BaseModel):
    session_open: time = time(9, 30)
    opening_range_minutes: int = Field(default=15, ge=5, le=60)
    min_breakout_close_pct: float = Field(default=0.0025, ge=0, le=0.10)
    max_breakout_extension_pct: float = Field(default=0.08, gt=0, le=0.50)
    min_close_location: float = Field(default=0.70, ge=0, le=1)
    max_upper_wick_ratio: float = Field(default=0.40, ge=0, le=1)
    min_relative_volume: float = Field(default=1.50, ge=0)
    max_stop_risk_pct: float = Field(default=0.08, gt=0, le=0.50)
    stop_buffer_pct: float = Field(default=0.0025, ge=0, le=0.05)
    require_vwap: bool = True
    require_relative_volume: bool = True
    require_prior_close: bool = False

    @model_validator(mode="after")
    def validate_extension(self) -> "OpeningBreakoutConfig":
        if self.max_breakout_extension_pct < self.min_breakout_close_pct:
            raise ValueError(
                "max_breakout_extension_pct must be >= min_breakout_close_pct"
            )
        return self


class OpeningRange(BaseModel):
    start: datetime
    end: datetime
    high: float
    low: float
    volume: float
    bars: int
    width_pct: float


class OpeningBreakoutScore(BaseModel):
    trigger: float = Field(ge=0, le=100)
    volume: float = Field(ge=0, le=100)
    vwap: float = Field(ge=0, le=100)
    structure: float = Field(ge=0, le=100)
    risk: float = Field(ge=0, le=100)
    overall: float = Field(ge=0, le=100)


class OpeningBreakoutCandidate(BaseModel):
    schema_version: str = "facsimile.opening_breakout_candidate.v1"
    symbol: str
    as_of: datetime
    state: CandidateState
    opening_range: OpeningRange | None = None
    breakout_bar: OHLCVBar | None = None
    entry_price: float | None = None
    structural_stop: float | None = None
    stop_risk_pct: float | None = None
    vwap: float | None = None
    relative_volume: float | None = None
    scores: OpeningBreakoutScore | None = None
    gates: list[GateResult] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    metrics: dict[str, float | int | str | bool | None] = Field(default_factory=dict)


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


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


def _eastern(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=EASTERN)
    return value.astimezone(EASTERN)


def _session_date(bars: list[OHLCVBar]) -> datetime.date:
    return _eastern(bars[-1].timestamp).date()


def _vwap(bars: list[OHLCVBar]) -> float | None:
    total_volume = sum(bar.volume for bar in bars)
    if total_volume <= 0:
        return None
    weighted = sum(
        ((bar.high + bar.low + bar.close) / 3.0) * bar.volume
        for bar in bars
    )
    return weighted / total_volume


def _median_volume(values: list[float]) -> float | None:
    clean = sorted(value for value in values if value >= 0)
    if not clean:
        return None
    middle = len(clean) // 2
    if len(clean) % 2:
        return clean[middle]
    return (clean[middle - 1] + clean[middle]) / 2.0


class OpeningBreakoutEngine:
    def __init__(
        self,
        config: OpeningBreakoutConfig | None = None,
    ) -> None:
        self.config = config or OpeningBreakoutConfig()

    def evaluate(
        self,
        symbol: str,
        intraday_bars: list[OHLCVBar],
        prior_session_bars: list[OHLCVBar] | None = None,
        prior_close: float | None = None,
    ) -> OpeningBreakoutCandidate:
        if not intraday_bars:
            return OpeningBreakoutCandidate(
                symbol=symbol.upper(),
                as_of=datetime.now(tz=EASTERN),
                state=CandidateState.REJECTED,
                reasons=["no intraday bars supplied"],
            )

        bars = sorted(intraday_bars, key=lambda bar: bar.timestamp)
        session_day = _session_date(bars)
        session_start = datetime.combine(
            session_day,
            self.config.session_open,
            tzinfo=EASTERN,
        )
        range_end = session_start + timedelta(
            minutes=self.config.opening_range_minutes
        )

        regular = [
            bar
            for bar in bars
            if _eastern(bar.timestamp).date() == session_day
            and _eastern(bar.timestamp) >= session_start
        ]
        range_bars = [
            bar
            for bar in regular
            if _eastern(bar.timestamp) < range_end
        ]
        breakout_bars = [
            bar
            for bar in regular
            if _eastern(bar.timestamp) >= range_end
        ]

        if not range_bars:
            return OpeningBreakoutCandidate(
                symbol=symbol.upper(),
                as_of=bars[-1].timestamp,
                state=CandidateState.REJECTED,
                reasons=["opening range is incomplete"],
            )

        opening_high = max(bar.high for bar in range_bars)
        opening_low = min(bar.low for bar in range_bars)
        opening_volume = sum(bar.volume for bar in range_bars)
        width = (
            (opening_high - opening_low) / opening_low
            if opening_low > 0
            else 0.0
        )
        opening_range = OpeningRange(
            start=range_bars[0].timestamp,
            end=range_bars[-1].timestamp,
            high=opening_high,
            low=opening_low,
            volume=opening_volume,
            bars=len(range_bars),
            width_pct=width,
        )

        if not breakout_bars:
            return OpeningBreakoutCandidate(
                symbol=symbol.upper(),
                as_of=range_bars[-1].timestamp,
                state=CandidateState.DEVELOPING,
                opening_range=opening_range,
                reasons=["opening range formed; no post-range bar yet"],
            )

        breakout_bar = next(
            (
                bar
                for bar in breakout_bars
                if bar.close
                >= opening_high
                * (1 + self.config.min_breakout_close_pct)
            ),
            breakout_bars[-1],
        )

        through_breakout = [
            bar
            for bar in regular
            if bar.timestamp <= breakout_bar.timestamp
        ]
        current_vwap = _vwap(through_breakout)

        reference_volumes: list[float] = []
        if prior_session_bars:
            prior_sorted = sorted(
                prior_session_bars,
                key=lambda bar: bar.timestamp,
            )
            reference_volumes = [
                bar.volume
                for bar in prior_sorted
                if _eastern(bar.timestamp).time()
                == _eastern(breakout_bar.timestamp).time()
            ]
            if not reference_volumes:
                reference_volumes = [
                    bar.volume for bar in prior_sorted[-20:]
                ]

        volume_reference = _median_volume(reference_volumes)
        relative_volume = (
            breakout_bar.volume / volume_reference
            if volume_reference is not None and volume_reference > 0
            else None
        )

        breakout_pct = (
            breakout_bar.close / opening_high
        ) - 1.0
        candle_location = close_location(breakout_bar)
        wick = upper_wick_ratio(breakout_bar)

        structural_stop = opening_high * (
            1 - self.config.stop_buffer_pct
        )
        stop_risk = (
            (breakout_bar.close - structural_stop)
            / breakout_bar.close
            if breakout_bar.close > structural_stop
            else 0.0
        )

        resolved_prior_close = prior_close
        if (
            resolved_prior_close is None
            and prior_session_bars
        ):
            prior_sorted = sorted(
                prior_session_bars,
                key=lambda bar: bar.timestamp,
            )
            if prior_sorted:
                resolved_prior_close = prior_sorted[-1].close

        gates = [
            _gate(
                "breakout_close",
                breakout_pct >= self.config.min_breakout_close_pct,
                breakout_pct,
                self.config.min_breakout_close_pct,
            ),
            _gate(
                "breakout_extension",
                breakout_pct <= self.config.max_breakout_extension_pct,
                breakout_pct,
                self.config.max_breakout_extension_pct,
            ),
            _gate(
                "close_location",
                candle_location >= self.config.min_close_location,
                candle_location,
                self.config.min_close_location,
            ),
            _gate(
                "upper_wick",
                wick <= self.config.max_upper_wick_ratio,
                wick,
                self.config.max_upper_wick_ratio,
            ),
            _gate(
                "structural_risk",
                0 < stop_risk <= self.config.max_stop_risk_pct,
                stop_risk,
                self.config.max_stop_risk_pct,
            ),
        ]

        if self.config.require_vwap:
            gates.append(
                _gate(
                    "above_vwap",
                    current_vwap is not None
                    and breakout_bar.close > current_vwap,
                    breakout_bar.close,
                    current_vwap,
                )
            )

        if self.config.require_relative_volume:
            gates.append(
                _gate(
                    "relative_volume",
                    relative_volume is not None
                    and relative_volume >= self.config.min_relative_volume,
                    relative_volume,
                    self.config.min_relative_volume,
                )
            )

        if self.config.require_prior_close:
            gates.append(
                _gate(
                    "above_prior_close",
                    resolved_prior_close is not None
                    and breakout_bar.close > resolved_prior_close,
                    breakout_bar.close,
                    resolved_prior_close,
                )
            )

        confirmed = all(gate.passed for gate in gates)
        developing = (
            breakout_bar.high > opening_high
            and breakout_bar.close <= opening_high
        )

        if confirmed:
            state = CandidateState.CONFIRMED
        elif developing:
            state = CandidateState.DEVELOPING
        else:
            state = CandidateState.REJECTED

        trigger_score = _clamp(
            55
            + breakout_pct
            / max(self.config.min_breakout_close_pct, 0.001)
            * 12
            + candle_location * 20
            + (1 - wick) * 13
        )
        volume_score = (
            _clamp((relative_volume / 2.0) * 100)
            if relative_volume is not None
            else 50.0
        )
        vwap_score = (
            100.0
            if current_vwap is not None
            and breakout_bar.close > current_vwap
            else 0.0
        )
        structure_score = _clamp(
            100 - min(width, 0.20) / 0.20 * 100
        )
        risk_score = (
            _clamp(
                100
                * (
                    1
                    - stop_risk
                    / self.config.max_stop_risk_pct
                )
            )
            if stop_risk > 0
            else 0.0
        )
        overall = _clamp(
            trigger_score * 0.35
            + volume_score * 0.20
            + vwap_score * 0.15
            + structure_score * 0.10
            + risk_score * 0.20
        )

        failed = [
            gate.name for gate in gates if not gate.passed
        ]
        reasons = (
            []
            if confirmed
            else [f"failed gate: {name}" for name in failed]
        )

        return OpeningBreakoutCandidate(
            symbol=symbol.upper(),
            as_of=breakout_bar.timestamp,
            state=state,
            opening_range=opening_range,
            breakout_bar=breakout_bar,
            entry_price=breakout_bar.close,
            structural_stop=structural_stop,
            stop_risk_pct=stop_risk,
            vwap=current_vwap,
            relative_volume=relative_volume,
            scores=OpeningBreakoutScore(
                trigger=round(trigger_score, 1),
                volume=round(volume_score, 1),
                vwap=round(vwap_score, 1),
                structure=round(structure_score, 1),
                risk=round(risk_score, 1),
                overall=round(overall, 1),
            ),
            gates=gates,
            reasons=reasons,
            metrics={
                "opening_range_high": opening_high,
                "opening_range_low": opening_low,
                "opening_range_width_pct": width,
                "opening_range_volume": opening_volume,
                "breakout_pct": breakout_pct,
                "close_location": candle_location,
                "upper_wick_ratio": wick,
                "vwap": current_vwap,
                "relative_volume": relative_volume,
                "prior_close": resolved_prior_close,
            },
        )
