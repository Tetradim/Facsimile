import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Play,
  Radar,
  Save,
  Search,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ScorePack = { overall: number };

type WatchScanRow = {
  profile: { symbol: string; company: string; price: number };
  candidate: { state: string };
  intelligence: { tier: string; scores: ScorePack } | null;
};

type WatchScanResponse = {
  generated_at: string;
  rows: WatchScanRow[];
};

type WatchlistRecord = {
  id: string;
  name: string;
  enabled: boolean;
  auto_refresh: boolean;
  refresh_interval_minutes: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
  scan_request: Record<string, unknown>;
};

type WatchlistEvent = {
  id: number;
  watchlist_id: string;
  symbol: string;
  event_type: string;
  message: string;
  old_value: string | null;
  new_value: string | null;
  occurred_at: string;
};

type WatchlistRefreshResponse = {
  watchlist: WatchlistRecord;
  scan: WatchScanResponse;
  events: WatchlistEvent[];
};

type LiveChartBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type LiveChartResponse = {
  symbol: string;
  profile: {
    symbol: string;
    company: string;
    price: number;
    sector: string | null;
    industry: string | null;
    market_cap: number | null;
  };
  bars: LiveChartBar[];
  candidate: {
    state: "rejected" | "developing" | "confirmed";
    box: {
      start: string;
      end: string;
      bars: number;
      body_low: number;
      body_high: number;
      width_pct: number;
    } | null;
    structural_stop: number | null;
    stop_risk_pct: number | null;
    metrics: Record<string, number | string | boolean | null>;
  };
  source: string;
};

type BacktestResponse = {
  symbol: string;
  matches_count: number;
  trades_count: number;
  wins: number;
  losses: number;
  win_rate: number;
  average_return_pct: number;
  median_return_pct: number;
  profit_factor: number | null;
  max_drawdown_pct: number;
  ending_equity: number;
  total_return_pct: number;
  equity_curve: Array<{
    timestamp: string;
    equity: number;
    drawdown_pct: number;
  }>;
  trades: Array<{
    signal_time: string;
    entry_time: string;
    entry_price: number;
    stop_price: number | null;
    exit_time: string;
    exit_price: number;
    exit_reason: string;
    return_pct: number;
    holding_weeks: number;
    tier: string;
    overall: number;
  }>;
  notes: string[];
};

function SimplePanel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__detail">{detail}</span>
    </div>
  );
}

