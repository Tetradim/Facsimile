from __future__ import annotations

from collections.abc import Sequence

from .models import OHLCVBar


def sma(values: Sequence[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema_series(values: Sequence[float], period: int) -> list[float]:
    if not values:
        return []
    alpha = 2.0 / (period + 1.0)
    out = [float(values[0])]
    for value in values[1:]:
        out.append((float(value) * alpha) + (out[-1] * (1.0 - alpha)))
    return out


def macd(values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[float | None, float | None]:
    if len(values) < slow + signal:
        return None, None
    fast_ema = ema_series(values, fast)
    slow_ema = ema_series(values, slow)
    line = [a - b for a, b in zip(fast_ema, slow_ema)]
    signal_series = ema_series(line, signal)
    return line[-1], signal_series[-1]


def true_range(current: OHLCVBar, previous_close: float | None) -> float:
    if previous_close is None:
        return current.high - current.low
    return max(
        current.high - current.low,
        abs(current.high - previous_close),
        abs(current.low - previous_close),
    )


def atr(bars: Sequence[OHLCVBar], period: int = 14) -> float | None:
    if len(bars) < period:
        return None
    ranges: list[float] = []
    previous_close: float | None = None
    for bar in bars:
        ranges.append(true_range(bar, previous_close))
        previous_close = bar.close
    return sum(ranges[-period:]) / period


def natr(bars: Sequence[OHLCVBar], period: int = 14) -> float | None:
    value = atr(bars, period)
    if value is None or not bars or bars[-1].close <= 0:
        return None
    return value / bars[-1].close


def close_location(bar: OHLCVBar) -> float:
    spread = bar.high - bar.low
    if spread <= 0:
        return 1.0
    return (bar.close - bar.low) / spread


def upper_wick_ratio(bar: OHLCVBar) -> float:
    spread = bar.high - bar.low
    if spread <= 0:
        return 0.0
    return (bar.high - max(bar.open, bar.close)) / spread


def relative_volume(bars: Sequence[OHLCVBar], average_bars: int = 6) -> tuple[float | None, float | None]:
    if len(bars) < 2:
        return None, None
    current = bars[-1].volume
    previous = bars[-2].volume
    previous_ratio = current / previous if previous > 0 else None
    prior = [bar.volume for bar in bars[-(average_bars + 1):-1]]
    average = sum(prior) / len(prior) if prior else 0.0
    average_ratio = current / average if average > 0 else None
    return previous_ratio, average_ratio
