from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .breakout import WeeklyBreakoutEngine
from .contracts import ScanEnvelope, weekly_breakout_envelope
from .models import (
    BreakoutCandidate,
    BreakoutConfig,
    FundamentalSnapshot,
    OHLCVBar,
)

app = FastAPI(
    title="Facsimile Breakout Scanner",
    version="0.1.0",
    description=(
        "Clean-room weekly breakout detection and scoring. "
        "No brokerage execution."
    ),
)


class ScanRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    weekly_bars: list[OHLCVBar]
    fundamentals: FundamentalSnapshot | None = None
    config: BreakoutConfig | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "facsimile"}


@app.post(
    "/v1/scan/weekly-breakout",
    response_model=BreakoutCandidate,
)
def scan_weekly_breakout(
    request: ScanRequest,
) -> BreakoutCandidate:
    return WeeklyBreakoutEngine(request.config).evaluate(
        request.symbol,
        request.weekly_bars,
        request.fundamentals,
    )


@app.post(
    "/v1/scan/weekly-breakout/envelope",
    response_model=ScanEnvelope,
)
def scan_weekly_breakout_envelope(
    request: ScanRequest,
) -> ScanEnvelope:
    candidate = scan_weekly_breakout(request)
    return weekly_breakout_envelope(candidate)
