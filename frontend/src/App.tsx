import { useMemo, useState } from "react";
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
  | "charts";

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

function ValueScanner() {
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("54.22");
  const [sector, setSector] = useState("All sectors");
  const [theme, setTheme] = useState("All themes");
  const [ranScan, setRanScan] = useState(false);

  const rows = useMemo(() => {
    const min = minPrice === "" ? 0 : Number(minPrice);
    const max = maxPrice === "" ? Number.POSITIVE_INFINITY : Number(maxPrice);
    return candidates.filter((row) => {
      const sectorMatch =
        sector === "All sectors" ||
        row.sector === sector ||
        (sector === "Medical" && row.theme === "Medical");
      const themeMatch = theme === "All themes" || row.theme === theme;
      return row.price >= min && row.price <= max && sectorMatch && themeMatch;
    });
  }, [minPrice, maxPrice, sector, theme]);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNIVERSE / VALUE SCANNER</div>
          <h1>Value Scanner</h1>
          <p>Define the investable universe first, then route matching symbols into technical scanners.</p>
        </div>
        <button className="button button--ghost">
          <Save size={16} />
          Save Scan
        </button>
      </div>

      <Panel title="Universe Filters" subtitle="Price values are free-form decimal inputs; presets are shortcuts only.">
        <div className="filter-grid">
          <label className="field">
            <span>Minimum Price</span>
            <div className="money-input">
              <span>$</span>
              <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0.00" inputMode="decimal" />
            </div>
          </label>
          <label className="field">
            <span>Maximum Price</span>
            <div className="money-input">
              <span>$</span>
              <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any" inputMode="decimal" />
            </div>
          </label>
          <label className="field">
            <span>Sector</span>
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              <option>All sectors</option>
              <option>Medical</option>
              <option>Health Care</option>
              <option>Industrials</option>
              <option>Technology</option>
              <option>Communication Services</option>
            </select>
          </label>
          <label className="field">
            <span>Theme</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value)}>
              <option>All themes</option>
              <option>Space</option>
              <option>Medical</option>
              <option>AI</option>
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
                setMinPrice("");
                setMaxPrice(range.max);
              }}
            >
              {range.label}
            </button>
          ))}
          <button className="chip chip--active">Custom</button>
        </div>

        <div className="scan-actions">
          <div className="scan-note">
            <Sparkles size={16} />
            Current query: {minPrice || "0.00"} – {maxPrice || "∞"} / {sector} / {theme}
          </div>
          <button className="button button--primary button--scan" onClick={() => setRanScan(true)}>
            <Play size={16} fill="currentColor" />
            Run Scan
          </button>
        </div>
      </Panel>

      <div className="metrics-grid metrics-grid--compact">
        <MetricCard label="Universe Input" value="6 demo" detail="Live provider next" />
        <MetricCard label="Eligible" value={String(rows.length)} detail="After price/taxonomy filters" tone="green" />
        <MetricCard label="Excluded" value={String(candidates.length - rows.length)} detail="Filtered before scoring" tone="purple" />
        <MetricCard label="Mode" value={ranScan ? "Scanned" : "Preview"} detail="Weekly Breakout route" tone="orange" />
      </div>

      <Panel title="Filtered Universe" subtitle={`${rows.length} symbols match the active universe query.`}>
        <ResultsTable rows={rows} />
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

function BuilderPage() {
  const [bars, setBars] = useState("6");
  const [width, setWidth] = useState("12");
  const [closeAbove, setCloseAbove] = useState("1");
  const [stopRisk, setStopRisk] = useState("20");

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TOOLS / SCANNER BUILDER</div>
          <h1>Build Your Own Breakout</h1>
          <p>Configure the breakout engine while preserving an explainable rule set.</p>
        </div>
        <button className="button button--ghost">
          <Save size={16} />
          Save Preset
        </button>
      </div>

      <div className="builder-layout">
        <Panel title="Core Setup" subtitle="Structure and confirmation rules">
          <div className="builder-fields">
            <label className="field"><span>Direction</span><select><option>Long</option><option>Short</option></select></label>
            <label className="field"><span>Setup State</span><select><option>Confirmed breakout</option><option>Developing setup</option></select></label>
            <label className="field"><span>Timeframe</span><select><option>Weekly</option><option>Daily</option></select></label>
            <label className="field"><span>Minimum consolidation bars</span><input value={bars} onChange={(e) => setBars(e.target.value)} /></label>
            <label className="field"><span>Maximum body-box width %</span><input value={width} onChange={(e) => setWidth(e.target.value)} /></label>
            <label className="field"><span>Minimum close above box %</span><input value={closeAbove} onChange={(e) => setCloseAbove(e.target.value)} /></label>
            <label className="field"><span>Structural stop position %</span><input defaultValue="33" /></label>
            <label className="field"><span>Maximum stop risk %</span><input value={stopRisk} onChange={(e) => setStopRisk(e.target.value)} /></label>
            <label className="field"><span>Minimum close location %</span><input defaultValue="75" /></label>
            <label className="field"><span>Maximum upper wick %</span><input defaultValue="50" /></label>
            <label className="field"><span>Volume behavior</span><select><option>Score only</option><option>Hard gate</option><option>Disabled</option></select></label>
            <label className="field"><span>Minimum relative volume</span><input defaultValue="1.00" /></label>
          </div>
        </Panel>

        <Panel title="Required Context" subtitle="Toggle confirmation gates">
          <div className="toggle-list">
            {[
              ["20-week moving average", true],
              ["Bullish MACD 12/26/9", true],
              ["10-week high", true],
              ["Market regime filter", true],
              ["Relative strength", true],
              ["Fundamental quality", false],
              ["Piotroski ≥ 6", false],
            ].map(([label, enabled]) => (
              <label className="toggle-row" key={String(label)}>
                <span>{label}</span>
                <input type="checkbox" defaultChecked={Boolean(enabled)} />
              </label>
            ))}
          </div>
          <div className="builder-summary">
            <Gauge size={18} />
            <div>
              <strong>Preset summary</strong>
              <span>{bars}+ bars · ≤{width}% box · +{closeAbove}% close · ≤{stopRisk}% risk</span>
            </div>
          </div>
          <button className="button button--primary button--full">
            <Play size={16} fill="currentColor" />
            Run Custom Scan
          </button>
        </Panel>
      </div>
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
          <button className="nav-item" title="Settings">
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
              <span>Data workstation demo</span>
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
        </main>
      </div>
    </div>
  );
}
