"""Facsimile market scanner package.

The package is intentionally broker-agnostic. It produces deterministic
universe decisions and scanner candidates that can later be consumed by
Sentinel Edge.
"""

from .breakout import WeeklyBreakoutEngine
from .models import BreakoutCandidate, BreakoutConfig, OHLCVBar
from .universe import (
    InstrumentProfile,
    UniverseFilter,
    evaluate_universe,
    filter_universe,
)

__all__ = [
    "WeeklyBreakoutEngine",
    "BreakoutCandidate",
    "BreakoutConfig",
    "OHLCVBar",
    "InstrumentProfile",
    "UniverseFilter",
    "evaluate_universe",
    "filter_universe",
]
