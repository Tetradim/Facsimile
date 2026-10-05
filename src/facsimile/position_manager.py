from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from .indicators import macd
from .models import OHLCVBar


class PositionState(str, Enum):
    NORMAL = "normal"
    MACD_BEARISH_CONFIRMED = "macd_bearish_confirmed"
    TIGHTENED = "tightened"
    STOP_HIT = "stop_hit"


class ManagedPosition(BaseModel):
    symbol: str
    opened_at: datetime
    entry_price: float = Field(gt=0)
    initial_stop: float = Field(gt=0)
    current_stop: float = Field(gt=0)
    state: PositionState = PositionState.NORMAL
    bearish_macd_weeks: int = Field(default=0, ge=0)
    last_updated_at: datetime | None = None

    def model_post_init(self, __context) -> None:
        if self.initial_stop >= self.entry_price:
            raise ValueError("initial_stop must be below entry_price")
        if self.current_stop < self.initial_stop:
            raise ValueError("current_stop cannot be below initial_stop")


class PositionUpdate(BaseModel):
    position: ManagedPosition
    previous_state: PositionState
    previous_stop: float
    stop_changed: bool
    stop_hit_price: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    structure_stop: float | None = None
    reason: str


class PositionManagerConfig(BaseModel):
    macd_bearish_confirmation_weeks: int = Field(default=2, ge=1, le=4)
    structure_lookback_weeks: int = Field(default=3, ge=2, le=12)
    structure_buffer_pct: float = Field(default=0.01, ge=0, le=0.10)


class WeeklyPositionManager:
    def __init__(
        self,
        config: PositionManagerConfig | None = None,
    ) -> None:
        self.config = config or PositionManagerConfig()

    def evaluate(
        self,
        position: ManagedPosition,
        weekly_bars: list[OHLCVBar],
    ) -> PositionUpdate:
        if not weekly_bars:
            raise ValueError("weekly_bars cannot be empty")

        bars = sorted(weekly_bars, key=lambda bar: bar.timestamp)
        current = bars[-1]
        previous_state = position.state
        previous_stop = position.current_stop

        updated = position.model_copy(deep=True)
        updated.last_updated_at = current.timestamp

        if current.low <= position.current_stop:
            fill = min(current.open, position.current_stop)
            updated.state = PositionState.STOP_HIT
            return PositionUpdate(
                position=updated,
                previous_state=previous_state,
                previous_stop=previous_stop,
                stop_changed=False,
                stop_hit_price=fill,
                reason=(
                    f"Weekly low {current.low:.4f} crossed the active stop "
                    f"{position.current_stop:.4f}."
                ),
            )

        closes = [bar.close for bar in bars]
        macd_line, macd_signal = macd(closes)
        bearish = (
            macd_line is not None
            and macd_signal is not None
            and macd_line < macd_signal
        )

        if bearish:
            updated.bearish_macd_weeks += 1
        else:
            updated.bearish_macd_weeks = 0
            if updated.state != PositionState.STOP_HIT:
                updated.state = PositionState.NORMAL

        structure_stop: float | None = None
        stop_changed = False

        if (
            bearish
            and updated.bearish_macd_weeks
            >= self.config.macd_bearish_confirmation_weeks
        ):
            updated.state = PositionState.MACD_BEARISH_CONFIRMED
            lookback = bars[-self.config.structure_lookback_weeks :]
            raw_structure = min(bar.low for bar in lookback)
            structure_stop = raw_structure * (
                1 - self.config.structure_buffer_pct
            )

            if structure_stop > updated.current_stop:
                updated.current_stop = structure_stop
                updated.state = PositionState.TIGHTENED
                stop_changed = True

        if updated.current_stop < previous_stop:
            raise RuntimeError("position manager attempted to loosen a stop")

        if stop_changed:
            reason = (
                f"Bearish weekly MACD confirmed for "
                f"{updated.bearish_macd_weeks} weeks; stop ratcheted from "
                f"{previous_stop:.4f} to {updated.current_stop:.4f} beneath "
                "recent weekly structure."
            )
        elif updated.state == PositionState.MACD_BEARISH_CONFIRMED:
            reason = (
                "Bearish weekly MACD is confirmed, but recent structure does "
                "not justify a tighter stop yet."
            )
        elif bearish:
            reason = (
                f"Bearish weekly MACD week {updated.bearish_macd_weeks}/"
                f"{self.config.macd_bearish_confirmation_weeks}; no stop "
                "change until confirmation."
            )
        else:
            reason = "Weekly MACD is not bearishly confirmed; stop unchanged."

        return PositionUpdate(
            position=updated,
            previous_state=previous_state,
            previous_stop=previous_stop,
            stop_changed=stop_changed,
            macd=macd_line,
            macd_signal=macd_signal,
            structure_stop=structure_stop,
            reason=reason,
        )
