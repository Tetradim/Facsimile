import { CapacitorHttp } from "@capacitor/core";
import type {
  BreakoutCandidate,
  OHLCVBar,
  StandaloneNews,
} from "./standalone";

export type ScoreEvidence = {
  score: number;
  positives: string[];
  cautions: string[];
};

export type CandidateTier = "A+" | "A" | "B" | "W1" | "W2" | "X";

export type StructuredCatalyst = {
  source: string;
  kind: string;
  title: string;
  score: number;
  event_date: string | null;
  status: string | null;
  phase: string | null;
  url: string;
  summary: string;
};

export type MobileIntelligence = {
  tier: CandidateTier;
  tier_reason: string;
  rank_key: [number, number, number, number, number];
  scores: {
    technical_health: ScoreEvidence;
    setup_quality: ScoreEvidence;
    breakout_trigger: ScoreEvidence;
    relative_strength: ScoreEvidence;
    catalyst: ScoreEvidence;
    growth: ScoreEvidence;
    profitability: ScoreEvidence;
    financial_health: ScoreEvidence;
    fundamental_quality: ScoreEvidence;
    dilution_safety: ScoreEvidence;
    liquidity: ScoreEvidence;
    trade_risk: ScoreEvidence;
    overall: number;
  };
  facts: {
    dilution_risk: string;
    recent_news_count: number;
    stop_risk_pct: number | null;
    box_bars: number | null;
    box_width_pct: number | null;
    cash_runway_years: number | null;
  };
};

export type MobileStrategyCondition = {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "between" | "contains";
  value: unknown;
  timeframe?: string;
  label?: string | null;
};

export type MobileStrategy = {
  schema_version?: string;
  name: string;
  description?: string;
  all_of?: { mode?: string; conditions?: MobileStrategyCondition[] };
  any_of?: { mode?: string; conditions?: MobileStrategyCondition[] };
  none_of?: { mode?: string; conditions?: MobileStrategyCondition[] };
  metadata?: Record<string, unknown>;
};

export type MobileStrategyEvaluation = {
  strategy_name: string;
  passed: boolean;
  failed_reasons: string[];
};

const USER_AGENT =
  "FacsimileScanner/0.4 mobile research scanner contact local-user@example.com";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

async function nativeJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await CapacitorHttp.get({
    url,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...headers,
    },
    connectTimeout: 15000,
    readTimeout: 25000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }
  return response.data as T;
}

