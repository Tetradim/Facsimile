from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from pydantic import BaseModel, Field

from .live_data import LiveScanRequest, LiveScanResponse, LiveDataService


class WatchSnapshot(BaseModel):
    symbol: str
    state: str
    tier: str = "X"
    overall: float = 0.0
    price: float
    rank: int | None = None
    as_of: datetime


class WatchEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    symbol: str
    kind: str
    from_value: str | None = None
    to_value: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class Watchlist(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    name: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    last_refresh_at: datetime | None = None
    scan_request: LiveScanRequest
    snapshots: list[WatchSnapshot] = Field(default_factory=list)
    events: list[WatchEvent] = Field(default_factory=list)


class WatchlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scan_request: LiveScanRequest


class WatchlistRefreshResponse(BaseModel):
    watchlist: Watchlist
    scan: LiveScanResponse
    new_events: list[WatchEvent] = Field(default_factory=list)


class WatchlistStore:
    def __init__(
        self,
        path: Path | None = None,
    ) -> None:
        configured = os.getenv("FACSIMILE_WATCHLIST_PATH")
        self.path = (
            path
            or (Path(configured).expanduser() if configured else None)
            or Path.home() / ".facsimile" / "watchlists.json"
        )
        self._lock = Lock()

    def _read(self) -> list[Watchlist]:
        if not self.path.exists():
            return []
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        return [
            Watchlist.model_validate(item)
            for item in payload
            if isinstance(item, dict)
        ]

    def _write(self, items: list[Watchlist]) -> None:
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

    def list(self) -> list[Watchlist]:
        with self._lock:
            return self._read()

    def create(self, request: WatchlistCreate) -> Watchlist:
        with self._lock:
            items = self._read()
            watchlist = Watchlist(
                name=request.name.strip(),
                scan_request=request.scan_request,
            )
            items.append(watchlist)
            self._write(items)
            return watchlist

    def delete(self, watchlist_id: str) -> bool:
        with self._lock:
            items = self._read()
            next_items = [
                item for item in items if item.id != watchlist_id
            ]
            if len(next_items) == len(items):
                return False
            self._write(next_items)
            return True

    def refresh(
        self,
        watchlist_id: str,
        service: LiveDataService,
    ) -> WatchlistRefreshResponse:
        with self._lock:
            items = self._read()
            index = next(
                (
                    idx
                    for idx, item in enumerate(items)
                    if item.id == watchlist_id
                ),
                None,
            )
            if index is None:
                raise KeyError(watchlist_id)
            watchlist = items[index]

        scan = service.scan_weekly_breakout(watchlist.scan_request)
        now = datetime.now(timezone.utc)
        previous = {
            snapshot.symbol: snapshot
            for snapshot in watchlist.snapshots
        }
        current: dict[str, WatchSnapshot] = {}
        events: list[WatchEvent] = []

        for row in scan.rows:
            intelligence = row.intelligence
            snapshot = WatchSnapshot(
                symbol=row.profile.symbol,
                state=row.candidate.state.value,
                tier=(
                    intelligence.tier.value
                    if intelligence is not None
                    else "X"
                ),
                overall=(
                    intelligence.scores.overall
                    if intelligence is not None
                    else (
                        row.candidate.scores.overall
                        if row.candidate.scores is not None
                        else 0.0
                    )
                ),
                price=row.profile.price,
                rank=row.rank,
                as_of=row.candidate.as_of,
            )
            current[snapshot.symbol] = snapshot
            prior = previous.get(snapshot.symbol)
            if prior is None:
                events.append(
                    WatchEvent(
                        symbol=snapshot.symbol,
                        kind="new_match",
                        to_value=snapshot.tier,
                    )
                )
                continue
            if prior.state != snapshot.state:
                events.append(
                    WatchEvent(
                        symbol=snapshot.symbol,
                        kind="state_changed",
                        from_value=prior.state,
                        to_value=snapshot.state,
                    )
                )
            if prior.tier != snapshot.tier:
                events.append(
                    WatchEvent(
                        symbol=snapshot.symbol,
                        kind="tier_changed",
                        from_value=prior.tier,
                        to_value=snapshot.tier,
                    )
                )

        for symbol, prior in previous.items():
            if symbol not in current:
                events.append(
                    WatchEvent(
                        symbol=symbol,
                        kind="no_longer_matching",
                        from_value=prior.tier,
                        to_value=None,
                    )
                )

        watchlist.updated_at = now
        watchlist.last_refresh_at = now
        watchlist.snapshots = sorted(
            current.values(),
            key=lambda item: (
                item.rank if item.rank is not None else 9999,
                item.symbol,
            ),
        )
        watchlist.events = (events + watchlist.events)[:200]

        with self._lock:
            items = self._read()
            index = next(
                (
                    idx
                    for idx, item in enumerate(items)
                    if item.id == watchlist_id
                ),
                None,
            )
            if index is None:
                raise KeyError(watchlist_id)
            items[index] = watchlist
            self._write(items)

        return WatchlistRefreshResponse(
            watchlist=watchlist,
            scan=scan,
            new_events=events,
        )


_store: WatchlistStore | None = None


def get_watchlist_store() -> WatchlistStore:
    global _store
    if _store is None:
        _store = WatchlistStore()
    return _store
