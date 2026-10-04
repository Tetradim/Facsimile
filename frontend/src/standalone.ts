import { CapacitorHttp } from "@capacitor/core";
import {
  buildMobileIntelligence,
  evaluateMobileStrategy,
  fetchSecFilings,
  fetchStructuredCatalysts,
  mobileStrategyFacts,
  structuredCatalystScore,
  type MobileIntelligence,
  type MobileStrategy,
  type MobileStrategyEvaluation,
  type StructuredCatalyst,
} from "./mobileIntelligence";

export type StandaloneNews = {
  symbol: string;
  title: string;
  publisher: string;
  published_at: string | null;
  url: string;
  summary: string;
  source: string;
};

export type StandaloneProvider = {
  name: string;
  kind: string;
  configured: boolean;
  zero_key: boolean;
  capabilities: string[];
  detail: string;
};

export type StandaloneProfile = {
  symbol: string;
  company: string;
  price: number;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  market_cap: number | null;
  source: string;
};

export type StandaloneScanRequest = {
  min_price?: number;
  max_price?: number;
  sector?: string;
  require_recent_news?: boolean;
  news_lookback_days?: number;
  max_candidates?: number;
  max_results?: number;
  include_rejected?: boolean;
  include_structured_catalysts?: boolean;
  strategy?: MobileStrategy | null;
  require_strategy_match?: boolean;
};

export type StandaloneScanResponse = {
  generated_at: string;
  query: StandaloneScanRequest;
  discovered_count: number;
  scanned_count: number;
  rows: StandaloneScanRow[];
  providers: StandaloneProvider[];
  warnings: string[];
};

export type OHLCVBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ConsolidationBox = {
  start: string;
  end: string;
  bars: number;
  body_low: number;
  body_high: number;
  width_pct: number;
};

type Gate = {
  name: string;
  passed: boolean;
  value: number | string | boolean | null;
  threshold: number | string | null;
  detail: string;
};

type ScoreCard = {
  quality: number | null;
  growth: number | null;
  momentum: number;
  breakout: number;
  risk: number;
  positional: number;
  entry: number;
  overall: number;
};

export type BreakoutCandidate = {
  schema_version: string;
  symbol: string;
  as_of: string;
  state: "rejected" | "developing" | "confirmed";
  box: ConsolidationBox | null;
  entry_price: number | null;
  structural_stop: number | null;
  stop_risk_pct: number | null;
  gates: Gate[];
  scores: ScoreCard | null;
  metrics: Record<string, number | string | boolean | null>;
  reasons: string[];
  metadata: Record<string, unknown>;
};

export type StandaloneScanRow = {
  profile: StandaloneProfile;
  candidate: BreakoutCandidate;
  news: StandaloneNews[];
  catalysts: StructuredCatalyst[];
  catalyst_score: number;
  intelligence: MobileIntelligence | null;
  strategy_evaluation: MobileStrategyEvaluation | null;
  rank: number | null;
  data_sources: string[];
  error: string | null;
};

type BreakoutConfig = {
  min_box_bars: number;
  max_box_bars: number;
  max_box_width_pct: number;
  ma_period: number;
  high_lookback: number;
  min_close_above_box_pct: number;
  min_weekly_gain_pct: number;
  max_weekly_gain_pct: number;
  min_close_location: number;
  max_upper_wick_ratio: number;
  min_volume_ratio: number;
  volume_average_bars: number;
  structural_stop_position: number;
  max_stop_risk_pct: number;
};

const YAHOO_ROOT = "https://query1.finance.yahoo.com";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Facsimile/0.3) AppleWebKit/537.36 Mobile Safari/537.36";

const MEDICAL_ALIASES = new Set([
  "medical",
  "health",
  "health care",
  "healthcare",
  "biotech",
  "biotechnology",
  "pharmaceuticals",
  "pharma",
]);

