# Value Scanner / Universe Filter

The Facsimile Value Scanner is a pre-scan universe selector. It narrows the
market before technical scanner logic runs.

It is deliberately shared by every scanner family rather than implemented as a
special case inside Weekly Breakout.

## Supported filters

Current filters are:

- minimum price
- maximum price
- sector
- industry
- theme
- exchange
- minimum market capitalization
- maximum market capitalization

Price and market-cap bounds are inclusive.

Taxonomy matching is case-insensitive.

## Sector vs theme

Formal sectors and operator themes are kept separate.

Examples:

- Medical can match Health Care, Healthcare, Biotechnology, Pharmaceuticals,
  Medical Devices, and Life Sciences metadata.
- Space is normally represented as a theme or industry tag. A company may have
  formal sector Industrials while also carrying Space, Satellite, Aerospace, or
  Launch Services metadata.

This avoids forcing themes such as Space, AI, Quantum, EV, or Cannabis into a
formal sector taxonomy.

## Examples

### All stocks under $3

```json
{
  "max_price": 3.0
}
```

### All stocks from $0.50 through $3

```json
{
  "min_price": 0.50,
  "max_price": 3.0
}
```

### Medical stocks under $3

```json
{
  "max_price": 3.0,
  "sectors": ["Medical"]
}
```

### Space stocks under $1

```json
{
  "max_price": 1.0,
  "themes": ["Space"]
}
```

### Aerospace or Space stocks under $5

The default taxonomy mode is ANY, so either taxonomy selector may match.

```json
{
  "max_price": 5.0,
  "industries": ["Aerospace"],
  "themes": ["Space"]
}
```

### Require both a sector and a theme

```json
{
  "max_price": 10.0,
  "sectors": ["Industrials"],
  "themes": ["Space"],
  "taxonomy_mode": "all"
}
```

## API

Filter a supplied market universe:

```text
POST /v1/universe/filter
POST /v1/universe/value-scan
```

Run Weekly Breakout across a supplied batch after applying the same universe
filter:

```text
POST /v1/scan/weekly-breakout/batch
```

A single-symbol scan may also include an instrument profile and universe
criteria. If the symbol does not pass the universe filter, it is rejected before
technical analysis.

## Whole-scanner rule

Every future scanner family must use this same pre-scan universe decision:

```text
Provider market universe
        |
        v
Price / Sector / Industry / Theme filter
        |
        v
Eligible symbols
        |
        +--> Weekly Breakout
        |
        +--> Opening Breakout
        |
        +--> Short Squeeze
        |
        +--> future scanners
```

This lets one operator query such as "Space under $1" be applied consistently
to every scan instead of maintaining separate filtering logic per strategy.

## Data-provider responsibility

The filter itself does not claim to discover every listed security. A market
data provider must supply the current symbol universe, point-in-time price, and
classification metadata. Facsimile then applies the deterministic filters.

When Facsimile is merged into Sentinel Edge, Edge should own that provider
routing and the canonical taxonomy data.
