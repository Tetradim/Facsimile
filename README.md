# Facsimile

Standalone market-scanning and research workstation for weekly breakouts, opening breakouts, short-squeeze analysis, and future scanner families, with optional future integration into **Sentinel Edge**.

Facsimile is an independent bot and workstation. It does not depend on or integrate with any other Sentinel-line bot.

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
- a React/TypeScript scanner workstation
- chart-heavy command center, scanner, builder and chart pages
- a stable versioned scanner envelope for future Edge ingestion
- FastAPI scan endpoints
- deterministic tests and CI

No live brokerage execution is included.

## Install

Requirements:

- Python 3.11+
- Node.js 20+
- npm

### Windows

Double-click:

```text
install.bat
```

The installer builds the complete workstation, creates `Facsimile.cmd`, and
attempts to add a **Facsimile** desktop shortcut.

### macOS / Linux

```bash
chmod +x install.sh
./install.sh
```

Then launch with:

```bash
./facsimile.sh
```

The installed workstation runs locally at:

```text
http://127.0.0.1:8765
```

The launcher serves both the FastAPI backend and built React UI from the same
local process.

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for details.

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

Frontend development:

```bash
cd frontend
npm install
npm run dev
```

See [docs/VALUE_SCANNER.md](docs/VALUE_SCANNER.md) for universe-filter examples and [docs/EDGE_INTEGRATION.md](docs/EDGE_INTEGRATION.md) for the integration boundary.
