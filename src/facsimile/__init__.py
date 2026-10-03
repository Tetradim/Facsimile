"""Facsimile weekly breakout scanner.

The package is intentionally broker-agnostic. It produces deterministic
scanner candidates that can later be consumed by Sentinel Edge.
"""

from .breakout import WeeklyBreakoutEngine
from .models import BreakoutCandidate, BreakoutConfig, OHLCVBar

__all__ = ["WeeklyBreakoutEngine", "BreakoutCandidate", "BreakoutConfig", "OHLCVBar"]
