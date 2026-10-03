from __future__ import annotations

import csv
import io
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import yfinance as yf
from pydantic import BaseModel, Field

from .breakout import WeeklyBreakoutEngine
from .models import BreakoutCandidate, BreakoutConfig, FundamentalSnapshot, OHLCVBar, VolumeMode
from .weekly import aggregate_daily_to_weekly


class ProviderStatus(BaseModel):
    name: str
    kind: str
    configured: bool
    zero_key: bool = False
    capabilities: list[str] = Field(default_factory=list)
    detail: str = ""


class LiveNewsItem(BaseModel):
    symbol: str
    title: str
    publisher: str = ""
    published_at: datetime | None = None
    url: str = ""
    summary: str = ""
    source: str


class LiveProfile(BaseModel):
    symbol: str
    company: str = ""
    price: float
    sector: str | None = None
    industry: str | None = None
    exchange: str | None = None
    market_cap: float | None = None
    source: str = "yahoo"


class LiveScanRequest(BaseModel):
    min_price: float = Field(default=0.10, ge=0)
    max_price: float = Field(default=2.50, gt=0)
    sector: str = "Medical"
    require_recent_news: bool = True
    news_lookback_days: int = Field(default=14, ge=1, le=90)
    max_candidates: int = Field(default=35, ge=1, le=100)
    max_results: int = Field(default=30, ge=1, le=100)
    include_rejected: bool = True
    config: BreakoutConfig | None = None


class LiveScanRow(BaseModel):
    profile: LiveProfile
    candidate: BreakoutCandidate
    news: list[LiveNewsItem] = Field(default_factory=list)
    catalyst_score: float = Field(default=0, ge=0, le=100)
    data_sources: list[str] = Field(default_factory=list)
    error: str | None = None


class LiveScanResponse(BaseModel):
    generated_at: datetime
    query: LiveScanRequest
    discovered_count: int
    scanned_count: int
    rows: list[LiveScanRow]
    providers: list[ProviderStatus]
    warnings: list[str] = Field(default_factory=list)


MEDICAL_SECTORS = ("Healthcare", "Pharmaceuticals")
CATALYST_TERMS = {
    "fda": 30,
    "phase 3": 28,
    "phase iii": 28,
    "phase 2": 22,
    "phase ii": 22,
    "clinical trial": 22,
    "topline": 22,
    "interim results": 20,
    "data readout": 22,
    "approval": 25,
    "pdufa": 30,
    "breakthrough": 20,
    "fast track": 18,
    "orphan drug": 16,
    "partnership": 14,
    "collaboration": 12,
    "acquisition": 18,
    "merger": 16,
    "financing": 8,
    "offering": 6,
    "earnings": 8,
}


