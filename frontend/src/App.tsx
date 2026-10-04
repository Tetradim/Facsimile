import { useMemo, useState } from "react";
import { apiFetch, getApiBaseUrl, getMobileMode, isNativeApp, setApiBaseUrl, setMobileMode, type MobileMode } from "./api";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Radar,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Page =
  | "command"
  | "value"
  | "breakout"
  | "builder"
  | "charts"
  | "settings";

type Candidate = {
  symbol: string;
  company: string;
  price: number;
  sector: string;
  theme: string;
  overall: number;
  positional: number;
  entry: number;
  breakout: number;
  quality: number;
  growth: number;
  risk: number;
  relVol: number;
  status: "READY" | "WATCH" | "DEVELOPING";
};

const candidates: Candidate[] = [
  {
    symbol: "RKLB",
    company: "Rocket Lab USA",
    price: 41.28,
    sector: "Industrials",
    theme: "Space",
    overall: 91,
    positional: 88,
    entry: 94,
    breakout: 96,
    quality: 84,
    growth: 93,
    risk: 89,
    relVol: 1.84,
    status: "READY",
  },
  {
    symbol: "LUNR",
    company: "Intuitive Machines",
    price: 13.72,
    sector: "Industrials",
    theme: "Space",
    overall: 86,
    positional: 82,
    entry: 91,
    breakout: 92,
    quality: 75,
    growth: 89,
    risk: 85,
    relVol: 1.61,
    status: "READY",
  },
  {
    symbol: "RXRX",
    company: "Recursion",
    price: 5.66,
    sector: "Health Care",
    theme: "Medical",
    overall: 83,
    positional: 85,
    entry: 80,
    breakout: 84,
    quality: 78,
    growth: 92,
    risk: 73,
    relVol: 1.42,
    status: "WATCH",
  },
  {
    symbol: "DNA",
    company: "Ginkgo Bioworks",
    price: 1.34,
    sector: "Health Care",
    theme: "Medical",
    overall: 79,
    positional: 76,
    entry: 83,
    breakout: 86,
    quality: 68,
    growth: 81,
    risk: 80,
    relVol: 2.11,
    status: "DEVELOPING",
  },
  {
    symbol: "ASTS",
    company: "AST SpaceMobile",
    price: 43.91,
    sector: "Communication Services",
    theme: "Space",
    overall: 88,
    positional: 91,
    entry: 86,
    breakout: 90,
    quality: 82,
    growth: 96,
    risk: 77,
    relVol: 1.35,
    status: "WATCH",
  },
  {
    symbol: "BBAI",
    company: "BigBear.ai",
    price: 4.72,
    sector: "Technology",
    theme: "AI",
    overall: 74,
    positional: 70,
    entry: 79,
    breakout: 82,
    quality: 64,
    growth: 76,
    risk: 71,
    relVol: 1.72,
    status: "DEVELOPING",
  },
];

const curveData = [
  { period: "Jan", strategy: 100, benchmark: 100 },
  { period: "Feb", strategy: 104, benchmark: 101 },
  { period: "Mar", strategy: 108, benchmark: 103 },
  { period: "Apr", strategy: 106, benchmark: 102 },
  { period: "May", strategy: 114, benchmark: 105 },
  { period: "Jun", strategy: 119, benchmark: 106 },
  { period: "Jul", strategy: 125, benchmark: 109 },
  { period: "Aug", strategy: 123, benchmark: 108 },
  { period: "Sep", strategy: 132, benchmark: 111 },
  { period: "Oct", strategy: 139, benchmark: 113 },
];

const sectorData = [
  { name: "Health", matches: 18 },
  { name: "Industrials", matches: 14 },
  { name: "Tech", matches: 11 },
  { name: "Comm", matches: 8 },
  { name: "Energy", matches: 5 },
];

const priceData = [
  { week: "W1", close: 36.4, volume: 42 },
  { week: "W2", close: 37.1, volume: 38 },
  { week: "W3", close: 37.5, volume: 35 },
  { week: "W4", close: 37.2, volume: 31 },
  { week: "W5", close: 38.0, volume: 34 },
  { week: "W6", close: 38.4, volume: 39 },
  { week: "W7", close: 39.1, volume: 44 },
  { week: "W8", close: 41.3, volume: 86 },
];

const navItems = [
  { id: "command" as Page, label: "Command Center", icon: LayoutDashboard },
  { id: "value" as Page, label: "Value Scanner", icon: CircleDollarSign },
  { id: "breakout" as Page, label: "Weekly Breakout", icon: TrendingUp },
  { id: "builder" as Page, label: "Scanner Builder", icon: SlidersHorizontal },
  { id: "charts" as Page, label: "Charts", icon: LineChartIcon },
];

const quickRanges = [
  { label: "Under $1", max: "1.00" },
  { label: "Under $3", max: "3.00" },
  { label: "Under $5", max: "5.00" },
  { label: "Under $10", max: "10.00" },
  { label: "Under $25", max: "25.00" },
  { label: "Under $50", max: "50.00" },
];

function scoreClass(score: number) {
  if (score >= 88) return "score score--hot";
  if (score >= 80) return "score score--good";
  return "score score--neutral";
}

function StatusBadge({ status }: { status: Candidate["status"] }) {
  return <span className={`status status--${status.toLowerCase()}`}>{status}</span>;
}

function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "purple" | "orange";
}) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__detail">{detail}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__header">
        <div>
          <div className="panel__title">{title}</div>
          {subtitle ? <div className="panel__subtitle">{subtitle}</div> : null}
        </div>
        {action ? <div className="panel__action">{action}</div> : null}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

