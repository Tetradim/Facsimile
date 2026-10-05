from __future__ import annotations

import random
from math import floor

from pydantic import BaseModel, Field


class MonteCarloRequest(BaseModel):
    returns_pct: list[float] = Field(min_length=1, max_length=5000)
    starting_equity: float = Field(default=10_000, gt=0)
    position_fraction: float = Field(default=1.0, gt=0, le=1.0)
    runs: int = Field(default=1000, ge=100, le=20_000)
    trades_per_run: int | None = Field(default=None, ge=1, le=5000)
    ruin_fraction: float = Field(default=0.50, gt=0, lt=1)
    seed: int = 42
    sample_paths: int = Field(default=20, ge=0, le=100)


class MonteCarloPath(BaseModel):
    run: int
    equity: list[float]
    max_drawdown_pct: float
    ending_equity: float


class MonteCarloResponse(BaseModel):
    runs: int
    trades_per_run: int
    starting_equity: float
    probability_profitable_pct: float
    probability_ruin_pct: float
    ending_equity_p10: float
    ending_equity_p25: float
    ending_equity_p50: float
    ending_equity_p75: float
    ending_equity_p90: float
    max_drawdown_p50_pct: float
    max_drawdown_p90_pct: float
    average_ending_equity: float
    sample_paths: list[MonteCarloPath]


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]

    position = (len(ordered) - 1) * percentile
    low = floor(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] * (1 - fraction) + ordered[high] * fraction


def run_monte_carlo(request: MonteCarloRequest) -> MonteCarloResponse:
    clean_returns = [
        value / 100.0
        for value in request.returns_pct
        if value == value and value > -100
    ]
    if not clean_returns:
        raise ValueError("returns_pct contains no usable returns")

    rng = random.Random(request.seed)
    trades_per_run = (
        request.trades_per_run
        if request.trades_per_run is not None
        else len(clean_returns)
    )
    ruin_level = request.starting_equity * request.ruin_fraction

    ending_values: list[float] = []
    drawdowns: list[float] = []
    profitable = 0
    ruined = 0
    paths: list[MonteCarloPath] = []

    for run in range(request.runs):
        equity = request.starting_equity
        peak = equity
        max_drawdown = 0.0
        path = [round(equity, 2)]

        for _ in range(trades_per_run):
            sampled_return = clean_returns[
                rng.randrange(len(clean_returns))
            ]
            equity *= 1 + request.position_fraction * sampled_return
            equity = max(0.0, equity)
            peak = max(peak, equity)
            drawdown = (
                (equity / peak) - 1.0
                if peak > 0
                else -1.0
            )
            max_drawdown = min(max_drawdown, drawdown)
            if run < request.sample_paths:
                path.append(round(equity, 2))

        ending_values.append(equity)
        drawdowns.append(abs(max_drawdown) * 100)

        if equity > request.starting_equity:
            profitable += 1
        if equity <= ruin_level:
            ruined += 1

        if run < request.sample_paths:
            paths.append(
                MonteCarloPath(
                    run=run + 1,
                    equity=path,
                    max_drawdown_pct=round(
                        abs(max_drawdown) * 100,
                        3,
                    ),
                    ending_equity=round(equity, 2),
                )
            )

    return MonteCarloResponse(
        runs=request.runs,
        trades_per_run=trades_per_run,
        starting_equity=request.starting_equity,
        probability_profitable_pct=round(
            profitable / request.runs * 100,
            2,
        ),
        probability_ruin_pct=round(
            ruined / request.runs * 100,
            2,
        ),
        ending_equity_p10=round(
            _percentile(ending_values, 0.10),
            2,
        ),
        ending_equity_p25=round(
            _percentile(ending_values, 0.25),
            2,
        ),
        ending_equity_p50=round(
            _percentile(ending_values, 0.50),
            2,
        ),
        ending_equity_p75=round(
            _percentile(ending_values, 0.75),
            2,
        ),
        ending_equity_p90=round(
            _percentile(ending_values, 0.90),
            2,
        ),
        max_drawdown_p50_pct=round(
            _percentile(drawdowns, 0.50),
            2,
        ),
        max_drawdown_p90_pct=round(
            _percentile(drawdowns, 0.90),
            2,
        ),
        average_ending_equity=round(
            sum(ending_values) / len(ending_values),
            2,
        ),
        sample_paths=paths,
    )
