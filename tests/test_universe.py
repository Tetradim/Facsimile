from facsimile.universe import (
    InstrumentProfile,
    MatchMode,
    UniverseFilter,
    evaluate_universe,
    filter_universe,
)


def test_filters_all_stocks_under_three_dollars() -> None:
    criteria = UniverseFilter(max_price=3.0)
    profiles = [
        InstrumentProfile(symbol="AAA", price=0.82),
        InstrumentProfile(symbol="BBB", price=2.95),
        InstrumentProfile(symbol="CCC", price=3.01),
    ]

    selected = filter_universe(profiles, criteria)

    assert [item.symbol for item in selected] == ["AAA", "BBB"]


def test_medical_alias_matches_healthcare_sector() -> None:
    profile = InstrumentProfile(
        symbol="MED",
        price=2.40,
        sector="Health Care",
        industry="Biotechnology",
    )
    criteria = UniverseFilter(
        max_price=3.0,
        sectors=["Medical"],
    )

    decision = evaluate_universe(profile, criteria)

    assert decision.eligible


def test_space_theme_is_not_forced_into_formal_sector() -> None:
    profile = InstrumentProfile(
        symbol="ORB",
        price=0.91,
        sector="Industrials",
        industry="Aerospace",
        themes=["Space", "Satellite"],
    )
    criteria = UniverseFilter(
        max_price=1.0,
        themes=["Space"],
    )

    decision = evaluate_universe(profile, criteria)

    assert decision.eligible


def test_combined_price_and_taxonomy_filter_rejects_wrong_price() -> None:
    profile = InstrumentProfile(
        symbol="BIO",
        price=4.25,
        sector="Health Care",
        industry="Biotechnology",
    )
    criteria = UniverseFilter(
        max_price=3.0,
        sectors=["Medical"],
    )

    decision = evaluate_universe(profile, criteria)

    assert not decision.eligible
    assert any(
        gate.name == "max_price" and not gate.passed
        for gate in decision.gates
    )


def test_all_taxonomy_mode_requires_each_requested_dimension() -> None:
    profile = InstrumentProfile(
        symbol="SAT",
        price=2.0,
        sector="Industrials",
        industry="Aerospace",
        themes=["Space"],
    )
    criteria = UniverseFilter(
        sectors=["Industrials"],
        themes=["Space"],
        taxonomy_mode=MatchMode.ALL,
    )

    assert evaluate_universe(profile, criteria).eligible
