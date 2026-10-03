# Live data providers

Facsimile supports a layered live-data stack. The live scanner reports the
providers that are configured and records the actual sources used for each
candidate.

## Works without API keys

### Yahoo Finance via yfinance

Primary live-test source for:

- U.S. equity screening
- current price and company profile
- historical OHLCV
- basic fundamentals
- company news and press releases

The live universe screen uses Yahoo's equity query interface to prefilter by
price and sector before downloading individual ticker histories.

### Nasdaq Trader

Fallback listed-symbol universe and exchange metadata. The official Nasdaq
Trader symbol directory is refreshed throughout the trading day.

### SEC EDGAR

Recent public filings such as 8-K, 10-Q, 10-K, 6-K, S-1 and 424B5 are attached
as catalyst/evidence items. SEC data APIs do not require an API key, but SEC
requires a declared User-Agent. Override the default with:

```text
SEC_USER_AGENT=YourName your-email@example.com
```

## Optional API-key providers

Set any of the following environment variables before launching Facsimile.
The provider will appear as configured in `GET /v1/live/providers`.

### Alpha Vantage

```text
ALPHAVANTAGE_API_KEY=...
```

Used for weekly OHLCV fallback and news/sentiment.

### Twelve Data

```text
TWELVEDATA_API_KEY=...
```

Used for weekly OHLCV fallback.

### Massive / Polygon

```text
MASSIVE_API_KEY=...
```

or:

```text
POLYGON_API_KEY=...
```

Used for daily OHLCV fallback and ticker news.

### Finnhub

```text
FINNHUB_API_KEY=...
```

Used as an additional company-news source.

## Live endpoints

```text
GET  /v1/live/providers
GET  /v1/live/news/{symbol}
POST /v1/live/scan/weekly-breakout
```

Example medical catalyst scan:

```json
{
  "min_price": 0.10,
  "max_price": 2.50,
  "sector": "Medical",
  "require_recent_news": true,
  "news_lookback_days": 14,
  "max_candidates": 35,
  "max_results": 30
}
```

When `config` is omitted, the live medical scan uses the Facsimile
`Medical Catalyst Weekly` preset:

- 6 minimum box bars
- 18% maximum body-box width
- 2% minimum close above resistance
- 80% minimum close location
- 35% maximum upper wick
- structural stop at 33% of the box
- 15% maximum stop risk
- hard volume gate at 1.50x
- MA, MACD and lookback-high confirmation enabled

## Data quality

These sources have different licensing, latency, coverage and rate limits.
Facsimile records provider provenance but does not claim that all sources are
exchange-direct real-time feeds. Verify provider terms before commercial use
or automated trading.
