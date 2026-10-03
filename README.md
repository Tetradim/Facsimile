# Facsimile

Clean-room market scanner service for weekly consolidation breakouts and future scanner families intended for eventual integration into **Sentinel Edge**.

Facsimile is deliberately standalone today. It does not depend on or integrate with any other Sentinel-line bot.

## Current scope

The implementation currently provides:

- completed-week OHLCV aggregation
- body-based consolidation-box detection
- configurable weekly breakout gates
- 20-week trend and MACD confirmation
- lookback-high confirmation
- candle-quality and volume checks
- structural stop and maximum-risk validation
- separate Quality, Growth, Momentum, Breakout, Risk, Positional, Entry and Overall scores
- optional point-in-time fundamental inputs
- a shared **Value Scanner / Universe Filter** with:
  - minimum and maximum stock price
  - sector selection
  - industry selection
  - theme selection such as Space
  - exchange selection
  - minimum and maximum market cap
- batch scanning where the universe filter runs before technical scanner logic
- a stable versioned scanner envelope for future Edge ingestion
- FastAPI scan endpoints
- deterministic tests and CI

No live brokerage execution is included.

## Planned scanner families

The contract is designed so additional scanners can be added without changing the Edge-facing envelope. The current roadmap reserves:

- Weekly Breakout
- Opening Breakout
- Short Squeeze

The Value Scanner is not a competing strategy family. It is the common pre-scan universe layer that all of those scanners use.

Examples:

- all stocks under $3
- all stocks from $0.50 to $3
- Medical stocks under $3
- Space stocks under $1
- Industrials + Space theme under $10

These scanners remain evidence-producing engines. Sentinel Edge will later own provider routing, alert delivery, cross-scanner ranking, risk policy and any execution/handoff behavior.

## Development

```bash
python -m pip install -e ".[dev]"
pytest -q
uvicorn facsimile.api:app --reload
```

See [docs/VALUE_SCANNER.md](docs/VALUE_SCANNER.md) for universe-filter examples and [docs/EDGE_INTEGRATION.md](docs/EDGE_INTEGRATION.md) for the integration boundary.