const CATALYST_TERMS: Record<string, number> = {
  fda: 30,
  "phase 3": 28,
  "phase iii": 28,
  "phase 2": 22,
  "phase ii": 22,
  "clinical trial": 22,
  topline: 22,
  "interim results": 20,
  "data readout": 22,
  approval: 25,
  pdufa: 30,
  breakthrough: 20,
  "fast track": 18,
  "orphan drug": 16,
  partnership: 14,
  collaboration: 12,
  acquisition: 18,
  merger: 16,
  financing: 8,
  offering: 6,
  earnings: 8,
};

function medicalConfig(): BreakoutConfig {
  return {
    min_box_bars: 6,
    max_box_bars: 12,
    max_box_width_pct: 0.18,
    ma_period: 20,
    high_lookback: 10,
    min_close_above_box_pct: 0.02,
    min_weekly_gain_pct: 0.02,
    max_weekly_gain_pct: 0.20,
    min_close_location: 0.80,
    max_upper_wick_ratio: 0.35,
    min_volume_ratio: 1.50,
    volume_average_bars: 6,
    structural_stop_position: 0.33,
    max_stop_risk_pct: 0.15,
  };
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function safeNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function makeGate(
  name: string,
  passed: boolean,
  value: Gate["value"] = null,
  threshold: Gate["threshold"] = null,
  detail = "",
): Gate {
  return { name, passed, value, threshold, detail };
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const out = [values[0]];
  for (const value of values.slice(1)) {
    out.push(value * alpha + out[out.length - 1] * (1 - alpha));
  }
  return out;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

function macd(values: number[]): [number | null, number | null] {
  if (values.length < 35) return [null, null];
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = fast.map((value, index) => value - slow[index]);
  const signal = emaSeries(line, 9);
  return [line.at(-1) ?? null, signal.at(-1) ?? null];
}

function closeLocation(bar: OHLCVBar): number {
  const spread = bar.high - bar.low;
  return spread <= 0 ? 1 : (bar.close - bar.low) / spread;
}

function upperWickRatio(bar: OHLCVBar): number {
  const spread = bar.high - bar.low;
  return spread <= 0 ? 0 : (bar.high - Math.max(bar.open, bar.close)) / spread;
}

function relativeVolume(
  bars: OHLCVBar[],
  averageBars: number,
): [number | null, number | null] {
  if (bars.length < 2) return [null, null];
  const current = bars.at(-1)!.volume;
  const previous = bars.at(-2)!.volume;
  const previousRatio = previous > 0 ? current / previous : null;
  const prior = bars.slice(-(averageBars + 1), -1).map((bar) => bar.volume);
  const average = prior.length
    ? prior.reduce((sum, value) => sum + value, 0) / prior.length
    : 0;
  return [previousRatio, average > 0 ? current / average : null];
}

function natr(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period) return null;
  const ranges: number[] = [];
  let previousClose: number | null = null;
  for (const bar of bars) {
    const tr =
      previousClose === null
        ? bar.high - bar.low
        : Math.max(
            bar.high - bar.low,
            Math.abs(bar.high - previousClose),
            Math.abs(bar.low - previousClose),
          );
    ranges.push(tr);
    previousClose = bar.close;
  }
  const recent = ranges.slice(-period);
  const atr = recent.reduce((sum, value) => sum + value, 0) / period;
  const close = bars.at(-1)?.close ?? 0;
  return close > 0 ? atr / close : null;
}

function findBox(
  history: OHLCVBar[],
  config: BreakoutConfig,
): ConsolidationBox | null {
  let best: ConsolidationBox | null = null;
  const maxLookback = Math.min(config.max_box_bars, history.length);

  for (let size = config.min_box_bars; size <= maxLookback; size += 1) {
    const window = history.slice(-size);
    const bodyHigh = Math.max(...window.map((bar) => Math.max(bar.open, bar.close)));
    const bodyLow = Math.min(...window.map((bar) => Math.min(bar.open, bar.close)));
    if (bodyLow <= 0) continue;
    const width = (bodyHigh - bodyLow) / bodyLow;
    if (width > config.max_box_width_pct) continue;

    const candidate: ConsolidationBox = {
      start: window[0].timestamp,
      end: window.at(-1)!.timestamp,
      bars: size,
      body_low: bodyLow,
      body_high: bodyHigh,
      width_pct: width,
    };

    if (
      best === null ||
      candidate.width_pct < best.width_pct ||
      (candidate.width_pct === best.width_pct && candidate.bars > best.bars)
    ) {
      best = candidate;
    }
  }
  return best;
}

function breakoutScore(
  box: ConsolidationBox,
  breakoutOverBox: number,
  closeLoc: number,
  wickRatio: number,
  volumeRatio: number | null,
  config: BreakoutConfig,
): number {
  const tightness = clamp(
    (1 - box.width_pct / config.max_box_width_pct) * 25,
    0,
    25,
  );
  const duration = clamp((box.bars / config.max_box_bars) * 15, 0, 15);
  const strength = clamp(
    (breakoutOverBox / Math.max(config.min_close_above_box_pct, 0.005)) * 20,
    0,
    20,
  );
  const closeQuality = clamp(closeLoc * 20, 0, 20);
  const wickQuality = clamp((1 - wickRatio) * 10, 0, 10);
  const volume = clamp(((volumeRatio ?? 0) / 1.5) * 10, 0, 10);
  return clamp(
    tightness + duration + strength + closeQuality + wickQuality + volume,
  );
}

function momentumScore(
  current: OHLCVBar,
  maValue: number | null,
  macdLine: number | null,
  macdSignal: number | null,
  volumeRatio: number | null,
  priorHigh: number,
): number {
  let score = 0;
  score += maValue !== null && current.close > maValue ? 25 : 0;
  score +=
    macdLine !== null && macdSignal !== null && macdLine > macdSignal ? 30 : 0;
  score +=
    current.close >= priorHigh
      ? 25
      : clamp((current.close / priorHigh) * 25, 0, 25);
  if (volumeRatio !== null) {
    score += clamp((volumeRatio / 1.5) * 20, 0, 20);
  }
  return clamp(score);
}

function rejectedCandidate(symbol: string, reason: string): BreakoutCandidate {
  return {
    schema_version: "facsimile.breakout_candidate.v1",
    symbol,
    as_of: new Date().toISOString(),
    state: "rejected",
    box: null,
    entry_price: null,
    structural_stop: null,
    stop_risk_pct: null,
    gates: [],
    scores: null,
    metrics: {},
    reasons: [reason],
    metadata: {
      engine: "weekly_consolidation_breakout_ts",
      execution: "none",
      platform: "android_standalone",
    },
  };
}

function evaluateBreakout(
  symbol: string,
  inputBars: OHLCVBar[],
  config = medicalConfig(),
): BreakoutCandidate {
  const bars = [...inputBars].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const required = Math.max(
    config.ma_period + 1,
    35,
    config.high_lookback + config.min_box_bars + 1,
  );
  if (bars.length < required) {
    return rejectedCandidate(
      symbol,
      `insufficient weekly history: need at least ${required} bars`,
    );
  }

  const current = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const box = findBox(bars.slice(0, -1), config);
  if (!box) {
    return rejectedCandidate(symbol, "no qualifying consolidation box found");
  }

  const closesBeforeCurrent = bars.slice(0, -1).map((bar) => bar.close);
  const maValue = sma(closesBeforeCurrent, config.ma_period);
  const [macdLine, macdSignal] = macd(closesBeforeCurrent);
  const priorHigh = Math.max(
    ...bars
      .slice(-(config.high_lookback + 1), -1)
      .map((bar) => bar.high),
  );

  const weeklyGain = current.close / previous.close - 1;
  const breakoutOverBox = current.close / box.body_high - 1;
  const location = closeLocation(current);
  const wick = upperWickRatio(current);
  const [previousVolRatio, averageVolRatio] = relativeVolume(
    bars,
    config.volume_average_bars,
  );
  const volumeReference = averageVolRatio ?? previousVolRatio;

  const stop =
    box.body_low +
    config.structural_stop_position * (box.body_high - box.body_low);
  const stopRisk =
    current.close > stop ? (current.close - stop) / current.close : 0;

  const gates: Gate[] = [
    makeGate(
      "box_width",
      box.width_pct <= config.max_box_width_pct,
      box.width_pct,
      config.max_box_width_pct,
    ),
    makeGate(
      "close_above_box",
      breakoutOverBox >= config.min_close_above_box_pct,
      breakoutOverBox,
      config.min_close_above_box_pct,
    ),
    makeGate(
      "weekly_gain_min",
      weeklyGain >= config.min_weekly_gain_pct,
      weeklyGain,
      config.min_weekly_gain_pct,
    ),
    makeGate(
      "weekly_gain_max",
      weeklyGain <= config.max_weekly_gain_pct,
      weeklyGain,
      config.max_weekly_gain_pct,
    ),
    makeGate(
      "close_location",
      location >= config.min_close_location,
      location,
      config.min_close_location,
    ),
    makeGate(
      "upper_wick",
      wick <= config.max_upper_wick_ratio,
      wick,
      config.max_upper_wick_ratio,
    ),
    makeGate(
      "structural_risk",
      stopRisk > 0 && stopRisk <= config.max_stop_risk_pct,
      stopRisk,
      config.max_stop_risk_pct,
    ),
    makeGate(
      "trend_ma",
      maValue !== null && current.close > maValue,
      current.close,
      maValue,
    ),
    makeGate(
      "macd_bullish",
      macdLine !== null && macdSignal !== null && macdLine > macdSignal,
      macdLine,
      macdSignal,
    ),
    makeGate(
      "lookback_high",
      current.close >= priorHigh,
      current.close,
      priorHigh,
    ),
    makeGate(
      "volume",
      volumeReference !== null &&
        volumeReference >= config.min_volume_ratio,
      volumeReference,
      config.min_volume_ratio,
    ),
  ];

  const hardPass = gates.every((gate) => gate.passed);
  const developing = current.high > box.body_high && current.close <= box.body_high;
  const state: BreakoutCandidate["state"] = hardPass
    ? "confirmed"
    : developing
      ? "developing"
      : "rejected";

  const momentum = momentumScore(
    current,
    maValue,
    macdLine,
    macdSignal,
    volumeReference,
    priorHigh,
  );
  const breakout = breakoutScore(
    box,
    breakoutOverBox,
    location,
    wick,
    volumeReference,
    config,
  );
  const risk =
    stopRisk > 0
      ? clamp(100 * (1 - stopRisk / config.max_stop_risk_pct))
      : 0;
  const positional = momentum;
  const entry = breakout * 0.65 + risk * 0.35;
  const overall = positional * 0.5 + entry * 0.5;
  const failed = gates.filter((gate) => !gate.passed).map((gate) => gate.name);

  return {
    schema_version: "facsimile.breakout_candidate.v1",
    symbol: symbol.toUpperCase(),
    as_of: current.timestamp,
    state,
    box,
    entry_price: current.close,
    structural_stop: stop,
    stop_risk_pct: stopRisk,
    gates,
    scores: {
      quality: null,
      growth: null,
      momentum,
      breakout,
      risk,
      positional,
      entry,
      overall,
    },
    metrics: {
      weekly_gain_pct: weeklyGain,
      close_above_box_pct: breakoutOverBox,
      close_location: location,
      upper_wick_ratio: wick,
      volume_vs_previous: previousVolRatio,
      volume_vs_average: averageVolRatio,
      ma_value: maValue,
      macd: macdLine,
      macd_signal: macdSignal,
      prior_high: priorHigh,
      natr_14: natr(bars.slice(0, -1), 14),
    },
    reasons: hardPass ? [] : failed.map((name) => `failed gate: ${name}`),
    metadata: {
      engine: "weekly_consolidation_breakout_ts",
      execution: "none",
      data_contract: "completed_weekly_bars",
      platform: "android_standalone",
    },
  };
}

async function nativeJson<T>(
  method: "GET" | "POST",
  url: string,
  data?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await CapacitorHttp.request({
    method,
    url,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      ...extraHeaders,
    },
    data,
    connectTimeout: 15000,
    readTimeout: 25000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }
  return response.data as T;
}

function yahooQuery(
  operator: string,
  operands: unknown[],
): Record<string, unknown> {
  return {
    operator: operator.toUpperCase(),
    operands,
  };
}

function parseNasdaqPrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return safeNumber(String(value).replace(/[$,]/g, "").trim());
}

