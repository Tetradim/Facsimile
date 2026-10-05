import {
  yahooWeeklyBars,
  type OHLCVBar,
} from "./standalone";

export type MobilePositionState =
  | "normal"
  | "macd_bearish_confirmed"
  | "tightened"
  | "stop_hit";

export type MobileManagedPosition = {
  symbol: string;
  opened_at: string;
  entry_price: number;
  initial_stop: number;
  current_stop: number;
  state: MobilePositionState;
  bearish_macd_weeks: number;
  last_updated_at: string | null;
};

export type MobilePositionEvent = {
  id: string;
  kind: string;
  message: string;
  occurred_at: string;
};

export type MobileTrackedPosition = {
  id: string;
  position: MobileManagedPosition;
  created_at: string;
  updated_at: string;
  events: MobilePositionEvent[];
};

export type MobilePositionRefresh = {
  tracked: MobileTrackedPosition;
  update: {
    previous_state: MobilePositionState;
    previous_stop: number;
    stop_changed: boolean;
    stop_hit_price: number | null;
    macd: number | null;
    macd_signal: number | null;
    structure_stop: number | null;
    reason: string;
  };
};

export type MobileMonteCarloRequest = {
  returns_pct: number[];
  starting_equity?: number;
  position_fraction?: number;
  runs?: number;
  trades_per_run?: number | null;
  ruin_fraction?: number;
  seed?: number;
  sample_paths?: number;
};

export type MobileMonteCarloResponse = {
  runs: number;
  trades_per_run: number;
  starting_equity: number;
  probability_profitable_pct: number;
  probability_ruin_pct: number;
  ending_equity_p10: number;
  ending_equity_p25: number;
  ending_equity_p50: number;
  ending_equity_p75: number;
  ending_equity_p90: number;
  max_drawdown_p50_pct: number;
  max_drawdown_p90_pct: number;
  average_ending_equity: number;
  sample_paths: Array<{
    run: number;
    equity: number[];
    max_drawdown_pct: number;
    ending_equity: number;
  }>;
};

const POSITION_KEY = "facsimile.android.positions.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + "-" + String(Math.floor(Math.random() * 1_000_000));
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadPositions(): MobileTrackedPosition[] {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    return raw ? (JSON.parse(raw) as MobileTrackedPosition[]) : [];
  } catch {
    return [];
  }
}

function savePositions(items: MobileTrackedPosition[]): void {
  window.localStorage.setItem(POSITION_KEY, JSON.stringify(items));
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const output = [values[0]];
  for (const value of values.slice(1)) {
    output.push(value * alpha + output[output.length - 1] * (1 - alpha));
  }
  return output;
}

function macd(values: number[]): [number | null, number | null] {
  if (values.length < 35) return [null, null];
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = fast.map((value, index) => value - slow[index]);
  const signal = emaSeries(line, 9);
  return [line.at(-1) ?? null, signal.at(-1) ?? null];
}

function event(kind: string, message: string): MobilePositionEvent {
  return {
    id: uuid(),
    kind,
    message,
    occurred_at: nowIso(),
  };
}

export function listStandalonePositions(): MobileTrackedPosition[] {
  return loadPositions();
}

export function createStandalonePosition(input: {
  symbol: string;
  opened_at: string;
  entry_price: number;
  initial_stop: number;
}): MobileTrackedPosition {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new Error("Symbol is required.");
  if (!(input.entry_price > 0) || !(input.initial_stop > 0)) {
    throw new Error("Entry and stop must be positive.");
  }
  if (input.initial_stop >= input.entry_price) {
    throw new Error("Initial stop must be below entry price.");
  }

  const now = nowIso();
  const tracked: MobileTrackedPosition = {
    id: uuid(),
    position: {
      symbol,
      opened_at: input.opened_at,
      entry_price: input.entry_price,
      initial_stop: input.initial_stop,
      current_stop: input.initial_stop,
      state: "normal",
      bearish_macd_weeks: 0,
      last_updated_at: null,
    },
    created_at: now,
    updated_at: now,
    events: [
      event(
        "position_created",
        "Position created at " +
          input.entry_price.toFixed(4) +
          " with stop " +
          input.initial_stop.toFixed(4) +
          ".",
      ),
    ],
  };

  savePositions([tracked, ...loadPositions()]);
  return tracked;
}

