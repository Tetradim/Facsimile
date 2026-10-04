import {
  buildMobileIntelligence,
  evaluateMobileStrategy,
  mobileStrategyFacts,
  type MobileStrategy,
} from "./mobileIntelligence";
import {
  evaluateBreakout,
  runStandaloneWeeklyScan,
  yahooWeeklyBars,
  type OHLCVBar,
  type StandaloneProfile,
  type StandaloneScanRequest,
  type StandaloneScanResponse,
} from "./standalone";

export type StandaloneChartResponse = {
  symbol: string;
  profile: StandaloneProfile;
  bars: OHLCVBar[];
  candidate: ReturnType<typeof evaluateBreakout>;
  source: string;
};

export type StandaloneBacktestRequest = {
  profile: {
    symbol: string;
    sector?: string | null;
    industry?: string | null;
    market_cap?: number | null;
  };
  weekly_bars: OHLCVBar[];
  benchmark_bars?: OHLCVBar[];
  strategy?: MobileStrategy | null;
  max_holding_weeks?: number;
  initial_equity?: number;
  position_size_pct?: number;
  slippage_pct?: number;
};

export type StandaloneBacktestResponse = {
  schema_version: string;
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
  matches: Array<{
    signal_time: string;
    symbol: string;
    tier: string;
    overall: number;
    entry_reference: number;
    structural_stop: number | null;
    strategy_passed: boolean;
    failed_reasons: string[];
  }>;
  trades: Array<{
    symbol: string;
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
  equity_curve: Array<{
    timestamp: string;
    equity: number;
    drawdown_pct: number;
  }>;
  notes: string[];
};

type WatchlistSnapshot = {
  symbol: string;
  state: string;
  tier: string;
  overall: number;
  catalyst: number;
  price: number;
  strategy_match: boolean | null;
  as_of: string;
};

export type StandaloneWatchlistRecord = {
  id: string;
  name: string;
  scan_request: StandaloneScanRequest;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
};

export type StandaloneWatchlistEvent = {
  id: number;
  watchlist_id: string;
  symbol: string;
  event_type: string;
  message: string;
  old_value: string | null;
  new_value: string | null;
  occurred_at: string;
};

type StoredWatchlist = StandaloneWatchlistRecord & {
  snapshots: Record<string, WatchlistSnapshot>;
  events: StandaloneWatchlistEvent[];
};

export type StandaloneWatchlistRefreshResponse = {
  watchlist: StandaloneWatchlistRecord;
  scan: StandaloneScanResponse;
  events: StandaloneWatchlistEvent[];
};

const WATCHLIST_STORAGE_KEY = "facsimile.android.watchlists.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + "-" + String(Math.floor(Math.random() * 1_000_000));
}

function loadStoredWatchlists(): StoredWatchlist[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredWatchlist[]) : [];
  } catch {
    return [];
  }
}

function saveStoredWatchlists(rows: StoredWatchlist[]): void {
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(rows));
}

function publicWatchlist(row: StoredWatchlist): StandaloneWatchlistRecord {
  return {
    id: row.id,
    name: row.name,
    scan_request: row.scan_request,
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_refreshed_at: row.last_refreshed_at,
  };
}