function cleanCompany(company: string): string {
  return company
    .replace(
      /\b(incorporated|inc|corp|corporation|plc|ltd|limited|holdings|holding|group)\b\.?/gi,
      "",
    )
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const candidates = [text, `${text}-01`, `${text}-01-01`];
  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

export async function fetchStructuredCatalysts(
  company: string,
): Promise<StructuredCatalyst[]> {
  const query = cleanCompany(company);
  if (query.length < 3) return [];

  const [trials, fda] = await Promise.allSettled([
    fetchClinicalTrials(query),
    fetchOpenFda(query),
  ]);
  const items = [
    ...(trials.status === "fulfilled" ? trials.value : []),
    ...(fda.status === "fulfilled" ? fda.value : []),
  ];
  const deduped = new Map<string, StructuredCatalyst>();
  for (const item of items) {
    const key = `${item.source}|${item.kind}|${item.title.toLowerCase()}`;
    const current = deduped.get(key);
    if (!current || item.score > current.score) deduped.set(key, item);
  }
  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

async function fetchClinicalTrials(query: string): Promise<StructuredCatalyst[]> {
  const params = new URLSearchParams({
    "query.spons": query,
    format: "json",
    pageSize: "10",
    sort: "LastUpdatePostDate:desc",
  });
  const payload = await nativeJson<{
    studies?: Array<Record<string, any>>;
  }>(`https://clinicaltrials.gov/api/v2/studies?${params.toString()}`);

  const now = Date.now();
  return (payload.studies ?? []).map((study) => {
    const protocol = study.protocolSection ?? {};
    const identification = protocol.identificationModule ?? {};
    const statusModule = protocol.statusModule ?? {};
    const design = protocol.designModule ?? {};
    const sponsorModule = protocol.sponsorCollaboratorsModule ?? {};
    const nctId = String(identification.nctId ?? "");
    const title = String(identification.briefTitle ?? nctId ?? "Clinical trial");
    const status = String(statusModule.overallStatus ?? "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (value) => value.toUpperCase());
    const phases = Array.isArray(design.phases) ? design.phases : [];
    const phase = phases.length
      ? phases.map((value: unknown) => String(value).replaceAll("_", " ")).join(", ")
      : null;
    const eventDate =
      parseDate(statusModule.primaryCompletionDateStruct?.date) ??
      parseDate(statusModule.completionDateStruct?.date) ??
      parseDate(statusModule.lastUpdatePostDateStruct?.date);
    const sponsor = String(sponsorModule.leadSponsor?.name ?? query);

    let score = 35;
    const phaseText = (phase ?? "").toLowerCase();
    if (phaseText.includes("phase 3")) score += 25;
    else if (phaseText.includes("phase 2")) score += 18;
    else if (phaseText.includes("phase 1")) score += 10;

    if (eventDate) {
      const days = (new Date(eventDate).getTime() - now) / 86_400_000;
      if (days >= -30 && days <= 60) score += 25;
      else if (days >= -90 && days <= 120) score += 15;
      else if (Math.abs(days) <= 365) score += 5;
    }

    return {
      source: "ClinicalTrials.gov",
      kind: "clinical_trial",
      title,
      score: Math.min(100, score),
      event_date: eventDate,
      status: status || null,
      phase,
      url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : "",
      summary: `${sponsor}; ${status || "status unavailable"}; ${phase || "phase unavailable"}.`,
    };
  });
}

async function fetchOpenFda(query: string): Promise<StructuredCatalyst[]> {
  const params = new URLSearchParams({
    search: `sponsor_name:"${query}"`,
    limit: "8",
  });
  let payload: { results?: Array<Record<string, any>> };
  try {
    payload = await nativeJson(
      `https://api.fda.gov/drug/drugsfda.json?${params.toString()}`,
    );
  } catch {
    return [];
  }

  const now = Date.now();
  const evidence: StructuredCatalyst[] = [];
  for (const record of payload.results ?? []) {
    const application = String(record.application_number ?? "");
    const products = Array.isArray(record.products) ? record.products : [];
    const label =
      products
        .map((product: any) => product.brand_name)
        .filter(Boolean)
        .slice(0, 2)
        .join(", ") || application;
    for (const submission of (record.submissions ?? []).slice(0, 5)) {
      const eventDate = parseDate(submission.submission_status_date);
      if (!eventDate) continue;
      const ageDays = Math.max(
        0,
        (now - new Date(eventDate).getTime()) / 86_400_000,
      );
      let score = 30;
      if (ageDays <= 30) score += 35;
      else if (ageDays <= 90) score += 25;
      else if (ageDays <= 365) score += 10;
      const status = String(submission.submission_status ?? "");
      if (["AP", "TA"].includes(status.toUpperCase())) score += 15;

      evidence.push({
        source: "openFDA Drugs@FDA",
        kind: "fda_submission",
        title: `${label}: FDA submission ${submission.submission_type ?? ""} ${submission.submission_number ?? ""}`.trim(),
        score: Math.min(100, score),
        event_date: eventDate,
        status: status || null,
        phase: null,
        url: "https://www.accessdata.fda.gov/scripts/cder/daf/",
        summary: `Application ${application}; status ${status || "unknown"}.`,
      });
    }
  }
  return evidence.sort((a, b) => b.score - a.score).slice(0, 8);
}

let secTickerMap: Map<string, { cik: number; company: string }> | null = null;

async function getSecTickerMap(): Promise<
  Map<string, { cik: number; company: string }>
> {
  if (secTickerMap) return secTickerMap;
  const payload = await nativeJson<Record<string, any>>(
    "https://www.sec.gov/files/company_tickers.json",
  );
  const map = new Map<string, { cik: number; company: string }>();
  Object.values(payload).forEach((item: any) => {
    const ticker = String(item.ticker ?? "").toUpperCase();
    const cik = Number(item.cik_str);
    if (ticker && Number.isFinite(cik)) {
      map.set(ticker, {
        cik,
        company: String(item.title ?? ticker),
      });
    }
  });
  secTickerMap = map;
  return map;
}

export async function fetchSecFilings(
  symbol: string,
): Promise<StandaloneNews[]> {
  try {
    const mapping = await getSecTickerMap();
    const item = mapping.get(symbol.toUpperCase());
    if (!item) return [];
    const cik = String(item.cik).padStart(10, "0");
    const data = await nativeJson<any>(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
    );
    const recent = data.filings?.recent ?? {};
    const forms: string[] = recent.form ?? [];
    const dates: string[] = recent.filingDate ?? [];
    const accessions: string[] = recent.accessionNumber ?? [];
    const docs: string[] = recent.primaryDocument ?? [];
    const allowed = new Set(["8-K", "10-Q", "10-K", "6-K", "S-1", "S-3", "424B5"]);
    const results: StandaloneNews[] = [];

    for (let index = 0; index < forms.length && results.length < 8; index += 1) {
      const form = forms[index];
      if (!allowed.has(form)) continue;
      const accession = String(accessions[index] ?? "").replaceAll("-", "");
      const primary = String(docs[index] ?? "");
      results.push({
        symbol: symbol.toUpperCase(),
        title: `${item.company}: SEC ${form} filing`,
        publisher: "SEC EDGAR",
        published_at: parseDate(dates[index]),
        url:
          accession && primary
            ? `https://www.sec.gov/Archives/edgar/data/${item.cik}/${accession}/${primary}`
            : "",
        summary: `Recent ${form} filing from SEC EDGAR.`,
        source: "sec_edgar_native",
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function structuredCatalystScore(
  evidence: StructuredCatalyst[],
): number {
  if (!evidence.length) return 0;
  const top = [...evidence].sort((a, b) => b.score - a.score).slice(0, 3);
  const weights = [1, 0.45, 0.25];
  let numerator = 0;
  let denominator = 0;
  top.forEach((item, index) => {
    numerator += item.score * weights[index];
    denominator += weights[index];
  });
  return Math.min(100, Math.round((numerator / denominator) * 10) / 10);
}

function periodReturn(bars: OHLCVBar[], periods: number): number | null {
  if (bars.length <= periods) return null;
  const start = bars[bars.length - periods - 1].close;
  return start > 0 ? bars[bars.length - 1].close / start - 1 : null;
}

function evidence(
  score: number,
  positives: string[] = [],
  cautions: string[] = [],
): ScoreEvidence {
  return { score: Math.round(clamp(score) * 10) / 10, positives, cautions };
}

function technical(candidate: BreakoutCandidate): ScoreEvidence {
  const metrics = candidate.metrics;
  const positives: string[] = [];
  const cautions: string[] = [];
  let score = 0;
  const close = candidate.entry_price ?? 0;
  const ma = typeof metrics.ma_value === "number" ? metrics.ma_value : null;
  if (ma !== null && close > ma) {
    score += 25;
    positives.push("Price is above the 20-week moving average");
  } else cautions.push("20-week moving-average confirmation is absent");

  const macd = typeof metrics.macd === "number" ? metrics.macd : null;
  const signal =
    typeof metrics.macd_signal === "number" ? metrics.macd_signal : null;
  if (macd !== null && signal !== null && macd > signal) {
    score += 30;
    positives.push("Weekly MACD is bullish");
  } else cautions.push("Weekly MACD confirmation is absent");

  const high = typeof metrics.prior_high === "number" ? metrics.prior_high : null;
  if (high !== null && high > 0) {
    score += close >= high ? 25 : clamp((close / high) * 25);
    if (close >= high) positives.push("Close is at or above prior 10-week high");
    else cautions.push("Close remains below prior 10-week high");
  }
  const volume =
    typeof metrics.volume_vs_average === "number"
      ? metrics.volume_vs_average
      : null;
  if (volume !== null) {
    score += Math.min(20, clamp((volume / 1.5) * 20));
    if (volume >= 1.5) positives.push(`Relative volume is ${volume.toFixed(2)}x`);
    else cautions.push(`Relative volume is only ${volume.toFixed(2)}x`);
  }
  return evidence(score, positives, cautions);
}

function setup(candidate: BreakoutCandidate): ScoreEvidence {
  if (!candidate.box) return evidence(0, [], ["No qualifying consolidation box"]);
  const width = candidate.box.width_pct;
  const tightness = clamp((1 - width / 0.18) * 45);
  const duration = clamp((candidate.box.bars / 12) * 30);
  const natr =
    typeof candidate.metrics.natr_14 === "number"
      ? candidate.metrics.natr_14
      : null;
  const volatility = natr === null ? 12.5 : clamp((1 - natr / 0.15) * 25);
  const positives = [
    `${candidate.box.bars}-week consolidation`,
    `${(width * 100).toFixed(1)}% body-box width`,
  ];
  return evidence(tightness + duration + volatility, positives);
}

function trigger(candidate: BreakoutCandidate): ScoreEvidence {
  const positives: string[] = [];
  const cautions: string[] = [];
  const breakout = candidate.metrics.close_above_box_pct;
  const closeLocation = candidate.metrics.close_location;
  const wick = candidate.metrics.upper_wick_ratio;
  if (typeof breakout === "number") {
    (breakout >= 0.02 ? positives : cautions).push(
      `Close vs resistance ${(breakout * 100).toFixed(1)}%`,
    );
  }
  if (typeof closeLocation === "number") {
    (closeLocation >= 0.8 ? positives : cautions).push(
      `Close location ${(closeLocation * 100).toFixed(0)}%`,
    );
  }
  if (typeof wick === "number") {
    (wick <= 0.35 ? positives : cautions).push(
      `Upper wick ${(wick * 100).toFixed(1)}%`,
    );
  }
  return evidence(candidate.scores?.breakout ?? 0, positives, cautions);
}

function relativeStrength(
  bars: OHLCVBar[],
  benchmark: OHLCVBar[],
): ScoreEvidence {
  if (!benchmark.length) {
    return evidence(50, [], ["SPY benchmark unavailable"]);
  }
  const spreads: number[] = [];
  const positives: string[] = [];
  const cautions: string[] = [];
  for (const [periods, label] of [
    [4, "1M"],
    [13, "3M"],
    [26, "6M"],
    [52, "12M"],
  ] as const) {
    const stock = periodReturn(bars, periods);
    const market = periodReturn(benchmark, periods);
    if (stock === null || market === null) continue;
    const spread = stock - market;
    spreads.push(spread);
    (spread > 0 ? positives : cautions).push(
      `${label} relative return ${(spread * 100).toFixed(1)} points vs SPY`,
    );
  }
  if (!spreads.length) return evidence(50, [], ["Insufficient RS history"]);
  const average = spreads.reduce((sum, value) => sum + value, 0) / spreads.length;
  return evidence(50 + average * 120, positives, cautions);
}

function dilution(news: StandaloneNews[]): [ScoreEvidence, string] {
  const text = news.map((item) => `${item.title} ${item.summary}`).join(" ").toLowerCase();
  const rules: Array<[string, number, string]> = [
    ["424b5", 45, "424B5 offering filing detected"],
    ["s-1", 38, "S-1 registration detected"],
    ["s-3", 28, "S-3 shelf registration detected"],
    ["at-the-market", 35, "ATM financing language detected"],
    ["warrant", 20, "Warrant language detected"],
    ["convertible", 22, "Convertible financing detected"],
    ["reverse split", 25, "Reverse-split language detected"],
    ["going concern", 25, "Going-concern language detected"],
    ["offering", 20, "Offering language detected"],
  ];
  let risk = 0;
  const cautions: string[] = [];
  for (const [term, points, message] of rules) {
    if (text.includes(term)) {
      risk += points;
      cautions.push(message);
    }
  }
  risk = Math.min(100, risk);
  const label =
    risk >= 75 ? "extreme" : risk >= 50 ? "high" : risk >= 25 ? "moderate" : "low";
  return [
    evidence(
      100 - risk,
      risk === 0 ? ["No obvious recent dilution warning found"] : [],
      cautions,
    ),
    label,
  ];
}

function liquidity(
  bars: OHLCVBar[],
  candidate: BreakoutCandidate,
): ScoreEvidence {
  const recent = bars.slice(-8);
  if (!recent.length) return evidence(0, [], ["No volume history"]);
  const avgDaily =
    recent.reduce((sum, bar) => sum + bar.close * bar.volume, 0) /
    recent.length /
    5;
  let score = 15;
  const positives: string[] = [];
  const cautions: string[] = [];
  if (avgDaily >= 5_000_000) {
    score = 85;
    positives.push(`Approx. daily dollar volume USD ${(avgDaily / 1_000_000).toFixed(1)}M`);
  } else if (avgDaily >= 1_000_000) {
    score = 70;
    positives.push(`Approx. daily dollar volume USD ${(avgDaily / 1_000_000).toFixed(1)}M`);
  } else if (avgDaily >= 500_000) {
    score = 55;
    cautions.push("Moderate dollar-volume liquidity");
  } else if (avgDaily >= 100_000) {
    score = 35;
    cautions.push("Thin dollar-volume liquidity");
  } else {
    cautions.push("Very thin dollar-volume liquidity");
  }
  const rvol = candidate.metrics.volume_vs_average;
  if (typeof rvol === "number" && rvol >= 1.5) {
    score += 10;
    positives.push(`Breakout volume is ${rvol.toFixed(2)}x average`);
  }
  return evidence(score, positives, cautions);
}

function tradeRisk(
  candidate: BreakoutCandidate,
  liquidityScore: ScoreEvidence,
): ScoreEvidence {
  const structural = candidate.stop_risk_pct;
  const structuralScore =
    structural === null ? 0 : clamp(100 * (1 - structural / 0.2));
  const natr =
    typeof candidate.metrics.natr_14 === "number"
      ? candidate.metrics.natr_14
      : null;
  const volatilityScore = natr === null ? 50 : clamp(100 * (1 - natr / 0.25));
  const positives: string[] = [];
  const cautions: string[] = [];
  if (structural !== null) {
    (structural <= 0.15 ? positives : cautions).push(
      `Structural stop risk ${(structural * 100).toFixed(1)}%`,
    );
  }
  return evidence(
    structuralScore * 0.55 + volatilityScore * 0.2 + liquidityScore.score * 0.25,
    positives,
    cautions,
  );
}

export function buildMobileIntelligence(
  candidate: BreakoutCandidate,
  bars: OHLCVBar[],
  benchmark: OHLCVBar[],
  news: StandaloneNews[],
  catalystScore: number,
): MobileIntelligence {
  const technicalScore = technical(candidate);
  const setupScore = setup(candidate);
  const triggerScore = trigger(candidate);
  const rsScore = relativeStrength(bars, benchmark);
  const [dilutionScore, dilutionRisk] = dilution(news);
  const liquidityScore = liquidity(bars, candidate);
  const riskScore = tradeRisk(candidate, liquidityScore);
  const catalyst = evidence(
    catalystScore,
    catalystScore >= 70 ? ["High-impact/recent catalyst evidence"] : [],
    catalystScore < 40 ? ["Catalyst evidence is relatively weak"] : [],
  );

  const neutral = evidence(
    50,
    [],
    ["Standalone zero-key fundamental feed not yet reliable; held neutral."],
  );
  const fundamental = neutral;
  const overall = Math.round(
    clamp(
      technicalScore.score * 0.14 +
        setupScore.score * 0.14 +
        triggerScore.score * 0.16 +
        rsScore.score * 0.1 +
        catalyst.score * 0.12 +
        fundamental.score * 0.1 +
        dilutionScore.score * 0.08 +
        liquidityScore.score * 0.07 +
        riskScore.score * 0.09,
    ) * 10,
  ) / 10;

  let tier: CandidateTier;
  let tierReason: string;
  let weight: number;
  if (candidate.state === "confirmed") {
    if (overall >= 90) [tier, tierReason, weight] = ["A+", "Confirmed breakout with 90+ intelligence score", 5];
    else if (overall >= 85) [tier, tierReason, weight] = ["A", "Confirmed breakout with 85+ intelligence score", 4];
    else [tier, tierReason, weight] = ["B", "Confirmed breakout; lower composite quality", 3];
  } else if (candidate.state === "developing") {
    if (overall >= 80) [tier, tierReason, weight] = ["W1", "High-quality developing setup", 2];
    else [tier, tierReason, weight] = ["W2", "Developing setup that still needs improvement", 1];
  } else {
    [tier, tierReason, weight] = ["X", "One or more mandatory breakout gates failed", 0];
  }

  return {
    tier,
    tier_reason: tierReason,
    rank_key: [
      weight,
      overall,
      catalyst.score,
      liquidityScore.score,
      -(candidate.stop_risk_pct ?? 1),
    ],
    scores: {
      technical_health: technicalScore,
      setup_quality: setupScore,
      breakout_trigger: triggerScore,
      relative_strength: rsScore,
      catalyst,
      growth: neutral,
      profitability: neutral,
      financial_health: neutral,
      fundamental_quality: fundamental,
      dilution_safety: dilutionScore,
      liquidity: liquidityScore,
      trade_risk: riskScore,
      overall,
    },
    facts: {
      dilution_risk: dilutionRisk,
      recent_news_count: news.length,
      stop_risk_pct: candidate.stop_risk_pct,
      box_bars: candidate.box?.bars ?? null,
      box_width_pct: candidate.box?.width_pct ?? null,
      cash_runway_years: null,
    },
  };
}

function lookup(facts: Record<string, any>, field: string): any {
  return field.split(".").reduce((value: any, part) => value?.[part], facts);
}

function conditionPasses(
  condition: MobileStrategyCondition,
  actual: any,
): boolean {
  if (actual === null || actual === undefined) return false;
  const expected = condition.value;
  switch (condition.operator) {
    case "eq": return actual === expected;
    case "ne": return actual !== expected;
    case "gt": return actual > (expected as any);
    case "gte": return actual >= (expected as any);
    case "lt": return actual < (expected as any);
    case "lte": return actual <= (expected as any);
    case "between":
      return Array.isArray(expected) &&
        expected.length === 2 &&
        actual >= expected[0] &&
        actual <= expected[1];
    case "contains":
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    default:
      return false;
  }
}

export function evaluateMobileStrategy(
  strategy: MobileStrategy,
  facts: Record<string, any>,
): MobileStrategyEvaluation {
  const all = strategy.all_of?.conditions ?? [];
  const any = strategy.any_of?.conditions ?? [];
  const none = strategy.none_of?.conditions ?? [];
  const allPass = all.every((item) => conditionPasses(item, lookup(facts, item.field)));
  const anyPass = any.length === 0 || any.some((item) => conditionPasses(item, lookup(facts, item.field)));
  const nonePass = !none.some((item) => conditionPasses(item, lookup(facts, item.field)));
  const failed: string[] = [];
  all.forEach((item) => {
    if (!conditionPasses(item, lookup(facts, item.field))) {
      failed.push(item.label ?? `${item.field} failed ALL rule`);
    }
  });
  if (!anyPass) failed.push("No ANY condition passed");
  none.forEach((item) => {
    if (conditionPasses(item, lookup(facts, item.field))) {
      failed.push(item.label ?? `${item.field} matched exclusion rule`);
    }
  });
  return {
    strategy_name: strategy.name,
    passed: allPass && anyPass && nonePass,
    failed_reasons: failed,
  };
}

export function mobileStrategyFacts(
  profile: {
    price: number;
    sector: string | null;
    industry: string | null;
    market_cap: number | null;
  },
  candidate: BreakoutCandidate,
  intelligence: MobileIntelligence,
  catalystScore: number,
): Record<string, any> {
  return {
    price: profile.price,
    sector: profile.sector ?? "",
    industry: profile.industry ?? "",
    market_cap: profile.market_cap,
    state: candidate.state,
    catalyst_score: catalystScore,
    recent_news_count: intelligence.facts.recent_news_count,
    dilution_risk: intelligence.facts.dilution_risk,
    stop_risk_pct: candidate.stop_risk_pct,
    box_bars: candidate.box?.bars ?? null,
    box_width_pct: candidate.box?.width_pct ?? null,
    close_above_box_pct: candidate.metrics.close_above_box_pct,
    close_location: candidate.metrics.close_location,
    upper_wick_ratio: candidate.metrics.upper_wick_ratio,
    volume_vs_average: candidate.metrics.volume_vs_average,
    cash_runway_years: null,
    scores: {
      overall: intelligence.scores.overall,
      technical: intelligence.scores.technical_health.score,
      setup: intelligence.scores.setup_quality.score,
      trigger: intelligence.scores.breakout_trigger.score,
      relative_strength: intelligence.scores.relative_strength.score,
      catalyst: intelligence.scores.catalyst.score,
      growth: intelligence.scores.growth.score,
      profitability: intelligence.scores.profitability.score,
      financial_health: intelligence.scores.financial_health.score,
      fundamental: intelligence.scores.fundamental_quality.score,
      dilution_safety: intelligence.scores.dilution_safety.score,
      liquidity: intelligence.scores.liquidity.score,
      trade_risk: intelligence.scores.trade_risk.score,
    },
    tier: intelligence.tier,
  };
}
