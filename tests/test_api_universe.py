from facsimile.api import (
    ScanRequest,
    UniverseFilterRequest,
    filter_market_universe,
    scan_weekly_breakout,
)
from facsimile.models import CandidateState
from facsimile.universe import InstrumentProfile, UniverseFilter


def test_value_scan_filters_medical_stocks_under_three() -> None:
    request = UniverseFilterRequest(
        profiles=[
            InstrumentProfile(
                symbol="MED1",
                price=0.75,
                sector="Health Care",
                industry="Biotechnology",
            ),
            InstrumentProfile(
                symbol="MED2",
                price=2.90,
                sector="Health Care",
                industry="Medical Devices",
            ),
            InstrumentProfile(
                symbol="MED3",
                price=3.25,
                sector="Health Care",
                industry="Biotechnology",
            ),
            InstrumentProfile(
                symbol="TECH",
                price=1.10,
                sector="Technology",
            ),
        ],
        criteria=UniverseFilter(
            max_price=3.0,
            sectors=["Medical"],
        ),
    )

    response = filter_market_universe(request)

    assert response.eligible_count == 2
    assert [item.symbol for item in response.eligible] == [
        "MED1",
        "MED2",
    ]


def test_universe_rejection_happens_before_breakout_history_check() -> None:
    request = ScanRequest(
        symbol="BIO",
        weekly_bars=[],
        profile=InstrumentProfile(
            symbol="BIO",
            price=4.50,
            sector="Health Care",
            industry="Biotechnology",
        ),
        universe=UniverseFilter(
            max_price=3.0,
            sectors=["Medical"],
        ),
    )

    candidate = scan_weekly_breakout(request)

    assert candidate.state == CandidateState.REJECTED
    assert candidate.metadata["engine"] == "universe_filter"
    assert "failed universe gate: max_price" in candidate.reasons