function matchesRequestedSector(
  sector: string | null,
  industry: string | null,
  requested: string,
): boolean {
  const wanted = requested.trim().toLowerCase();
  if (!wanted || ["all", "all sectors"].includes(wanted)) return true;

  const sectorText = (sector ?? "").toLowerCase();
  const industryText = (industry ?? "").toLowerCase();

  if (MEDICAL_ALIASES.has(wanted)) {
    return (
      sectorText.includes("health") ||
      ["biotech", "pharma", "medical", "diagnostic", "drug", "life science"]
        .some((term) => industryText.includes(term))
    );
  }

  return sectorText.includes(wanted) || industryText.includes(wanted);
}

async function screenNasdaq(
  request: Required<
    Pick<
      StandaloneScanRequest,
      "min_price" | "max_price" | "sector" | "max_candidates"
    >
  >,
): Promise<StandaloneProfile[]> {
  const url =
    "https://api.nasdaq.com/api/screener/stocks" +
    "?tableonly=true&limit=10000&offset=0&download=true";

  const payload = await nativeJson<{
    data?: {
      rows?: Array<Record<string, unknown>>;
    };
    status?: {
      bCodeMessage?: Array<Record<string, unknown>>;
    };
  }>(
    "GET",
    url,
    undefined,
    {
      Accept: "application/json,text/plain,*/*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/market-activity/stocks/screener",
    },
  );

  const rows = payload.data?.rows ?? [];
  const profiles: StandaloneProfile[] = [];
  for (const row of rows) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const price = parseNasdaqPrice(row.lastsale);
    const sector = row.sector ? String(row.sector) : null;
    const industry = row.industry ? String(row.industry) : null;

    if (!symbol || price === null || price <= 0) continue;
    if (price < request.min_price || price > request.max_price) continue;
    if (!matchesRequestedSector(sector, industry, request.sector)) continue;

    profiles.push({
      symbol,
      company: String(row.name ?? symbol),
      price,
      sector,
      industry,
      exchange: null,
      market_cap: safeNumber(row.marketCap),
      source: "nasdaq_screener_native",
    });
  }

  profiles.sort((a, b) => b.price - a.price);
  return profiles.slice(0, request.max_candidates);
}

