from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from .live_data import LiveDataService, LiveScanRequest, LiveScanResponse


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _default_db_path() -> Path:
    configured = os.getenv("FACSIMILE_DATA_DIR")
    root = Path(configured).expanduser() if configured else Path.home() / ".facsimile"
    root.mkdir(parents=True, exist_ok=True)
    return root / "facsimile.sqlite3"


class WatchlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scan_request: LiveScanRequest
    enabled: bool = True
    auto_refresh: bool = False
    refresh_interval_minutes: int = Field(default=60, ge=15, le=1440)


class WatchlistMonitoringUpdate(BaseModel):
    auto_refresh: bool
    refresh_interval_minutes: int = Field(default=60, ge=15, le=1440)


class WatchlistRecord(BaseModel):
    id: str
    name: str
    scan_request: LiveScanRequest
    enabled: bool
    auto_refresh: bool = False
    refresh_interval_minutes: int = 60
    created_at: datetime
    updated_at: datetime
    last_refreshed_at: datetime | None = None
    last_error: str | None = None


class WatchlistSnapshot(BaseModel):
    symbol: str
    state: str
    tier: str
    overall: float
    catalyst: float
    price: float
    strategy_match: bool | None = None
    as_of: datetime


class WatchlistEvent(BaseModel):
    id: int
    watchlist_id: str
    symbol: str
    event_type: str
    message: str
    old_value: str | None = None
    new_value: str | None = None
    occurred_at: datetime


class WatchlistRefreshResponse(BaseModel):
    watchlist: WatchlistRecord
    scan: LiveScanResponse
    events: list[WatchlistEvent] = Field(default_factory=list)


