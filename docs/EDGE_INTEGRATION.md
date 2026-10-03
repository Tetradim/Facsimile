# Sentinel Edge integration boundary

Facsimile is a standalone scanner project. Its only planned Sentinel integration
target is **Sentinel Edge**.

It does not depend on, publish to, or model any other Sentinel-line bot.

## Design rule

Scanner logic must remain importable without FastAPI, persistence, broker
clients, or an alert transport.

The preferred future Edge integration is:

1. Edge supplies the point-in-time market universe, classifications, OHLCV and fundamentals.
2. Facsimile applies the shared Value Scanner / Universe Filter.
3. Only eligible symbols are passed to scanner engines.
4. Scanner engines return deterministic candidate objects.
5. Candidate objects are converted to a versioned ScanEnvelope.
6. Edge decides how to display, rank, persist, alert, or combine them with its
   own signal/risk system.

No execution command is emitted by Facsimile.

## Shared universe layer

The universe layer is intentionally scanner-agnostic and runs before strategy
logic.

Current criteria include:

- min/max price
- sector
- industry
- theme
- exchange
- min/max market cap

This supports queries such as:

- all stocks under $3
- Medical stocks under $3
- Space stocks under $1

Formal sectors and flexible themes remain separate so concepts such as Space
do not need to be misclassified as sectors.

Every current and future scanner should consume the same eligibility decision.

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

The evidence block may include the instrument profile and universe decision in
addition to scanner-specific gates and metrics.

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
- universe eligibility/profile evidence when filtering is used

## What Edge should own later

When merged, Edge should continue to own:

- provider routing and credentials
- the canonical listed-symbol universe
- sector/industry/theme classification data
- exchange-calendar/session correctness
- storage
- operator configuration
- alert delivery
- cross-scanner ranking
- risk policy
- any execution/handoff logic

Facsimile should remain the deterministic universe-filtering and scanner/scoring layer.
