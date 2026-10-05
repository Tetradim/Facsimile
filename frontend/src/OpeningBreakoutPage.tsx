import { useEffect, useMemo, useState } from "react";
import { Activity, Play, Search } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  OpeningBreakoutChart,
  type IntradayBar,
} from "./OpeningBreakoutChart";

type Gate = {
  name: string;
  passed: boolean;
  value: number | string | boolean | null;
  threshold: number | string | null;
  detail: string;
};

type OpeningCandidate = {
  state: "rejected" | "developing" | "confirmed";
  opening_range: {
    start: string;
    end: string;
    high: number;
    low: number;
    volume: number;
    bars: number;
    width_pct: number;
  } | null;
  breakout_bar: IntradayBar | null;
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
  gates: Gate[];
  reasons: string[];
  metrics: Record<string, number | string | boolean | null>;
};

type OpeningResponse = {
  symbol: string;
  profile: {
    company: string;
    price: number;
    sector: string | null;
    industry: string | null;
  };
  session_date: string;
  bars: IntradayBar[];
  prior_session_bars: IntradayBar[];
  candidate: OpeningCandidate;
  source: string;
  warnings: string[];
};

type OpeningBatchResponse = {
  generated_at: string;
  rows: OpeningResponse[];
  errors: string[];
};

function scoreClass(score: number): string {
  if (score >= 85) return "score score--hot";
  if (score >= 70) return "score score--good";
  return "score score--neutral";
}

