from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from pydantic import BaseModel

from .live_data import get_live_data_service
from .watchlists import (
    WatchlistRecord,
    get_watchlist_store,
    refresh_watchlist,
)


class MonitorStatus(BaseModel):
    running: bool
    auto_refresh_watchlists: int
    due_watchlists: int
    last_tick_at: datetime | None = None
    last_completed_at: datetime | None = None


class WatchlistMonitor:
    def __init__(self, poll_seconds: int = 60) -> None:
        self.poll_seconds = max(15, poll_seconds)
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self.last_tick_at: datetime | None = None
        self.last_completed_at: datetime | None = None

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._task = asyncio.create_task(
            self._run(),
            name="facsimile-watchlist-monitor",
        )

    async def stop(self) -> None:
        self._stop.set()
        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _run(self) -> None:
        while not self._stop.is_set():
            await self.tick()
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=self.poll_seconds,
                )
            except asyncio.TimeoutError:
                continue

    async def tick(self) -> list[WatchlistRecord]:
        store = get_watchlist_store()
        due = store.due()
        self.last_tick_at = datetime.now(timezone.utc)
        completed: list[WatchlistRecord] = []

        for watchlist in due:
            try:
                await asyncio.to_thread(
                    refresh_watchlist,
                    store,
                    watchlist.id,
                    get_live_data_service(),
                )
                completed.append(store.get(watchlist.id))
            except Exception as exc:
                store.set_error(
                    watchlist.id,
                    str(exc)[:1000],
                )

        self.last_completed_at = datetime.now(timezone.utc)
        return completed

    def status(self) -> MonitorStatus:
        store = get_watchlist_store()
        all_watchlists = store.list()
        auto = [
            item
            for item in all_watchlists
            if item.enabled and item.auto_refresh
        ]
        return MonitorStatus(
            running=self.running,
            auto_refresh_watchlists=len(auto),
            due_watchlists=len(store.due()),
            last_tick_at=self.last_tick_at,
            last_completed_at=self.last_completed_at,
        )


_monitor: WatchlistMonitor | None = None


def get_watchlist_monitor() -> WatchlistMonitor:
    global _monitor
    if _monitor is None:
        _monitor = WatchlistMonitor()
    return _monitor
