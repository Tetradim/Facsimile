# Facsimile

Clean-room market scanner service for weekly consolidation breakouts and future scanner families intended for eventual integration into **Sentinel Edge**.

Facsimile is deliberately standalone today. It does not depend on or integrate with any other Sentinel-line bot.

## Current scope

The first implementation slice provides:

- completed-week OHLCV aggregation
- body-based consolidation-box detection
- configurable weekly breakout gates
- 20-week trend and MACD confirmation
- lookback-high confirmation
- candle-quality and volume checks
- structural stop and maximum-risk validation
- separate Quality, Growth, Momentum, Breakout, Risk, Positional, Entry and Overall scores
- optional point-in-time fundamental inputs
- a stable versioned scanner envelope for future Edge ingestion
- FastAPI scan endpoints
- deterministic tests and CI

No live brokerage execution is included.

## Planned scanner families

The contract is designed so additional scanners can be added without changing the Edge-facing envelope. The current roadmap reserves:

- Weekly Breakout
- Opening Breakout
- Short Squeeze

These scanners will remain evidence-producing engines. Sentinel Edge will later own provider routing, alert delivery, cross-scanner ranking, risk policy and any execution/handoff behavior.

## Development

```bash
python -m pip install -e ".[dev]"
pytest -q
uvicorn facsimile.api:app --reload
```

See [docs/EDGE_INTEGRATION.md](docs/EDGE_INTEGRATION.md) for the integration boundary.