async function screenYahoo(
  request: Required<
    Pick<
      StandaloneScanRequest,
      "min_price" | "max_price" | "sector" | "max_candidates"
    >
  >,
): Promise<StandaloneProfile[]> {
  const filters: Record<string, unknown>[] = [
    yahooQuery("eq", ["region", "us"]),
    yahooQuery("btwn", ["intradayprice", request.min_price, request.max_price]),
  ];

  const normalizedSector = request.sector.trim().toLowerCase();
  if (normalizedSector && !["all", "all sectors"].includes(normalizedSector)) {
    const yahooSector = MEDICAL_ALIASES.has(normalizedSector)
      ? "Healthcare"
      : request.sector;
    filters.push(yahooQuery("eq", ["sector", yahooSector]));
  }

  const body = {
    offset: 0,
    size: Math.min(250, Math.max(request.max_candidates * 3, 60)),
    sortField: "eodvolume",
    sortType: "DESC",
    userId: "",
    userIdType: "guid",
    quoteType: "EQUITY",
    query: yahooQuery("and", filters),
  };
  const url =
    `${YAHOO_ROOT}/v1/finance/screener?corsDomain=finance.yahoo.com&formatted=false&lang=en-US&region=US`;

  const payload = await nativeJson<{
    finance?: {
      result?: Array<{ quotes?: Array<Record<string, unknown>> }>;
      error?: unknown;
    };
  }>("POST", url, body);

  const quotes = payload.finance?.result?.[0]?.quotes ?? [];
  const profiles: StandaloneProfile[] = [];
  for (const quote of quotes) {
    const symbol = String(quote.symbol ?? "").trim().toUpperCase();
    const price =
      safeNumber(quote.regularMarketPrice) ??
      safeNumber(quote.intradayprice) ??
      safeNumber(quote.postMarketPrice);
    if (!symbol || price === null) continue;
    if (price < request.min_price || price > request.max_price) continue;

    profiles.push({
      symbol,
      company: String(
        quote.shortName ?? quote.longName ?? quote.displayName ?? symbol,
      ),
      price,
      sector: quote.sector ? String(quote.sector) : null,
      industry: quote.industry ? String(quote.industry) : null,
      exchange: quote.exchange ? String(quote.exchange) : null,
      market_cap:
        safeNumber(quote.marketCap) ?? safeNumber(quote.intradaymarketcap),
      source: "yahoo_screener_native",
    });
  }
  return profiles.slice(0, request.max_candidates);
}

