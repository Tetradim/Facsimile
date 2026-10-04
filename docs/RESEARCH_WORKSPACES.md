# Research Workspaces

Facsimile's research increment adds persistent watchlists, state-change events,
historical weekly backtesting and live candlestick charts.

## Watchlists

Watchlists persist locally in:

```text
~/.facsimile/facsimile.sqlite3
```

Set `FACSIMILE_DATA_DIR` to move the local data directory.

Each watchlist stores the complete live-scan request, including its
`facsimile.strategy.v1` definition. Refreshing a watchlist deliberately asks
the scanner for rejected and nonmatching rows too, so transitions can be
detected instead of disappearing silently.

Events currently include:

- `new_match`
- `state_change`
- `tier_change`
- `strategy_match_change`
- `score_move` for Intelligence Overall moves of 10+ points
- `confirmed_breakout`

The first refresh establishes a baseline. Later refreshes compare against the
previous persisted snapshot.

## Backtest Lab

Endpoint:

```text
POST /v1/backtest/weekly
```

The historical simulator follows these rules:

1. Signals use completed weekly bars available at that historical point.
2. A confirmed signal on week N can only enter on week N+1.
3. Entry uses the next weekly open plus configured slippage.
4. Structural stops are evaluated against subsequent weekly lows.
5. With weekly data, intrabar path is unknowable. If a stop is crossed, the
   fill uses the worse of the structural stop or that week's open, then
   slippage.
6. Overlapping positions in the same single-symbol replay are not opened.
7. SPY relative strength is calculated only with benchmark bars dated on or
   before the signal.
8. Historical news, catalyst and dilution evidence are not reconstructed in
   this first simulator. Strategies requiring those facts can therefore
   intentionally produce no trades.

The built-in **Weekly Breakout Technical** preset is intended to be safe for
this first historical simulator because it does not require reconstructed
historical catalyst data.

Results include:

- confirmed historical matches
- completed trades
- win/loss count and win rate
- average and median return
- profit factor
- max drawdown
- ending equity / total return
- per-trade signal, entry, stop and exit evidence
- equity curve

## Live Charts

Endpoint:

```text
GET /v1/live/chart/{symbol}?weeks=104
```

The chart workspace now renders real OHLC candles rather than a demonstration
line. Overlays use the same live candidate produced by the breakout engine:

- consolidation body box
- resistance
- structural stop
- 20-week simple moving average
- weekly volume
- live scanner context values

Chart/backtest requests can retrieve a longer Yahoo history (up to the research
window requested) without changing or slowing the regular live-scanner data
path.

## Android

The standalone Android research branch implements the same routes inside the
APK:

- `/v1/live/chart/{symbol}`
- `/v1/backtest/weekly`
- `/v1/watchlists`
- `/v1/watchlists/{id}/refresh`
- `/v1/watchlists/{id}/events`
- `/v1/strategies/presets`

Android watchlists are stored in app-local browser storage and refreshed using
the on-device scanner. Backtests and charts use native HTTPS through Capacitor;
no PC is required.

## Current limits

Watchlist refresh is user-triggered in this increment. It is not yet an OS
background service or push-notification system.

The backtester is single-symbol and weekly. It is intentionally conservative
about data it does not have; it does not fabricate point-in-time historical
fundamentals or catalysts.

These limits keep the research results deterministic and auditable while the
next layers (background monitor, point-in-time event store, and portfolio-level
simulation) are built.