def _utc_from_epoch(value: Any) -> datetime | None:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return _utc_from_epoch(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _as_float(value: Any) -> float | None:
    try:
        result = float(value)
        return result if result == result else None
    except (TypeError, ValueError):
        return None


def _catalyst_score(news: list[LiveNewsItem]) -> float:
    if not news:
        return 0.0
    now = datetime.now(timezone.utc)
    best = 0.0
    for item in news:
        text = f"{item.title} {item.summary}".lower()
        score = 15.0
        for term, points in CATALYST_TERMS.items():
            if term in text:
                score += points
        if item.published_at is not None:
            age_days = max(0.0, (now - item.published_at).total_seconds() / 86400)
            score += max(0.0, 25.0 - age_days * 2)
        best = max(best, min(100.0, score))
    return round(best, 1)


def medical_breakout_config() -> BreakoutConfig:
    return BreakoutConfig(
        min_box_bars=6,
        max_box_bars=12,
        max_box_width_pct=0.18,
        min_close_above_box_pct=0.02,
        min_close_location=0.80,
        max_upper_wick_ratio=0.35,
        structural_stop_position=0.33,
        max_stop_risk_pct=0.15,
        volume_mode=VolumeMode.HARD_GATE,
        min_volume_ratio=1.50,
        require_ma20=True,
        require_macd_bullish=True,
        require_lookback_high=True,
    )


class YahooProvider:
    name = "Yahoo Finance"

    def screen(self, request: LiveScanRequest) -> list[LiveProfile]:
        clauses: list[Any] = [
            yf.EquityQuery("eq", ["region", "us"]),
            yf.EquityQuery(
                "btwn",
                ["intradayprice", request.min_price, request.max_price],
            ),
        ]
        sector = request.sector.strip().lower()
        if sector and sector not in {"all", "all sectors"}:
            if sector in {"medical", "health", "health care", "healthcare", "biotech"}:
                clauses.append(
                    yf.EquityQuery(
                        "or",
                        [
                            yf.EquityQuery("eq", ["sector", value])
                            for value in MEDICAL_SECTORS
                        ],
                    )
                )
            else:
                clauses.append(yf.EquityQuery("eq", ["sector", request.sector]))

        query = yf.EquityQuery("and", clauses)
        response = yf.screen(
            query,
            size=min(250, max(request.max_candidates * 3, 50)),
            sortField="eodvolume",
            sortAsc=False,
        )
        quotes = response.get("quotes", []) if isinstance(response, dict) else []

        profiles: list[LiveProfile] = []
        for quote in quotes:
            symbol = str(quote.get("symbol") or "").strip().upper()
            price = _as_float(
                quote.get("regularMarketPrice")
                or quote.get("intradayprice")
                or quote.get("postMarketPrice")
            )
            if not symbol or price is None:
                continue
            if not request.min_price <= price <= request.max_price:
                continue
            profiles.append(
                LiveProfile(
                    symbol=symbol,
                    company=str(
                        quote.get("shortName")
                        or quote.get("longName")
                        or quote.get("displayName")
                        or symbol
                    ),
                    price=price,
                    sector=quote.get("sector"),
                    industry=quote.get("industry"),
                    exchange=quote.get("exchange"),
                    market_cap=_as_float(
                        quote.get("marketCap")
                        or quote.get("intradaymarketcap")
                    ),
                    source="yahoo_screener",
                )
            )
        return profiles[: request.max_candidates]

    def profile(self, symbol: str, price_hint: float | None = None) -> LiveProfile:
        ticker = yf.Ticker(symbol)
        info = ticker.get_info() or {}
        fast = ticker.get_fast_info()
        price = (
            _as_float(info.get("currentPrice"))
            or _as_float(info.get("regularMarketPrice"))
            or _as_float(getattr(fast, "last_price", None))
            or price_hint
        )
        if price is None:
            raise RuntimeError(f"No current price available for {symbol}")
        return LiveProfile(
            symbol=symbol.upper(),
            company=str(info.get("longName") or info.get("shortName") or symbol),
            price=price,
            sector=info.get("sector"),
            industry=info.get("industry"),
            exchange=info.get("exchange"),
            market_cap=_as_float(info.get("marketCap")),
            source="yahoo",
        )

    def fundamentals(self, symbol: str) -> FundamentalSnapshot | None:
        info = yf.Ticker(symbol).get_info() or {}
        values = {
            "revenue_growth": _as_float(info.get("revenueGrowth")),
            "earnings_growth": _as_float(info.get("earningsGrowth")),
            "operating_margin": _as_float(info.get("operatingMargins")),
            "return_on_equity": _as_float(info.get("returnOnEquity")),
            "debt_to_equity": _as_float(info.get("debtToEquity")),
        }
        if all(value is None for value in values.values()):
            return None
        return FundamentalSnapshot(**values)

    def daily_bars(self, symbol: str) -> list[OHLCVBar]:
        frame = yf.Ticker(symbol).history(
            period="2y",
            interval="1d",
            auto_adjust=False,
            actions=False,
            repair=True,
            timeout=15,
        )
        bars: list[OHLCVBar] = []
        for index, row in frame.iterrows():
            open_ = _as_float(row.get("Open"))
            high = _as_float(row.get("High"))
            low = _as_float(row.get("Low"))
            close = _as_float(row.get("Close"))
            volume = _as_float(row.get("Volume"))
            if None in (open_, high, low, close) or volume is None:
                continue
            timestamp = index.to_pydatetime()
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            bars.append(
                OHLCVBar(
                    timestamp=timestamp,
                    open=open_,
                    high=high,
                    low=low,
                    close=close,
                    volume=max(0.0, volume),
                )
            )
        return bars

    def news(self, symbol: str, count: int = 12) -> list[LiveNewsItem]:
        raw_items = yf.Ticker(symbol).get_news(count=count, tab="all") or []
        results: list[LiveNewsItem] = []
        for raw in raw_items:
            content = raw.get("content") if isinstance(raw, dict) else None
            content = content if isinstance(content, dict) else raw
            if not isinstance(content, dict):
                continue
            provider = content.get("provider")
            if isinstance(provider, dict):
                publisher = str(provider.get("displayName") or provider.get("name") or "")
            else:
                publisher = str(content.get("publisher") or "")
            canonical = content.get("canonicalUrl")
            if isinstance(canonical, dict):
                url = str(canonical.get("url") or "")
            else:
                url = str(content.get("link") or content.get("url") or "")
            published = (
                _parse_datetime(content.get("pubDate"))
                or _parse_datetime(content.get("displayTime"))
                or _utc_from_epoch(content.get("providerPublishTime"))
            )
            title = str(content.get("title") or "").strip()
            if not title:
                continue
            results.append(
                LiveNewsItem(
                    symbol=symbol.upper(),
                    title=title,
                    publisher=publisher,
                    published_at=published,
                    url=url,
                    summary=str(content.get("summary") or content.get("description") or ""),
                    source="yahoo",
                )
            )
        return results


class NasdaqDirectoryProvider:
    name = "Nasdaq Trader"
    NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
    OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

    def symbols(self) -> list[dict[str, str]]:
        records: list[dict[str, str]] = []
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            for url, exchange_default in (
                (self.NASDAQ_URL, "NASDAQ"),
                (self.OTHER_URL, ""),
            ):
                response = client.get(url)
                response.raise_for_status()
                reader = csv.DictReader(io.StringIO(response.text), delimiter="|")
                for row in reader:
                    if not row:
                        continue
                    first = next(iter(row.values()), "")
                    if str(first).startswith("File Creation Time"):
                        continue
                    test_issue = str(row.get("Test Issue") or "").upper()
                    if test_issue == "Y":
                        continue
                    symbol = str(
                        row.get("Symbol")
                        or row.get("ACT Symbol")
                        or row.get("NASDAQ Symbol")
                        or ""
                    ).strip().upper()
                    if not symbol:
                        continue
                    exchange_code = str(row.get("Exchange") or "")
                    exchange = {
                        "A": "NYSE American",
                        "N": "NYSE",
                        "P": "NYSE Arca",
                        "Z": "Cboe",
                        "V": "IEX",
                    }.get(exchange_code, exchange_default)
                    records.append(
                        {
                            "symbol": symbol,
                            "company": str(row.get("Security Name") or symbol),
                            "exchange": exchange,
                        }
                    )
        return records


class SecEdgarProvider:
    name = "SEC EDGAR"
    TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

    def __init__(self) -> None:
        self.user_agent = os.getenv(
            "SEC_USER_AGENT",
            "FacsimileScanner local-user@example.com",
        )

    def _headers(self) -> dict[str, str]:
        return {
            "User-Agent": self.user_agent,
            "Accept-Encoding": "gzip, deflate",
        }

    def recent_filings(self, symbol: str, limit: int = 8) -> list[LiveNewsItem]:
        with httpx.Client(timeout=15, headers=self._headers()) as client:
            mapping = client.get(self.TICKERS_URL)
            mapping.raise_for_status()
            cik: int | None = None
            company = symbol
            for item in mapping.json().values():
                if str(item.get("ticker") or "").upper() == symbol.upper():
                    cik = int(item["cik_str"])
                    company = str(item.get("title") or symbol)
                    break
            if cik is None:
                return []

            response = client.get(
                f"https://data.sec.gov/submissions/CIK{cik:010d}.json"
            )
            response.raise_for_status()
            data = response.json()
            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            dates = recent.get("filingDate", [])
            accessions = recent.get("accessionNumber", [])
            primary_docs = recent.get("primaryDocument", [])

            items: list[LiveNewsItem] = []
            for form, date_text, accession, primary in zip(
                forms,
                dates,
                accessions,
                primary_docs,
            ):
                if form not in {"8-K", "10-Q", "10-K", "6-K", "S-1", "424B5"}:
                    continue
                accession_clean = str(accession).replace("-", "")
                url = (
                    f"https://www.sec.gov/Archives/edgar/data/{cik}/"
                    f"{accession_clean}/{primary}"
                )
                published = _parse_datetime(f"{date_text}T00:00:00+00:00")
                items.append(
                    LiveNewsItem(
                        symbol=symbol.upper(),
                        title=f"{company}: SEC {form} filing",
                        publisher="SEC EDGAR",
                        published_at=published,
                        url=url,
                        summary=f"Recent {form} filing from SEC EDGAR.",
                        source="sec_edgar",
                    )
                )
                if len(items) >= limit:
                    break
            return items


class RestProvider:
    def __init__(self, name: str, env_key: str) -> None:
        self.name = name
        self.env_key = env_key

    @property
    def api_key(self) -> str | None:
        value = os.getenv(self.env_key)
        return value.strip() if value and value.strip() else None


class AlphaVantageProvider(RestProvider):
    def __init__(self) -> None:
        super().__init__("Alpha Vantage", "ALPHAVANTAGE_API_KEY")

    def weekly_bars(self, symbol: str) -> list[OHLCVBar]:
        if not self.api_key:
            return []
        response = httpx.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "TIME_SERIES_WEEKLY",
                "symbol": symbol,
                "apikey": self.api_key,
            },
            timeout=20,
        )
        response.raise_for_status()
        series = response.json().get("Weekly Time Series", {})
        bars: list[OHLCVBar] = []
        for date_text, row in series.items():
            try:
                bars.append(
                    OHLCVBar(
                        timestamp=datetime.fromisoformat(date_text).replace(
                            tzinfo=timezone.utc
                        ),
                        open=float(row["1. open"]),
                        high=float(row["2. high"]),
                        low=float(row["3. low"]),
                        close=float(row["4. close"]),
                        volume=float(row["5. volume"]),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return sorted(bars, key=lambda bar: bar.timestamp)

    def news(self, symbol: str, limit: int = 12) -> list[LiveNewsItem]:
        if not self.api_key:
            return []
        response = httpx.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "NEWS_SENTIMENT",
                "tickers": symbol,
                "limit": limit,
                "apikey": self.api_key,
            },
            timeout=20,
        )
        response.raise_for_status()
        items: list[LiveNewsItem] = []
        for row in response.json().get("feed", []):
            published = None
            stamp = str(row.get("time_published") or "")
            try:
                published = datetime.strptime(stamp[:15], "%Y%m%dT%H%M%S").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                pass
            items.append(
                LiveNewsItem(
                    symbol=symbol.upper(),
                    title=str(row.get("title") or ""),
                    publisher=str(row.get("source") or "Alpha Vantage"),
                    published_at=published,
                    url=str(row.get("url") or ""),
                    summary=str(row.get("summary") or ""),
                    source="alpha_vantage",
                )
            )
        return [item for item in items if item.title]


