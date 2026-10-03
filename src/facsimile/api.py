from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from .breakout import WeeklyBreakoutEngine
from .contracts import ScanEnvelope, weekly_breakout_envelope
from .live_data import (
    LiveNewsItem,
    LiveProfile,
    LiveScanRequest,
    LiveScanResponse,
    ProviderStatus,
    get_live_data_service,
)
from .models import (
    BreakoutCandidate,
    BreakoutConfig,
    CandidateState,
    FundamentalSnapshot,
    OHLCVBar,
)
from .universe import (
    InstrumentProfile,
    UniverseDecision,
    UniverseFilter,
    evaluate_universe,
)

app = FastAPI(
    title="Facsimile Breakout Scanner",
    version="0.2.0",
    description=(
        "Clean-room scanner and universe filtering service. "
        "No brokerage execution."
    ),
)


class ScanRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    weekly_bars: list[OHLCVBar]
    fundamentals: FundamentalSnapshot | None = None
    config: BreakoutConfig | None = None
    profile: InstrumentProfile | None = None
    universe: UniverseFilter | None = None

    @model_validator(mode="after")
    def validate_universe_input(self) -> "ScanRequest":
        if self.universe is not None and self.profile is None:
            raise ValueError(
                "profile is required when a universe filter is supplied"
            )
        if (
            self.profile is not None
            and self.profile.symbol.upper() != self.symbol.upper()
        ):
            raise ValueError("profile.symbol must match symbol")
        return self


class UniverseFilterRequest(BaseModel):
    profiles: list[InstrumentProfile]
    criteria: UniverseFilter


class UniverseFilterResponse(BaseModel):
    total: int
    eligible_count: int
    excluded_count: int
    eligible: list[InstrumentProfile]
    excluded: list[InstrumentProfile]


class BatchScanItem(BaseModel):
    profile: InstrumentProfile
    weekly_bars: list[OHLCVBar]
    fundamentals: FundamentalSnapshot | None = None


class BatchWeeklyScanRequest(BaseModel):
    items: list[BatchScanItem]
    universe: UniverseFilter | None = None
    config: BreakoutConfig | None = None
    include_excluded: bool = False


class BatchWeeklyScanResponse(BaseModel):
    total: int
    eligible_count: int
    excluded_count: int
    candidates: list[BreakoutCandidate]


def _universe_rejection(
    request: ScanRequest,
    decision: UniverseDecision,
) -> BreakoutCandidate:
    timestamp = max(
        (bar.timestamp for bar in request.weekly_bars),
        default=datetime.now(timezone.utc),
    )

    return BreakoutCandidate(
        symbol=request.symbol.upper(),
        as_of=timestamp,
        state=CandidateState.REJECTED,
        reasons=decision.reasons,
        metadata={
            "engine": "universe_filter",
            "execution": "none",
            "universe": decision.model_dump(mode="json"),
            "profile": (
                request.profile.model_dump(mode="json")
                if request.profile is not None
                else None
            ),
        },
    )


def _scan_weekly(request: ScanRequest) -> BreakoutCandidate:
    universe_decision: UniverseDecision | None = None

    if request.profile is not None:
        universe_decision = evaluate_universe(
            request.profile,
            request.universe,
        )
        if not universe_decision.eligible:
            return _universe_rejection(
                request,
                universe_decision,
            )

    candidate = WeeklyBreakoutEngine(request.config).evaluate(
        request.symbol,
        request.weekly_bars,
        request.fundamentals,
    )

    if request.profile is not None:
        candidate.metadata["profile"] = request.profile.model_dump(
            mode="json"
        )

    if universe_decision is not None:
        candidate.metadata["universe"] = universe_decision.model_dump(
            mode="json"
        )

    return candidate


def _filter_market_universe(
    request: UniverseFilterRequest,
) -> UniverseFilterResponse:
    eligible: list[InstrumentProfile] = []
    excluded: list[InstrumentProfile] = []

    for profile in request.profiles:
        decision = evaluate_universe(
            profile,
            request.criteria,
        )
        if decision.eligible:
            eligible.append(profile)
        else:
            excluded.append(profile)

    return UniverseFilterResponse(
        total=len(request.profiles),
        eligible_count=len(eligible),
        excluded_count=len(excluded),
        eligible=eligible,
        excluded=excluded,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "facsimile"}


@app.get(
    "/v1/live/providers",
    response_model=list[ProviderStatus],
)
def live_provider_status() -> list[ProviderStatus]:
    return get_live_data_service().provider_status()


@app.get(
    "/v1/live/profile/{symbol}",
    response_model=LiveProfile,
)
def live_profile(symbol: str) -> LiveProfile:
    return get_live_data_service().profile_for_symbol(symbol)


@app.get(
    "/v1/live/news/{symbol}",
    response_model=list[LiveNewsItem],
)
def live_news(symbol: str) -> list[LiveNewsItem]:
    return get_live_data_service().news_for_symbol(symbol)


@app.post(
    "/v1/live/scan/weekly-breakout",
    response_model=LiveScanResponse,
)
def live_scan_weekly_breakout(
    request: LiveScanRequest,
) -> LiveScanResponse:
    return get_live_data_service().scan_weekly_breakout(request)


@app.post(
    "/v1/universe/filter",
    response_model=UniverseFilterResponse,
)
def filter_market_universe(
    request: UniverseFilterRequest,
) -> UniverseFilterResponse:
    return _filter_market_universe(request)


@app.post(
    "/v1/universe/value-scan",
    response_model=UniverseFilterResponse,
)
def value_scan_universe(
    request: UniverseFilterRequest,
) -> UniverseFilterResponse:
    """Operator-friendly alias for price/taxonomy universe filtering."""

    return _filter_market_universe(request)


@app.post(
    "/v1/scan/weekly-breakout",
    response_model=BreakoutCandidate,
)
def scan_weekly_breakout(
    request: ScanRequest,
) -> BreakoutCandidate:
    return _scan_weekly(request)


@app.post(
    "/v1/scan/weekly-breakout/envelope",
    response_model=ScanEnvelope,
)
def scan_weekly_breakout_envelope(
    request: ScanRequest,
) -> ScanEnvelope:
    candidate = _scan_weekly(request)
    return weekly_breakout_envelope(candidate)


@app.post(
    "/v1/scan/weekly-breakout/batch",
    response_model=BatchWeeklyScanResponse,
)
def scan_weekly_breakout_batch(
    request: BatchWeeklyScanRequest,
) -> BatchWeeklyScanResponse:
    candidates: list[BreakoutCandidate] = []
    eligible_count = 0
    excluded_count = 0

    for item in request.items:
        scan_request = ScanRequest(
            symbol=item.profile.symbol,
            weekly_bars=item.weekly_bars,
            fundamentals=item.fundamentals,
            config=request.config,
            profile=item.profile,
            universe=request.universe,
        )

        decision = evaluate_universe(
            item.profile,
            request.universe,
        )

        if not decision.eligible:
            excluded_count += 1
            if request.include_excluded:
                candidates.append(
                    _universe_rejection(
                        scan_request,
                        decision,
                    )
                )
            continue

        eligible_count += 1
        candidates.append(_scan_weekly(scan_request))

    return BatchWeeklyScanResponse(
        total=len(request.items),
        eligible_count=eligible_count,
        excluded_count=excluded_count,
        candidates=candidates,
    )


_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=_FRONTEND_DIST, html=True),
        name="frontend",
    )
