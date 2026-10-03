# Sentinel Edge integration boundary

Facsimile is a standalone scanner project. Its only planned Sentinel integration
target is **Sentinel Edge**.

It does not depend on, publish to, or model any other Sentinel-line bot.

## Design rule

Scanner logic must remain importable without FastAPI, persistence, broker
clients, or an alert transport.

The preferred future Edge integration is:

1. Edge supplies point-in-time OHLCV and fundamentals.
2. Facsimile scanner engines return deterministic candidate objects.
3. Candidate objects are converted to a versioned ScanEnvelope.
4. Edge decides how to display, rank, persist, alert, or combine them with its
   own signal/risk system.

No execution command is emitted by Facsimile.

## Stable contract

Current envelope schema:

- schema_version: facsimile.scan_envelope.v1
- family
- symbol
- observed_at
- status
- score
- reasons
- evidence
- payload

Current scanner family:

- weekly_breakout

Reserved future families:

- opening_breakout
- short_squeeze

Those future scanners should share the same envelope while retaining their own
family-specific candidate payloads.

## Weekly breakout evidence

The weekly breakout implementation exposes:

- body-based consolidation box
- box duration and width
- completed-week close above resistance
- weekly gain limits
- candle close-location strength
- upper-wick quality
- 20-week trend gate
- MACD bullish gate
- lookback-high gate
- configurable volume behavior
- structural stop at a configurable position inside the box
- maximum stop-risk gate
- NATR, relative volume and other scoring metrics
- optional point-in-time Quality and Growth fundamentals
- separate Positional, Entry and Overall scores

## What Edge should own later

When merged, Edge should continue to own:

- provider routing and credentials
- exchange-calendar/session correctness
- storage
- operator configuration
- alert delivery
- cross-scanner ranking
- risk policy
- any execution/handoff logic

Facsimile should remain the deterministic scanner/scoring layer.