class TwelveDataProvider(RestProvider):
    def __init__(self) -> None:
        super().__init__("Twelve Data", "TWELVEDATA_API_KEY")

    def weekly_bars(self, symbol: str) -> list[OHLCVBar]:
        if not self.api_key:
            return []
        response = httpx.get(
            "https://api.twelvedata.com/time_series",
            params={
                "symbol": symbol,
                "interval": "1week",
                "outputsize": 120,
                "apikey": self.api_key,
            },
            timeout=20,
        )
        response.raise_for_status()
        bars: list[OHLCVBar] = []
        for row in response.json().get("values", []):
            try:
                timestamp = _parse_datetime(row.get("datetime"))
                if timestamp is None:
                    continue
                bars.append(
                    OHLCVBar(
                        timestamp=timestamp,
                        open=float(row["open"]),
                        high=float(row["high"]),
                        low=float(row["low"]),
                        close=float(row["close"]),
                        volume=float(row.get("volume") or 0),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return sorted(bars, key=lambda bar: bar.timestamp)


class MassiveProvider(RestProvider):
    def __init__(self) -> None:
        super().__init__("Massive / Polygon", "MASSIVE_API_KEY")

    @property
    def api_key(self) -> str | None:
        return (
            os.getenv("MASSIVE_API_KEY")
            or os.getenv("POLYGON_API_KEY")
            or None
        )

    def daily_bars(self, symbol: str) -> list[OHLCVBar]:
        if not self.api_key:
            return []
        end = datetime.now(timezone.utc).date()
        start = end - timedelta(days=730)
        response = httpx.get(
            (
                "https://api.massive.com/v2/aggs/ticker/"
                f"{symbol}/range/1/day/{start.isoformat()}/{end.isoformat()}"
            ),
            params={
                "adjusted": "true",
                "sort": "asc",
                "limit": 50000,
                "apiKey": self.api_key,
            },
            timeout=20,
        )
        response.raise_for_status()
        bars: list[OHLCVBar] = []
        for row in response.json().get("results", []):
            timestamp = _utc_from_epoch(float(row.get("t", 0)) / 1000)
            if timestamp is None:
                continue
            try:
                bars.append(
                    OHLCVBar(
                        timestamp=timestamp,
                        open=float(row["o"]),
                        high=float(row["h"]),
                        low=float(row["l"]),
                        close=float(row["c"]),
                        volume=float(row.get("v") or 0),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return bars

    def news(self, symbol: str, limit: int = 12) -> list[LiveNewsItem]:
        if not self.api_key:
            return []
        response = httpx.get(
            "https://api.massive.com/v2/reference/news",
            params={
                "ticker": symbol,
                "order": "desc",
                "sort": "published_utc",
                "limit": limit,
                "apiKey": self.api_key,
            },
            timeout=20,
        )
        response.raise_for_status()
        items: list[LiveNewsItem] = []
        for row in response.json().get("results", []):
            publisher = row.get("publisher") or {}
            items.append(
                LiveNewsItem(
                    symbol=symbol.upper(),
                    title=str(row.get("title") or ""),
                    publisher=str(
                        publisher.get("name") if isinstance(publisher, dict) else publisher
                    ),
                    published_at=_parse_datetime(row.get("published_utc")),
                    url=str(row.get("article_url") or ""),
                    summary=str(row.get("description") or ""),
                    source="massive",
                )
            )
        return [item for item in items if item.title]


class FinnhubProvider(RestProvider):
    def __init__(self) -> None:
        super().__init__("Finnhub", "FINNHUB_API_KEY")

    def news(self, symbol: str, limit: int = 12) -> list[LiveNewsItem]:
        if not self.api_key:
            return []
        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=30)
        response = httpx.get(
            "https://finnhub.io/api/v1/company-news",
            params={
                "symbol": symbol,
                "from": start.isoformat(),
                "to": today.isoformat(),
                "token": self.api_key,
            },
            timeout=20,
        )
        response.raise_for_status()
        items: list[LiveNewsItem] = []
        for row in response.json()[:limit]:
            items.append(
                LiveNewsItem(
                    symbol=symbol.upper(),
                    title=str(row.get("headline") or ""),
                    publisher=str(row.get("source") or "Finnhub"),
                    published_at=_utc_from_epoch(row.get("datetime")),
                    url=str(row.get("url") or ""),
                    summary=str(row.get("summary") or ""),
                    source="finnhub",
                )
            )
        return [item for item in items if item.title]


class LiveDataService:
    def __init__(self) -> None:
        self.yahoo = YahooProvider()
        self.nasdaq = NasdaqDirectoryProvider()
        self.sec = SecEdgarProvider()
        self.alpha = AlphaVantageProvider()
        self.twelve = TwelveDataProvider()
        self.massive = MassiveProvider()
        self.finnhub = FinnhubProvider()

    def provider_status(self) -> list[ProviderStatus]:
        return [
            ProviderStatus(
                name="Yahoo Finance / yfinance",
                kind="market+profile+news",
                configured=True,
                zero_key=True,
                capabilities=["screen", "quote", "ohlcv", "profile", "fundamentals", "news"],
                detail="Primary zero-key live test provider.",
            ),
            ProviderStatus(
                name="Nasdaq Trader",
                kind="universe",
                configured=True,
                zero_key=True,
                capabilities=["listed-symbol universe", "exchange metadata"],
                detail="Fallback U.S. listed-symbol directory.",
            ),
            ProviderStatus(
                name="SEC EDGAR",
                kind="filings",
                configured=True,
                zero_key=True,
                capabilities=["recent filings", "company mapping"],
                detail="Real-time public filing catalyst/evidence source.",
            ),
            ProviderStatus(
                name=self.alpha.name,
                kind="market+news",
                configured=bool(self.alpha.api_key),
                capabilities=["weekly ohlcv", "news sentiment"],
                detail=f"Set {self.alpha.env_key} to enable.",
            ),
            ProviderStatus(
                name=self.twelve.name,
                kind="market",
                configured=bool(self.twelve.api_key),
                capabilities=["weekly ohlcv"],
                detail=f"Set {self.twelve.env_key} to enable.",
            ),
            ProviderStatus(
                name=self.massive.name,
                kind="market+news",
                configured=bool(self.massive.api_key),
                capabilities=["daily ohlcv", "news"],
                detail="Set MASSIVE_API_KEY or POLYGON_API_KEY to enable.",
            ),
            ProviderStatus(
                name=self.finnhub.name,
                kind="market+news",
                configured=bool(self.finnhub.api_key),
                capabilities=["company news"],
                detail=f"Set {self.finnhub.env_key} to enable.",
            ),
        ]

    def _weekly_bars(self, symbol: str) -> tuple[list[OHLCVBar], str]:
        errors: list[str] = []
        try:
            daily = self.yahoo.daily_bars(symbol)
            weekly = aggregate_daily_to_weekly(daily, exclude_partial_week=True)
            if len(weekly) >= 35:
                return weekly, "yahoo"
        except Exception as exc:
            errors.append(f"Yahoo: {exc}")

        for provider, daily_mode in (
            (self.massive, True),
            (self.twelve, False),
            (self.alpha, False),
        ):
            try:
                if not provider.api_key:
                    continue
                bars = (
                    aggregate_daily_to_weekly(
                        provider.daily_bars(symbol),
                        exclude_partial_week=True,
                    )
                    if daily_mode
                    else provider.weekly_bars(symbol)
                )
                if len(bars) >= 35:
                    return bars, provider.name
            except Exception as exc:
                errors.append(f"{provider.name}: {exc}")
        raise RuntimeError("; ".join(errors) or "No OHLCV provider returned enough history")

    def _news(self, symbol: str) -> tuple[list[LiveNewsItem], list[str]]:
        items: list[LiveNewsItem] = []
        sources: list[str] = []
        providers = [self.yahoo, self.massive, self.finnhub, self.alpha]
        for provider in providers:
            try:
                if isinstance(provider, RestProvider) and not provider.api_key:
                    continue
                batch = provider.news(symbol, count=12) if isinstance(provider, YahooProvider) else provider.news(symbol, limit=12)
                if batch:
                    items.extend(batch)
                    sources.append(provider.name)
            except Exception:
                continue
        try:
            filings = self.sec.recent_filings(symbol, limit=6)
            if filings:
                items.extend(filings)
                sources.append(self.sec.name)
        except Exception:
            pass

        deduped: dict[tuple[str, str], LiveNewsItem] = {}
        for item in items:
            key = (item.title.strip().lower(), item.url.strip().lower())
            deduped.setdefault(key, item)
        ordered = sorted(
            deduped.values(),
            key=lambda item: item.published_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        return ordered[:20], sources

    def _scan_one(
        self,
        profile_hint: LiveProfile,
        request: LiveScanRequest,
        config: BreakoutConfig,
    ) -> LiveScanRow:
        sources = [profile_hint.source]
        try:
            profile = self.yahoo.profile(profile_hint.symbol, profile_hint.price)
            sources.append("yahoo_profile")
        except Exception:
            profile = profile_hint

        news, news_sources = self._news(profile.symbol)
        sources.extend(news_sources)

        cutoff = datetime.now(timezone.utc) - timedelta(days=request.news_lookback_days)
        recent_news = [
            item
            for item in news
            if item.published_at is None or item.published_at >= cutoff
        ]
        if request.require_recent_news and not recent_news:
            bars, bar_source = self._weekly_bars(profile.symbol)
            sources.append(bar_source)
            candidate = WeeklyBreakoutEngine(config).evaluate(
                profile.symbol,
                bars,
                None,
            )
            candidate.reasons.append(
                f"No news/filing found in the last {request.news_lookback_days} days"
            )
            return LiveScanRow(
                profile=profile,
                candidate=candidate,
                news=[],
                catalyst_score=0,
                data_sources=sorted(set(sources)),
            )

        bars, bar_source = self._weekly_bars(profile.symbol)
        sources.append(bar_source)
        try:
            fundamentals = self.yahoo.fundamentals(profile.symbol)
            if fundamentals is not None:
                sources.append("yahoo_fundamentals")
        except Exception:
            fundamentals = None

        candidate = WeeklyBreakoutEngine(config).evaluate(
            profile.symbol,
            bars,
            fundamentals,
        )
        candidate.metadata["live_data_sources"] = sorted(set(sources))
        candidate.metadata["recent_news_count"] = len(recent_news)
        return LiveScanRow(
            profile=profile,
            candidate=candidate,
            news=recent_news[:8],
            catalyst_score=_catalyst_score(recent_news),
            data_sources=sorted(set(sources)),
        )

    def scan_weekly_breakout(self, request: LiveScanRequest) -> LiveScanResponse:
        if request.max_price < request.min_price:
            raise ValueError("max_price must be >= min_price")

        warnings: list[str] = []
        try:
            profiles = self.yahoo.screen(request)
        except Exception as exc:
            profiles = []
            warnings.append(f"Yahoo screener unavailable: {exc}")

        if not profiles:
            warnings.append(
                "No screener candidates were returned. Check connectivity or broaden the filters."
            )
            return LiveScanResponse(
                generated_at=datetime.now(timezone.utc),
                query=request,
                discovered_count=0,
                scanned_count=0,
                rows=[],
                providers=self.provider_status(),
                warnings=warnings,
            )

        config = request.config or medical_breakout_config()
        rows: list[LiveScanRow] = []
        workers = min(6, max(1, len(profiles)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(self._scan_one, profile, request, config): profile
                for profile in profiles[: request.max_candidates]
            }
            for future in as_completed(futures):
                profile = futures[future]
                try:
                    row = future.result()
                except Exception as exc:
                    warnings.append(f"{profile.symbol}: {exc}")
                    continue
                if request.include_rejected or row.candidate.state.value != "rejected":
                    rows.append(row)

        def rank(row: LiveScanRow) -> tuple[float, float, float]:
            overall = (
                row.candidate.scores.overall
                if row.candidate.scores is not None
                else 0.0
            )
            confirmed = 1.0 if row.candidate.state.value == "confirmed" else 0.0
            return (confirmed, overall, row.catalyst_score)

        rows.sort(key=rank, reverse=True)
        rows = rows[: request.max_results]
        return LiveScanResponse(
            generated_at=datetime.now(timezone.utc),
            query=request,
            discovered_count=len(profiles),
            scanned_count=len(rows),
            rows=rows,
            providers=self.provider_status(),
            warnings=warnings,
        )


_service: LiveDataService | None = None


def get_live_data_service() -> LiveDataService:
    global _service
    if _service is None:
        _service = LiveDataService()
    return _service
