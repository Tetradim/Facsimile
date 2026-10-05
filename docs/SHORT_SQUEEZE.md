# Short Squeeze Scanner

Facsimile's Short Squeeze family separates **reported short-interest pressure**
from the **current market trigger**. It does not treat daily short-sale volume
as a substitute for short interest.

## Required pressure evidence

The deterministic engine requires:

- short interest as a percentage of float
- days to cover / short ratio

Default hard thresholds:

```text
short float >= 15%
days to cover >= 3.0
relative volume >= 1.50x
average daily dollar volume >= $500,000
price trigger >= +3%
maximum trigger extension <= +25%
float <= 200 million shares
```

The price trigger uses an explicit breakout return when supplied; otherwise it
falls back to the five-day price return.

## Optional borrow evidence

The score can also use:

- borrow fee
- utilization

When those fields are unavailable they are held neutral. Facsimile does not
infer borrow stress from unrelated fields.

## Score families

```text
Squeeze Pressure  35%
Borrow Stress     20%
Float             10%
Price Trigger     25%
Liquidity         10%
```

**Squeeze Pressure** combines short float and days to cover.

**Borrow Stress** combines borrow fee and utilization when a provider supplies
them.

**Float** favors smaller floats while remaining separate from liquidity.

**Price Trigger** uses current price expansion, relative volume and proximity to
the 52-week high.

**Liquidity** uses recent average daily dollar volume.

The composite is a ranking score, not a probability of a future squeeze.

## States

```text
CONFIRMED
DEVELOPING
REJECTED
```

A candidate is **confirmed** only when all configured hard pressure and trigger
gates pass.

A candidate is **developing** when reported short-float and days-to-cover
pressure pass but one or more current trigger/liquidity gates have not.

A candidate is **rejected** when the core reported short-interest pressure is
below threshold.

## Live Yahoo verifier

The first live verifier uses Yahoo Finance metadata exposed through yfinance for
reported:

- short percent of float
- short ratio / days to cover
- float shares
- short-interest observation date when supplied

Daily Yahoo OHLCV is used separately for:

- five-day return
- 20-day return
- 20-day breakout distance
- relative volume
- average daily dollar volume
- distance to the 52-week high

The Short Squeeze UI displays the short-interest observation date when
available. Short-interest data is not represented as real-time.

Borrow fee and utilization are not available from this zero-key source and stay
neutral.

## Endpoints

Provider-agnostic supplied-evidence endpoints:

```text
POST /v1/scan/short-squeeze
POST /v1/scan/short-squeeze/envelope
```

Live verifier endpoints:

```text
GET  /v1/live/short-squeeze/{symbol}
POST /v1/live/short-squeeze/batch
```

The live batch is a focus-list verifier, not a full-market discovery engine.
It accepts at most 20 symbols and uses at most four concurrent workers.

## Future discovery layer

yfinance currently exposes Yahoo EquityQuery fields for short interest,
including short percentage of float and days to cover. Facsimile does not yet
use those fields for market-wide discovery because query value scaling,
coverage and refresh behavior need provider-level validation before they are
trusted as hard discovery filters.

A future discovery adapter should preserve the same ShortSqueezeSnapshot
contract so the scoring engine remains provider-independent.