export function deleteStandalonePosition(id: string): void {
  const items = loadPositions();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) throw new Error("Position not found.");
  savePositions(next);
}

function evaluatePosition(
  position: MobileManagedPosition,
  bars: OHLCVBar[],
): MobilePositionRefresh["update"] {
  if (!bars.length) throw new Error("No weekly bars available.");
  const current = bars[bars.length - 1];
  const previousState = position.state;
  const previousStop = position.current_stop;

  if (current.low <= previousStop) {
    const fill = Math.min(current.open, previousStop);
    position.state = "stop_hit";
    position.last_updated_at = current.timestamp;
    return {
      previous_state: previousState,
      previous_stop: previousStop,
      stop_changed: false,
      stop_hit_price: fill,
      macd: null,
      macd_signal: null,
      structure_stop: null,
      reason:
        "Weekly low " +
        current.low.toFixed(4) +
        " crossed the active stop " +
        previousStop.toFixed(4) +
        ".",
    };
  }

  const closes = bars.map((bar) => bar.close);
  const [macdLine, macdSignal] = macd(closes);
  const bearish =
    macdLine !== null &&
    macdSignal !== null &&
    macdLine < macdSignal;

  if (bearish) {
    position.bearish_macd_weeks += 1;
  } else {
    position.bearish_macd_weeks = 0;
    position.state = "normal";
  }

  let structureStop: number | null = null;
  let stopChanged = false;

  if (bearish && position.bearish_macd_weeks >= 2) {
    position.state = "macd_bearish_confirmed";
    const recent = bars.slice(-3);
    const raw = Math.min(...recent.map((bar) => bar.low));
    structureStop = raw * 0.99;
    if (structureStop > position.current_stop) {
      position.current_stop = structureStop;
      position.state = "tightened";
      stopChanged = true;
    }
  }

  if (position.current_stop < previousStop) {
    throw new Error("Position manager attempted to loosen a stop.");
  }

  position.last_updated_at = current.timestamp;

  let reason = "Weekly MACD is not bearishly confirmed; stop unchanged.";
  if (stopChanged) {
    reason =
      "Bearish weekly MACD confirmed for " +
      String(position.bearish_macd_weeks) +
      " weeks; stop ratcheted from " +
      previousStop.toFixed(4) +
      " to " +
      position.current_stop.toFixed(4) +
      " beneath recent weekly structure.";
  } else if (position.state === "macd_bearish_confirmed") {
    reason =
      "Bearish weekly MACD is confirmed, but recent structure does not justify a tighter stop yet.";
  } else if (bearish) {
    reason =
      "Bearish weekly MACD week " +
      String(position.bearish_macd_weeks) +
      "/2; no stop change until confirmation.";
  }

  return {
    previous_state: previousState,
    previous_stop: previousStop,
    stop_changed: stopChanged,
    stop_hit_price: null,
    macd: macdLine,
    macd_signal: macdSignal,
    structure_stop: structureStop,
    reason,
  };
}

