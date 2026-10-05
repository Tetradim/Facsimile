import {
  yahooIntradayBars,
  type OHLCVBar,
  type StandaloneProfile,
} from "./standalone";

export type OpeningBreakoutConfig = {
  opening_range_minutes?: number;
  min_breakout_close_pct?: number;
  max_breakout_extension_pct?: number;
  min_close_location?: number;
  max_upper_wick_ratio?: number;
  min_relative_volume?: number;
  max_stop_risk_pct?: number;
  stop_buffer_pct?: number;
  require_vwap?: boolean;
  require_relative_volume?: boolean;
  require_prior_close?: boolean;
};

export type OpeningRange = {
  start: string;
  end: string;
  high: number;
  low: number;
  volume: number;
  bars: number;
  width_pct: number;
};

export type OpeningBreakoutCandidate = {
  schema_version: "facsimile.opening_breakout_candidate.v1";
  symbol: string;
  as_of: string;
  state: "rejected" | "developing" | "confirmed";
  opening_range: OpeningRange | null;
  breakout_bar: OHLCVBar | null;
  entry_price: number | null;
  structural_stop: number | null;
  stop_risk_pct: number | null;
  vwap: number | null;
  relative_volume: number | null;
  scores: {
    trigger: number;
    volume: number;
    vwap: number;
    structure: number;
    risk: number;
    overall: number;
  } | null;
  gates: Array<{
    name: string;
    passed: boolean;
    value: number | string | boolean | null;
    threshold: number | string | null;
    detail: string;
  }>;
  reasons: string[];
  metrics: Record<string, number | string | boolean | null>;
};

export type StandaloneOpeningResponse = {
  symbol: string;
  profile: StandaloneProfile;
  session_date: string;
  bars: OHLCVBar[];
  prior_session_bars: OHLCVBar[];
  candidate: OpeningBreakoutCandidate;
  source: string;
  warnings: string[];
};

export type StandaloneOpeningBatchRequest = {
  symbols: string[];
  config?: OpeningBreakoutConfig | null;
  include_rejected?: boolean;
};

export type StandaloneOpeningBatchResponse = {
  generated_at: string;
  rows: StandaloneOpeningResponse[];
  errors: string[];
};

type EasternParts = {
  dateKey: string;
  minuteOfDay: number;
};

const easternFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function easternParts(timestamp: string): EasternParts {
  const parts = easternFormatter.formatToParts(new Date(timestamp));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");
  return {
    dateKey:
      String(year).padStart(4, "0") +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0"),
    minuteOfDay: hour * 60 + minute,
  };
}

function closeLocation(bar: OHLCVBar): number {
  const spread = bar.high - bar.low;
  return spread <= 0 ? 1 : (bar.close - bar.low) / spread;
}

function upperWickRatio(bar: OHLCVBar): number {
  const spread = bar.high - bar.low;
  return spread <= 0
    ? 0
    : (bar.high - Math.max(bar.open, bar.close)) / spread;
}

function vwap(bars: OHLCVBar[]): number | null {
  const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
  if (volume <= 0) return null;
  const weighted = bars.reduce(
    (sum, bar) =>
      sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume,
    0,
  );
  return weighted / volume;
}