export function standaloneStrategyPresets(): MobileStrategy[] {
  const medical: MobileStrategy = {
    schema_version: "facsimile.strategy.v1",
    name: "Medical Catalyst Weekly",
    description:
      "Low-priced healthcare weekly breakout with catalyst, volume and structural-risk confirmation.",
    all_of: {
      mode: "all",
      conditions: [
        { field: "price", operator: "between", value: [0.1, 2.5] },
        { field: "sector", operator: "contains", value: "health" },
        { field: "box_bars", operator: "gte", value: 6, timeframe: "1w" },
        { field: "box_width_pct", operator: "lte", value: 0.18, timeframe: "1w" },
        { field: "close_above_box_pct", operator: "gte", value: 0.02, timeframe: "1w" },
        { field: "close_location", operator: "gte", value: 0.8, timeframe: "1w" },
        { field: "upper_wick_ratio", operator: "lte", value: 0.35, timeframe: "1w" },
        { field: "volume_vs_average", operator: "gte", value: 1.5, timeframe: "1w" },
        { field: "stop_risk_pct", operator: "lte", value: 0.15, timeframe: "1w" },
      ],
    },
    any_of: {
      mode: "any",
      conditions: [
        { field: "catalyst_score", operator: "gte", value: 70 },
        { field: "recent_news_count", operator: "gte", value: 1 },
      ],
    },
    none_of: {
      mode: "none",
      conditions: [
        { field: "dilution_risk", operator: "eq", value: "extreme" },
      ],
    },
    metadata: {
      scanner_family: "weekly_breakout",
      reusable_for: ["scan", "watchlist", "alert", "backtest"],
    },
  };

  const technical: MobileStrategy = {
    schema_version: "facsimile.strategy.v1",
    name: "Weekly Breakout Technical",
    description:
      "Historical-safe weekly breakout preset without historical catalyst requirements.",
    all_of: {
      mode: "all",
      conditions: [
        { field: "box_bars", operator: "gte", value: 6, timeframe: "1w" },
        { field: "box_width_pct", operator: "lte", value: 0.18, timeframe: "1w" },
        { field: "close_above_box_pct", operator: "gte", value: 0.02, timeframe: "1w" },
        { field: "close_location", operator: "gte", value: 0.8, timeframe: "1w" },
        { field: "upper_wick_ratio", operator: "lte", value: 0.35, timeframe: "1w" },
        { field: "volume_vs_average", operator: "gte", value: 1.5, timeframe: "1w" },
        { field: "stop_risk_pct", operator: "lte", value: 0.15, timeframe: "1w" },
        { field: "scores.technical", operator: "gte", value: 70, timeframe: "1w" },
      ],
    },
    any_of: { mode: "any", conditions: [] },
    none_of: { mode: "none", conditions: [] },
    metadata: {
      scanner_family: "weekly_breakout",
      historical_safe: true,
      reusable_for: ["scan", "watchlist", "alert", "backtest"],
    },
  };

  return [medical, technical];
}