export async function refreshStandalonePosition(
  id: string,
): Promise<MobilePositionRefresh> {
  const items = loadPositions();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Position not found.");
  const tracked = items[index];
  const previousState = tracked.position.state;
  const previousStop = tracked.position.current_stop;
  const bars = await yahooWeeklyBars(tracked.position.symbol, "2y");
  const update = evaluatePosition(tracked.position, bars);
  tracked.updated_at = nowIso();

  if (tracked.position.state === "stop_hit") {
    tracked.events.unshift(event("stop_hit", update.reason));
  } else if (update.stop_changed) {
    tracked.events.unshift(event("stop_tightened", update.reason));
  } else if (
    previousState !== tracked.position.state ||
    previousStop !== tracked.position.current_stop
  ) {
    tracked.events.unshift(event("state_changed", update.reason));
  }
  tracked.events = tracked.events.slice(0, 200);
  items[index] = tracked;
  savePositions(items);
  return { tracked, update };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], pct: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 1) return ordered[0];
  const position = (ordered.length - 1) * pct;
  const low = Math.floor(position);
  const high = Math.min(low + 1, ordered.length - 1);
  const fraction = position - low;
  return ordered[low] * (1 - fraction) + ordered[high] * fraction;
}

export function runStandaloneMonteCarlo(
  input: MobileMonteCarloRequest,
): MobileMonteCarloResponse {
  const returns = input.returns_pct
    .filter((value) => Number.isFinite(value) && value > -100)
    .map((value) => value / 100);
  if (!returns.length) throw new Error("No usable returns supplied.");

  const starting = input.starting_equity ?? 10_000;
  const fraction = input.position_fraction ?? 1;
  const runs = Math.max(100, Math.min(input.runs ?? 1000, 20_000));
  const tradesPerRun = Math.max(
    1,
    Math.min(input.trades_per_run ?? returns.length, 5000),
  );
  const ruinFraction = input.ruin_fraction ?? 0.5;
  const seed = input.seed ?? 42;
  const sampleCount = Math.max(0, Math.min(input.sample_paths ?? 20, 100));
  const rng = mulberry32(seed);

  const ending: number[] = [];
  const drawdowns: number[] = [];
  const samplePaths: MobileMonteCarloResponse["sample_paths"] = [];
  let profitable = 0;
  let ruined = 0;

  for (let run = 0; run < runs; run += 1) {
    let equity = starting;
    let peak = equity;
    let worstDrawdown = 0;
    const path = [Math.round(equity * 100) / 100];

    for (let trade = 0; trade < tradesPerRun; trade += 1) {
      const sampled =
        returns[Math.floor(rng() * returns.length)];
      equity *= 1 + fraction * sampled;
      equity = Math.max(0, equity);
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? equity / peak - 1 : -1;
      worstDrawdown = Math.min(worstDrawdown, drawdown);
      if (run < sampleCount) {
        path.push(Math.round(equity * 100) / 100);
      }
    }

    ending.push(equity);
    drawdowns.push(Math.abs(worstDrawdown) * 100);
    if (equity > starting) profitable += 1;
    if (equity <= starting * ruinFraction) ruined += 1;

    if (run < sampleCount) {
      samplePaths.push({
        run: run + 1,
        equity: path,
        max_drawdown_pct:
          Math.round(Math.abs(worstDrawdown) * 100_000) / 1000,
        ending_equity: Math.round(equity * 100) / 100,
      });
    }
  }

  const roundMoney = (value: number) => Math.round(value * 100) / 100;
  const roundPct = (value: number) => Math.round(value * 100) / 100;

  return {
    runs,
    trades_per_run: tradesPerRun,
    starting_equity: starting,
    probability_profitable_pct: roundPct((profitable / runs) * 100),
    probability_ruin_pct: roundPct((ruined / runs) * 100),
    ending_equity_p10: roundMoney(percentile(ending, 0.1)),
    ending_equity_p25: roundMoney(percentile(ending, 0.25)),
    ending_equity_p50: roundMoney(percentile(ending, 0.5)),
    ending_equity_p75: roundMoney(percentile(ending, 0.75)),
    ending_equity_p90: roundMoney(percentile(ending, 0.9)),
    max_drawdown_p50_pct: roundPct(percentile(drawdowns, 0.5)),
    max_drawdown_p90_pct: roundPct(percentile(drawdowns, 0.9)),
    average_ending_equity: roundMoney(
      ending.reduce((sum, value) => sum + value, 0) / ending.length,
    ),
    sample_paths: samplePaths,
  };
}
