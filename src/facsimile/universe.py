from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class MatchMode(str, Enum):
    ANY = "any"
    ALL = "all"


class InstrumentProfile(BaseModel):
    """Point-in-time metadata used to decide scanner eligibility."""

    symbol: str = Field(min_length=1, max_length=32)
    price: float = Field(gt=0)
    sector: str | None = None
    industry: str | None = None
    themes: list[str] = Field(default_factory=list)
    exchange: str | None = None
    market_cap: float | None = Field(default=None, ge=0)


class UniverseFilter(BaseModel):
    """Common pre-scan filter shared by every scanner family.

    Price bounds are inclusive. Taxonomy values are case-insensitive.
    Themes are deliberately separate from sectors so operator concepts such as
    Space, AI, Cannabis, EV, Quantum, etc. do not need to masquerade as formal
    market sectors.
    """

    min_price: float | None = Field(default=None, ge=0)
    max_price: float | None = Field(default=None, gt=0)

    sectors: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)
    exchanges: list[str] = Field(default_factory=list)

    min_market_cap: float | None = Field(default=None, ge=0)
    max_market_cap: float | None = Field(default=None, ge=0)

    taxonomy_mode: MatchMode = MatchMode.ANY

    @model_validator(mode="after")
    def validate_ranges(self) -> "UniverseFilter":
        if (
            self.min_price is not None
            and self.max_price is not None
            and self.min_price > self.max_price
        ):
            raise ValueError("min_price must be <= max_price")
        if (
            self.min_market_cap is not None
            and self.max_market_cap is not None
            and self.min_market_cap > self.max_market_cap
        ):
            raise ValueError("min_market_cap must be <= max_market_cap")
        return self


class UniverseGate(BaseModel):
    name: str
    passed: bool
    value: str | float | list[str] | None = None
    expected: str | float | list[str] | None = None


class UniverseDecision(BaseModel):
    eligible: bool
    gates: list[UniverseGate] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


def _norm(value: str | None) -> str:
    return " ".join((value or "").strip().lower().replace("&", "and").split())


def _norm_set(values: list[str]) -> set[str]:
    return {_norm(value) for value in values if _norm(value)}


def _taxonomy_aliases(profile: InstrumentProfile) -> set[str]:
    values = {
        _norm(profile.sector),
        _norm(profile.industry),
        *(_norm(theme) for theme in profile.themes),
    }
    values.discard("")

    aliases: set[str] = set(values)

    health_terms = {
        "health care",
        "healthcare",
        "medical",
        "biotech",
        "biotechnology",
        "pharmaceuticals",
        "pharma",
        "medical devices",
        "life sciences",
    }
    if values.intersection(health_terms):
        aliases.update({"health care", "healthcare", "medical"})

    space_terms = {
        "space",
        "aerospace",
        "space technology",
        "satellite",
        "satellites",
        "launch services",
        "space infrastructure",
    }
    if values.intersection(space_terms):
        aliases.update({"space", "space technology"})

    return aliases


def evaluate_universe(
    profile: InstrumentProfile,
    criteria: UniverseFilter | None,
) -> UniverseDecision:
    if criteria is None:
        return UniverseDecision(eligible=True)

    gates: list[UniverseGate] = []

    if criteria.min_price is not None:
        gates.append(
            UniverseGate(
                name="min_price",
                passed=profile.price >= criteria.min_price,
                value=profile.price,
                expected=criteria.min_price,
            )
        )

    if criteria.max_price is not None:
        gates.append(
            UniverseGate(
                name="max_price",
                passed=profile.price <= criteria.max_price,
                value=profile.price,
                expected=criteria.max_price,
            )
        )

    if criteria.min_market_cap is not None:
        gates.append(
            UniverseGate(
                name="min_market_cap",
                passed=(
                    profile.market_cap is not None
                    and profile.market_cap >= criteria.min_market_cap
                ),
                value=profile.market_cap,
                expected=criteria.min_market_cap,
            )
        )

    if criteria.max_market_cap is not None:
        gates.append(
            UniverseGate(
                name="max_market_cap",
                passed=(
                    profile.market_cap is not None
                    and profile.market_cap <= criteria.max_market_cap
                ),
                value=profile.market_cap,
                expected=criteria.max_market_cap,
            )
        )

    taxonomy = _taxonomy_aliases(profile)
    taxonomy_checks: list[UniverseGate] = []

    requested_sectors = _norm_set(criteria.sectors)
    if requested_sectors:
        taxonomy_checks.append(
            UniverseGate(
                name="sector",
                passed=bool(taxonomy.intersection(requested_sectors)),
                value=profile.sector,
                expected=criteria.sectors,
            )
        )

    requested_industries = _norm_set(criteria.industries)
    if requested_industries:
        taxonomy_checks.append(
            UniverseGate(
                name="industry",
                passed=bool(taxonomy.intersection(requested_industries)),
                value=profile.industry,
                expected=criteria.industries,
            )
        )

    requested_themes = _norm_set(criteria.themes)
    if requested_themes:
        taxonomy_checks.append(
            UniverseGate(
                name="theme",
                passed=bool(taxonomy.intersection(requested_themes)),
                value=profile.themes,
                expected=criteria.themes,
            )
        )

    requested_exchanges = _norm_set(criteria.exchanges)
    if requested_exchanges:
        gates.append(
            UniverseGate(
                name="exchange",
                passed=_norm(profile.exchange) in requested_exchanges,
                value=profile.exchange,
                expected=criteria.exchanges,
            )
        )

    if taxonomy_checks:
        if criteria.taxonomy_mode == MatchMode.ALL:
            taxonomy_pass = all(gate.passed for gate in taxonomy_checks)
        else:
            taxonomy_pass = any(gate.passed for gate in taxonomy_checks)

        gates.append(
            UniverseGate(
                name="taxonomy",
                passed=taxonomy_pass,
                value=[
                    value
                    for value in (
                        profile.sector,
                        profile.industry,
                        *profile.themes,
                    )
                    if value
                ],
                expected=[
                    *criteria.sectors,
                    *criteria.industries,
                    *criteria.themes,
                ],
            )
        )

    eligible = all(gate.passed for gate in gates)
    reasons = [
        f"failed universe gate: {gate.name}"
        for gate in gates
        if not gate.passed
    ]

    return UniverseDecision(
        eligible=eligible,
        gates=gates,
        reasons=reasons,
    )


def filter_universe(
    profiles: list[InstrumentProfile],
    criteria: UniverseFilter | None,
) -> list[InstrumentProfile]:
    return [
        profile
        for profile in profiles
        if evaluate_universe(profile, criteria).eligible
    ]
