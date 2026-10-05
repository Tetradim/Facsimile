import { useEffect, useState } from "react";
import { Activity, Plus, RefreshCw, Trash2 } from "lucide-react";

type PositionEvent = {
  id: string;
  kind: string;
  message: string;
  occurred_at: string;
};

type ManagedPosition = {
  symbol: string;
  opened_at: string;
  entry_price: number;
  initial_stop: number;
  current_stop: number;
  state: "normal" | "macd_bearish_confirmed" | "tightened" | "stop_hit";
  bearish_macd_weeks: number;
  last_updated_at: string | null;
};

type TrackedPosition = {
  id: string;
  position: ManagedPosition;
  created_at: string;
  updated_at: string;
  events: PositionEvent[];
};

type PositionRefresh = {
  tracked: TrackedPosition;
  update: {
    previous_state: string;
    previous_stop: number;
    stop_changed: boolean;
    stop_hit_price: number | null;
    macd: number | null;
    macd_signal: number | null;
    structure_stop: number | null;
    reason: string;
  };
};

function stateLabel(state: ManagedPosition["state"]): string {
  return state.replaceAll("_", " ").toUpperCase();
}

export function PositionsPage() {
  const [items, setItems] = useState<TrackedPosition[]>([]);
  const [symbol, setSymbol] = useState("RKLB");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [openedAt, setOpenedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/v1/positions");
    if (!response.ok) throw new Error(await response.text());
    setItems((await response.json()) as TrackedPosition[]);
  }

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not load positions.");
    });
  }, []);

  async function create() {
    setMessage("");
    try {
      const response = await fetch("/v1/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          opened_at: new Date(openedAt + "T16:00:00Z").toISOString(),
          entry_price: Number(entry),
          initial_stop: Number(stop),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setEntry("");
      setStop("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create position.");
    }
  }

  async function refresh(id: string) {
    setLoadingId(id);
    setMessage("");
    try {
      const response = await fetch("/v1/positions/" + id + "/refresh", {
        method: "POST",
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as PositionRefresh;
      setMessage(result.update.reason);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Position refresh failed.");
    } finally {
      setLoadingId(null);
    }
  }

  async function remove(id: string) {
    const response = await fetch("/v1/positions/" + id, {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage(await response.text());
      return;
    }
    await load();
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRADE MANAGEMENT / WEEKLY LIFECYCLE</div>
          <h1>Positions</h1>
          <p>
            Track the active structural stop week by week. Bearish MACD does not
            force an exit; it must confirm before the manager can ratchet the stop,
            and the stop is never allowed to loosen.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Track a position</div>
            <div className="panel__subtitle">
              Entry and initial stop are immutable reference points.
            </div>
          </div>
        </div>
        <div className="panel__body">
          <div className="filter-grid">
            <label className="field">
              <span>Symbol</span>
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              />
            </label>
            <label className="field">
              <span>Entry price</span>
              <input
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="field">
              <span>Initial stop</span>
              <input
                value={stop}
                onChange={(event) => setStop(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="field">
              <span>Opened</span>
              <input
                type="date"
                value={openedAt}
                onChange={(event) => setOpenedAt(event.target.value)}
              />
            </label>
          </div>
          <button className="button button--primary" onClick={create}>
            <Plus size={16} />
            Track position
          </button>
          {message ? <div className="connection-status">{message}</div> : null}
        </div>
      </section>

      <div className="position-grid">
        {items.map((item) => {
          const position = item.position;
          const stopGain =
            ((position.current_stop / position.initial_stop) - 1) * 100;
          return (
            <section className="panel position-card" key={item.id}>
              <div className="panel__header">
                <div>
                  <div className="panel__title">
                    {position.symbol + " · " + stateLabel(position.state)}
                  </div>
                  <div className="panel__subtitle">
                    {"Entry $" + position.entry_price.toFixed(2) +
                      " · current stop $" + position.current_stop.toFixed(2)}
                  </div>
                </div>
                <div className="watchlist-actions">
                  <button
                    className="button button--quiet"
                    onClick={() => refresh(item.id)}
                    disabled={loadingId === item.id || position.state === "stop_hit"}
                  >
                    {loadingId === item.id ? <Activity size={15} /> : <RefreshCw size={15} />}
                    {loadingId === item.id ? "Refreshing…" : "Refresh week"}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Delete " + position.symbol}
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="panel__body">
                <div className="position-metrics">
                  <div>
                    <span>Initial stop</span>
                    <strong>{"$" + position.initial_stop.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Current stop</span>
                    <strong className="positive">
                      {"$" + position.current_stop.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span>Stop ratchet</span>
                    <strong>{stopGain.toFixed(1) + "%"}</strong>
                  </div>
                  <div>
                    <span>Bearish MACD weeks</span>
                    <strong>{position.bearish_macd_weeks}</strong>
                  </div>
                </div>

                <div className="position-timeline">
                  {item.events.slice(0, 8).map((event) => (
                    <div className="position-event" key={event.id}>
                      <span>{event.kind.replaceAll("_", " ")}</span>
                      <b>{event.message}</b>
                      <small>{new Date(event.occurred_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
