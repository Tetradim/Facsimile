import { useEffect, useMemo, useState } from "react";
import { Activity, Bell, Play, Plus, Trash2 } from "lucide-react";

type WatchSnapshot = {
  symbol: string;
  state: string;
  tier: string;
  overall: number;
  price: number;
  rank: number | null;
  as_of: string;
};

type WatchEvent = {
  id: string;
  symbol: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
};

type Watchlist = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  last_refresh_at: string | null;
  scan_request: {
    min_price: number;
    max_price: number;
    sector: string;
    require_recent_news: boolean;
    news_lookback_days: number;
  };
  snapshots: WatchSnapshot[];
  events: WatchEvent[];
};

type RefreshResponse = {
  watchlist: Watchlist;
  new_events: WatchEvent[];
};

function eventLabel(event: WatchEvent): string {
  if (event.kind === "new_match") {
    return "New match entered " + (event.to_value ?? "the watchlist");
  }
  if (event.kind === "no_longer_matching") {
    return "No longer matches (" + (event.from_value ?? "previous") + ")";
  }
  if (event.kind === "tier_changed") {
    return "Tier " + (event.from_value ?? "—") + " → " + (event.to_value ?? "—");
  }
  if (event.kind === "state_changed") {
    return "State " + (event.from_value ?? "—") + " → " + (event.to_value ?? "—");
  }
  return event.kind.replaceAll("_", " ");
}

export function WatchlistsPage() {
  const [items, setItems] = useState<Watchlist[]>([]);
  const [name, setName] = useState("Medical Catalyst Watch");
  const [minPrice, setMinPrice] = useState("0.10");
  const [maxPrice, setMaxPrice] = useState("2.50");
  const [sector, setSector] = useState("Medical");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/v1/watchlists");
      if (!response.ok) throw new Error(await response.text());
      setItems((await response.json()) as Watchlist[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load watchlists.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError("");
    try {
      const response = await fetch("/v1/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scan_request: {
            min_price: Number(minPrice),
            max_price: Number(maxPrice),
            sector,
            require_recent_news: true,
            news_lookback_days: 14,
            max_candidates: 40,
            max_results: 30,
            include_rejected: false,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create watchlist.");
    }
  }

  async function refresh(id: string) {
    setLoadingId(id);
    setError("");
    try {
      const response = await fetch("/v1/watchlists/" + id + "/refresh", {
        method: "POST",
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as RefreshResponse;

      if (
        payload.new_events.length &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const first = payload.new_events[0];
        new Notification(payload.watchlist.name + ": " + first.symbol, {
          body: eventLabel(first),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Watchlist refresh failed.");
    } finally {
      setLoadingId(null);
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch("/v1/watchlists/" + id, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete watchlist.");
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    await Notification.requestPermission();
  }

  const eventCount = useMemo(
    () => items.reduce((sum, item) => sum + item.events.length, 0),
    [items],
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MONITOR / ACTIVE WATCHLISTS</div>
          <h1>Watchlists</h1>
          <p>
            Persist scanner definitions, refresh them against live data, and record
            new matches, state changes, tier changes, and dropped setups.
          </p>
        </div>
        <button className="button button--ghost" onClick={enableNotifications}>
          <Bell size={16} />
          Enable desktop alerts
        </button>
      </div>

      <section className="panel watchlist-create">
        <div className="panel__header">
          <div>
            <div className="panel__title">Create active watchlist</div>
            <div className="panel__subtitle">
              The saved scan request becomes the watch definition.
            </div>
          </div>
        </div>
        <div className="panel__body">
          <div className="filter-grid">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>Minimum price</span>
              <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
            </label>
            <label className="field">
              <span>Maximum price</span>
              <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
            </label>
            <label className="field">
              <span>Sector</span>
              <select value={sector} onChange={(event) => setSector(event.target.value)}>
                <option>Medical</option>
                <option>Healthcare</option>
                <option>Technology</option>
                <option>Industrials</option>
                <option>All sectors</option>
              </select>
            </label>
          </div>
          <button className="button button--primary" onClick={create}>
            <Plus size={16} />
            Create watchlist
          </button>
          {error ? <div className="live-error">{error}</div> : null}
        </div>
      </section>

      <div className="metrics-grid metrics-grid--compact">
        <div className="metric-card">
          <div className="metric-card__label">Watchlists</div>
          <div className="metric-card__value">{items.length}</div>
          <div className="metric-card__detail">Persisted locally</div>
        </div>
        <div className="metric-card metric-card--purple">
          <div className="metric-card__label">Recorded Changes</div>
          <div className="metric-card__value">{eventCount}</div>
          <div className="metric-card__detail">Newest first</div>
        </div>
      </div>

      <div className="watchlist-grid">
        {items.map((item) => (
          <section className="panel watchlist-card" key={item.id}>
            <div className="panel__header">
              <div>
                <div className="panel__title">{item.name}</div>
                <div className="panel__subtitle">
                  {"$" + item.scan_request.min_price.toFixed(2) + "–$" +
                    item.scan_request.max_price.toFixed(2) + " · " +
                    item.scan_request.sector}
                  {item.last_refresh_at
                    ? " · refreshed " + new Date(item.last_refresh_at).toLocaleString()
                    : " · not refreshed yet"}
                </div>
              </div>
              <div className="watchlist-actions">
                <button
                  className="button button--quiet"
                  onClick={() => refresh(item.id)}
                  disabled={loadingId === item.id}
                >
                  {loadingId === item.id ? <Activity size={15} /> : <Play size={15} />}
                  {loadingId === item.id ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  className="icon-button"
                  aria-label={"Delete " + item.name}
                  onClick={() => remove(item.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="panel__body">
              <div className="watch-snapshot-row">
                {item.snapshots.slice(0, 12).map((snapshot) => (
                  <div className="watch-symbol" key={snapshot.symbol}>
                    <strong>{snapshot.symbol}</strong>
                    <span className={
                      "tier tier--" +
                      (["A+", "A", "B"].includes(snapshot.tier)
                        ? "confirmed"
                        : ["W1", "W2"].includes(snapshot.tier)
                          ? "watch"
                          : "reject")
                    }>
                      {snapshot.tier}
                    </span>
                    <small>{snapshot.overall.toFixed(0)}</small>
                  </div>
                ))}
                {!item.snapshots.length ? (
                  <div className="muted">Refresh to create the first snapshot.</div>
                ) : null}
              </div>

              <div className="watch-events">
                <strong>Recent changes</strong>
                {item.events.slice(0, 8).map((event) => (
                  <div className="watch-event" key={event.id}>
                    <span>{event.symbol}</span>
                    <b>{eventLabel(event)}</b>
                    <small>{new Date(event.created_at).toLocaleString()}</small>
                  </div>
                ))}
                {!item.events.length ? (
                  <span className="muted">No state changes recorded yet.</span>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
