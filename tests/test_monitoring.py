from datetime import datetime, timedelta, timezone

from facsimile.live_data import LiveScanRequest
from facsimile.watchlists import (
    WatchlistCreate,
    WatchlistMonitoringUpdate,
    WatchlistStore,
)


def test_auto_refresh_is_opt_in(tmp_path):
    store = WatchlistStore(tmp_path / "monitor.sqlite3")
    manual = store.create(
        WatchlistCreate(
            name="Manual",
            scan_request=LiveScanRequest(),
        )
    )
    automatic = store.create(
        WatchlistCreate(
            name="Automatic",
            scan_request=LiveScanRequest(),
            auto_refresh=True,
            refresh_interval_minutes=30,
        )
    )

    due = store.due(datetime.now(timezone.utc))

    assert manual.id not in {item.id for item in due}
    assert automatic.id in {item.id for item in due}


def test_monitoring_update_and_due_interval(tmp_path):
    store = WatchlistStore(tmp_path / "monitor.sqlite3")
    row = store.create(
        WatchlistCreate(
            name="Medical",
            scan_request=LiveScanRequest(),
        )
    )
    updated = store.update_monitoring(
        row.id,
        WatchlistMonitoringUpdate(
            auto_refresh=True,
            refresh_interval_minutes=45,
        ),
    )

    assert updated.auto_refresh is True
    assert updated.refresh_interval_minutes == 45

    now = datetime.now(timezone.utc)
    with store._connect() as db:
        db.execute(
            """
            UPDATE watchlists
            SET last_refreshed_at = ?
            WHERE id = ?
            """,
            ((now - timedelta(minutes=20)).isoformat(), row.id),
        )
    assert store.due(now) == []

    with store._connect() as db:
        db.execute(
            """
            UPDATE watchlists
            SET last_refreshed_at = ?
            WHERE id = ?
            """,
            ((now - timedelta(minutes=50)).isoformat(), row.id),
        )
    assert [item.id for item in store.due(now)] == [row.id]


def test_existing_database_is_migrated(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    import sqlite3

    with sqlite3.connect(path) as db:
        db.execute(
            """
            CREATE TABLE watchlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                request_json TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_refreshed_at TEXT
            )
            """
        )

    store = WatchlistStore(path)

    with store._connect() as db:
        columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(watchlists)"
            ).fetchall()
        }

    assert "auto_refresh" in columns
    assert "refresh_interval_minutes" in columns
    assert "last_error" in columns
