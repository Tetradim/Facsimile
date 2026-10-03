from datetime import datetime, timedelta, timezone

from facsimile.models import OHLCVBar
from facsimile.weekly import aggregate_daily_to_weekly


def test_aggregate_daily_to_weekly_omits_partial_last_week() -> None:
    start = datetime(2025, 1, 6, tzinfo=timezone.utc)
    bars = []

    for i in range(8):
        day = start + timedelta(days=i if i < 5 else i + 2)
        bars.append(
            OHLCVBar(
                timestamp=day,
                open=100 + i,
                high=102 + i,
                low=99 + i,
                close=101 + i,
                volume=1000,
            )
        )

    weekly = aggregate_daily_to_weekly(
        bars,
        exclude_partial_week=True,
    )

    assert len(weekly) == 1
    assert weekly[0].open == 100
    assert weekly[0].close == 105
    assert weekly[0].volume == 5000
