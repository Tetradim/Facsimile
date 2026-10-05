from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from pydantic import BaseModel, Field

from .live_data import LiveDataService
from .position_manager import (
    ManagedPosition,
    PositionManagerConfig,
    PositionState,
    PositionUpdate,
    WeeklyPositionManager,
)


class PositionEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    kind: str
    message: str
    occurred_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class TrackedPosition(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    position: ManagedPosition
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    events: list[PositionEvent] = Field(default_factory=list)


class TrackedPositionCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    opened_at: datetime
    entry_price: float = Field(gt=0)
    initial_stop: float = Field(gt=0)


class PositionRefreshResponse(BaseModel):
    tracked: TrackedPosition
    update: PositionUpdate


class PositionStore:
    def __init__(
        self,
        path: Path | None = None,
        config: PositionManagerConfig | None = None,
    ) -> None:
        configured = os.getenv("FACSIMILE_POSITION_PATH")
        self.path = (
            path
            or (Path(configured).expanduser() if configured else None)
            or Path.home() / ".facsimile" / "positions.json"
        )
        self._lock = Lock()
        self.manager = WeeklyPositionManager(config)

    def _read(self) -> list[TrackedPosition]:
        if not self.path.exists():
            return []
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        return [
            TrackedPosition.model_validate(item)
            for item in payload
            if isinstance(item, dict)
        ]

    def _write(self, items: list[TrackedPosition]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(
                [item.model_dump(mode="json") for item in items],
                indent=2,
            ),
            encoding="utf-8",
        )
        temp.replace(self.path)

    def list(self) -> list[TrackedPosition]:
        with self._lock:
            return self._read()

    def create(
        self,
        request: TrackedPositionCreate,
    ) -> TrackedPosition:
        if request.initial_stop >= request.entry_price:
            raise ValueError("initial_stop must be below entry_price")

        tracked = TrackedPosition(
            position=ManagedPosition(
                symbol=request.symbol.strip().upper(),
                opened_at=request.opened_at,
                entry_price=request.entry_price,
                initial_stop=request.initial_stop,
                current_stop=request.initial_stop,
            ),
            events=[
                PositionEvent(
                    kind="position_created",
                    message=(
                        f"Position created at {request.entry_price:.4f} "
                        f"with stop {request.initial_stop:.4f}."
                    ),
                )
            ],
        )
        with self._lock:
            items = self._read()
            items.append(tracked)
            self._write(items)
        return tracked

    def delete(self, position_id: str) -> bool:
        with self._lock:
            items = self._read()
            next_items = [
                item for item in items if item.id != position_id
            ]
            if len(next_items) == len(items):
                return False
            self._write(next_items)
            return True

    def refresh(
        self,
        position_id: str,
        service: LiveDataService,
    ) -> PositionRefreshResponse:
        with self._lock:
            items = self._read()
            index = next(
                (
                    idx
                    for idx, item in enumerate(items)
                    if item.id == position_id
                ),
                None,
            )
            if index is None:
                raise KeyError(position_id)
            tracked = items[index]

        bars = service.weekly_bars_for_symbol(
            tracked.position.symbol
        )
        update = self.manager.evaluate(
            tracked.position,
            bars,
        )
        tracked.position = update.position
        tracked.updated_at = datetime.now(timezone.utc)

        if update.position.state == PositionState.STOP_HIT:
            tracked.events.insert(
                0,
                PositionEvent(
                    kind="stop_hit",
                    message=update.reason,
                ),
            )
        elif update.stop_changed:
            tracked.events.insert(
                0,
                PositionEvent(
                    kind="stop_tightened",
                    message=update.reason,
                ),
            )
        elif update.previous_state != update.position.state:
            tracked.events.insert(
                0,
                PositionEvent(
                    kind="state_changed",
                    message=update.reason,
                ),
            )
        tracked.events = tracked.events[:200]

        with self._lock:
            items = self._read()
            index = next(
                (
                    idx
                    for idx, item in enumerate(items)
                    if item.id == position_id
                ),
                None,
            )
            if index is None:
                raise KeyError(position_id)
            items[index] = tracked
            self._write(items)

        return PositionRefreshResponse(
            tracked=tracked,
            update=update,
        )


_store: PositionStore | None = None


def get_position_store() -> PositionStore:
    global _store
    if _store is None:
        _store = PositionStore()
    return _store
