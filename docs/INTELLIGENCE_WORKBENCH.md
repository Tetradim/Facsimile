# Intelligence Workbench

Facsimile's Intelligence Workbench separates **whether a setup is valid** from
**how attractive the setup is**. Hard breakout gates remain deterministic. The
new intelligence layer explains and ranks the candidates that survive (and
keeps rejected candidates visibly separate when requested).

## Tier order

Tier always outranks a raw score.

1. **A+** — confirmed breakout with Intelligence Overall >= 90
2. **A** — confirmed breakout with Intelligence Overall >= 85
3. **B** — other confirmed breakout
4. **W1** — developing setup with Intelligence Overall >= 80
5. **W2** — other developing setup
6. **X** — rejected by one or more mandatory breakout gates

Inside the same tier, candidates are ordered by:

1. Intelligence Overall
2. Catalyst
3. Liquidity
4. Lower structural stop risk

This prevents a high-scoring rejected setup from appearing above a confirmed
setup merely because some soft scores are strong.

## Explainable score families

Each family returns a 0–100 score plus positive and caution evidence.

### Technical Health

- price relative to 20-week moving average
- weekly MACD confirmation
- prior 10-week high
- relative volume

### Setup Quality

- body-box tightness
- consolidation duration
- weekly NATR / volatility

### Breakout Trigger

- close above resistance
- candle close location
- upper-wick rejection
- breakout/volume quality from the deterministic engine

### Relative Strength

Facsimile compares the stock with SPY over approximately:

- 1 month
- 3 months
- 6 months
- 12 months

This is market-relative performance, not simply proximity to a recent high.

### Catalyst

Catalyst evidence can come from:

- current news and press releases
- SEC EDGAR filings
- ClinicalTrials.gov
- openFDA Drugs@FDA
- configured optional news providers

The structured medical catalyst layer uses trial phase/status/completion dates
and FDA application/submission dates in addition to headline keywords.

### Fundamentals

Fundamentals are split into ChartMill-style subratings rather than one opaque
number:

- **Growth** — revenue and earnings growth
- **Profitability** — gross margin, operating margin, ROE
- **Financial Health** — current ratio, debt/equity, cash vs. debt, cash flow
- **Fundamental Quality** — composite of the three above, with Financial Health
  weighted most heavily for the low-priced medical universe

When cash is available and operating cash flow is negative, Facsimile also
estimates an operating-cash runway:

```text
cash runway years = total cash / abs(annual operating cash flow)
```

This is an approximation, not company guidance.

### Dilution Safety

Recent evidence is inspected for financing/dilution risk such as:

- S-1
- S-3
- 424B5
- at-the-market / ATM language
- warrants
- convertibles
- offerings
- reverse splits
- going-concern language

The UI shows both **Dilution Safety** (higher is better) and a categorical
Dilution Risk label.

### Liquidity

Liquidity uses recent dollar volume and breakout relative volume. This is meant
to expose tradability/slippage risk without automatically rejecting every
low-float stock.

### Trade Risk

Trade Risk combines:

- structural stop distance
- weekly normalized volatility
- liquidity

## Intelligence Overall

Current composite weights:

| Family | Weight |
| --- | ---: |
| Technical Health | 14% |
| Setup Quality | 14% |
| Breakout Trigger | 16% |
| Relative Strength | 10% |
| Catalyst | 12% |
| Fundamental Quality | 10% |
| Dilution Safety | 8% |
| Liquidity | 7% |
| Trade Risk | 9% |

The weights are explicit and deterministic. They should be changed through a
versioned strategy/preset process rather than silently retuned in production.

## TradingView-style column packs

The live result table now has:

- **Breakout View** — Overall, Technical, Setup, Trigger, RS
- **Catalyst View** — Catalyst, Fundamental, Dilution, structured evidence/news
- **Fundamental View** — Fundamental, Growth, Profitability, Financial Health,
  Cash Runway
- **Risk View** — Trade Risk, Liquidity, Stop Risk, Box, provider provenance

Every candidate has a **Why?** expander showing evidence behind the major score
families.

## Saved screens

Value Scanner screens can be saved locally with:

- price range
- sector
- news lookback
- catalyst requirement
- selected column pack

Saved screens are stored on the current device.

## Reusable strategy contract

Strategies use schema:

```text
facsimile.strategy.v1
```

A strategy contains three groups:

- **ALL** — every condition must pass
- **ANY** — at least one must pass
- **NONE** — any match excludes the candidate

Conditions carry:

- field
- operator
- value
- timeframe metadata

Supported operators currently include:

```text
eq ne gt gte lt lte between contains
```

The same strategy object is designed to be reused by:

```text
live scan -> saved screen -> watchlist -> alert -> backtest
```

The scanner already evaluates these objects. Watchlist alerts and historical
backtesting can consume the same contract without rewriting strategy rules.

## Rule Assistant

The Scanner Builder accepts a short natural-language description and translates
recognized constraints (price range, sector, RVOL, stop risk) into visible,
editable deterministic conditions.

The assistant is deliberately not allowed to create hidden trading rules.
Everything it recognizes appears in the ALL/ANY/NONE editor before execution.

## Data provenance

Live rows retain their actual data sources. Facsimile does not claim that a
provider participated if it did not return data for the candidate.

Free/public sources can change, throttle, or lag. Intelligence ratings are
decision-support metrics, not guarantees of future performance.