export function WatchlistsPage() {
  const [watchlists, setWatchlists] = useState<WatchlistRecord[]>([]);
  const [name, setName] = useState("Medical Catalyst Watch");
  const [minPrice, setMinPrice] = useState("0.10");
  const [maxPrice, setMaxPrice] = useState("2.50");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState("60");
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [events, setEvents] = useState<WatchlistEvent[]>([]);
  const [latestScan, setLatestScan] = useState<WatchScanResponse | null>(null);
  const [message, setMessage] = useState("");

  async function loadWatchlists() {
    try {
      const response = await fetch("/v1/watchlists");
      if (!response.ok) throw new Error(await response.text());
      setWatchlists((await response.json()) as WatchlistRecord[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load watchlists.");
    }
  }

  useEffect(() => {
    void loadWatchlists();
  }, []);

  async function createWatchlist() {
    setLoading(true);
    setMessage("");
    try {
      const presetResponse = await fetch("/v1/strategies/presets");
      if (!presetResponse.ok) throw new Error(await presetResponse.text());
      const presets = (await presetResponse.json()) as Array<Record<string, unknown>>;
      const strategy =
        presets.find((item) => item.name === "Medical Catalyst Weekly") ?? null;

      const response = await fetch("/v1/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          auto_refresh: autoRefresh,
          refresh_interval_minutes: Number(refreshInterval || 60),
          scan_request: {
            min_price: Number(minPrice),
            max_price: Number(maxPrice),
            sector: "Medical",
            require_recent_news: true,
            include_structured_catalysts: true,
            news_lookback_days: 14,
            max_candidates: 50,
            max_results: 50,
            include_rejected: true,
            strategy,
            require_strategy_match: true,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setMessage("Watchlist saved. Refresh it once to establish the baseline snapshot.");
      await loadWatchlists();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create watchlist.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshWatchlist(id: string) {
    setRefreshingId(id);
    setMessage("");
    try {
      const response = await fetch("/v1/watchlists/" + id + "/refresh", {
        method: "POST",
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as WatchlistRefreshResponse;
      setLatestScan(result.scan);
      setEvents(result.events);
      setMessage(
        result.events.length
          ? String(result.events.length) + " new state-change alert(s) generated."
          : "Watchlist refreshed. No meaningful state changes since the previous snapshot.",
      );
      await loadWatchlists();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Watchlist refresh failed.");
    } finally {
      setRefreshingId(null);
    }
  }

  async function loadEvents(id: string) {
    try {
      const response = await fetch("/v1/watchlists/" + id + "/events?limit=100");
      if (!response.ok) throw new Error(await response.text());
      setEvents((await response.json()) as WatchlistEvent[]);
      setLatestScan(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load events.");
    }
  }

  async function updateMonitoring(
    watchlist: WatchlistRecord,
    auto: boolean,
    interval = watchlist.refresh_interval_minutes,
  ) {
    try {
      const response = await fetch(
        "/v1/watchlists/" + watchlist.id + "/monitoring",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auto_refresh: auto,
            refresh_interval_minutes: interval,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      await loadWatchlists();
      setMessage(
        auto
          ? "Automatic monitoring enabled for " + watchlist.name + "."
          : "Automatic monitoring disabled for " + watchlist.name + ".",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update automatic monitoring.",
      );
    }
  }

  async function deleteWatchlist(id: string) {
    if (!window.confirm("Delete this watchlist and its local event history?")) return;
    try {
      const response = await fetch("/v1/watchlists/" + id, { method: "DELETE" });
      if (!response.ok) throw new Error(await response.text());
      setEvents([]);
      setLatestScan(null);
      await loadWatchlists();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete watchlist.");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MONITOR / STATE CHANGES</div>
          <h1>Watchlists</h1>
          <p>Persist scanner definitions, monitor them automatically when enabled, and surface only meaningful state changes.</p>
        </div>
        <div className="live-mode-badge">
          <span className="live-dot" />
          AUTO MONITOR READY
        </div>
      </div>

      <div className="builder-layout">
        <SimplePanel title="Create Watchlist" subtitle="Uses the Medical Catalyst Weekly strategy">
          <div className="builder-fields">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>Minimum Price</span>
              <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Maximum Price</span>
              <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Universe</span>
              <input value="Medical" disabled />
            </label>
            <label className="field">
              <span>Auto Monitor</span>
              <select
                value={autoRefresh ? "on" : "off"}
                onChange={(event) => setAutoRefresh(event.target.value === "on")}
              >
                <option value="off">Manual refresh</option>
                <option value="on">Automatic</option>
              </select>
            </label>
            <label className="field">
              <span>Refresh Interval</span>
              <select
                value={refreshInterval}
                onChange={(event) => setRefreshInterval(event.target.value)}
                disabled={!autoRefresh}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
              </select>
            </label>
          </div>
          <button className="button button--primary button--full" onClick={createWatchlist} disabled={loading}>
            <Save size={16} />
            {loading ? "Saving…" : "Save Watchlist"}
          </button>
          {message ? <div className="connection-status">{message}</div> : null}
        </SimplePanel>

        <SimplePanel title="Alert Semantics" subtitle="Events only appear when something actually changes">
          <div className="gate-list gate-list--single">
            {[
              "New actionable match enters the monitored universe",
              "Rejected / developing / confirmed state changes",
              "A+ / A / B / W1 / W2 / X tier changes",
              "Stored strategy starts or stops matching",
              "Intelligence Overall moves by 10+ points",
              "Developing setup becomes a confirmed weekly breakout",
            ].map((item) => (
              <div className="gate-item" key={item}>
                <span className="gate-check">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </SimplePanel>
      </div>

      <SimplePanel title="Saved Watchlists" subtitle={String(watchlists.length) + " persistent monitor(s)"}>
        {watchlists.length ? (
          <div className="watchlist-grid">
            {watchlists.map((watchlist) => (
              <div className="watchlist-card" key={watchlist.id}>
                <div>
                  <strong>{watchlist.name}</strong>
                  <span>
                    {watchlist.auto_refresh
                      ? "Auto every " + String(watchlist.refresh_interval_minutes) + " min"
                      : "Manual refresh"}
                    {" · "}
                    {watchlist.last_refreshed_at
                      ? "Last " + new Date(watchlist.last_refreshed_at).toLocaleString()
                      : "No baseline yet"}
                  </span>
                  {watchlist.last_error ? (
                    <span className="negative">Last error: {watchlist.last_error}</span>
                  ) : null}
                </div>
                <div className="watchlist-actions">
                  <button
                    className={watchlist.auto_refresh ? "button button--quiet monitor-button monitor-button--on" : "button button--quiet monitor-button"}
                    onClick={() => updateMonitoring(watchlist, !watchlist.auto_refresh)}
                  >
                    {watchlist.auto_refresh ? "Auto On" : "Auto Off"}
                  </button>
                  <button className="button button--quiet" onClick={() => loadEvents(watchlist.id)}>
                    History
                  </button>
                  <button
                    className="button button--primary"
                    onClick={() => refreshWatchlist(watchlist.id)}
                    disabled={refreshingId === watchlist.id}
                  >
                    <Activity size={15} />
                    {refreshingId === watchlist.id ? "Refreshing…" : "Refresh"}
                  </button>
                  <button className="logic-remove" onClick={() => deleteWatchlist(watchlist.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-live-state">
            <Bell size={24} />
            <strong>No persistent watchlists yet.</strong>
            <span>Create one above and refresh it to establish a baseline.</span>
          </div>
        )}
      </SimplePanel>

      {events.length ? (
        <SimplePanel title="State-Change Alerts" subtitle="Newest events from the selected watchlist">
          <div className="event-feed">
            {events.map((event) => (
              <div className="event-row" key={event.id}>
                <span className={"event-type event-type--" + event.event_type}>
                  {event.event_type.replaceAll("_", " ")}
                </span>
                <div>
                  <strong>{event.symbol}</strong>
                  <span>{event.message}</span>
                </div>
                <time>{new Date(event.occurred_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        </SimplePanel>
      ) : null}

      {latestScan?.rows.length ? (
        <SimplePanel title="Latest Watchlist Snapshot" subtitle={String(latestScan.rows.length) + " monitored rows"}>
          <div className="table-wrap">
            <table className="scanner-table watch-snapshot-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tier</th>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>State</th>
                  <th>Intelligence</th>
                </tr>
              </thead>
              <tbody>
                {latestScan.rows.slice(0, 25).map((row, index) => (
                  <tr key={row.profile.symbol}>
                    <td>{index + 1}</td>
                    <td><span className="tier tier--confirmed">{row.intelligence?.tier ?? "X"}</span></td>
                    <td>
                      <div className="symbol-cell">
                        <div>
                          <strong>{row.profile.symbol}</strong>
                          <span>{row.profile.company}</span>
                        </div>
                      </div>
                    </td>
                    <td className="numeric">{"$" + row.profile.price.toFixed(4)}</td>
                    <td>{row.candidate.state.toUpperCase()}</td>
                    <td className="numeric">{row.intelligence?.scores.overall.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SimplePanel>
      ) : null}
    </>
  );
}

export function BacktestPage() {
  const [symbol, setSymbol] = useState("RKLB");
  const [holdingWeeks, setHoldingWeeks] = useState("12");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState("");

  async function runBacktest() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const normalized = symbol.trim().toUpperCase();
      const responses = await Promise.all([
        fetch("/v1/live/chart/" + encodeURIComponent(normalized) + "?weeks=260"),
        fetch("/v1/live/chart/SPY?weeks=260"),
        fetch("/v1/strategies/presets"),
      ]);
      const chartResponse = responses[0];
      const benchmarkResponse = responses[1];
      const presetResponse = responses[2];
      if (!chartResponse.ok) throw new Error(await chartResponse.text());
      if (!benchmarkResponse.ok) throw new Error(await benchmarkResponse.text());
      if (!presetResponse.ok) throw new Error(await presetResponse.text());

      const chart = (await chartResponse.json()) as LiveChartResponse;
      const benchmark = (await benchmarkResponse.json()) as LiveChartResponse;
      const presets = (await presetResponse.json()) as Array<Record<string, unknown>>;
      const strategy =
        presets.find((item) => item.name === "Weekly Breakout Technical") ?? null;

      const response = await fetch("/v1/backtest/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            symbol: chart.profile.symbol,
            sector: chart.profile.sector,
            industry: chart.profile.industry,
            market_cap: chart.profile.market_cap,
          },
          weekly_bars: chart.bars,
          benchmark_bars: benchmark.bars,
          strategy,
          max_holding_weeks: Number(holdingWeeks || 12),
          initial_equity: 10000,
          position_size_pct: 1,
          slippage_pct: 0.001,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setResult((await response.json()) as BacktestResponse);
    } catch (backtestError) {
      setError(backtestError instanceof Error ? backtestError.message : "Backtest failed.");
    } finally {
      setLoading(false);
    }
  }

  const equityData =
    result?.equity_curve.map((point, index) => ({
      trade: index + 1,
      equity: point.equity,
    })) ?? [];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RESEARCH / HISTORICAL SIMULATION</div>
          <h1>Backtest Lab</h1>
          <p>Replay completed weekly signals without lookahead and enter on the next weekly open.</p>
        </div>
        <div className="backtest-controls">
          <div className="symbol-search">
            <Search size={16} />
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              aria-label="Backtest ticker"
            />
          </div>
          <label className="field field--compact">
            <span>Max hold</span>
            <select value={holdingWeeks} onChange={(event) => setHoldingWeeks(event.target.value)}>
              <option value="4">4 weeks</option>
              <option value="8">8 weeks</option>
              <option value="12">12 weeks</option>
              <option value="20">20 weeks</option>
              <option value="26">26 weeks</option>
            </select>
          </label>
          <button className="button button--primary" onClick={runBacktest} disabled={loading}>
            <Play size={16} fill="currentColor" />
            {loading ? "Replaying…" : "Run Backtest"}
          </button>
        </div>
      </div>

      {error ? <div className="live-error">{error}</div> : null}

      <div className="metrics-grid">
        <MiniMetric
          label="Trades"
          value={result ? String(result.trades_count) : "—"}
          detail={result ? String(result.matches_count) + " historical matches" : "Waiting for replay"}
        />
        <MiniMetric
          label="Win Rate"
          value={result ? (result.win_rate * 100).toFixed(1) + "%" : "—"}
          detail={result ? String(result.wins) + " wins / " + String(result.losses) + " losses" : "Next-week entries"}
        />
        <MiniMetric
          label="Avg Return"
          value={result ? (result.average_return_pct * 100).toFixed(2) + "%" : "—"}
          detail="Per completed trade"
        />
        <MiniMetric
          label="Max Drawdown"
          value={result ? (result.max_drawdown_pct * 100).toFixed(2) + "%" : "—"}
          detail={result ? "Ending equity $" + result.ending_equity.toFixed(0) : "Equity curve"}
        />
      </div>

      {result ? (
        <>
          <div className="dashboard-grid">
            <SimplePanel title="Equity Curve" subtitle={"Total return " + (result.total_return_pct * 100).toFixed(2) + "%"}>
              <div className="chart">
                {equityData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityData}>
                      <CartesianGrid stroke="#202938" vertical={false} />
                      <XAxis dataKey="trade" stroke="#6f7d90" tickLine={false} axisLine={false} />
                      <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: "#0f1622",
                          border: "1px solid #263246",
                          borderRadius: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#4f8cff"
                        fill="#4f8cff"
                        fillOpacity={0.12}
                        strokeWidth={2.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-live-state">
                    <BarChart3 size={22} />
                    <span>No completed trades for this preset/history window.</span>
                  </div>
                )}
              </div>
            </SimplePanel>

            <SimplePanel title="Simulation Assumptions" subtitle="Explicit anti-lookahead rules">
              <div className="gate-list gate-list--single">
                {result.notes.map((note) => (
                  <div className="gate-item" key={note}>
                    <span className="gate-check">✓</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </SimplePanel>
          </div>

          <SimplePanel title="Historical Trades" subtitle="Technical preset · next-week entry · structural stop">
            {result.trades.length ? (
              <div className="table-wrap">
                <table className="scanner-table backtest-table">
                  <thead>
                    <tr>
                      <th>Signal</th>
                      <th>Entry</th>
                      <th>Entry Price</th>
                      <th>Stop</th>
                      <th>Exit</th>
                      <th>Exit Price</th>
                      <th>Reason</th>
                      <th>Return</th>
                      <th>Tier</th>
                      <th>Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((trade, index) => (
                      <tr key={trade.entry_time + "-" + String(index)}>
                        <td>{new Date(trade.signal_time).toLocaleDateString()}</td>
                        <td>{new Date(trade.entry_time).toLocaleDateString()}</td>
                        <td className="numeric">{"$" + trade.entry_price.toFixed(2)}</td>
                        <td className="numeric">
                          {trade.stop_price == null ? "—" : "$" + trade.stop_price.toFixed(2)}
                        </td>
                        <td>{new Date(trade.exit_time).toLocaleDateString()}</td>
                        <td className="numeric">{"$" + trade.exit_price.toFixed(2)}</td>
                        <td>{trade.exit_reason.replaceAll("_", " ")}</td>
                        <td className={trade.return_pct >= 0 ? "positive numeric" : "negative numeric"}>
                          {(trade.return_pct * 100).toFixed(2)}%
                        </td>
                        <td><span className="tier tier--confirmed">{trade.tier}</span></td>
                        <td className="numeric">{trade.overall.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-live-state">
                <Radar size={22} />
                <strong>No trades matched.</strong>
                <span>Try another symbol or a different holding period.</span>
              </div>
            )}
          </SimplePanel>
        </>
      ) : (
        <SimplePanel title="Historical-safe Default" subtitle="Uses the reusable Weekly Breakout Technical preset">
          <div className="gate-list">
            {[
              "Completed weekly bars only",
              "No same-candle entry",
              "Entry at following weekly open",
              "0.10% slippage by default",
              "Structural-stop exit",
              "SPY-relative strength uses benchmark data available by signal date",
              "No historical catalyst claims until point-in-time event data exists",
              "Static fundamentals are explicitly flagged if supplied",
            ].map((item) => (
              <div className="gate-item" key={item}>
                <span className="gate-check">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </SimplePanel>
      )}
    </>
  );
}

function smaSeries(bars: LiveChartBar[], period = 20): Array<number | null> {
  return bars.map((_, index) => {
    if (index + 1 < period) return null;
    const window = bars.slice(index + 1 - period, index + 1);
    return window.reduce((sum, bar) => sum + bar.close, 0) / period;
  });
}

function CandlestickChart({ data }: { data: LiveChartResponse }) {
  const bars = data.bars.slice(-72);
  const width = 1000;
  const height = 430;
  const pad = { left: 58, right: 72, top: 24, bottom: 34 };
  const values = bars.flatMap((bar) => [bar.high, bar.low]);
  if (data.candidate.box) {
    values.push(data.candidate.box.body_high, data.candidate.box.body_low);
  }
  if (data.candidate.structural_stop != null) {
    values.push(data.candidate.structural_stop);
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.02, 0.01);
  const low = min - spread * 0.08;
  const high = max + spread * 0.08;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const step = plotWidth / Math.max(1, bars.length);
  const candleWidth = Math.max(3, Math.min(9, step * 0.62));
  const y = (value: number) =>
    pad.top + ((high - value) / (high - low)) * plotHeight;
  const x = (index: number) => pad.left + step * index + step / 2;
  const ma = smaSeries(bars, 20);
  const maPoints = ma
    .map((value, index) =>
      value == null ? null : String(x(index)) + "," + String(y(value)),
    )
    .filter((value): value is string => value !== null)
    .join(" ");

  const box = data.candidate.box;
  const boxStart = box ? bars.findIndex((bar) => bar.timestamp >= box.start) : -1;
  const boxEnd = box ? bars.findIndex((bar) => bar.timestamp >= box.end) : -1;

  return (
    <div className="candlestick-shell">
      <svg
        className="candlestick-chart"
        viewBox={"0 0 " + String(width) + " " + String(height)}
        role="img"
        aria-label={data.symbol + " weekly candlestick chart"}
      >
        <rect x="0" y="0" width={width} height={height} rx="8" className="candle-bg" />

        {[0, 1, 2, 3, 4].map((index) => {
          const price = high - ((high - low) * index) / 4;
          const lineY = y(price);
          return (
            <g key={index}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={lineY}
                y2={lineY}
                className="candle-grid"
              />
              <text x={width - pad.right + 8} y={lineY + 4} className="candle-axis-label">
                {"$" + price.toFixed(price < 10 ? 2 : 1)}
              </text>
            </g>
          );
        })}

        {box && boxStart >= 0 ? (
          <rect
            x={x(boxStart) - step / 2}
            y={y(box.body_high)}
            width={Math.max(
              step,
              x(boxEnd >= 0 ? boxEnd : bars.length - 1) - x(boxStart) + step,
            )}
            height={Math.max(2, y(box.body_low) - y(box.body_high))}
            className="box-zone"
          />
        ) : null}

        {data.candidate.structural_stop != null ? (
          <>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(data.candidate.structural_stop)}
              y2={y(data.candidate.structural_stop)}
              className="stop-line"
            />
            <text
              x={pad.left + 6}
              y={y(data.candidate.structural_stop) - 6}
              className="stop-label"
            >
              STOP {data.candidate.structural_stop.toFixed(2)}
            </text>
          </>
        ) : null}

        {box ? (
          <>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(box.body_high)}
              y2={y(box.body_high)}
              className="resistance-line"
            />
            <text x={pad.left + 6} y={y(box.body_high) - 6} className="resistance-label">
              RESISTANCE {box.body_high.toFixed(2)}
            </text>
          </>
        ) : null}

        {maPoints ? <polyline points={maPoints} className="ma-line" /> : null}

        {bars.map((bar, index) => {
          const up = bar.close >= bar.open;
          const top = y(Math.max(bar.open, bar.close));
          const bottom = y(Math.min(bar.open, bar.close));
          return (
            <g key={bar.timestamp}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={y(bar.high)}
                y2={y(bar.low)}
                className={up ? "wick wick--up" : "wick wick--down"}
              />
              <rect
                x={x(index) - candleWidth / 2}
                y={top}
                width={candleWidth}
                height={Math.max(1.5, bottom - top)}
                className={up ? "candle candle--up" : "candle candle--down"}
              />
            </g>
          );
        })}

        {bars
          .filter((_, index) => index % Math.max(1, Math.floor(bars.length / 6)) === 0)
          .map((bar) => {
            const index = bars.indexOf(bar);
            return (
              <text
                key={bar.timestamp}
                x={x(index)}
                y={height - 10}
                textAnchor="middle"
                className="candle-axis-label"
              >
                {new Date(bar.timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  year: "2-digit",
                })}
              </text>
            );
          })}
      </svg>

      <div className="chart-legend">
        <span><i className="legend-ma" />20W SMA</span>
        <span><i className="legend-box" />Consolidation</span>
        <span><i className="legend-resistance" />Resistance</span>
        <span><i className="legend-stop" />Structural stop</span>
      </div>
    </div>
  );
}

export function LiveChartsPage() {
  const [symbolInput, setSymbolInput] = useState("RKLB");
  const [weeks, setWeeks] = useState(104);
  const [data, setData] = useState<LiveChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadChart(symbol = symbolInput, period = weeks) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/v1/live/chart/" +
          encodeURIComponent(symbol.trim().toUpperCase()) +
          "?weeks=" +
          String(period),
      );
      if (!response.ok) throw new Error(await response.text());
      setData((await response.json()) as LiveChartResponse);
    } catch (chartError) {
      setError(chartError instanceof Error ? chartError.message : "Chart retrieval failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChart("RKLB", 104);
  }, []);

  const volumeData =
    data?.bars.slice(-72).map((bar) => ({
      date: new Date(bar.timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      volume: Math.round(bar.volume / 1000),
    })) ?? [];

  const metrics = data?.candidate.metrics ?? {};
  const box = data?.candidate.box;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ANALYTICS / LIVE WEEKLY CHART</div>
          <h1>Charts</h1>
          <p>True OHLC candles with the scanner's actual consolidation box, resistance, stop and 20-week average.</p>
        </div>
        <div className="chart-search-actions">
          <div className="symbol-search">
            <Search size={16} />
            <input
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadChart();
              }}
              aria-label="Ticker symbol"
            />
          </div>
          <button className="button button--primary" onClick={() => loadChart()} disabled={loading}>
            <Search size={15} />
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {error ? <div className="live-error">{error}</div> : null}

      <SimplePanel
        title={data ? data.symbol + " · " + data.profile.company : "Weekly Structure"}
        subtitle={
          data
            ? data.source + " · " + data.candidate.state.toUpperCase() + " scanner state"
            : "Loading live weekly structure"
        }
        action={
          <div className="timeframe-tabs">
            {[
              [26, "6M"],
              [52, "1Y"],
              [104, "2Y"],
              [260, "5Y"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={weeks === value ? "active" : ""}
                onClick={() => {
                  setWeeks(Number(value));
                  void loadChart(symbolInput, Number(value));
                }}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {data ? (
          <CandlestickChart data={data} />
        ) : (
          <div className="live-loading">
            <Activity size={22} />
            Retrieving weekly OHLC history…
          </div>
        )}
      </SimplePanel>

      {data ? (
        <div className="dashboard-grid">
          <SimplePanel title="Weekly Volume" subtitle="Thousands of shares per completed week">
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid stroke="#202938" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#6f7d90"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f1622",
                      border: "1px solid #263246",
                      borderRadius: 10,
                    }}
                  />
                  <Bar dataKey="volume" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SimplePanel>

          <SimplePanel title="Scanner Context" subtitle="Values from the same live candidate">
            <div className="context-grid">
              <div>
                <span>Box width</span>
                <strong>{box ? (box.width_pct * 100).toFixed(2) + "%" : "—"}</strong>
              </div>
              <div><span>Box bars</span><strong>{box?.bars ?? "—"}</strong></div>
              <div>
                <span>Close location</span>
                <strong>
                  {typeof metrics.close_location === "number"
                    ? (metrics.close_location * 100).toFixed(0) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Upper wick</span>
                <strong>
                  {typeof metrics.upper_wick_ratio === "number"
                    ? (metrics.upper_wick_ratio * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>NATR 14</span>
                <strong>
                  {typeof metrics.natr_14 === "number"
                    ? (metrics.natr_14 * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>RelVol</span>
                <strong className="positive">
                  {typeof metrics.volume_vs_average === "number"
                    ? metrics.volume_vs_average.toFixed(2) + "×"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Stop risk</span>
                <strong>
                  {data.candidate.stop_risk_pct != null
                    ? (data.candidate.stop_risk_pct * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Last price</span>
                <strong>{"$" + data.profile.price.toFixed(2)}</strong>
              </div>
            </div>
          </SimplePanel>
        </div>
      ) : null}
    </>
  );
}
