from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class LogicMode(str, Enum):
    ALL = "all"
    ANY = "any"
    NONE = "none"


class FilterOperator(str, Enum):
    EQ = "eq"
    NE = "ne"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    BETWEEN = "between"
    CONTAINS = "contains"


class StrategyCondition(BaseModel):
    field: str
    operator: FilterOperator
    value: Any
    timeframe: str = "current"
    label: str | None = None


class StrategyGroup(BaseModel):
    mode: LogicMode
    conditions: list[StrategyCondition] = Field(default_factory=list)


class StrategyDefinition(BaseModel):
    schema_version: str = "facsimile.strategy.v1"
    name: str
    description: str = ""
    all_of: StrategyGroup = Field(
        default_factory=lambda: StrategyGroup(mode=LogicMode.ALL)
    )
    any_of: StrategyGroup = Field(
        default_factory=lambda: StrategyGroup(mode=LogicMode.ANY)
    )
    none_of: StrategyGroup = Field(
        default_factory=lambda: StrategyGroup(mode=LogicMode.NONE)
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


def medical_catalyst_weekly_strategy() -> StrategyDefinition:
    return StrategyDefinition(
        name="Medical Catalyst Weekly",
        description=(
            "Low-priced healthcare weekly breakout with catalyst, trend, "
            "volume and structural-risk confirmation."
        ),
        all_of=StrategyGroup(
            mode=LogicMode.ALL,
            conditions=[
                StrategyCondition(
                    field="price",
                    operator=FilterOperator.BETWEEN,
                    value=[0.10, 2.50],
                    label="Price 0.10 to 2.50",
                ),
                StrategyCondition(
                    field="sector",
                    operator=FilterOperator.CONTAINS,
                    value="health",
                    label="Healthcare / Medical",
                ),
                StrategyCondition(
                    field="box_bars",
                    operator=FilterOperator.GTE,
                    value=6,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="box_width_pct",
                    operator=FilterOperator.LTE,
                    value=0.18,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="close_above_box_pct",
                    operator=FilterOperator.GTE,
                    value=0.02,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="close_location",
                    operator=FilterOperator.GTE,
                    value=0.80,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="upper_wick_ratio",
                    operator=FilterOperator.LTE,
                    value=0.35,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="volume_vs_average",
                    operator=FilterOperator.GTE,
                    value=1.50,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="stop_risk_pct",
                    operator=FilterOperator.LTE,
                    value=0.15,
                    timeframe="1w",
                ),
            ],
        ),
        any_of=StrategyGroup(
            mode=LogicMode.ANY,
            conditions=[
                StrategyCondition(
                    field="catalyst_score",
                    operator=FilterOperator.GTE,
                    value=70,
                ),
                StrategyCondition(
                    field="recent_news_count",
                    operator=FilterOperator.GTE,
                    value=1,
                ),
            ],
        ),
        none_of=StrategyGroup(
            mode=LogicMode.NONE,
            conditions=[
                StrategyCondition(
                    field="dilution_risk",
                    operator=FilterOperator.EQ,
                    value="extreme",
                ),
            ],
        ),
        metadata={
            "scanner_family": "weekly_breakout",
            "reusable_for": [
                "scan",
                "watchlist",
                "alert",
                "backtest",
            ],
        },
    )


def weekly_breakout_technical_strategy() -> StrategyDefinition:
    return StrategyDefinition(
        name="Weekly Breakout Technical",
        description=(
            "Historical-safe weekly breakout preset using price structure, "
            "trend, relative volume and structural risk without requiring "
            "historical news/catalyst reconstruction."
        ),
        all_of=StrategyGroup(
            mode=LogicMode.ALL,
            conditions=[
                StrategyCondition(
                    field="box_bars",
                    operator=FilterOperator.GTE,
                    value=6,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="box_width_pct",
                    operator=FilterOperator.LTE,
                    value=0.18,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="close_above_box_pct",
                    operator=FilterOperator.GTE,
                    value=0.02,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="close_location",
                    operator=FilterOperator.GTE,
                    value=0.80,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="upper_wick_ratio",
                    operator=FilterOperator.LTE,
                    value=0.35,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="volume_vs_average",
                    operator=FilterOperator.GTE,
                    value=1.50,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="stop_risk_pct",
                    operator=FilterOperator.LTE,
                    value=0.15,
                    timeframe="1w",
                ),
                StrategyCondition(
                    field="scores.technical",
                    operator=FilterOperator.GTE,
                    value=70,
                    timeframe="1w",
                ),
            ],
        ),
        metadata={
            "scanner_family": "weekly_breakout",
            "historical_safe": True,
            "reusable_for": [
                "scan",
                "watchlist",
                "alert",
                "backtest",
            ],
        },
    )


def default_presets() -> list[StrategyDefinition]:
    return [
        medical_catalyst_weekly_strategy(),
        weekly_breakout_technical_strategy(),
    ]


class ConditionResult(BaseModel):
    condition: StrategyCondition
    passed: bool
    actual: Any = None


class StrategyEvaluation(BaseModel):
    strategy_name: str
    passed: bool
    all_of: list[ConditionResult] = Field(default_factory=list)
    any_of: list[ConditionResult] = Field(default_factory=list)
    none_of: list[ConditionResult] = Field(default_factory=list)
    failed_reasons: list[str] = Field(default_factory=list)


def _lookup(facts: dict[str, Any], field: str) -> Any:
    current: Any = facts
    for part in field.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _condition_passes(condition: StrategyCondition, actual: Any) -> bool:
    expected = condition.value
    if actual is None:
        return False

    if condition.operator == FilterOperator.EQ:
        return actual == expected
    if condition.operator == FilterOperator.NE:
        return actual != expected
    if condition.operator == FilterOperator.GT:
        return actual > expected
    if condition.operator == FilterOperator.GTE:
        return actual >= expected
    if condition.operator == FilterOperator.LT:
        return actual < expected
    if condition.operator == FilterOperator.LTE:
        return actual <= expected
    if condition.operator == FilterOperator.BETWEEN:
        if not isinstance(expected, (list, tuple)) or len(expected) != 2:
            return False
        return expected[0] <= actual <= expected[1]
    if condition.operator == FilterOperator.CONTAINS:
        return str(expected).lower() in str(actual).lower()
    return False


def _evaluate_group(
    group: StrategyGroup,
    facts: dict[str, Any],
) -> list[ConditionResult]:
    return [
        ConditionResult(
            condition=condition,
            actual=_lookup(facts, condition.field),
            passed=_condition_passes(
                condition,
                _lookup(facts, condition.field),
            ),
        )
        for condition in group.conditions
    ]


def evaluate_strategy(
    strategy: StrategyDefinition,
    facts: dict[str, Any],
) -> StrategyEvaluation:
    all_results = _evaluate_group(strategy.all_of, facts)
    any_results = _evaluate_group(strategy.any_of, facts)
    none_results = _evaluate_group(strategy.none_of, facts)

    all_pass = all(item.passed for item in all_results)
    any_pass = (
        any(item.passed for item in any_results)
        if any_results
        else True
    )
    none_pass = not any(item.passed for item in none_results)

    failed: list[str] = []
    for item in all_results:
        if not item.passed:
            failed.append(
                item.condition.label
                or f"{item.condition.field} failed ALL rule"
            )
    if any_results and not any_pass:
        failed.append("No ANY condition passed")
    for item in none_results:
        if item.passed:
            failed.append(
                item.condition.label
                or f"{item.condition.field} matched exclusion rule"
            )

    return StrategyEvaluation(
        strategy_name=strategy.name,
        passed=all_pass and any_pass and none_pass,
        all_of=all_results,
        any_of=any_results,
        none_of=none_results,
        failed_reasons=failed,
    )
