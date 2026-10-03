from facsimile.contracts import (
    ScannerFamily,
    weekly_breakout_envelope,
)
from facsimile.models import BreakoutCandidate, CandidateState


def test_weekly_breakout_envelope_is_stable() -> None:
    candidate = BreakoutCandidate(
        symbol="ABC",
        as_of="2025-06-06T20:00:00Z",
        state=CandidateState.CONFIRMED,
    )

    envelope = weekly_breakout_envelope(candidate)

    assert envelope.schema_version == "facsimile.scan_envelope.v1"
    assert envelope.family == ScannerFamily.WEEKLY_BREAKOUT
    assert envelope.symbol == "ABC"
    assert envelope.status == "confirmed"
    assert envelope.payload["schema_version"] == (
        "facsimile.breakout_candidate.v1"
    )