export async function standaloneChart(
  symbol: string,
  weeks = 104,
): Promise<StandaloneChartResponse> {
  const normalized = symbol.trim().toUpperCase();
  const bars = await yahooWeeklyBars(
    normalized,
    weeks > 104 ? "10y" : "2y",
  );
  if (!bars.length) throw new Error("No weekly chart history returned.");
  const candidate = evaluateBreakout(normalized, bars);
  const last = bars[bars.length - 1];
  return {
    symbol: normalized,
    profile: {
      symbol: normalized,
      company: normalized,
      price: last.close,
      sector: null,
      industry: null,
      exchange: null,
      market_cap: null,
      source: "yahoo_chart_native",
    },
    bars: bars.slice(-Math.max(35, Math.min(weeks, 260))),
    candidate,
    source: "yahoo_chart_native",
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export async function runStandaloneBacktest(
  request: StandaloneBacktestRequest,
): Promise<StandaloneBacktestResponse> {
  const bars = [...request.weekly_bars].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const benchmark = [...(request.benchmark_bars ?? [])].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const strategy =
    request.strategy ??
    standaloneStrategyPresets().find(
      (item) => item.name === "Weekly Breakout Technical",
    ) ??
    null;
  const maxHoldingWeeks = Math.max(
    1,
    Math.min(request.max_holding_weeks ?? 12, 104),
  );
  const initialEquity = request.initial_equity ?? 10_000;
  const positionSizePct = request.position_size_pct ?? 1;
  const slippage = request.slippage_pct ?? 0.001;
  const required = 35;

  const matches: StandaloneBacktestResponse["matches"] = [];
  const trades: StandaloneBacktestResponse["trades"] = [];
  let nextAvailableEntry = required;

  for (let signalIndex = required - 1; signalIndex < bars.length - 1; signalIndex += 1) {
    const history = bars.slice(0, signalIndex + 1);
    const candidate = evaluateBreakout(request.profile.symbol, history);
    const benchmarkHistory = benchmark.filter(
      (bar) => bar.timestamp <= candidate.as_of,
    );
    const intelligence = buildMobileIntelligence(
      candidate,
      history,
      benchmarkHistory,
      [],
      0,
    );
    const profile: StandaloneProfile = {
      symbol: request.profile.symbol.toUpperCase(),
      company: request.profile.symbol.toUpperCase(),
      price: candidate.entry_price ?? history[history.length - 1].close,
      sector: request.profile.sector ?? null,
      industry: request.profile.industry ?? null,
      exchange: null,
      market_cap: request.profile.market_cap ?? null,
      source: "historical",
    };
    const evaluation = strategy
      ? evaluateMobileStrategy(
          strategy,
          mobileStrategyFacts(profile, candidate, intelligence, 0),
        )
      : null;
    const passed =
      evaluation?.passed ?? candidate.state === "confirmed";

    if (candidate.state === "confirmed") {
      matches.push({
        signal_time: candidate.as_of,
        symbol: request.profile.symbol.toUpperCase(),
        tier: intelligence.tier,
        overall: intelligence.scores.overall,
        entry_reference: candidate.entry_price ?? 0,
        structural_stop: candidate.structural_stop,
        strategy_passed: passed,
        failed_reasons: evaluation?.failed_reasons ?? [],
      });
    }

    if (!passed || candidate.state !== "confirmed") continue;
    const entryIndex = signalIndex + 1;
    if (entryIndex < nextAvailableEntry) continue;

    const entryBar = bars[entryIndex];
    const entryPrice = entryBar.open * (1 + slippage);
    const stop = candidate.structural_stop;
    let exitIndex = Math.min(
      bars.length - 1,
      entryIndex + maxHoldingWeeks - 1,
    );
    let exitReason = "max_holding";
    let exitPrice = bars[exitIndex].close * (1 - slippage);

    if (stop != null) {
      for (let index = entryIndex; index <= exitIndex; index += 1) {
        const bar = bars[index];
        if (bar.low <= stop) {
          exitIndex = index;
          exitReason = "structural_stop";
          exitPrice = Math.min(bar.open, stop) * (1 - slippage);
          break;
        }
      }
    }

    const returnPct = exitPrice / entryPrice - 1;
    trades.push({
      symbol: request.profile.symbol.toUpperCase(),
      signal_time: candidate.as_of,
      entry_time: entryBar.timestamp,
      entry_price: entryPrice,
      stop_price: stop,
      exit_time: bars[exitIndex].timestamp,
      exit_price: exitPrice,
      exit_reason: exitReason,
      return_pct: returnPct,
      holding_weeks: exitIndex - entryIndex + 1,
      tier: intelligence.tier,
      overall: intelligence.scores.overall,
    });
    nextAvailableEntry = exitIndex + 1;
  }

  let equity = initialEquity;
  let peak = equity;
  let positiveGross = 0;
  let negativeGross = 0;
  const equityCurve: StandaloneBacktestResponse["equity_curve"] = [];
  const returns: number[] = [];

  for (const trade of trades) {
    const pnl = equity * positionSizePct * trade.return_pct;
    equity += pnl;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? equity / peak - 1 : 0;
    equityCurve.push({
      timestamp: trade.exit_time,
      equity,
      drawdown_pct: drawdown,
    });
    returns.push(trade.return_pct);
    if (pnl >= 0) positiveGross += pnl;
    else negativeGross += Math.abs(pnl);
  }

  const wins = returns.filter((value) => value > 0).length;
  const losses = returns.length - wins;
  const averageReturn =
    returns.length > 0
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : 0;
  const maxDrawdown = equityCurve.reduce(
    (worst, point) => Math.min(worst, point.drawdown_pct),
    0,
  );

  return {
    schema_version: "facsimile.backtest.v1",
    symbol: request.profile.symbol.toUpperCase(),
    matches_count: matches.length,
    trades_count: trades.length,
    wins,
    losses,
    win_rate: returns.length ? wins / returns.length : 0,
    average_return_pct: averageReturn,
    median_return_pct: median(returns),
    profit_factor: negativeGross > 0 ? positiveGross / negativeGross : null,
    max_drawdown_pct: maxDrawdown,
    ending_equity: equity,
    total_return_pct: equity / initialEquity - 1,
    matches,
    trades,
    equity_curve: equityCurve,
    notes: [
      "Signals use completed weekly bars only.",
      "Entries occur at the next weekly open plus configured slippage.",
      "Weekly bars cannot resolve intrabar stop path; stop fills use the worse of stop or weekly open.",
      "Standalone Android backtests use neutral historical fundamentals and no reconstructed historical catalyst/news context.",
    ],
  };
}

export function listStandaloneWatchlists(): StandaloneWatchlistRecord[] {
  return loadStoredWatchlists().map(publicWatchlist);
}

export function createStandaloneWatchlist(input: {
  name: string;
  scan_request: StandaloneScanRequest;
  enabled?: boolean;
}): StandaloneWatchlistRecord {
  const rows = loadStoredWatchlists();
  const now = nowIso();
  const row: StoredWatchlist = {
    id: uuid(),
    name: input.name.trim(),
    scan_request: input.scan_request,
    enabled: input.enabled ?? true,
    created_at: now,
    updated_at: now,
    last_refreshed_at: null,
    snapshots: {},
    events: [],
  };
  saveStoredWatchlists([row, ...rows]);
  return publicWatchlist(row);
}

export function deleteStandaloneWatchlist(id: string): void {
  const rows = loadStoredWatchlists();
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) throw new Error("Watchlist not found");
  saveStoredWatchlists(next);
}

export function standaloneWatchlistEvents(
  id: string,
  limit = 100,
): StandaloneWatchlistEvent[] {
  const row = loadStoredWatchlists().find((item) => item.id === id);
  if (!row) throw new Error("Watchlist not found");
  return [...row.events]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, Math.max(1, Math.min(limit, 500)));
}

