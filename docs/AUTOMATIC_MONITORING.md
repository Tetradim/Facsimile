# Automatic Watchlist Monitoring

Version 0.6 adds opt-in scheduled watchlist refresh to the desktop/server
workstation.

## Behavior

Automatic monitoring is disabled by default for every watchlist.

A watchlist can be configured with:

- `auto_refresh=true|false`
- `refresh_interval_minutes` from 15 to 1440 minutes

The FastAPI application starts a lightweight scheduler during application
lifespan. Once per minute it determines which enabled automatic watchlists are
due. Provider-heavy scan work is executed off the async server loop.

A due refresh uses the same live scanner and `facsimile.strategy.v1` contract
as manual refresh. There is no separate alert-only scoring implementation.

## Persistence

Existing v0.5 SQLite databases are migrated in place. New watchlist columns:

- `auto_refresh`
- `refresh_interval_minutes`
- `last_error`

Provider or network failures are recorded on the watchlist instead of silently
discarded. A successful refresh clears `last_error`.

## API

```text
PATCH /v1/watchlists/{id}/monitoring
GET   /v1/monitor/status
POST  /v1/monitor/tick
```

`POST /v1/monitor/tick` is primarily an operator/test control. Normal
automatic refresh is handled by the application scheduler.

## UI

The Watchlists workspace exposes:

- manual vs automatic mode when creating a watchlist
- 15m / 30m / 1h / 2h / 4h intervals
- per-watchlist Auto On/Off control
- last provider error
- scheduler running status
- count of automatic and currently-due watchlists
- last scheduler tick
- event-history polling while the workspace is open

## Runtime constraint

The workstation process must be running for desktop automatic monitoring to
run. The browser itself does not have to remain open.

## Android design

Android background work is a separate native/mobile concern. Capacitor's
Background Runner is periodic rather than an exact always-running service. The
standalone Android implementation therefore uses OS-scheduled background checks
for established watchlist symbols and reserves the full universe/catalyst
refresh for the foreground app. This keeps background notifications honest
about the reduced headless-data context.