function ResultsTable({ rows }: { rows: Candidate[] }) {
  return (
    <div className="table-wrap">
      <table className="scanner-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Sector / Theme</th>
            <th>Overall</th>
            <th>Positional</th>
            <th>Entry</th>
            <th>Breakout</th>
            <th>Quality</th>
            <th>Growth</th>
            <th>RelVol</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol}>
              <td>
                <div className="symbol-cell">
                  <button className="star-button" aria-label={`Star ${row.symbol}`}>
                    <Star size={14} />
                  </button>
                  <div>
                    <strong>{row.symbol}</strong>
                    <span>{row.company}</span>
                  </div>
                </div>
              </td>
              <td className="numeric">${row.price.toFixed(2)}</td>
              <td>
                <div className="taxonomy-cell">
                  <span>{row.sector}</span>
                  <small>{row.theme}</small>
                </div>
              </td>
              <td><span className={scoreClass(row.overall)}>{row.overall}</span></td>
              <td><span className={scoreClass(row.positional)}>{row.positional}</span></td>
              <td><span className={scoreClass(row.entry)}>{row.entry}</span></td>
              <td><span className={scoreClass(row.breakout)}>{row.breakout}</span></td>
              <td><span className={scoreClass(row.quality)}>{row.quality}</span></td>
              <td><span className={scoreClass(row.growth)}>{row.growth}</span></td>
              <td className="numeric">{row.relVol.toFixed(2)}×</td>
              <td><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommandCenter({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FACSIMILE / MARKET WORKSTATION</div>
          <h1>Command Center</h1>
          <p>Scanner health, strongest setups, market regime, and portfolio-level signal context.</p>
        </div>
        <button className="button button--primary" onClick={() => onNavigate("value")}>
          <Radar size={16} />
          New Scan
        </button>
      </div>

      <div className="metrics-grid">
        <MetricCard label="Eligible Universe" value="4,281" detail="US common stocks" />
        <MetricCard label="Breakout Matches" value="47" detail="+12 since last close" tone="green" />
        <MetricCard label="High Conviction" value="11" detail="Overall score ≥ 88" tone="purple" />
        <MetricCard label="Market Regime" value="Constructive" detail="SPX 10 EMA > 20 EMA" tone="orange" />
      </div>

      <div className="dashboard-grid">
        <Panel
          title="Strategy Curve"
          subtitle="Illustrative scanner equity curve versus benchmark"
          action={<button className="text-button">Simulation Lab</button>}
          className="panel--wide"
        >
          <div className="chart chart--large">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curveData}>
                <defs>
                  <linearGradient id="strategyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#202938" vertical={false} />
                <XAxis dataKey="period" stroke="#6f7d90" tickLine={false} axisLine={false} />
                <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0f1622", border: "1px solid #263246", borderRadius: 10 }} />
                <Area type="monotone" dataKey="strategy" stroke="#22c55e" fill="url(#strategyFill)" strokeWidth={2.5} />
                <Line type="monotone" dataKey="benchmark" stroke="#7c8aa0" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Matches by Sector" subtitle="Current eligible setups">
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData}>
                <CartesianGrid stroke="#202938" vertical={false} />
                <XAxis dataKey="name" stroke="#6f7d90" tickLine={false} axisLine={false} />
                <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0f1622", border: "1px solid #263246", borderRadius: 10 }} />
                <Bar dataKey="matches" fill="#4f8cff" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title="Highest Ranked Setups"
        subtitle="Cross-section of the current scanner universe"
        action={<button className="text-button" onClick={() => onNavigate("breakout")}>View all</button>}
      >
        <ResultsTable rows={candidates.slice(0, 5)} />
      </Panel>
    </>
  );
}

type LiveProvider = {
  name: string;
  kind: string;
  configured: boolean;
  zero_key: boolean;
  capabilities: string[];
  detail: string;
};

type LiveNews = {
  symbol: string;
  title: string;
  publisher: string;
  published_at: string | null;
  url: string;
  summary: string;
  source: string;
};

