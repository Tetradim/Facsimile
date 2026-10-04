from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from facsimile.models import OHLCVBar
from facsimile.universe import InstrumentProfile

from .base import LiveNewsItem, ProviderStatus


class YahooFinanceProvider:
    name = "yahoo"

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            provider=self.name,
            capabilities=[
                "equity_screener",
                "quotes",
                "weekly_ohlcv",
                "profiles",
                "news",
            ],
            detail="No API key required; data supplied through yfinance/Yahoo Finance.",
        )

    @staticmethod
    def _sector_value(value: str) -> str:
        normalized = value.strip().lower()
        aliases = {
            "medical": "Healthcare",
            "health": "Healthcare",
            "health care": "Healthcare",
            "healthcare": "Healthcare",
            "biotech": "Healthcare",
            "biotechnology": "Healthcare",
        }
        return aliases.get(normalized, value)

    def screen(
        self,
        min_price: float,
        max_price: float,
        sector: str | None = None,
        max_results: int = 250,
    ) -> list[InstrumentProfile]:
        clauses: list[Any] = [
            yf.EquityQuery("eq", ["region", "us"]),
            yf.EquityQuery("gte", ["intradayprice", min_price]),
            yf.EquityQuery("lte", ["intradayprice", max_price]),
            yf.EquityQuery(
                "is-in",
                ["exchange", "NMS", "NGM", "NCM", "NYQ", "ASE"],
            ),
        ]
        if sector:
            clauses.append(
                yf.EquityQuery("eq", ["sector", self._sector_value(sector)])
            )

        query = yf.EquityQuery("and", clauses)
        profiles: list[InstrumentProfile] = []
        offset = 0

        while len(profiles) < max_results:
            size = min(250, max_results - len(profiles))
            payload = yf.screen(
                query,
                offset=offset,
                size=size,
                sortField="dayvolume",
                sortAsc=False,
            )
            quotes = payload.get("quotes", []) if isinstance(payload, dict) else []
            if not quotes:
                break

            for quote in quotes:
                symbol = str(
                    quote.get("symbol")
                    or quote.get("ticker")
                    or ""
                ).strip().upper()
                price = quote.get("regularMarketPrice")
                if price is None:
                    price = quote.get("intradayprice")
                if not symbol or price is None:
                    continue

                profiles.append(
                    InstrumentProfile(
                        symbol=symbol,
                        price=float(price),
                        sector=quote.get("sector") or sector,
                        industry=quote.get("industry"),
                        exchange=(
                            quote.get("exchange")
                            or quote.get("fullExchangeName")
                        ),
                        market_cap=quote.get("marketCap"),
                    )
                )

            if len(quotes) < size:
                break
            offset += size

        return profiles[:max_results]

    def weekly_bars(
        self,
        symbol: str,
        period: str = "1y",
    ) -> list[OHLCVBar]:
        history = yf.Ticker(symbol).history(
            period=period,
            interval="1wk",
            auto_adjust=False,
            actions=False,
            repair=True,
        )
        if history is None or history.empty:
            return []

        bars: list[OHLCVBar] = []
        for index, row in history.iterrows():
            try:
                timestamp = index.to_pydatetime()
            except AttributeError:
                timestamp = index
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)

            values = {
                "open": row.get("Open"),
                "high": row.get("High"),
                "low": row.get("Low"),
                "close": row.get("Close"),
                "volume": row.get("Volume"),
            }
            if any(value is None for value in values.values()):
                continue
            try:
                bars.append(
                    OHLCVBar(
                        timestamp=timestamp,
                        open=float(values["open"]),
                        high=float(values["high"]),
                        low=float(values["low"]),
                        close=float(values["close"]),
                        volume=float(values["volume"]),
                    )
                )
            except (TypeError, ValueError):
                continue
        return bars

    def profile(self, symbol: str, fallback_price: float) -> InstrumentProfile:
        info: dict[str, Any] = {}
        try:
            info = yf.Ticker(symbol).get_info() or {}
        except Exception:
            info = {}

        price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or fallback_price
        )
        return InstrumentProfile(
            symbol=symbol.upper(),
            price=float(price),
            sector=info.get("sector"),
            industry=info.get("industry"),
            exchange=info.get("exchange"),
            market_cap=info.get("marketCap"),
        )

    def news(self, symbol: str, count: int = 10) -> list[LiveNewsItem]:
        try:
            items = yf.Ticker(symbol).get_news(count=count, tab="all")
        except Exception:
            return []

        parsed: list[LiveNewsItem] = []
        for item in items or []:
            content = item.get("content", item) if isinstance(item, dict) else {}
            title = content.get("title") or content.get("headline")
            if not title:
                continue

            provider = content.get("provider")
            if isinstance(provider, dict):
                publisher = provider.get("displayName") or provider.get("name")
            else:
                publisher = content.get("publisher")

            canonical = content.get("canonicalUrl")
            clickthrough = content.get("clickThroughUrl")
            url = None
            if isinstance(canonical, dict):
                url = canonical.get("url")
            if not url and isinstance(clickthrough, dict):
                url = clickthrough.get("url")
            if not url:
                url = content.get("link")

            published_at = None
            published = (
                content.get("pubDate")
                or content.get("displayTime")
                or content.get("providerPublishTime")
            )
            if isinstance(published, (int, float)):
                published_at = datetime.fromtimestamp(
                    published,
                    tz=timezone.utc,
                )
            elif isinstance(published, str):
                try:
                    published_at = datetime.fromisoformat(
                        published.replace("Z", "+00:00")
                    )
                except ValueError:
                    published_at = None

            summary = content.get("summary") or content.get("description")
            parsed.append(
                LiveNewsItem(
                    provider=self.name,
                    title=str(title),
                    url=url,
                    publisher=publisher,
                    published_at=published_at,
                    summary=summary,
                )
            )
        return parsed
