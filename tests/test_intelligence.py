from datetime import datetime, timedelta, timezone

from facsimile.intelligence import CandidateTier, build_candidate_intelligence
from facsimile.models import (
    BreakoutCandidate,
    CandidateState,
    ConsolidationBox,
    OHLCVBar,
    ScoreCard,
)


def _bars(multiplier: float = 1.0, step: float = 0.01) -> list[OHLCVBar]:
    start = datetime(2025, 1, 3, tzinfo=timezone.utc)
    bars = []
    for index in range(60):
        close = (1.0 + index * step) * multiplier
        bars.append(
            OHLCVBar(
                timestamp=start + timedelta(days=7 * index),
                open=close * 0.98,
                high=close * 1.03,
                low=close * 0.96,
                close=close,
                volume=2_000_000,
            )
        )
    return bars


def _candidate(state: CandidateState = CandidateState.CONFIRMED) -> BreakoutCandidate:
    bars = _bars()
    current = bars[-1]
    return BreakoutCandidate(
        symbol="TEST",
        as_of=current.timestamp,
        state=state,
        box=ConsolidationBox(
            start=bars[-9].timestamp,
            end=bars[-2].timestamp,
            bars=8,
            body_low=1.45,
            body_high=1.55,
            width_pct=0.069,
        ),
        entry_price=1.62,
        structural_stop=1.48,
        stop_risk_pct=0.086,
        scores=ScoreCard(
            quality=82,
            growth=88,
            momentum=92,
            breakout=94,
            risk=90,
            positional=88,
            entry=92,
            overall=90,
        ),
        metrics={
            "ma_value": 1.30,
            "macd": 0.08,
            "macd_signal": 0.04,
            "prior_high": 1.58,
            "volume_vs_average": 2.1,
            "close_above_box_pct": 0.045,
            "close_location": 0.91,
            "upper_wick_ratio": 0.08,
            "natr_14": 0.06,
        },
    )


def test_confirmed_candidate_receives_actionable_tier_and_explanations():
    intelligence = build_candidate_intelligence(
        _candidate(),
        _bars(1.0, step=0.02),
        _bars(1.0, step=0.01),
        [],
        80,
    )

    assert intelligence.tier in {
        CandidateTier.A_PLUS,
        CandidateTier.A,
        CandidateTier.B,
    }
    assert intelligence.scores.technical_health.score >= 80
    assert intelligence.scores.setup_quality.positives
    assert intelligence.scores.relative_strength.score > 50
    assert intelligence.facts["dilution_risk"] == "low"


def test_rejected_state_never_outranks_confirmed_by_score():
    confirmed = build_candidate_intelligence(
        _candidate(CandidateState.CONFIRMED),
        _bars(1.0),
        _bars(1.0),
        [],
        10,
    )
    rejected_candidate = _candidate(CandidateState.REJECTED)
    rejected_candidate.scores.overall = 100
    rejected = build_candidate_intelligence(
        rejected_candidate,
        _bars(1.5),
        _bars(1.0),
        [],
        100,
    )

    assert confirmed.rank_key[0] > rejected.rank_key[0]
    assert rejected.tier == CandidateTier.REJECTED