export function OpeningBreakoutPage() {
  const [symbol, setSymbol] = useState("RKLB");
  const [data, setData] = useState<OpeningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusSymbols, setFocusSymbols] = useState("RKLB,LUNR,ASTS,RXRX");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batch, setBatch] = useState<OpeningBatchResponse | null>(null);
  const [error, setError] = useState("");

  async function load(next = symbol) {
    const clean = next.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/v1/live/opening-breakout/" + encodeURIComponent(clean),
      );
      if (!response.ok) throw new Error(await response.text());
      setData((await response.json()) as OpeningResponse);
      setSymbol(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opening breakout lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("RKLB");
  }, []);

  async function runFocusList() {
    const symbols = focusSymbols
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 12);
    if (!symbols.length) return;
    setBatchLoading(true);
    setError("");
    try {
      const response = await fetch("/v1/live/opening-breakout/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          include_rejected: true,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setBatch((await response.json()) as OpeningBatchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Focus-list scan failed.");
    } finally {
      setBatchLoading(false);
    }
  }


  const volumeData = useMemo(
    () =>
      (data?.bars ?? []).map((bar) => ({
        time: new Date(bar.timestamp).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        volume: bar.volume,
      })),
    [data],
  );

  const candidate = data?.candidate;
  const scores = candidate?.scores;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCANNERS / OPENING BREAKOUT</div>
          <h1>Opening Breakout</h1>
          <p>
            Five-minute opening-range breakout confirmation using VWAP,
            relative volume, candle quality, extension, and structural risk.
          </p>
        </div>
        <div className="chart-search-actions">
          <div className="symbol-search">
            <Search size={16} />
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load();
              }}
            />
          </div>
          <button className="button button--primary" onClick={() => load()} disabled={loading}>
            {loading ? <Activity size={15} /> : <Play size={15} fill="currentColor" />}
            {loading ? "Loading…" : "Evaluate"}
          </button>
        </div>
      </div>

      {error ? <div className="live-error">{error}</div> : null}

      <section className="panel opening-focus-panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Opening Breakout Focus List</div>
            <div className="panel__subtitle">
              Controlled live scan · maximum 12 symbols · four concurrent intraday fetches
            </div>
          </div>
        </div>
        <div className="panel__body">
          <div className="opening-focus-controls">
            <label className="field">
              <span>Symbols</span>
              <input
                value={focusSymbols}
                onChange={(event) => setFocusSymbols(event.target.value.toUpperCase())}
                placeholder="RKLB,LUNR,ASTS"
              />
            </label>
            <button
              className="button button--primary"
              onClick={runFocusList}
              disabled={batchLoading}
            >
              {batchLoading ? <Activity size={15} /> : <Play size={15} fill="currentColor" />}
              {batchLoading ? "Scanning…" : "Scan focus list"}
            </button>
          </div>

          {batch?.rows.length ? (
            <div className="table-wrap opening-focus-results">
              <table className="scanner-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Symbol</th>
                    <th>State</th>
                    <th>Overall</th>
                    <th>OR High</th>
                    <th>RVOL</th>
                    <th>VWAP</th>
                    <th>Stop Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.rows.map((row, index) => (
                    <tr
                      key={row.symbol}
                      className="opening-focus-row"
                      onClick={() => void load(row.symbol)}
                    >
                      <td>{index + 1}</td>
                      <td><strong>{row.symbol}</strong></td>
                      <td>{row.candidate.state.toUpperCase()}</td>
                      <td>{row.candidate.scores?.overall.toFixed(0) ?? "—"}</td>
                      <td>
                        {row.candidate.opening_range
                          ? "$" + row.candidate.opening_range.high.toFixed(2)
                          : "—"}
                      </td>
                      <td>
                        {row.candidate.relative_volume != null
                          ? row.candidate.relative_volume.toFixed(2) + "×"
                          : "—"}
                      </td>
                      <td>
                        {row.candidate.vwap != null
                          ? "$" + row.candidate.vwap.toFixed(2)
                          : "—"}
                      </td>
                      <td>
                        {row.candidate.stop_risk_pct != null
                          ? (row.candidate.stop_risk_pct * 100).toFixed(1) + "%"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : batch ? (
            <div className="empty-live-state">
              <strong>No rows returned.</strong>
              <span>Check the symbols, session timing, or provider warnings.</span>
            </div>
          ) : null}

          {batch?.errors.length ? (
            <div className="warning-strip">
              {batch.errors.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
        </div>
      </section>

      {data?.warnings.length ? (
        <div className="warning-strip">
          {data.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-card__label">State</div>
              <div className="metric-card__value">
                {candidate?.state.toUpperCase()}
              </div>
              <div className="metric-card__detail">{data.session_date}</div>
            </div>
            <div className="metric-card metric-card--purple">
              <div className="metric-card__label">OR High</div>
              <div className="metric-card__value">
                {candidate?.opening_range
                  ? "$" + candidate.opening_range.high.toFixed(2)
                  : "—"}
              </div>
              <div className="metric-card__detail">15-minute opening range</div>
            </div>
            <div className="metric-card metric-card--green">
              <div className="metric-card__label">Relative Volume</div>
              <div className="metric-card__value">
                {candidate?.relative_volume != null
                  ? candidate.relative_volume.toFixed(2) + "×"
                  : "—"}
              </div>
              <div className="metric-card__detail">Breakout bar vs prior session</div>
            </div>
            <div className="metric-card metric-card--orange">
              <div className="metric-card__label">Stop Risk</div>
              <div className="metric-card__value">
                {candidate?.stop_risk_pct != null
                  ? (candidate.stop_risk_pct * 100).toFixed(1) + "%"
                  : "—"}
              </div>
              <div className="metric-card__detail">
                Stop just beneath opening-range high
              </div>
            </div>
          </div>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">
                  {data.symbol + " · " + data.profile.company}
                </div>
                <div className="panel__subtitle">
                  {data.source + " · 5-minute regular-session bars"}
                </div>
              </div>
            </div>
            <div className="panel__body">
              <OpeningBreakoutChart
                bars={data.bars}
                openingHigh={candidate?.opening_range?.high ?? null}
                openingLow={candidate?.opening_range?.low ?? null}
                structuralStop={candidate?.structural_stop ?? null}
              />
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Score Profile</div>
                  <div className="panel__subtitle">Intraday breakout quality</div>
                </div>
              </div>
              <div className="panel__body score-stack">
                {[
                  ["Overall", scores?.overall ?? 0],
                  ["Trigger", scores?.trigger ?? 0],
                  ["Volume", scores?.volume ?? 0],
                  ["VWAP", scores?.vwap ?? 0],
                  ["Structure", scores?.structure ?? 0],
                  ["Risk", scores?.risk ?? 0],
                ].map(([label, raw]) => {
                  const value = Number(raw);
                  return (
                    <div className="score-row" key={String(label)}>
                      <span>{label}</span>
                      <div className="score-track">
                        <span style={{ width: value + "%" }} />
                      </div>
                      <strong className={scoreClass(value)}>
                        {value.toFixed(0)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Gate Evidence</div>
                  <div className="panel__subtitle">Hard confirmation rules</div>
                </div>
              </div>
              <div className="panel__body gate-list">
                {(candidate?.gates ?? []).map((gate) => (
                  <div className="gate-item" key={gate.name}>
                    <span className={gate.passed ? "gate-check" : "gate-check gate-check--fail"}>
                      {gate.passed ? "✓" : "×"}
                    </span>
                    <span>{gate.name.replaceAll("_", " ")}</span>
                    <small>{gate.value == null ? "—" : String(gate.value)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Intraday Volume</div>
                  <div className="panel__subtitle">Current session five-minute bars</div>
                </div>
              </div>
              <div className="panel__body chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid stroke="#202938" vertical={false} />
                    <XAxis dataKey="time" stroke="#6f7d90" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#0f1622", border: "1px solid #263246", borderRadius: 10 }} />
                    <Bar dataKey="volume" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Trade Structure</div>
                  <div className="panel__subtitle">Current evaluated trigger</div>
                </div>
              </div>
              <div className="panel__body context-grid">
                <div><span>Entry</span><strong>{candidate?.entry_price != null ? "$" + candidate.entry_price.toFixed(2) : "—"}</strong></div>
                <div><span>VWAP</span><strong>{candidate?.vwap != null ? "$" + candidate.vwap.toFixed(2) : "—"}</strong></div>
                <div><span>Stop</span><strong>{candidate?.structural_stop != null ? "$" + candidate.structural_stop.toFixed(2) : "—"}</strong></div>
                <div><span>OR Width</span><strong>{candidate?.opening_range ? (candidate.opening_range.width_pct * 100).toFixed(1) + "%" : "—"}</strong></div>
                <div><span>Breakout</span><strong>{typeof candidate?.metrics.breakout_pct === "number" ? (candidate.metrics.breakout_pct * 100).toFixed(2) + "%" : "—"}</strong></div>
                <div><span>Close Location</span><strong>{typeof candidate?.metrics.close_location === "number" ? (candidate.metrics.close_location * 100).toFixed(0) + "%" : "—"}</strong></div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