function makeSnapshot(
  row: StandaloneScanResponse["rows"][number],
): WatchlistSnapshot {
  return {
    symbol: row.profile.symbol,
    state: row.candidate.state,
    tier: row.intelligence?.tier ?? "X",
    overall: row.intelligence?.scores.overall ?? 0,
    catalyst: row.catalyst_score,
    price: row.profile.price,
    strategy_match: row.strategy_evaluation?.passed ?? null,
    as_of: row.candidate.as_of,
  };
}

function snapshotEvents(
  watchlistId: string,
  previous: WatchlistSnapshot | undefined,
  current: WatchlistSnapshot,
  startId: number,
): StandaloneWatchlistEvent[] {
  const occurred = nowIso();
  const events: StandaloneWatchlistEvent[] = [];
  const push = (
    eventType: string,
    message: string,
    oldValue: string | null,
    newValue: string | null,
  ) => {
    events.push({
      id: startId + events.length,
      watchlist_id: watchlistId,
      symbol: current.symbol,
      event_type: eventType,
      message,
      old_value: oldValue,
      new_value: newValue,
      occurred_at: occurred,
    });
  };

  if (!previous) {
    if (current.state !== "rejected" || current.strategy_match === true) {
      push(
        "new_match",
        current.symbol + " entered the watchlist as " + current.tier + " / " + current.state + ".",
        null,
        current.tier + ":" + current.state,
      );
    }
    return events;
  }

  if (previous.state !== current.state) {
    push(
      "state_change",
      current.symbol + " state changed " + previous.state + " -> " + current.state + ".",
      previous.state,
      current.state,
    );
  }
  if (previous.tier !== current.tier) {
    push(
      "tier_change",
      current.symbol + " tier changed " + previous.tier + " -> " + current.tier + ".",
      previous.tier,
      current.tier,
    );
  }
  if (
    previous.strategy_match != null &&
    current.strategy_match != null &&
    previous.strategy_match !== current.strategy_match
  ) {
    push(
      "strategy_match_change",
      current.symbol +
        (current.strategy_match
          ? " now matches the stored strategy."
          : " no longer matches the stored strategy."),
      String(previous.strategy_match),
      String(current.strategy_match),
    );
  }
  if (Math.abs(current.overall - previous.overall) >= 10) {
    push(
      "score_move",
      current.symbol +
        " Intelligence Overall moved to " +
        current.overall.toFixed(1) +
        ".",
      previous.overall.toFixed(1),
      current.overall.toFixed(1),
    );
  }
  if (previous.state !== "confirmed" && current.state === "confirmed") {
    push(
      "confirmed_breakout",
      current.symbol +
        " is now a confirmed weekly breakout (" +
        current.tier +
        ", " +
        current.overall.toFixed(1) +
        ").",
      previous.state,
      "confirmed",
    );
  }
  return events;
}

export async function refreshStandaloneWatchlist(
  id: string,
): Promise<StandaloneWatchlistRefreshResponse> {
  const rows = loadStoredWatchlists();
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Watchlist not found");
  const stored = rows[index];
  const request: StandaloneScanRequest = {
    ...stored.scan_request,
    include_rejected: true,
    require_strategy_match: false,
    max_results: Math.max(
      stored.scan_request.max_results ?? 30,
      Math.min(60, stored.scan_request.max_candidates ?? 35),
    ),
  };

  const scan = await runStandaloneWeeklyScan(request);
  const created: StandaloneWatchlistEvent[] = [];
  const snapshots: Record<string, WatchlistSnapshot> = {};
  let eventId = Date.now();

  for (const row of scan.rows) {
    const current = makeSnapshot(row);
    snapshots[current.symbol] = current;
    const nextEvents = snapshotEvents(
      stored.id,
      stored.snapshots[current.symbol],
      current,
      eventId,
    );
    created.push(...nextEvents);
    eventId += nextEvents.length + 1;
  }

  const now = nowIso();
  const updated: StoredWatchlist = {
    ...stored,
    updated_at: now,
    last_refreshed_at: now,
    snapshots,
    events: [...created, ...stored.events].slice(0, 500),
  };
  rows[index] = updated;
  saveStoredWatchlists(rows);

  return {
    watchlist: publicWatchlist(updated),
    scan,
    events: created,
  };
}
