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


def default_presets() -> list[StrategyDefinition]:
    return [medical_catalyst_weekly_strategy()]
