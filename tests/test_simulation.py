from facsimile.simulation import MonteCarloRequest, run_monte_carlo


def test_monte_carlo_is_reproducible_with_fixed_seed():
    request = MonteCarloRequest(
        returns_pct=[10, -5, 8, -3, 4],
        runs=500,
        trades_per_run=20,
        seed=123,
        sample_paths=3,
    )

    first = run_monte_carlo(request)
    second = run_monte_carlo(request)

    assert first == second
    assert first.ending_equity_p10 <= first.ending_equity_p50
    assert first.ending_equity_p50 <= first.ending_equity_p90
    assert len(first.sample_paths) == 3


def test_position_fraction_reduces_drawdown_exposure():
    full = run_monte_carlo(
        MonteCarloRequest(
            returns_pct=[15, -20, 12, -10, 8],
            runs=500,
            trades_per_run=25,
            seed=7,
            position_fraction=1.0,
        )
    )
    half = run_monte_carlo(
        MonteCarloRequest(
            returns_pct=[15, -20, 12, -10, 8],
            runs=500,
            trades_per_run=25,
            seed=7,
            position_fraction=0.5,
        )
    )

    assert half.max_drawdown_p90_pct < full.max_drawdown_p90_pct
