# Trade Management and Simulation

Facsimile's trade-management layer extends the weekly breakout workflow beyond
candidate discovery. It is deliberately deterministic and does not submit
broker orders.

## Weekly position lifecycle

Tracked positions use four states:

```text
NORMAL
  -> MACD_BEARISH_CONFIRMED
  -> TIGHTENED
  -> STOP_HIT
```

A bearish weekly MACD reading is not an immediate sell signal.

Default behavior:

1. The active stop is checked first.
2. Weekly MACD must remain bearish for two completed weeks.
3. After confirmation, Facsimile inspects the most recent three weekly lows.
4. A candidate stop is placed 1% below that recent structure.
5. The new stop is accepted only when it is above the existing stop.
6. A stop can never be loosened.

The initial entry and stop remain visible as immutable reference points.

Persistent desktop positions are stored in:

```text
~/.facsimile/positions.json
```

Set `FACSIMILE_POSITION_PATH` to override the location.

## Position endpoints

```text
GET    /v1/positions
POST   /v1/positions
DELETE /v1/positions/{id}
POST   /v1/positions/{id}/refresh
```

A refresh downloads completed weekly history, applies the lifecycle manager and
records meaningful events such as:

- state change
- stop tightened
- stop hit

## Monte Carlo simulation

The simulation engine bootstraps historical Facsimile signal returns. It does
not forecast a stock price and is not a predictive probability model.

Endpoint:

```text
POST /v1/simulation/monte-carlo
```

Inputs include:

- historical trade/signal returns
- starting equity
- position fraction
- number of randomized runs
- trades per run
- ruin threshold
- deterministic random seed

Outputs include:

- probability the sampled run finishes above starting equity
- probability ending equity falls below the chosen ruin threshold
- ending-equity P10 / P25 / P50 / P75 / P90
- median and 90th-percentile maximum drawdown
- sample equity paths

The UI's Simulation Lab first obtains historical weekly signals from the
backtest engine, optionally filters them by minimum Intelligence score, and then
feeds those realized forward returns into the bootstrap engine.

## Research discipline

Facsimile keeps these assumptions explicit:

- score thresholds are user inputs
- position size is a user input
- simulation parameters are not auto-retuned against the result
- point-in-time fields unavailable to the historical engine are not invented
- bootstrap outcomes describe the supplied historical return sample, not future
  certainty

## Android

The standalone Android build implements the same stop-ratchet and Monte Carlo
contracts locally in TypeScript. Position state is stored on the device and no
desktop process is required.
