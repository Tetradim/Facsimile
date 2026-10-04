from facsimile.strategy import (
    FilterOperator,
    LogicMode,
    StrategyCondition,
    StrategyDefinition,
    StrategyGroup,
    evaluate_strategy,
    medical_catalyst_weekly_strategy,
)


def test_medical_strategy_is_reusable_contract():
    strategy = medical_catalyst_weekly_strategy()

    assert strategy.schema_version == "facsimile.strategy.v1"
    assert strategy.all_of.mode == LogicMode.ALL
    assert strategy.any_of.mode == LogicMode.ANY
    assert strategy.none_of.mode == LogicMode.NONE
    assert "alert" in strategy.metadata["reusable_for"]
    assert "backtest" in strategy.metadata["reusable_for"]


def test_strategy_evaluator_honors_all_any_none():
    strategy = StrategyDefinition(
        name="test",
        all_of=StrategyGroup(
            mode=LogicMode.ALL,
            conditions=[
                StrategyCondition(
                    field="price",
                    operator=FilterOperator.BETWEEN,
                    value=[0.10, 2.50],
                ),
                StrategyCondition(
                    field="scores.technical",
                    operator=FilterOperator.GTE,
                    value=80,
                ),
            ],
        ),
        any_of=StrategyGroup(
            mode=LogicMode.ANY,
            conditions=[
                StrategyCondition(
                    field="catalyst",
                    operator=FilterOperator.GTE,
                    value=70,
                ),
                StrategyCondition(
                    field="news_count",
                    operator=FilterOperator.GTE,
                    value=1,
                ),
            ],
        ),
        none_of=StrategyGroup(
            mode=LogicMode.NONE,
            conditions=[
                StrategyCondition(
                    field="dilution",
                    operator=FilterOperator.EQ,
                    value="extreme",
                )
            ],
        ),
    )

    result = evaluate_strategy(
        strategy,
        {
            "price": 1.40,
            "scores": {"technical": 88},
            "catalyst": 40,
            "news_count": 2,
            "dilution": "low",
        },
    )

    assert result.passed is True
    assert not result.failed_reasons


def test_strategy_evaluator_reports_exclusion():
    strategy = StrategyDefinition(
        name="test",
        none_of=StrategyGroup(
            mode=LogicMode.NONE,
            conditions=[
                StrategyCondition(
                    field="dilution",
                    operator=FilterOperator.EQ,
                    value="extreme",
                    label="No extreme dilution",
                )
            ],
        ),
    )

    result = evaluate_strategy(strategy, {"dilution": "extreme"})

    assert result.passed is False
    assert result.failed_reasons == ["No extreme dilution"]
