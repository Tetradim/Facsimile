from datetime import datetime, timezone

from facsimile.catalysts import (
    CatalystEvidence,
    _company_query_name,
    structured_catalyst_score,
)


def test_company_query_name_removes_common_legal_suffixes():
    assert _company_query_name("Acme Therapeutics, Inc.") == "Acme Therapeutics"
    assert _company_query_name("Example Bio Holdings Corporation") == "Example Bio"


def test_structured_catalyst_score_prefers_high_quality_evidence():
    evidence = [
        CatalystEvidence(
            source="ClinicalTrials.gov",
            kind="clinical_trial",
            title="Phase 3 study",
            score=90,
            event_date=datetime(2026, 10, 15, tzinfo=timezone.utc),
        ),
        CatalystEvidence(
            source="openFDA Drugs@FDA",
            kind="fda_submission",
            title="Recent FDA submission",
            score=70,
        ),
        CatalystEvidence(
            source="ClinicalTrials.gov",
            kind="clinical_trial",
            title="Older Phase 1 study",
            score=40,
        ),
    ]

    score = structured_catalyst_score(evidence)

    assert 70 < score < 90