type StructuredCatalyst = {
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

type LiveScanRow = {
  profile: {
    symbol: string;
    company: string;
    price: number;
    sector: string | null;
    industry: string | null;
    exchange: string | null;
    market_cap: number | null;
    source: string;
  };
  candidate: {
    state: "rejected" | "developing" | "confirmed";
    scores: {
      quality: number | null;
      growth: number | null;
      momentum: number;
      breakout: number;
      risk: number;
      positional: number;
      entry: number;
      overall: number;
    } | null;
    metrics: Record<string, number | string | boolean | null>;
    reasons: string[];
  };
  news: LiveNews[];
  catalysts: StructuredCatalyst[];
  catalyst_score: number;
  rank: number | null;
  intelligence: {
    tier: "A+" | "A" | "B" | "W1" | "W2" | "X";
    tier_reason: string;
    scores: {
      technical_health: { score: number; positives: string[]; cautions: string[] };
      setup_quality: { score: number; positives: string[]; cautions: string[] };
      breakout_trigger: { score: number; positives: string[]; cautions: string[] };
      relative_strength: { score: number; positives: string[]; cautions: string[] };
      catalyst: { score: number; positives: string[]; cautions: string[] };
      growth: { score: number; positives: string[]; cautions: string[] };
      profitability: { score: number; positives: string[]; cautions: string[] };
      financial_health: { score: number; positives: string[]; cautions: string[] };
      fundamental_quality: { score: number; positives: string[]; cautions: string[] };
      dilution_safety: { score: number; positives: string[]; cautions: string[] };
      liquidity: { score: number; positives: string[]; cautions: string[] };
      trade_risk: { score: number; positives: string[]; cautions: string[] };
      overall: number;
    };
    facts: {
      dilution_risk?: string;
      recent_news_count?: number;
      stop_risk_pct?: number | null;
      box_bars?: number | null;
      box_width_pct?: number | null;
      cash_runway_years?: number | null;
    };
  } | null;
  data_sources: string[];
  error: string | null;
};

type LiveScanResponse = {
  generated_at: string;
  discovered_count: number;
  scanned_count: number;
  rows: LiveScanRow[];
  providers: LiveProvider[];
  warnings: string[];
};

function LiveStateBadge({ state }: { state: LiveScanRow["candidate"]["state"] }) {
  const label =
    state === "confirmed" ? "CONFIRMED" : state === "developing" ? "DEVELOPING" : "REJECTED";
  const className =
    state === "confirmed"
      ? "status status--ready"
      : state === "developing"
        ? "status status--developing"
        : "status status--rejected";
  return <span className={className}>{label}</span>;
}


type IntelligenceView = "breakout" | "catalyst" | "fundamental" | "risk";

function TierBadge({ tier }: { tier: NonNullable<LiveScanRow["intelligence"]>["tier"] }) {
  const className =
    tier === "A+" || tier === "A" || tier === "B"
      ? "tier tier--confirmed"
      : tier === "W1" || tier === "W2"
        ? "tier tier--watch"
        : "tier tier--reject";
  return <span className={className}>{tier}</span>;
}

function IntelligenceCell({
  label,
  score,
}: {
  label: string;
  score: number | undefined;
}) {
  return (
    <div className="intel-cell">
      <span>{label}</span>
      <strong className={scoreClass(score ?? 0)}>{score?.toFixed(0) ?? "—"}</strong>
    </div>
  );
}

function IntelligenceResultsTable({
  rows,
  view,
}: {
  rows: LiveScanRow[];
  view: IntelligenceView;
}) {
  return (
    <div className="table-wrap">
      <table className="scanner-table live-table intelligence-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Tier</th>
            <th>Symbol</th>
            <th>Price</th>
            <th>State</th>
            {view === "breakout" ? (
              <>
                <th>Overall</th>
                <th>Technical</th>
                <th>Setup</th>
                <th>Trigger</th>
                <th>RS</th>
              </>
            ) : null}
            {view === "catalyst" ? (
              <>
                <th>Catalyst</th>
                <th>Fundamental</th>
                <th>Dilution Safety</th>
                <th>Dilution Risk</th>
                <th>Recent News</th>
              </>
            ) : null}
            {view === "fundamental" ? (
              <>
                <th>Fundamental</th>
                <th>Growth</th>
                <th>Profitability</th>
                <th>Financial Health</th>
                <th>Cash Runway</th>
              </>
            ) : null}
            {view === "risk" ? (
              <>
                <th>Trade Risk</th>
                <th>Liquidity</th>
                <th>Stop Risk</th>
                <th>Box</th>
                <th>Sources</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const intelligence = row.intelligence;
            const scores = intelligence?.scores;
            const latestNews = row.news[0];
            const structuredCatalyst = row.catalysts?.[0];
            return (
              <tr key={row.profile.symbol}>
                <td className="numeric rank-cell">{row.rank ?? "—"}</td>
                <td>{intelligence ? <TierBadge tier={intelligence.tier} /> : "—"}</td>
                <td>
                  <div className="symbol-cell symbol-cell--intel">
                    <div>
                      <strong>{row.profile.symbol}</strong>
                      <span>{row.profile.company}</span>
                    </div>
                    {intelligence ? (
                      <details className="why-details">
                        <summary>Why?</summary>
                        <div className="why-panel">
                          <strong>{intelligence.tier_reason}</strong>
                          {[
                            ["Technical", scores?.technical_health],
                            ["Setup", scores?.setup_quality],
                            ["Trigger", scores?.breakout_trigger],
                            ["RS", scores?.relative_strength],
                            ["Catalyst", scores?.catalyst],
                            ["Growth", scores?.growth],
                            ["Profitability", scores?.profitability],
                            ["Financial Health", scores?.financial_health],
                            ["Dilution", scores?.dilution_safety],
                            ["Liquidity", scores?.liquidity],
                            ["Risk", scores?.trade_risk],
                          ].map(([name, evidence]) => {
                            const item = evidence as
                              | { score: number; positives: string[]; cautions: string[] }
                              | undefined;
                            if (!item) return null;
                            return (
                              <div className="why-score" key={String(name)}>
                                <span>{String(name)} {item.score.toFixed(0)}</span>
                                {item.positives.slice(0, 2).map((text) => (
                                  <small className="positive" key={text}>✓ {text}</small>
                                ))}
                                {item.cautions.slice(0, 2).map((text) => (
                                  <small className="negative" key={text}>⚠ {text}</small>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </td>
                <td className="numeric">${row.profile.price.toFixed(4)}</td>
                <td><LiveStateBadge state={row.candidate.state} /></td>

                {view === "breakout" ? (
                  <>
                    <td><IntelligenceCell label="" score={scores?.overall} /></td>
                    <td><IntelligenceCell label="" score={scores?.technical_health.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.setup_quality.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.breakout_trigger.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.relative_strength.score} /></td>
                  </>
                ) : null}

                {view === "catalyst" ? (
                  <>
                    <td><IntelligenceCell label="" score={scores?.catalyst.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.fundamental_quality.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.dilution_safety.score} /></td>
                    <td>
                      <span className={"risk-label risk-label--" + (intelligence?.facts.dilution_risk ?? "unknown")}>
                        {(intelligence?.facts.dilution_risk ?? "unknown").toUpperCase()}
                      </span>
                    </td>
                    <td className="news-cell">
                      {structuredCatalyst ? (
                        <>
                          {structuredCatalyst.url ? (
                            <a href={structuredCatalyst.url} target="_blank" rel="noreferrer">
                              {structuredCatalyst.title}
                            </a>
                          ) : (
                            <span>{structuredCatalyst.title}</span>
                          )}
                          <small>
                            {structuredCatalyst.source}
                            {structuredCatalyst.phase ? " · " + structuredCatalyst.phase : ""}
                            {structuredCatalyst.event_date
                              ? " · " + new Date(structuredCatalyst.event_date).toLocaleDateString()
                              : ""}
                          </small>
                        </>
                      ) : latestNews ? (
                        <>
                          {latestNews.url ? (
                            <a href={latestNews.url} target="_blank" rel="noreferrer">
                              {latestNews.title}
                            </a>
                          ) : (
                            <span>{latestNews.title}</span>
                          )}
                          <small>
                            {latestNews.publisher || latestNews.source}
                            {latestNews.published_at
                              ? " · " + new Date(latestNews.published_at).toLocaleDateString()
                              : ""}
                          </small>
                        </>
                      ) : (
                        <span className="muted">No catalyst evidence</span>
                      )}
                    </td>
                  </>
                ) : null}

                {view === "fundamental" ? (
                  <>
                    <td><IntelligenceCell label="" score={scores?.fundamental_quality.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.growth.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.profitability.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.financial_health.score} /></td>
                    <td className="numeric">
                      {intelligence?.facts.cash_runway_years != null
                        ? intelligence.facts.cash_runway_years.toFixed(1) + "y"
                        : "—"}
                    </td>
                  </>
                ) : null}

                {view === "risk" ? (
                  <>
                    <td><IntelligenceCell label="" score={scores?.trade_risk.score} /></td>
                    <td><IntelligenceCell label="" score={scores?.liquidity.score} /></td>
                    <td className="numeric">
                      {intelligence?.facts.stop_risk_pct != null
                        ? (intelligence.facts.stop_risk_pct * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td className="numeric">
                      {intelligence?.facts.box_bars ?? "—"}w ·{" "}
                      {intelligence?.facts.box_width_pct != null
                        ? (intelligence.facts.box_width_pct * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td className="sources-cell">
                      {row.data_sources.map((source) => <span key={source}>{source}</span>)}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type SavedScannerView = {
  id: string;
  name: string;
  minPrice: string;
  maxPrice: string;
  sector: string;
  newsDays: string;
  requireNews: boolean;
  columnPack: IntelligenceView;
};

function ValueScanner() {
  const [minPrice, setMinPrice] = useState("0.10");
  const [maxPrice, setMaxPrice] = useState("2.50");
  const [sector, setSector] = useState("Medical");
  const [requireNews, setRequireNews] = useState(true);
  const [newsDays, setNewsDays] = useState("14");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<IntelligenceView>("breakout");
  const [result, setResult] = useState<LiveScanResponse | null>(null);
  const [error, setError] = useState("");
  const [savedViews, setSavedViews] = useState<SavedScannerView[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("facsimile.savedViews") || "[]") as SavedScannerView[];
    } catch {
      return [];
    }
  });

  function persistSavedViews(next: SavedScannerView[]) {
    setSavedViews(next);
    localStorage.setItem("facsimile.savedViews", JSON.stringify(next));
  }

  function saveCurrentView() {
    const saved: SavedScannerView = {
      id: String(Date.now()),
      name: sector + " $" + minPrice + "–$" + maxPrice + " · " + newsDays + "d",
      minPrice,
      maxPrice,
      sector,
      newsDays,
      requireNews,
      columnPack: view,
    };
    persistSavedViews([saved, ...savedViews].slice(0, 12));
  }

  function applySavedView(saved: SavedScannerView) {
    setMinPrice(saved.minPrice);
    setMaxPrice(saved.maxPrice);
    setSector(saved.sector);
    setNewsDays(saved.newsDays);
    setRequireNews(saved.requireNews);
    setView(saved.columnPack);
  }

  function removeSavedView(id: string) {
    persistSavedViews(savedViews.filter((saved) => saved.id !== id));
  }

  async function runLiveScan() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/live/scan/weekly-breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          min_price: Number(minPrice || 0),
          max_price: Number(maxPrice || 1000000),
          sector,
          require_recent_news: requireNews,
          news_lookback_days: Number(newsDays || 14),
          max_candidates: 35,
          max_results: 30,
          include_rejected: true,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Live scan failed with HTTP ${response.status}`);
      }
      setResult((await response.json()) as LiveScanResponse);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Live scan failed");
    } finally {
      setLoading(false);
    }
  }

  const rows = result?.rows ?? [];
  const confirmed = rows.filter((row) => row.candidate.state === "confirmed").length;
  const developing = rows.filter((row) => row.candidate.state === "developing").length;
  const configuredProviders = result?.providers.filter((provider) => provider.configured).length ?? 3;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LIVE UNIVERSE / WEEKLY BREAKOUT</div>
          <h1>Live Value Scanner</h1>
          <p>Pull current market data, recent catalysts, and completed weekly candles into the breakout engine.</p>
        </div>
        <div className="live-mode-badge">
          <span className="live-dot" />
          LIVE PROVIDERS
        </div>
      </div>

      <Panel
        title="Universe + Catalyst Filters"
        subtitle="Nasdaq screens the zero-key universe first; Yahoo supplies OHLCV/news and acts as the universe fallback."
      >
        <div className="filter-grid">
          <label className="field">
            <span>Minimum Price</span>
            <div className="money-input">
              <span>$</span>
              <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="decimal" />
            </div>
          </label>
          <label className="field">
            <span>Maximum Price</span>
            <div className="money-input">
              <span>$</span>
              <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="decimal" />
            </div>
          </label>
          <label className="field">
            <span>Sector</span>
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              <option>Medical</option>
              <option>Healthcare</option>
              <option>Pharmaceuticals</option>
              <option>Technology</option>
              <option>Industrials</option>
              <option>All sectors</option>
            </select>
          </label>
          <label className="field">
            <span>News Lookback</span>
            <select value={newsDays} onChange={(event) => setNewsDays(event.target.value)}>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>

        <div className="quick-row">
          <span className="quick-row__label">Quick ranges</span>
          {quickRanges.map((range) => (
            <button
              key={range.label}
              className="chip"
              onClick={() => {
                setMinPrice("0.10");
                setMaxPrice(range.max);
              }}
            >
              {range.label}
            </button>
          ))}
          <label className="news-toggle">
            <input
              type="checkbox"
              checked={requireNews}
              onChange={(event) => setRequireNews(event.target.checked)}
            />
            Require recent news / filing
          </label>
        </div>

        <div className="scan-actions">
          <div className="scan-note">
            <Sparkles size={16} />
            Medical Catalyst preset: 18% box · +2% breakout · 1.5× volume · ≤15% stop risk
          </div>
          <div className="scan-action-buttons">
            <button className="button button--ghost" onClick={saveCurrentView}>
              <Save size={16} />
              Save View
            </button>
            <button
              className="button button--primary button--scan"
              onClick={runLiveScan}
              disabled={loading}
            >
              <Play size={16} fill="currentColor" />
              {loading ? "Scanning Live…" : "Run Live Scan"}
            </button>
          </div>
        </div>
        {error ? <div className="live-error">{error}</div> : null}
      </Panel>

      {savedViews.length ? (
        <Panel
          title="Saved Screens"
          subtitle="TradingView-style reusable filter and column-layout presets stored on this device."
        >
          <div className="saved-view-row">
            {savedViews.map((saved) => (
              <div className="saved-view-chip" key={saved.id}>
                <button onClick={() => applySavedView(saved)}>
                  <strong>{saved.name}</strong>
                  <span>{saved.columnPack} view</span>
                </button>
                <button
                  className="saved-view-remove"
                  onClick={() => removeSavedView(saved.id)}
                  aria-label={"Remove " + saved.name}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="metrics-grid metrics-grid--compact">
        <MetricCard
          label="Discovered"
          value={result ? String(result.discovered_count) : "—"}
          detail="Live universe candidates"
        />
        <MetricCard
          label="Confirmed"
          value={result ? String(confirmed) : "—"}
          detail="Weekly breakout confirmed"
          tone="green"
        />
        <MetricCard
          label="Developing"
          value={result ? String(developing) : "—"}
          detail="Worth watching"
          tone="purple"
        />
        <MetricCard
          label="Providers"
          value={String(configuredProviders)}
          detail="Configured data sources"
          tone="orange"
        />
      </div>

      {result?.warnings.length ? (
        <div className="warning-strip">
          {result.warnings.slice(0, 4).map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}

      {result ? (
        <Panel
          title="Provider Status"
          subtitle="Green sources are active for this data mode. Add API keys to enable additional fallbacks."
        >
          <div className="provider-grid">
            {result.providers.map((provider) => (
              <div className="provider-card" key={provider.name}>
                <span className={provider.configured ? "provider-dot provider-dot--on" : "provider-dot"} />
                <div>
                  <strong>{provider.name}</strong>
                  <span>{provider.kind} · {provider.configured ? "active" : "not configured"}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Live Weekly Breakout Results"
        subtitle={
          result
            ? `${rows.length} ranked rows generated ${new Date(result.generated_at).toLocaleString()}`
            : "Run a live scan to replace the old demonstration rows with current provider data."
        }
      >
        {loading ? (
          <div className="live-loading">
            <Activity size={22} />
            Screening the universe, retrieving news and filings, downloading weekly history, and scoring candidates…
          </div>
        ) : rows.length ? (
          <>
            <div className="column-pack-tabs">
              {[
                ["breakout", "Breakout View"],
                ["catalyst", "Catalyst View"],
                ["fundamental", "Fundamental View"],
                ["risk", "Risk View"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => setView(id as IntelligenceView)}
                >
                  {label}
                </button>
              ))}
            </div>
            <IntelligenceResultsTable rows={rows} view={view} />
          </>
        ) : (
          <div className="empty-live-state">
            <Radar size={24} />
            <strong>No live scan has been run yet.</strong>
            <span>Start with $0.10–$2.50 / Medical / 14-day news lookback.</span>
          </div>
        )}
      </Panel>
    </>
  );
}

function BreakoutPage() {
  const selected = candidates[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCANNERS / WEEKLY BREAKOUT</div>
          <h1>Weekly Breakout</h1>
          <p>Completed-week consolidation breakouts ranked by positional and entry quality.</p>
        </div>
        <button className="button button--primary">
          <Zap size={16} />
          Run Weekly Scan
        </button>
      </div>

      <div className="setup-grid">
        <Panel
          title={`${selected.symbol} · ${selected.company}`}
          subtitle="Highest-ranked active setup"
          action={<StatusBadge status={selected.status} />}
          className="panel--wide"
        >
          <div className="setup-topline">
            <div>
              <span className="setup-price">${selected.price.toFixed(2)}</span>
              <span className="setup-change">+5.18% weekly</span>
            </div>
            <div className="setup-tags">
              <span>{selected.sector}</span>
              <span>{selected.theme}</span>
              <span>1W</span>
            </div>
          </div>
          <div className="chart chart--setup">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceData}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#202938" vertical={false} />
                <XAxis dataKey="week" stroke="#6f7d90" tickLine={false} axisLine={false} />
                <YAxis domain={[34, 44]} stroke="#6f7d90" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0f1622", border: "1px solid #263246", borderRadius: 10 }} />
                <ReferenceLine y={39.3} stroke="#a78bfa" strokeDasharray="5 5" label={{ value: "Resistance", fill: "#a78bfa", position: "insideTopRight" }} />
                <ReferenceLine y={37.1} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Stop", fill: "#ef4444", position: "insideBottomRight" }} />
                <Area type="monotone" dataKey="close" stroke="#4f8cff" fill="url(#priceFill)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Score Profile" subtitle="Positional vs entry quality">
          <div className="score-stack">
            {[
              ["Overall", selected.overall],
              ["Positional", selected.positional],
              ["Entry", selected.entry],
              ["Breakout", selected.breakout],
              ["Quality", selected.quality],
              ["Growth", selected.growth],
              ["Risk", selected.risk],
            ].map(([label, score]) => (
              <div className="score-row" key={String(label)}>
                <span>{label}</span>
                <div className="score-track"><span style={{ width: `${score}%` }} /></div>
                <strong>{score}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel title="Breakout Evidence" subtitle="Deterministic gate evaluation">
          <div className="gate-list">
            {[
              "6+ week consolidation",
              "Body box width ≤ 12%",
              "Close > resistance +1%",
              "Above 20-week MA",
              "MACD line > signal",
              "Close at 10-week high",
              "Upper wick < 50%",
              "Structural risk < 20%",
            ].map((gate) => (
              <div className="gate-item" key={gate}>
                <span className="gate-check">✓</span>
                <span>{gate}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Trade Structure" subtitle="Completed weekly confirmation">
          <div className="stat-list">
            <div><span>Box</span><strong>$36.82 – $39.30</strong></div>
            <div><span>Consolidation</span><strong>7 weeks</strong></div>
            <div><span>Breakout close</span><strong>$41.28</strong></div>
            <div><span>Structural stop</span><strong className="negative">$37.64</strong></div>
            <div><span>Stop risk</span><strong>8.82%</strong></div>
            <div><span>Relative volume</span><strong className="positive">1.84×</strong></div>
          </div>
        </Panel>
      </div>

      <Panel title="Ranked Breakout Candidates" subtitle="Current demonstration universe">
        <ResultsTable rows={candidates} />
      </Panel>
    </>
  );
}

type BuilderGroup = "all" | "any" | "none";

type BuilderCondition = {
  id: string;
  group: BuilderGroup;
  field: string;
  operator: string;
  value: string;
  timeframe: string;
};

const defaultBuilderConditions: BuilderCondition[] = [
  { id: "price", group: "all", field: "price", operator: "between", value: "0.10,2.50", timeframe: "current" },
  { id: "sector", group: "all", field: "sector", operator: "contains", value: "health", timeframe: "current" },
  { id: "technical", group: "all", field: "scores.technical", operator: "gte", value: "75", timeframe: "1w" },
  { id: "setup", group: "all", field: "scores.setup", operator: "gte", value: "80", timeframe: "1w" },
  { id: "rvol", group: "all", field: "volume_vs_average", operator: "gte", value: "1.5", timeframe: "1w" },
  { id: "risk", group: "all", field: "stop_risk_pct", operator: "lte", value: "0.15", timeframe: "1w" },
  { id: "catalyst", group: "any", field: "catalyst_score", operator: "gte", value: "70", timeframe: "current" },
  { id: "news", group: "any", field: "recent_news_count", operator: "gte", value: "1", timeframe: "current" },
  { id: "dilution", group: "none", field: "dilution_risk", operator: "eq", value: "extreme", timeframe: "current" },
];

function BuilderPage() {
  const [conditions, setConditions] = useState<BuilderCondition[]>(defaultBuilderConditions);
  const [description, setDescription] = useState(
    "Medical stocks between 0.10 and 2.50 with strong weekly setup, 1.5x volume, recent catalyst and no extreme dilution.",
  );
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<LiveScanResponse | null>(null);

  function normalizedValue(condition: BuilderCondition): unknown {
    if (condition.operator === "between") {
      const values = condition.value.split(",").map((value) => Number(value.trim()));
      return values.length === 2 && values.every(Number.isFinite)
        ? values
        : condition.value;
    }
    if (["gt", "gte", "lt", "lte"].includes(condition.operator)) {
      const numeric = Number(condition.value);
      return Number.isFinite(numeric) ? numeric : condition.value;
    }
    return condition.value;
  }

  function strategyPayload() {
    const group = (name: BuilderGroup) => ({
      mode: name,
      conditions: conditions
        .filter((condition) => condition.group === name)
        .map((condition) => ({
          field: condition.field,
          operator: condition.operator,
          value: normalizedValue(condition),
          timeframe: condition.timeframe,
        })),
    });

    return {
      schema_version: "facsimile.strategy.v1",
      name: "Custom Workbench Strategy",
      description,
      all_of: group("all"),
      any_of: group("any"),
      none_of: group("none"),
      metadata: {
        scanner_family: "weekly_breakout",
        reusable_for: ["scan", "watchlist", "alert", "backtest"],
      },
    };
  }

  function updateCondition(
    id: string,
    key: keyof BuilderCondition,
    value: string,
  ) {
    setConditions((current) =>
      current.map((condition) =>
        condition.id === id ? { ...condition, [key]: value } : condition,
      ),
    );
  }

  function addCondition(group: BuilderGroup) {
    setConditions((current) => [
      ...current,
      {
        id: "rule-" + Date.now(),
        group,
        field: "scores.overall",
        operator: "gte",
        value: "80",
        timeframe: "current",
      },
    ]);
  }

  function removeCondition(id: string) {
    setConditions((current) => current.filter((condition) => condition.id !== id));
  }

  function savePreset() {
    const payload = strategyPayload();
    const key = "facsimile.savedStrategies";
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
    localStorage.setItem(key, JSON.stringify([...existing, payload]));
    setMessage("Saved locally. This strategy object can be reused by scans, alerts and backtests.");
  }

  function buildRulesFromText() {
    const text = description.toLowerCase();
    let next = [...defaultBuilderConditions];

    const priceMatch = text.match(/between\s+\$?([0-9.]+)\s+(?:and|to)\s+\$?([0-9.]+)/);
    if (priceMatch) {
      next = next.map((condition) =>
        condition.id === "price"
          ? { ...condition, value: priceMatch[1] + "," + priceMatch[2] }
          : condition,
      );
    }

    const rvolMatch = text.match(/(?:rvol|relative volume|volume)\s*(?:>=|at least|over)?\s*([0-9.]+)x?/);
    if (rvolMatch) {
      next = next.map((condition) =>
        condition.id === "rvol" ? { ...condition, value: rvolMatch[1] } : condition,
      );
    }

    const riskMatch = text.match(/(?:stop risk|risk)\s*(?:<=|under|below|less than)?\s*([0-9.]+)%/);
    if (riskMatch) {
      next = next.map((condition) =>
        condition.id === "risk"
          ? { ...condition, value: String(Number(riskMatch[1]) / 100) }
          : condition,
      );
    }

    if (text.includes("medical") || text.includes("healthcare") || text.includes("biotech")) {
      next = next.map((condition) =>
        condition.id === "sector" ? { ...condition, value: "health" } : condition,
      );
    }

    setConditions(next);
    setMessage("Rule Assistant translated the recognizable parts into deterministic filters.");
  }

  async function runCustomScan() {
    const priceRule = conditions.find((condition) => condition.field === "price");
    const range =
      priceRule?.operator === "between"
        ? priceRule.value.split(",").map((value) => Number(value.trim()))
        : [0.10, 2.50];
    const sectorRule = conditions.find((condition) => condition.field === "sector");
    const newsRule = conditions.find((condition) => condition.field === "recent_news_count");

    setRunning(true);
    setMessage("");
    try {
      const response = await apiFetch("/v1/live/scan/weekly-breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          min_price: Number.isFinite(range[0]) ? range[0] : 0.10,
          max_price: Number.isFinite(range[1]) ? range[1] : 2.50,
          sector: sectorRule?.value || "Medical",
          require_recent_news: Boolean(newsRule),
          news_lookback_days: 14,
          max_candidates: 50,
          max_results: 30,
          include_rejected: true,
          strategy: strategyPayload(),
          require_strategy_match: true,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as LiveScanResponse;
      setPreview(data);
      setMessage(
        "Custom strategy matched " +
          data.rows.length +
          " ranked candidates from " +
          data.discovered_count +
          " discovered symbols.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Custom scan failed.");
    } finally {
      setRunning(false);
    }
  }

  const renderGroup = (group: BuilderGroup, title: string, hint: string) => (
    <div className={"logic-group logic-group--" + group}>
      <div className="logic-group__header">
        <div>
          <strong>{title}</strong>
          <span>{hint}</span>
        </div>
        <button className="text-button" onClick={() => addCondition(group)}>+ Add rule</button>
      </div>
      <div className="logic-rules">
        {conditions.filter((condition) => condition.group === group).map((condition) => (
          <div className="logic-rule" key={condition.id}>
            <select
              value={condition.field}
              onChange={(event) => updateCondition(condition.id, "field", event.target.value)}
            >
              <option value="price">Price</option>
              <option value="sector">Sector</option>
              <option value="state">State</option>
              <option value="scores.overall">Overall</option>
              <option value="scores.technical">Technical Health</option>
              <option value="scores.setup">Setup Quality</option>
              <option value="scores.trigger">Breakout Trigger</option>
              <option value="scores.relative_strength">Relative Strength</option>
              <option value="catalyst_score">Catalyst</option>
              <option value="scores.fundamental">Fundamental Quality</option>
              <option value="scores.growth">Growth</option>
              <option value="scores.profitability">Profitability</option>
              <option value="scores.financial_health">Financial Health</option>
              <option value="cash_runway_years">Cash Runway Years</option>
              <option value="dilution_risk">Dilution Risk</option>
              <option value="scores.dilution_safety">Dilution Safety</option>
              <option value="scores.liquidity">Liquidity</option>
              <option value="scores.trade_risk">Trade Risk</option>
              <option value="volume_vs_average">Relative Volume</option>
              <option value="stop_risk_pct">Stop Risk</option>
              <option value="box_bars">Box Bars</option>
              <option value="box_width_pct">Box Width</option>
              <option value="recent_news_count">Recent News Count</option>
            </select>
            <select
              value={condition.operator}
              onChange={(event) => updateCondition(condition.id, "operator", event.target.value)}
            >
              <option value="gte">≥</option>
              <option value="lte">≤</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
              <option value="eq">=</option>
              <option value="ne">≠</option>
              <option value="between">Between</option>
              <option value="contains">Contains</option>
            </select>
            <input
              value={condition.value}
              onChange={(event) => updateCondition(condition.id, "value", event.target.value)}
            />
            <select
              value={condition.timeframe}
              onChange={(event) => updateCondition(condition.id, "timeframe", event.target.value)}
            >
              <option value="current">Current</option>
              <option value="1d">1D</option>
              <option value="1w">1W</option>
              <option value="1m">1M</option>
              <option value="quarterly">Quarterly</option>
            </select>
            <button
              className="logic-remove"
              onClick={() => removeCondition(condition.id)}
              aria-label="Remove rule"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TOOLS / STRATEGY WORKBENCH</div>
          <h1>Scanner Builder</h1>
          <p>TradingView-style filtering with ChartMill-style explainable ratings and reusable deterministic rules.</p>
        </div>
        <button className="button button--ghost" onClick={savePreset}>
          <Save size={16} />
          Save Strategy
        </button>
      </div>

      <Panel
        title="Rule Assistant"
        subtitle="Describe the scan; recognizable constraints become visible rules you can inspect and edit."
      >
        <div className="rule-assistant">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
          <button className="button button--quiet" onClick={buildRulesFromText}>
            <Sparkles size={16} />
            Build Rules
          </button>
        </div>
      </Panel>

      <div className="logic-builder">
        {renderGroup("all", "ALL", "Every rule in this group must pass.")}
        {renderGroup("any", "ANY", "At least one catalyst/context rule must pass.")}
        {renderGroup("none", "NONE", "Any matching exclusion rule removes the candidate.")}
      </div>

      <div className="builder-layout">
        <Panel
          title="Reusable Strategy Contract"
          subtitle="One definition can power scanning, watchlists, alerts and later historical tests."
        >
          <pre className="strategy-json">
            {JSON.stringify(strategyPayload(), null, 2)}
          </pre>
        </Panel>

        <Panel title="Run Strategy" subtitle="Evaluate the custom rules against live candidates">
          <div className="builder-summary">
            <Gauge size={18} />
            <div>
              <strong>{conditions.length} deterministic conditions</strong>
              <span>Tier ranking remains state-first, then intelligence quality.</span>
            </div>
          </div>
          <button
            className="button button--primary button--full"
            onClick={runCustomScan}
            disabled={running}
          >
            <Play size={16} fill="currentColor" />
            {running ? "Running…" : "Run Custom Live Scan"}
          </button>
          {message ? <div className="connection-status">{message}</div> : null}
        </Panel>
      </div>

      {preview?.rows.length ? (
        <Panel
          title="Custom Strategy Matches"
          subtitle={preview.rows.length + " candidates matched the reusable strategy definition."}
        >
          <IntelligenceResultsTable rows={preview.rows.slice(0, 10)} view="breakout" />
        </Panel>
      ) : null}
    </>
  );
}

function ChartsPage() {
  const [timeframe, setTimeframe] = useState("1W");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ANALYTICS / CHARTS</div>
          <h1>Charts</h1>
          <p>Price action, scanner context, levels, volume, and momentum in one inspection workspace.</p>
        </div>
        <div className="symbol-search">
          <Search size={16} />
          <input defaultValue="RKLB" aria-label="Ticker symbol" />
        </div>
      </div>

      <Panel
        title="RKLB · Weekly Structure"
        subtitle="Scanner overlay: consolidation, breakout resistance, stop, and momentum"
        action={
          <div className="timeframe-tabs">
            {["1D", "1W", "1M", "6M", "1Y"].map((value) => (
              <button
                key={value}
                className={timeframe === value ? "active" : ""}
                onClick={() => setTimeframe(value)}
              >
                {value}
              </button>
            ))}
          </div>
        }
      >
        <div className="chart chart--hero">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceData}>
              <CartesianGrid stroke="#202938" vertical={false} />
              <XAxis dataKey="week" stroke="#6f7d90" tickLine={false} axisLine={false} />
              <YAxis domain={[34, 44]} stroke="#6f7d90" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#0f1622", border: "1px solid #263246", borderRadius: 10 }} />
              <ReferenceLine y={39.3} stroke="#22c55e" strokeDasharray="5 5" />
              <ReferenceLine y={37.64} stroke="#ef4444" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="close" stroke="#f8fafc" strokeWidth={2.3} dot={{ fill: "#4f8cff", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-toolbar">
          {["Price", "20W MA", "MACD", "Volume", "Box", "Resistance", "Stop"].map((item, index) => (
            <button className={index < 5 ? "active" : ""} key={item}>{item}</button>
          ))}
        </div>
      </Panel>

      <div className="dashboard-grid">
        <Panel title="Weekly Volume" subtitle="Breakout participation">
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priceData}>
                <CartesianGrid stroke="#202938" vertical={false} />
                <XAxis dataKey="week" stroke="#6f7d90" tickLine={false} axisLine={false} />
                <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0f1622", border: "1px solid #263246", borderRadius: 10 }} />
                <Bar dataKey="volume" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Scanner Context" subtitle="Fast-read setup statistics">
          <div className="context-grid">
            <div><span>Box width</span><strong>6.73%</strong></div>
            <div><span>Box bars</span><strong>7</strong></div>
            <div><span>Close location</span><strong>88%</strong></div>
            <div><span>Upper wick</span><strong>11%</strong></div>
            <div><span>NATR 14</span><strong>4.8%</strong></div>
            <div><span>RelVol</span><strong className="positive">1.84×</strong></div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function SettingsPage() {
  const [mode, setMode] = useState<MobileMode>(getMobileMode());
  const [serverUrl, setServerUrlState] = useState(getApiBaseUrl());
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  function chooseMode(nextMode: MobileMode) {
    setMobileMode(nextMode);
    setMode(nextMode);
    setStatus("idle");
    setMessage(
      nextMode === "standalone"
        ? "Standalone mode enabled. No computer or local server is required."
        : "Remote mode enabled. Enter a Facsimile API URL below.",
    );
  }

  async function testCurrentMode() {
    if (mode === "remote") {
      setApiBaseUrl(serverUrl);
    }
    setStatus("testing");
    setMessage(
      mode === "standalone"
        ? "Checking the on-device Facsimile engine…"
        : "Testing the remote Facsimile API…",
    );

    try {
      const response = await apiFetch("/health", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        status?: string;
        service?: string;
        mode?: string;
      };
      setStatus("ok");
      setMessage(
        mode === "standalone"
          ? "Standalone engine is ready. Live scans will run entirely on this phone."
          : `Connected to ${payload.service ?? "Facsimile"} (${payload.status ?? "ok"}).`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Connection test failed: ${error.message}`
          : "Connection test failed.",
      );
    }
  }

  function saveServer() {
    setApiBaseUrl(serverUrl);
    setServerUrlState(getApiBaseUrl());
    setMessage("Remote server URL saved.");
    setStatus("idle");
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">APP / DATA MODE</div>
          <h1>Settings</h1>
          <p>Android runs independently by default. A desktop server is optional.</p>
        </div>
        <div className="live-mode-badge">
          <span className="live-dot" />
          {mode === "standalone" ? "STANDALONE" : "REMOTE"}
        </div>
      </div>

      <div className="builder-layout">
        <Panel
          title="Android Data Mode"
          subtitle="Standalone keeps the scanner, indicators, ranking and live-data requests on the phone."
        >
          <div className="settings-stack">
            <div className="mode-picker">
              <button
                className={mode === "standalone" ? "mode-card mode-card--active" : "mode-card"}
                onClick={() => chooseMode("standalone")}
              >
                <strong>Standalone</strong>
                <span>No PC required. Recommended.</span>
              </button>
              <button
                className={mode === "remote" ? "mode-card mode-card--active" : "mode-card"}
                onClick={() => chooseMode("remote")}
              >
                <strong>Remote API</strong>
                <span>Optional Python backend for desktop parity/debugging.</span>
              </button>
            </div>

            {mode === "standalone" ? (
              <>
                <div className="settings-hint">
                  <strong>Independent mode:</strong> the app screens stocks, downloads weekly
                  OHLCV/news over the internet, evaluates the Medical Catalyst Weekly rules,
                  scores candidates, and ranks results directly on Android.
                </div>
                <div className="settings-hint">
                  <strong>No LAN address needed.</strong> You can close the PC completely.
                  The phone only needs internet access.
                </div>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Facsimile API URL</span>
                  <input
                    value={serverUrl}
                    onChange={(event) => setServerUrlState(event.target.value)}
                    placeholder="https://scanner.example.com"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>
                <div className="settings-actions">
                  <button className="button button--ghost" onClick={saveServer}>
                    <Save size={16} />
                    Save URL
                  </button>
                </div>
              </>
            )}

            <button
              className="button button--primary button--full"
              onClick={testCurrentMode}
              disabled={status === "testing"}
            >
              <Activity size={16} />
              {status === "testing"
                ? "Testing…"
                : mode === "standalone"
                  ? "Check Standalone Engine"
                  : "Test Remote Connection"}
            </button>

            {message ? (
              <div
                className={
                  status === "ok"
                    ? "connection-status connection-status--ok"
                    : status === "error"
                      ? "connection-status connection-status--error"
                      : "connection-status"
                }
              >
                {message}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Standalone Capabilities" subtitle="What now runs inside the APK">
          <div className="gate-list gate-list--single">
            {[
              "Live U.S. equity screening by price and sector",
              "Weekly OHLCV retrieval",
              "Recent company-news retrieval",
              "6–12 week consolidation-box detection",
              "20-week moving-average confirmation",
              "MACD 12/26/9 confirmation",
              "Relative-volume hard gate",
              "Structural stop/risk calculation",
              "A+/A/B/W1/W2/X tier ranking",
              "SPY relative-strength scoring",
              "ClinicalTrials.gov and openFDA catalyst evidence",
              "SEC filing / dilution-risk evidence",
              "Liquidity and structural-risk scoring",
              "Explainable Intelligence Workbench ratings",
              "Reusable ALL / ANY / NONE strategy rules",
            ].map((item) => (
              <div className="gate-item" key={item}>
                <span className="gate-check">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("command");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "app-shell--collapsed"}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={20} /></div>
          {sidebarOpen ? (
            <div>
              <strong>FACSIMILE</strong>
              <span>Scanner Workstation</span>
            </div>
          ) : null}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">{sidebarOpen ? "Workspace" : ""}</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={page === item.id ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => setPage(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                {sidebarOpen ? <span>{item.label}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <div className="nav-label">{sidebarOpen ? "Saved Views" : ""}</div>
          <button className="nav-item" title="Space under $5">
            <Target size={18} />
            {sidebarOpen ? <span>Space under $5</span> : null}
          </button>
          <button className="nav-item" title="Medical under $3">
            <Boxes size={18} />
            {sidebarOpen ? <span>Medical under $3</span> : null}
          </button>
        </div>

        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "nav-item nav-item--active" : "nav-item"}
            title="Settings"
            onClick={() => setPage("settings")}
          >
            <Settings size={18} />
            {sidebarOpen ? <span>Settings</span> : null}
          </button>
          <button
            className="collapse-button"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setSidebarOpen((value) => !value)}>
              <Menu size={19} />
            </button>
            <div className="market-state">
              <span className="live-dot" />
              <strong>MARKET OPEN</strong>
              <span>{isNativeApp() ? (getMobileMode() === "standalone" ? "Standalone Intelligence" : "Android remote") : "Live data workstation"}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Alerts"><Bell size={17} /></button>
            <button className="button button--quiet">
              <BarChart3 size={16} />
              Scanner Health
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        <main className="content">
          {page === "command" ? <CommandCenter onNavigate={setPage} /> : null}
          {page === "value" ? <ValueScanner /> : null}
          {page === "breakout" ? <BreakoutPage /> : null}
          {page === "builder" ? <BuilderPage /> : null}
          {page === "charts" ? <ChartsPage /> : null}
          {page === "settings" ? <SettingsPage /> : null}
        </main>
      </div>
    </div>
  );
}
