from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field

from .breakout import WeeklyBreakoutEngine
from .models import BreakoutCandidate, BreakoutConfig
from .providers import LiveNewsItem, ProviderStatus, YahooFinanceProvider
from .universe import InstrumentProfile


class LiveScanRequest(BaseModel):
    min_price: float = Field(default=0.10, ge=0)
    max_price: float = Field(default=2.50, gt=0)
    sector: str | None = "Medical"
    max_symbols: int = Field(default=60, ge=1, le=250)
    require_recent_news: bool = True
    news_days: int = Field(default=14, ge=1, le=90)
    minimum_news_items: int = Field(default=1, ge=0, le=10)
    workers: int = Field(default=8, ge=1, le=16)
    config: BreakoutConfig | None = None


class LiveCandidate(BaseModel):
    profile: InstrumentProfile
    breakout: BreakoutCandidate
    news: list[LiveNewsItem] = Field(default_factory=list)
    latest_news_at: datetime | None = None


class LiveScanResponse(BaseModel):
    as_of: datetime
    provider_status: list[ProviderStatus]
    screened_symbols: int
    evaluated_symbols: int
    news_qualified_symbols: int
    candidates: list[LiveCandidate]
    warnings: list[str] = Field(default_factory=list)


def _recent_news(
    items: list[LiveNewsItem],
    cutoff: datetime,
) -> list[LiveNewsItem]:
    result = []
    for item in items:
        if item.published_at is None or item.published_at >= cutoff:
            result.append(item)
    return result


def run_live_weekly_scan(request: LiveScanRequest) -> LiveScanResponse:
    yahoo = YahooFinanceProvider()
    warnings: list[str] = []

    if request.min_price > request.max_price:
        raise ValueError("min_price cannot exceed max_price")

    profiles = yahoo.screen(
        min_price=request.min_price,
        max_price=request.max_price,
        sector=request.sector,
        max_results=request.max_symbols,
    )

    engine = WeeklyBreakoutEngine(request.config)
    cutoff = datetime.now(timezone.utc) - timedelta(days=request.news_days)

    def evaluate(profile: InstrumentProfile) -> LiveCandidate | None:
        bars = yahoo.weekly_bars(profile.symbol)
        if not bars:
            return None

        news = _recent_news(yahoo.news(profile.symbol), cutoff)
        if (
            request.require_recent_news
            and len(news) < request.minimum_news_items
        ):
            return None

        enriched = yahoo.profile(profile.symbol, profile.price)
        if enriched.sector is None:
            enriched.sector = profile.sector
        if enriched.industry is None:
            enriched.industry = profile.industry
        if enriched.exchange is None:
            enriched.exchange = profile.exchange

        candidate = engine.evaluate(
            enriched.symbol,
            bars,
            fundamentals=None,
        )
        latest_news_at = max(
            (
                item.published_at
                for item in news
                if item.published_at is not None
            ),
            default=None,
        )
        return LiveCandidate(
            profile=enriched,
            breakout=candidate,
            news=news,
            latest_news_at=latest_news_at,
        )

    results: list[LiveCandidate] = []
    evaluated = 0
    with ThreadPoolExecutor(max_workers=request.workers) as pool:
        futures = {
            pool.submit(evaluate, profile): profile.symbol
            for profile in profiles
        }
        for future in as_completed(futures):
            evaluated += 1
            try:
                result = future.result()
                if result is not None:
                    results.append(result)
            except Exception as exc:
                warnings.append(f"{futures[future]}: {exc}")

    results.sort(
        key=lambda item: (
            item.breakout.scores.overall_score
            if item.breakout.scores is not None
            else -1,
            item.latest_news_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )

    return LiveScanResponse(
        as_of=datetime.now(timezone.utc),
        provider_status=[yahoo.status()],
        screened_symbols=len(profiles),
        evaluated_symbols=evaluated,
        news_qualified_symbols=len(results),
        candidates=results,
        warnings=warnings[:25],
    )
