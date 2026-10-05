from datetime import datetime, timezone

from facsimile.models import CandidateState
from facsimile.short_squeeze import (
    ShortSqueezeEngine,
    ShortSqueezeSnapshot,
)


def _snapshot(**updates) -> ShortSqueezeSnapshot:
    payload = {
        "symbol": "TEST",
        "as_of": datetime(2026, 10, 4, tzinfo=timezone.utc),
        "price": 3.25,
        "short_float_pct": 0.28,
        "days_to_cover": 5.4,
        "float_shares": 24_000_000,
        "relative_volume": 2.4,
        "average_daily_dollar_volume": 4_500_000,
        "borrow_fee_pct": 0.32,
        "utilization_pct": 0.91,
        "return_5d_pct": 0.08,
        "breakout_pct": 0.05,
        "distance_to_52w_high_pct": 0.12,
        "source_evidence": {
            "short_interest": "test-short-interest-source",
            "borrow": "test-borrow-source",
        },
    }
    payload.update(updates)
    return ShortSqueezeSnapshot(**payload)


def test_short_squeeze_confirms_when_pressure_and_trigger_align():
    result = ShortSqueezeEngine().evaluate(_snapshot())

    assert result.state == CandidateState.CONFIRMED
    assert result.scores.pressure > 70
    assert result.scores.trigger > 50
    assert result.scores.overall > 60
    assert "short_interest_semantics" in result.evidence


def test_short_squeeze_is_developing_when_pressure_exists_without_trigger():
    result = ShortSqueezeEngine().evaluate(
        _snapshot(
            relative_volume=0.8,
            breakout_pct=0.0,
            return_5d_pct=0.01,
        )
    )

    assert result.state == CandidateState.DEVELOPING
    assert any(
        reason == "failed gate: relative_volume"
        for reason in result.reasons
    )
    assert any(
        reason == "failed gate: price_trigger"
        for reason in result.reasons
    )


def test_short_squeeze_rejects_low_reported_short_interest():
    result = ShortSqueezeEngine().evaluate(
        _snapshot(
            short_float_pct=0.06,
            days_to_cover=1.1,
        )
    )

    assert result.state == CandidateState.REJECTED
    assert "failed gate: short_float" in result.reasons
    assert "failed gate: days_to_cover" in result.reasons


def test_missing_borrow_data_is_neutral_not_invented():
    result = ShortSqueezeEngine().evaluate(
        _snapshot(
            borrow_fee_pct=None,
            utilization_pct=None,
        )
    )

    assert result.scores.borrow == 50
