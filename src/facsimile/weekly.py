from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, time, timezone

from .models import OHLCVBar


def aggregate_daily_to_weekly(
    daily_bars: Sequence[OHLCVBar],
    *,
    exclude_partial_week: bool = True,
) -> list[OHLCVBar]:
    """Aggregate ordered daily bars into ISO-week bars.

    The scanner is designed around completed weekly candles. When partial-week
    exclusion is enabled, the most recent ISO week is omitted unless its final
    observed bar is Friday. Sentinel Edge can later replace this simple rule
    with its exchange-calendar session service.
    """
    if not daily_bars:
        return []

    ordered = sorted(daily_bars, key=lambda bar: bar.timestamp)
    buckets: dict[tuple[int, int], list[OHLCVBar]] = {}
    for bar in ordered:
        iso = bar.timestamp.date().isocalendar()
        buckets.setdefault((iso.year, iso.week), []).append(bar)

    weekly: list[OHLCVBar] = []
    keys = sorted(buckets)
    for index, key in enumerate(keys):
        group = buckets[key]
        if exclude_partial_week and index == len(keys) - 1 and group[-1].timestamp.weekday() < 4:
            continue
        start = group[0]
        end = group[-1]
        weekly.append(
            OHLCVBar(
                timestamp=datetime.combine(
                    end.timestamp.date(),
                    time.max,
                    tzinfo=end.timestamp.tzinfo or timezone.utc,
                ),
                open=start.open,
                high=max(bar.high for bar in group),
                low=min(bar.low for bar in group),
                close=end.close,
                volume=sum(bar.volume for bar in group),
            )
        )
    return weekly
