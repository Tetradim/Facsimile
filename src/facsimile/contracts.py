from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from .models import BreakoutCandidate


class ScannerFamily(str, Enum):
    WEEKLY_BREAKOUT = "weekly_breakout"
    OPENING_BREAKOUT = "opening_breakout"
    SHORT_SQUEEZE = "short_squeeze"


class ScanEnvelope(BaseModel):
    """Stable boundary intended for later Sentinel Edge ingestion."""

    schema_version: str = "facsimile.scan_envelope.v1"
    family: ScannerFamily
    symbol: str
    observed_at: datetime
    status: str
    score: float | None = Field(default=None, ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)


def weekly_breakout_envelope(
    candidate: BreakoutCandidate,
) -> ScanEnvelope:
    return ScanEnvelope(
        family=ScannerFamily.WEEKLY_BREAKOUT,
        symbol=candidate.symbol,
        observed_at=candidate.as_of,
        status=candidate.state.value,
        score=(
            candidate.scores.overall
            if candidate.scores is not None
            else None
        ),
        reasons=candidate.reasons,
        evidence={
            "gates": [
                gate.model_dump(mode="json")
                for gate in candidate.gates
            ],
            "metrics": candidate.metrics,
            "universe": candidate.metadata.get("universe"),
            "profile": candidate.metadata.get("profile"),
        },
        payload=candidate.model_dump(mode="json"),
    )