function median(values: number[]): number | null {
  const clean = values.filter((value) => value >= 0).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2
    ? clean[mid]
    : (clean[mid - 1] + clean[mid]) / 2;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function gate(
  name: string,
  passed: boolean,
  value: number | string | boolean | null = null,
  threshold: number | string | null = null,
) {
  return { name, passed, value, threshold, detail: "" };
}

function configWithDefaults(
  input: OpeningBreakoutConfig | null | undefined,
): Required<OpeningBreakoutConfig> {
  return {
    opening_range_minutes: input?.opening_range_minutes ?? 15,
    min_breakout_close_pct: input?.min_breakout_close_pct ?? 0.0025,
    max_breakout_extension_pct: input?.max_breakout_extension_pct ?? 0.08,
    min_close_location: input?.min_close_location ?? 0.7,
    max_upper_wick_ratio: input?.max_upper_wick_ratio ?? 0.4,
    min_relative_volume: input?.min_relative_volume ?? 1.5,
    max_stop_risk_pct: input?.max_stop_risk_pct ?? 0.08,
    stop_buffer_pct: input?.stop_buffer_pct ?? 0.0025,
    require_vwap: input?.require_vwap ?? true,
    require_relative_volume: input?.require_relative_volume ?? true,
    require_prior_close: input?.require_prior_close ?? false,
  };
}

export function evaluateOpeningBreakout(
  symbol: string,
  sessionBars: OHLCVBar[],
  priorSessionBars: OHLCVBar[] = [],
  priorClose: number | null = null,
  rawConfig?: OpeningBreakoutConfig | null,
): OpeningBreakoutCandidate {
  const config = configWithDefaults(rawConfig);
  const cleanSymbol = symbol.trim().toUpperCase();
  const bars = [...sessionBars].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  if (!bars.length) {
    return {
      schema_version: "facsimile.opening_breakout_candidate.v1",
      symbol: cleanSymbol,
      as_of: new Date().toISOString(),
      state: "rejected",
      opening_range: null,
      breakout_bar: null,
      entry_price: null,
      structural_stop: null,
      stop_risk_pct: null,
      vwap: null,
      relative_volume: null,
      scores: null,
      gates: [],
      reasons: ["no intraday bars supplied"],
      metrics: {},
    };
  }

  const openMinute = 9 * 60 + 30;
  const rangeEnd = openMinute + config.opening_range_minutes;
  const regular = bars.filter((bar) => easternParts(bar.timestamp).minuteOfDay >= openMinute);
  const rangeBars = regular.filter(
    (bar) => easternParts(bar.timestamp).minuteOfDay < rangeEnd,
  );
  const breakoutBars = regular.filter(
    (bar) => easternParts(bar.timestamp).minuteOfDay >= rangeEnd,
  );

  if (!rangeBars.length) {
    return {
      schema_version: "facsimile.opening_breakout_candidate.v1",
      symbol: cleanSymbol,
      as_of: bars[bars.length - 1].timestamp,
      state: "rejected",
      opening_range: null,
      breakout_bar: null,
      entry_price: null,
      structural_stop: null,
      stop_risk_pct: null,
      vwap: null,
      relative_volume: null,
      scores: null,
      gates: [],
      reasons: ["opening range is incomplete"],
      metrics: {},
    };
  }

  const openingHigh = Math.max(...rangeBars.map((bar) => bar.high));
  const openingLow = Math.min(...rangeBars.map((bar) => bar.low));
  const openingVolume = rangeBars.reduce((sum, bar) => sum + bar.volume, 0);
  const openingRange: OpeningRange = {
    start: rangeBars[0].timestamp,
    end: rangeBars[rangeBars.length - 1].timestamp,
    high: openingHigh,
    low: openingLow,
    volume: openingVolume,
    bars: rangeBars.length,
    width_pct: openingLow > 0 ? (openingHigh - openingLow) / openingLow : 0,
  };

  if (!breakoutBars.length) {
    return {
      schema_version: "facsimile.opening_breakout_candidate.v1",
      symbol: cleanSymbol,
      as_of: rangeBars[rangeBars.length - 1].timestamp,
      state: "developing",
      opening_range: openingRange,
      breakout_bar: null,
      entry_price: null,
      structural_stop: null,
      stop_risk_pct: null,
      vwap: vwap(rangeBars),
      relative_volume: null,
      scores: null,
      gates: [],
      reasons: ["opening range formed; no post-range bar yet"],
      metrics: {
        opening_range_high: openingHigh,
        opening_range_low: openingLow,
        opening_range_width_pct: openingRange.width_pct,
      },
    };
  }

  const breakoutBar =
    breakoutBars.find(
      (bar) =>
        bar.close >=
        openingHigh * (1 + config.min_breakout_close_pct),
    ) ?? breakoutBars[breakoutBars.length - 1];

  const throughBreakout = regular.filter(
    (bar) => bar.timestamp <= breakoutBar.timestamp,
  );
  const currentVwap = vwap(throughBreakout);
  const breakoutMinute = easternParts(breakoutBar.timestamp).minuteOfDay;
  let referenceVolumes = priorSessionBars
    .filter(
      (bar) => easternParts(bar.timestamp).minuteOfDay === breakoutMinute,
    )
    .map((bar) => bar.volume);
  if (!referenceVolumes.length) {
    referenceVolumes = priorSessionBars.slice(-20).map((bar) => bar.volume);
  }
  const reference = median(referenceVolumes);
  const relativeVolume =
    reference !== null && reference > 0
      ? breakoutBar.volume / reference
      : null;

  const breakoutPct = breakoutBar.close / openingHigh - 1;
  const candleLocation = closeLocation(breakoutBar);
  const wick = upperWickRatio(breakoutBar);
  const structuralStop = openingHigh * (1 - config.stop_buffer_pct);
  const stopRisk =
    breakoutBar.close > structuralStop
      ? (breakoutBar.close - structuralStop) / breakoutBar.close
      : 0;

  const resolvedPriorClose =
    priorClose ??
    (priorSessionBars.length
      ? priorSessionBars[priorSessionBars.length - 1].close
      : null);

  const gates = [
    gate(
      "breakout_close",
      breakoutPct >= config.min_breakout_close_pct,
      breakoutPct,
      config.min_breakout_close_pct,
    ),
    gate(
      "breakout_extension",
      breakoutPct <= config.max_breakout_extension_pct,
      breakoutPct,
      config.max_breakout_extension_pct,
    ),
    gate(
      "close_location",
      candleLocation >= config.min_close_location,
      candleLocation,
      config.min_close_location,
    ),
    gate(
      "upper_wick",
      wick <= config.max_upper_wick_ratio,
      wick,
      config.max_upper_wick_ratio,
    ),
    gate(
      "structural_risk",
      stopRisk > 0 && stopRisk <= config.max_stop_risk_pct,
      stopRisk,
      config.max_stop_risk_pct,
    ),
  ];

  if (config.require_vwap) {
    gates.push(
      gate(
        "above_vwap",
        currentVwap !== null && breakoutBar.close > currentVwap,
        breakoutBar.close,
        currentVwap,
      ),
    );
  }

  if (config.require_relative_volume) {
    gates.push(
      gate(
        "relative_volume",
        relativeVolume !== null &&
          relativeVolume >= config.min_relative_volume,
        relativeVolume,
        config.min_relative_volume,
      ),
    );
  }

  if (config.require_prior_close) {
    gates.push(
      gate(
        "above_prior_close",
        resolvedPriorClose !== null &&
          breakoutBar.close > resolvedPriorClose,
        breakoutBar.close,
        resolvedPriorClose,
      ),
    );
  }

  const confirmed = gates.every((item) => item.passed);
  const developing =
    breakoutBar.high > openingHigh && breakoutBar.close <= openingHigh;
  const state = confirmed
    ? "confirmed"
    : developing
      ? "developing"
      : "rejected";

  const triggerScore = clamp(
    55 +
      (breakoutPct / Math.max(config.min_breakout_close_pct, 0.001)) * 12 +
      candleLocation * 20 +
      (1 - wick) * 13,
  );
  const volumeScore =
    relativeVolume !== null ? clamp((relativeVolume / 2) * 100) : 50;
  const vwapScore =
    currentVwap !== null && breakoutBar.close > currentVwap ? 100 : 0;
  const structureScore = clamp(
    100 - (Math.min(openingRange.width_pct, 0.2) / 0.2) * 100,
  );
  const riskScore =
    stopRisk > 0
      ? clamp(100 * (1 - stopRisk / config.max_stop_risk_pct))
      : 0;
  const overall = clamp(
    triggerScore * 0.35 +
      volumeScore * 0.2 +
      vwapScore * 0.15 +
      structureScore * 0.1 +
      riskScore * 0.2,
  );

  return {
    schema_version: "facsimile.opening_breakout_candidate.v1",
    symbol: cleanSymbol,
    as_of: breakoutBar.timestamp,
    state,
    opening_range: openingRange,
    breakout_bar: breakoutBar,
    entry_price: breakoutBar.close,
    structural_stop: structuralStop,
    stop_risk_pct: stopRisk,
    vwap: currentVwap,
    relative_volume: relativeVolume,
    scores: {
      trigger: Math.round(triggerScore * 10) / 10,
      volume: Math.round(volumeScore * 10) / 10,
      vwap: Math.round(vwapScore * 10) / 10,
      structure: Math.round(structureScore * 10) / 10,
      risk: Math.round(riskScore * 10) / 10,
      overall: Math.round(overall * 10) / 10,
    },
    gates,
    reasons: confirmed
      ? []
      : gates
          .filter((item) => !item.passed)
          .map((item) => "failed gate: " + item.name),
    metrics: {
      opening_range_high: openingHigh,
      opening_range_low: openingLow,
      opening_range_width_pct: openingRange.width_pct,
      opening_range_volume: openingVolume,
      breakout_pct: breakoutPct,
      close_location: candleLocation,
      upper_wick_ratio: wick,
      vwap: currentVwap,
      relative_volume: relativeVolume,
      prior_close: resolvedPriorClose,
    },
  };
}

export async function standaloneOpeningBreakout(
  symbol: string,
  config?: OpeningBreakoutConfig | null,
): Promise<StandaloneOpeningResponse> {
  const clean = symbol.trim().toUpperCase();
  const bars = await yahooIntradayBars(clean, "5d", "5m");
  if (!bars.length) {
    throw new Error("No five-minute history returned for " + clean + ".");
  }

  const groups = new Map<string, OHLCVBar[]>();
  for (const bar of bars) {
    const key = easternParts(bar.timestamp).dateKey;
    const group = groups.get(key) ?? [];
    group.push(bar);
    groups.set(key, group);
  }
  const dates = [...groups.keys()].sort();
  const sessionDate = dates[dates.length - 1];
  const current = groups.get(sessionDate) ?? [];
  const prior = dates.length > 1 ? groups.get(dates[dates.length - 2]) ?? [] : [];
  const priorClose = prior.length ? prior[prior.length - 1].close : null;
  const candidate = evaluateOpeningBreakout(
    clean,
    current,
    prior,
    priorClose,
    config,
  );

  const lastPrice = current[current.length - 1]?.close ?? candidate.entry_price ?? 0;
  return {
    symbol: clean,
    profile: {
      symbol: clean,
      company: clean,
      price: lastPrice,
      sector: null,
      industry: null,
      exchange: null,
      market_cap: null,
      source: "yahoo_intraday_native",
    },
    session_date: sessionDate,
    bars: current,
    prior_session_bars: prior,
    candidate,
    source: "Yahoo Finance 5m native",
    warnings:
      prior.length > 0
        ? []
        : [
            "Prior-session intraday history was unavailable; relative-volume confirmation may remain unresolved.",
          ],
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, items.length)) },
      () => worker(),
    ),
  );
  return results;
}