function currentWeekMayBeIncomplete(): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date());
  return !["Sat", "Sun"].includes(weekday);
}

async function yahooWeeklyBars(symbol: string): Promise<OHLCVBar[]> {
  const url =
    `${YAHOO_ROOT}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?range=2y&interval=1wk&includePrePost=false&events=history";
  const payload = await nativeJson<{
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  }>("GET", url);

  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  if (!quote || !timestamps.length) return [];

  const bars: OHLCVBar[] = [];
  timestamps.forEach((timestamp, index) => {
    const open = safeNumber(quote.open?.[index]);
    const high = safeNumber(quote.high?.[index]);
    const low = safeNumber(quote.low?.[index]);
    const close = safeNumber(quote.close?.[index]);
    const volume = safeNumber(quote.volume?.[index]);
    if ([open, high, low, close, volume].some((value) => value === null)) return;
    if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0) return;
    bars.push({
      timestamp: new Date(timestamp * 1000).toISOString(),
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: Math.max(0, volume!),
    });
  });

  if (currentWeekMayBeIncomplete() && bars.length > 1) {
    return bars.slice(0, -1);
  }
  return bars;
}

async function yahooNews(
  symbol: string,
  count = 12,
): Promise<StandaloneNews[]> {
  const url =
    `${YAHOO_ROOT}/v1/finance/search?q=${encodeURIComponent(symbol)}` +
    `&quotesCount=1&newsCount=${count}&listsCount=0&enableFuzzyQuery=false`;
  const payload = await nativeJson<{
    news?: Array<Record<string, unknown>>;
  }>("GET", url);

  return (payload.news ?? [])
    .map((item): StandaloneNews | null => {
      const title = String(item.title ?? "").trim();
      if (!title) return null;
      const epoch = safeNumber(item.providerPublishTime);
      return {
        symbol,
        title,
        publisher: String(item.publisher ?? "Yahoo Finance"),
        published_at:
          epoch === null ? null : new Date(epoch * 1000).toISOString(),
        url: String(item.link ?? item.url ?? ""),
        summary: String(item.summary ?? ""),
        source: "yahoo_native",
      };
    })
    .filter((item): item is StandaloneNews => item !== null);
}

function catalystScore(news: StandaloneNews[]): number {
  if (!news.length) return 0;
  const now = Date.now();
  let best = 0;
  for (const item of news) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    let score = 15;
    for (const [term, points] of Object.entries(CATALYST_TERMS)) {
      if (text.includes(term)) score += points;
    }
    if (item.published_at) {
      const ageDays = Math.max(
        0,
        (now - new Date(item.published_at).getTime()) / 86_400_000,
      );
      score += Math.max(0, 25 - ageDays * 2);
    }
    best = Math.max(best, Math.min(100, score));
  }
  return Math.round(best * 10) / 10;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export function standaloneProviderStatus(): StandaloneProvider[] {
  return [
    {
      name: "Nasdaq Screener Native",
      kind: "universe",
      configured: true,
      zero_key: true,
      capabilities: [
        "US listed stocks",
        "current screener price",
        "sector",
        "industry",
        "market cap",
      ],
      detail:
        "On-device access to Nasdaq's public stock-screener web endpoint. No PC or API key required.",
    },
    {
      name: "Yahoo Finance Native",
      kind: "market+news",
      configured: true,
      zero_key: true,
      capabilities: [
        "US equity screener",
        "weekly OHLCV",
        "quotes",
        "company news",
      ],
      detail:
        "Direct on-device HTTPS via Capacitor native HTTP. No PC or API key required.",
    },
    {
      name: "SEC EDGAR Native",
      kind: "filings",
      configured: true,
      zero_key: true,
      capabilities: ["8-K", "10-Q", "10-K", "6-K", "S-1", "S-3", "424B5"],
      detail: "Direct on-device SEC filing evidence for catalyst and dilution risk.",
    },
    {
      name: "ClinicalTrials.gov Native",
      kind: "catalyst",
      configured: true,
      zero_key: true,
      capabilities: ["trial phase", "status", "completion dates"],
      detail: "Structured medical catalyst evidence retrieved on-device.",
    },
    {
      name: "openFDA Drugs@FDA Native",
      kind: "catalyst",
      configured: true,
      zero_key: true,
      capabilities: ["drug applications", "submission dates", "submission status"],
      detail: "Structured FDA evidence retrieved on-device.",
    },
    {
      name: "Facsimile On-device Intelligence Engine",
      kind: "scanner",
      configured: true,
      zero_key: true,
      capabilities: [
        "weekly consolidation boxes",
        "MACD",
        "20-week MA",
        "relative volume",
        "structural risk",
        "tier ranking",
        "SPY relative strength",
        "liquidity",
        "dilution safety",
        "explainable scores",
        "strategy evaluation",
      ],
      detail: "TypeScript breakout and Intelligence Workbench engine.",
    },
  ];
}

export async function runStandaloneWeeklyScan(
  rawRequest: StandaloneScanRequest,
): Promise<StandaloneScanResponse> {
  const request = {
    min_price: rawRequest.min_price ?? 0.1,
    max_price: rawRequest.max_price ?? 2.5,
    sector: rawRequest.sector ?? "Medical",
    require_recent_news: rawRequest.require_recent_news ?? true,
    news_lookback_days: rawRequest.news_lookback_days ?? 14,
    max_candidates: Math.min(rawRequest.max_candidates ?? 35, 60),
    max_results: Math.min(rawRequest.max_results ?? 30, 60),
    include_rejected: rawRequest.include_rejected ?? true,
    include_structured_catalysts:
      rawRequest.include_structured_catalysts ?? true,
    strategy: rawRequest.strategy ?? null,
    require_strategy_match: rawRequest.require_strategy_match ?? true,
  };
  if (request.min_price > request.max_price) {
    throw new Error("Minimum price cannot exceed maximum price.");
  }

  const warnings: string[] = [
    "Standalone mode uses Yahoo's unofficial finance endpoints; availability and latency can change.",
  ];
  let profiles: StandaloneProfile[] = [];
  try {
    profiles = await screenNasdaq(request);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Nasdaq universe screen unavailable: ${error.message}`
        : "Nasdaq universe screen unavailable.",
    );
  }

  if (!profiles.length) {
    try {
      profiles = await screenYahoo(request);
      warnings.push("Nasdaq returned no matching rows; Yahoo screener fallback was used.");
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `No standalone universe source succeeded: ${error.message}`
          : "No standalone universe source succeeded.",
      );
    }
  }

  const cutoff = Date.now() - request.news_lookback_days * 86_400_000;
  let benchmarkBars: OHLCVBar[] = [];
  try {
    benchmarkBars = await yahooWeeklyBars("SPY");
    warnings.push("Relative strength benchmark: SPY via Yahoo native chart.");
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `SPY benchmark unavailable: ${error.message}`
        : "SPY benchmark unavailable.",
    );
  }

  const rows = await mapWithConcurrency(profiles, 6, async (profile) => {
    try {
      const isMedical = matchesRequestedSector(
        profile.sector,
        profile.industry,
        "Medical",
      );
      const [bars, rawNews, secNews, catalysts] = await Promise.all([
        yahooWeeklyBars(profile.symbol),
        yahooNews(profile.symbol),
        fetchSecFilings(profile.symbol),
        request.include_structured_catalysts && isMedical
          ? fetchStructuredCatalysts(profile.company)
          : Promise.resolve([]),
      ]);

      const combinedNews = [...rawNews, ...secNews];
      const recentNews = combinedNews
        .filter((item) => {
          if (!item.published_at) return true;
          return new Date(item.published_at).getTime() >= cutoff;
        })
        .sort((a, b) =>
          String(b.published_at ?? "").localeCompare(
            String(a.published_at ?? ""),
          ),
        );

      const headlineScore = catalystScore(recentNews);
      const registryScore = structuredCatalystScore(catalysts);
      const combinedCatalystScore = Math.max(headlineScore, registryScore);
      const candidate = evaluateBreakout(profile.symbol, bars);

      if (
        request.require_recent_news &&
        recentNews.length === 0 &&
        registryScore < 40
      ) {
        candidate.state = "rejected";
        candidate.reasons = [
          ...candidate.reasons,
          `No recent news/filing or structured catalyst in the last ${request.news_lookback_days} days`,
        ];
      }

      const intelligence = buildMobileIntelligence(
        candidate,
        bars,
        benchmarkBars,
        recentNews,
        combinedCatalystScore,
      );
      const strategyEvaluation = request.strategy
        ? evaluateMobileStrategy(
            request.strategy,
            mobileStrategyFacts(
              profile,
              candidate,
              intelligence,
              combinedCatalystScore,
            ),
          )
        : null;

      const row: StandaloneScanRow = {
        profile,
        candidate,
        news: recentNews,
        catalysts,
        catalyst_score: combinedCatalystScore,
        intelligence,
        strategy_evaluation: strategyEvaluation,
        rank: null,
        data_sources: [
          profile.source,
          "yahoo_chart_native",
          "yahoo_news_native",
          ...(secNews.length ? ["sec_edgar_native"] : []),
          ...[...new Set(catalysts.map((item) => item.source))],
          "facsimile_ts_engine",
          "facsimile_intelligence_ts",
        ],
        error: null,
      };
      return row;
    } catch (error) {
      return {
        profile,
        candidate: rejectedCandidate(
          profile.symbol,
          error instanceof Error ? error.message : "standalone scan error",
        ),
        news: [],
        catalysts: [],
        catalyst_score: 0,
        intelligence: null,
        strategy_evaluation: null,
        rank: null,
        data_sources: ["facsimile_ts_engine"],
        error: error instanceof Error ? error.message : "standalone scan error",
      } satisfies StandaloneScanRow;
    }
  });

  let visibleRows = rows.filter((row) => {
    const statePass =
      request.include_rejected || row.candidate.state !== "rejected";
    const strategyPass =
      !request.strategy ||
      !request.require_strategy_match ||
      row.strategy_evaluation?.passed === true;
    return statePass && strategyPass;
  });

  visibleRows.sort((a, b) => {
    const aKey = a.intelligence?.rank_key ?? [0, -1, 0, 0, -1];
    const bKey = b.intelligence?.rank_key ?? [0, -1, 0, 0, -1];
    for (let index = 0; index < aKey.length; index += 1) {
      if (aKey[index] !== bKey[index]) return bKey[index] - aKey[index];
    }
    return 0;
  });
  visibleRows = visibleRows.slice(0, request.max_results);
  visibleRows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const errors = rows.filter((row) => row.error).length;
  if (errors) {
    warnings.push(`${errors} symbols could not be fully retrieved from Yahoo.`);
  }

  return {
    generated_at: new Date().toISOString(),
    query: request,
    discovered_count: profiles.length,
    scanned_count: rows.length,
    rows: visibleRows,
    providers: standaloneProviderStatus(),
    warnings,
  };
}