class WatchlistStore:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path is not None else _default_db_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS watchlists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_refreshed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS watchlist_snapshots (
                    watchlist_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    state TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    overall REAL NOT NULL,
                    catalyst REAL NOT NULL,
                    price REAL NOT NULL,
                    strategy_match INTEGER,
                    as_of TEXT NOT NULL,
                    PRIMARY KEY (watchlist_id, symbol),
                    FOREIGN KEY (watchlist_id) REFERENCES watchlists(id)
                        ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS watchlist_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    watchlist_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    occurred_at TEXT NOT NULL,
                    FOREIGN KEY (watchlist_id) REFERENCES watchlists(id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_watchlist_events_watchlist
                ON watchlist_events(watchlist_id, occurred_at DESC);
                """
            )
            existing = {
                row["name"]
                for row in db.execute("PRAGMA table_info(watchlists)").fetchall()
            }
            if "auto_refresh" not in existing:
                db.execute(
                    "ALTER TABLE watchlists ADD COLUMN auto_refresh INTEGER NOT NULL DEFAULT 0"
                )
            if "refresh_interval_minutes" not in existing:
                db.execute(
                    "ALTER TABLE watchlists ADD COLUMN refresh_interval_minutes INTEGER NOT NULL DEFAULT 60"
                )
            if "last_error" not in existing:
                db.execute(
                    "ALTER TABLE watchlists ADD COLUMN last_error TEXT"
                )

    @staticmethod
    def _record(row: sqlite3.Row) -> WatchlistRecord:
        return WatchlistRecord(
            id=row["id"],
            name=row["name"],
            scan_request=LiveScanRequest.model_validate_json(row["request_json"]),
            enabled=bool(row["enabled"]),
            auto_refresh=bool(row["auto_refresh"]),
            refresh_interval_minutes=int(row["refresh_interval_minutes"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            last_refreshed_at=(
                datetime.fromisoformat(row["last_refreshed_at"])
                if row["last_refreshed_at"]
                else None
            ),
            last_error=row["last_error"],
        )

    def create(self, request: WatchlistCreate) -> WatchlistRecord:
        identifier = uuid4().hex
        now = _utc_now()
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO watchlists (
                    id, name, request_json, enabled,
                    auto_refresh, refresh_interval_minutes,
                    created_at, updated_at, last_refreshed_at, last_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
                """,
                (
                    identifier,
                    request.name.strip(),
                    request.scan_request.model_dump_json(),
                    1 if request.enabled else 0,
                    1 if request.auto_refresh else 0,
                    request.refresh_interval_minutes,
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
        return self.get(identifier)

    def list(self) -> list[WatchlistRecord]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT * FROM watchlists ORDER BY updated_at DESC"
            ).fetchall()
        return [self._record(row) for row in rows]

    def get(self, watchlist_id: str) -> WatchlistRecord:
        with self._connect() as db:
            row = db.execute(
                "SELECT * FROM watchlists WHERE id = ?",
                (watchlist_id,),
            ).fetchone()
        if row is None:
            raise KeyError(watchlist_id)
        return self._record(row)

    def update_monitoring(
        self,
        watchlist_id: str,
        request: WatchlistMonitoringUpdate,
    ) -> WatchlistRecord:
        now = _utc_now()
        with self._connect() as db:
            result = db.execute(
                """
                UPDATE watchlists
                SET auto_refresh = ?,
                    refresh_interval_minutes = ?,
                    updated_at = ?,
                    last_error = NULL
                WHERE id = ?
                """,
                (
                    1 if request.auto_refresh else 0,
                    request.refresh_interval_minutes,
                    now.isoformat(),
                    watchlist_id,
                ),
            )
            if result.rowcount == 0:
                raise KeyError(watchlist_id)
        return self.get(watchlist_id)

    def due(self, now: datetime | None = None) -> list[WatchlistRecord]:
        instant = now or _utc_now()
        due: list[WatchlistRecord] = []
        for watchlist in self.list():
            if not (
                watchlist.enabled
                and watchlist.auto_refresh
            ):
                continue
            if watchlist.last_refreshed_at is None:
                due.append(watchlist)
                continue
            age_minutes = (
                instant - watchlist.last_refreshed_at
            ).total_seconds() / 60
            if age_minutes >= watchlist.refresh_interval_minutes:
                due.append(watchlist)
        return due

    def set_error(
        self,
        watchlist_id: str,
        message: str | None,
    ) -> None:
        with self._connect() as db:
            db.execute(
                """
                UPDATE watchlists
                SET last_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    message,
                    _utc_now().isoformat(),
                    watchlist_id,
                ),
            )

    def delete(self, watchlist_id: str) -> None:
        with self._connect() as db:
            db.execute(
                "DELETE FROM watchlist_events WHERE watchlist_id = ?",
                (watchlist_id,),
            )
            db.execute(
                "DELETE FROM watchlist_snapshots WHERE watchlist_id = ?",
                (watchlist_id,),
            )
            result = db.execute(
                "DELETE FROM watchlists WHERE id = ?",
                (watchlist_id,),
            )
            if result.rowcount == 0:
                raise KeyError(watchlist_id)

    def snapshots(self, watchlist_id: str) -> dict[str, WatchlistSnapshot]:
        with self._connect() as db:
            rows = db.execute(
                """
                SELECT * FROM watchlist_snapshots
                WHERE watchlist_id = ?
                """,
                (watchlist_id,),
            ).fetchall()
        snapshots: dict[str, WatchlistSnapshot] = {}
        for row in rows:
            snapshots[row["symbol"]] = WatchlistSnapshot(
                symbol=row["symbol"],
                state=row["state"],
                tier=row["tier"],
                overall=float(row["overall"]),
                catalyst=float(row["catalyst"]),
                price=float(row["price"]),
                strategy_match=(
                    None
                    if row["strategy_match"] is None
                    else bool(row["strategy_match"])
                ),
                as_of=datetime.fromisoformat(row["as_of"]),
            )
        return snapshots

    def save_refresh(
        self,
        watchlist_id: str,
        snapshots: list[WatchlistSnapshot],
        events: list[dict[str, Any]],
    ) -> list[WatchlistEvent]:
        now = _utc_now()
        created_ids: list[int] = []
        with self._connect() as db:
            for snapshot in snapshots:
                db.execute(
                    """
                    INSERT INTO watchlist_snapshots (
                        watchlist_id, symbol, state, tier, overall,
                        catalyst, price, strategy_match, as_of
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(watchlist_id, symbol) DO UPDATE SET
                        state=excluded.state,
                        tier=excluded.tier,
                        overall=excluded.overall,
                        catalyst=excluded.catalyst,
                        price=excluded.price,
                        strategy_match=excluded.strategy_match,
                        as_of=excluded.as_of
                    """,
                    (
                        watchlist_id,
                        snapshot.symbol,
                        snapshot.state,
                        snapshot.tier,
                        snapshot.overall,
                        snapshot.catalyst,
                        snapshot.price,
                        (
                            None
                            if snapshot.strategy_match is None
                            else 1 if snapshot.strategy_match else 0
                        ),
                        snapshot.as_of.isoformat(),
                    ),
                )

            for event in events:
                cursor = db.execute(
                    """
                    INSERT INTO watchlist_events (
                        watchlist_id, symbol, event_type, message,
                        old_value, new_value, occurred_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        watchlist_id,
                        event["symbol"],
                        event["event_type"],
                        event["message"],
                        event.get("old_value"),
                        event.get("new_value"),
                        now.isoformat(),
                    ),
                )
                created_ids.append(int(cursor.lastrowid))

            db.execute(
                """
                UPDATE watchlists
                SET last_refreshed_at = ?,
                    updated_at = ?,
                    last_error = NULL
                WHERE id = ?
                """,
                (now.isoformat(), now.isoformat(), watchlist_id),
            )

        return self.events_by_ids(created_ids)

    def events(
        self,
        watchlist_id: str,
        limit: int = 100,
    ) -> list[WatchlistEvent]:
        with self._connect() as db:
            rows = db.execute(
                """
                SELECT * FROM watchlist_events
                WHERE watchlist_id = ?
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?
                """,
                (watchlist_id, max(1, min(limit, 500))),
            ).fetchall()
        return [self._event(row) for row in rows]

    def events_by_ids(self, ids: list[int]) -> list[WatchlistEvent]:
        if not ids:
            return []
        placeholders = ",".join("?" for _ in ids)
        with self._connect() as db:
            rows = db.execute(
                f"""
                SELECT * FROM watchlist_events
                WHERE id IN ({placeholders})
                ORDER BY id ASC
                """,
                ids,
            ).fetchall()
        return [self._event(row) for row in rows]

    @staticmethod
    def _event(row: sqlite3.Row) -> WatchlistEvent:
        return WatchlistEvent(
            id=int(row["id"]),
            watchlist_id=row["watchlist_id"],
            symbol=row["symbol"],
            event_type=row["event_type"],
            message=row["message"],
            old_value=row["old_value"],
            new_value=row["new_value"],
            occurred_at=datetime.fromisoformat(row["occurred_at"]),
        )


def _snapshot_from_row(row: Any) -> WatchlistSnapshot:
    intelligence = row.intelligence
    tier = intelligence.tier.value if intelligence is not None else "X"
    overall = intelligence.scores.overall if intelligence is not None else 0.0
    strategy_match = (
        row.strategy_evaluation.passed
        if row.strategy_evaluation is not None
        else None
    )
    return WatchlistSnapshot(
        symbol=row.profile.symbol,
        state=row.candidate.state.value,
        tier=tier,
        overall=overall,
        catalyst=row.catalyst_score,
        price=row.profile.price,
        strategy_match=strategy_match,
        as_of=row.candidate.as_of,
    )


def _change_events(
    previous: WatchlistSnapshot | None,
    current: WatchlistSnapshot,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    if previous is None:
        if current.state != "rejected" or current.strategy_match is True:
            events.append(
                {
                    "symbol": current.symbol,
                    "event_type": "new_match",
                    "message": (
                        f"{current.symbol} entered the watchlist as "
                        f"{current.tier} / {current.state}."
                    ),
                    "new_value": f"{current.tier}:{current.state}",
                }
            )
        return events

    if previous.state != current.state:
        events.append(
            {
                "symbol": current.symbol,
                "event_type": "state_change",
                "message": (
                    f"{current.symbol} state changed "
                    f"{previous.state} -> {current.state}."
                ),
                "old_value": previous.state,
                "new_value": current.state,
            }
        )

    if previous.tier != current.tier:
        events.append(
            {
                "symbol": current.symbol,
                "event_type": "tier_change",
                "message": (
                    f"{current.symbol} tier changed "
                    f"{previous.tier} -> {current.tier}."
                ),
                "old_value": previous.tier,
                "new_value": current.tier,
            }
        )

    if (
        previous.strategy_match is not None
        and current.strategy_match is not None
        and previous.strategy_match != current.strategy_match
    ):
        events.append(
            {
                "symbol": current.symbol,
                "event_type": "strategy_match_change",
                "message": (
                    f"{current.symbol} "
                    f"{'now matches' if current.strategy_match else 'no longer matches'} "
                    "the stored strategy."
                ),
                "old_value": str(previous.strategy_match).lower(),
                "new_value": str(current.strategy_match).lower(),
            }
        )

    score_move = current.overall - previous.overall
    if abs(score_move) >= 10:
        events.append(
            {
                "symbol": current.symbol,
                "event_type": "score_move",
                "message": (
                    f"{current.symbol} Intelligence Overall moved "
                    f"{score_move:+.1f} points to {current.overall:.1f}."
                ),
                "old_value": f"{previous.overall:.1f}",
                "new_value": f"{current.overall:.1f}",
            }
        )

    if previous.state != "confirmed" and current.state == "confirmed":
        events.append(
            {
                "symbol": current.symbol,
                "event_type": "confirmed_breakout",
                "message": (
                    f"{current.symbol} is now a confirmed weekly breakout "
                    f"({current.tier}, {current.overall:.1f})."
                ),
                "old_value": previous.state,
                "new_value": "confirmed",
            }
        )

    return events


def refresh_watchlist(
    store: WatchlistStore,
    watchlist_id: str,
    service: LiveDataService,
) -> WatchlistRefreshResponse:
    watchlist = store.get(watchlist_id)
    request = watchlist.scan_request.model_copy(deep=True)

    # A monitor needs rejected/nonmatching rows too so it can detect transitions.
    request.include_rejected = True
    request.require_strategy_match = False
    request.max_results = max(
        request.max_results,
        min(100, request.max_candidates),
    )

    previous = store.snapshots(watchlist_id)
    scan = service.scan_weekly_breakout(request)
    current = [_snapshot_from_row(row) for row in scan.rows]

    raw_events: list[dict[str, Any]] = []
    for snapshot in current:
        raw_events.extend(
            _change_events(previous.get(snapshot.symbol), snapshot)
        )

    created = store.save_refresh(
        watchlist_id,
        current,
        raw_events,
    )
    return WatchlistRefreshResponse(
        watchlist=store.get(watchlist_id),
        scan=scan,
        events=created,
    )


_store: WatchlistStore | None = None


def get_watchlist_store() -> WatchlistStore:
    global _store
    if _store is None:
        _store = WatchlistStore()
    return _store
