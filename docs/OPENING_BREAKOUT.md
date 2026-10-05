# Opening Breakout Scanner

Facsimile's Opening Breakout family evaluates a completed opening range and the
first actionable breakout bar after that range. It is separate from the Weekly
Breakout family but returns the same stable scan-envelope boundary for later
Sentinel Edge ingestion.

## Default configuration

```text
regular-session open        09:30 America/New_York
opening range               15 minutes
intraday bars               5 minutes
minimum close above OR high 0.25%
maximum breakout extension  8%
minimum close location      70%
maximum upper wick          40%
minimum relative volume     1.50x
maximum structural risk     8%
stop buffer                 0.25% below OR high
require VWAP                yes
require relative volume     yes
require prior close         no
```

The structural stop is intentionally a **tight trigger stop beneath the
opening-range high**, not a full-range stop beneath the opening low. This makes
the default scanner useful for breakout continuation rather than accepting very
wide opening-range risk. A later preset may expose half-range and range-low stop
modes.

## Confirmation gates

A confirmed setup must satisfy all configured hard gates:

- close above the opening-range high by the minimum breakout percentage
- not excessively extended beyond the opening range
- strong candle close location
- controlled upper wick
- structural stop risk below the configured maximum
- close above session VWAP when VWAP is required
- breakout-bar relative volume above the configured minimum when RVOL is
  required
- optional close above prior-session close

A candle that trades through the range high but closes back inside the range is
classified as **developing** rather than confirmed.

## Scoring

The Opening Breakout score is separate from the Weekly Intelligence score.

```text
Trigger quality  35%
Volume            20%
VWAP              15%
OR structure      10%
Trade risk        20%
```

Hard-gate state still outranks a soft score in any ranked live batch.

## Live desktop source

The first live implementation uses Yahoo Finance five-minute regular-session
history through the existing yfinance provider. Facsimile groups bars by
America/New_York session date and uses the most recent session plus the prior
session when available.

Relative volume prefers the prior session's bar at the same clock time. If that
bar is unavailable, the engine falls back to the median of recent prior-session
bar volumes.

This is an internet data source, not a direct exchange feed. Provider latency,
missing bars, throttling and corrections can affect live results.

## Endpoints

Deterministic supplied-data endpoints:

```text
POST /v1/scan/opening-breakout
POST /v1/scan/opening-breakout/envelope
```

Live desktop endpoint:

```text
GET /v1/live/opening-breakout/{symbol}
```

Controlled focus-list endpoint:

```text
POST /v1/live/opening-breakout/batch
```

The focus list is deliberately capped at **12 symbols** with no more than four
concurrent intraday fetches. It is not presented as a full-market real-time
scanner.

## Android

The standalone Android implementation uses Capacitor native HTTP to retrieve
Yahoo five-minute chart history and runs the same opening-range, VWAP, RVOL,
candle-quality and structural-risk rules on the phone.

The Android focus-list scanner uses the same 12-symbol cap and four-worker
limit. No PC is required in Standalone mode.