export async function standaloneOpeningBatch(
  request: StandaloneOpeningBatchRequest,
): Promise<StandaloneOpeningBatchResponse> {
  const symbols = [...new Set(
    request.symbols
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  )].slice(0, 12);

  const errors: string[] = [];
  const results = await mapWithConcurrency(symbols, 4, async (symbol) => {
    try {
      return await standaloneOpeningBreakout(symbol, request.config);
    } catch (error) {
      errors.push(
        symbol +
          ": " +
          (error instanceof Error ? error.message : "intraday lookup failed"),
      );
      return null;
    }
  });

  const rows = results.filter(
    (value): value is StandaloneOpeningResponse => value !== null,
  );
  const visible = request.include_rejected
    ? rows
    : rows.filter((row) => row.candidate.state !== "rejected");

  visible.sort((a, b) => {
    const weight = (state: OpeningBreakoutCandidate["state"]) =>
      state === "confirmed" ? 2 : state === "developing" ? 1 : 0;
    const aKey = [
      weight(a.candidate.state),
      a.candidate.scores?.overall ?? 0,
      a.candidate.relative_volume ?? 0,
      -(a.candidate.stop_risk_pct ?? 1),
    ];
    const bKey = [
      weight(b.candidate.state),
      b.candidate.scores?.overall ?? 0,
      b.candidate.relative_volume ?? 0,
      -(b.candidate.stop_risk_pct ?? 1),
    ];
    for (let index = 0; index < aKey.length; index += 1) {
      if (aKey[index] !== bKey[index]) return bKey[index] - aKey[index];
    }
    return 0;
  });

  return {
    generated_at: new Date().toISOString(),
    rows: visible,
    errors,
  };
}
