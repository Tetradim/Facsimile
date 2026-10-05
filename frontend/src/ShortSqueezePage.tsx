import { useEffect, useState } from "react";
import { Activity, Play, Search } from "lucide-react";

type Gate = {
  name: string;
  passed: boolean;
  value: number | string | boolean | null;
  threshold: number | string | null;
  detail: string;
};

type SqueezeCandidate = {
  state: "rejected" | "developing" | "confirmed";
  snapshot: {
    symbol: string;
    as_of: string;
    price: number;
    short_float_pct: number;
    days_to_cover: number;
    float_shares: number | null;
    relative_volume: number | null;
    average_daily_dollar_volume: number | null;
    borrow_fee_pct: number | null;
    utilization_pct: number | null;
    return_5d_pct: number | null;
    return_20d_pct: number | null;
    breakout_pct: number | null;
    distance_to_52w_high_pct: number | null;
    source_evidence: Record<string, string>;
  };
  scores: {
    pressure: number;
    borrow: number;
    float: number;
    trigger: number;
    liquidity: number;
    overall: number;
  };
  gates: Gate[];
  reasons: string[];
  evidence: Record<string, string>;
};

type SqueezeResponse = {
  symbol: string;
  profile: {
    company: string;
    price: number;
    sector: string | null;
    industry: string | null;
  };
  candidate: SqueezeCandidate;
  source: string;
  warnings: string[];
};

type BatchResponse = {
  generated_at: string;
  rows: SqueezeResponse[];
  errors: string[];
};

function stateClass(state: SqueezeCandidate["state"]): string {
  if (state === "confirmed") return "status status--ready";
  if (state === "developing") return "status status--developing";
  return "status status--rejected";
}

function money(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return "$" + (value / 1_000).toFixed(0) + "K";
  return "$" + value.toFixed(0);
}

export function ShortSqueezePage() {
  const [symbol, setSymbol] = useState("GME");
  const [focusSymbols, setFocusSymbols] = useState("GME,UPST,CVNA,PLUG");
  const [data, setData] = useState<SqueezeResponse | null>(null);
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(next = symbol) {
    const clean = next.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/v1/live/short-squeeze/" + encodeURIComponent(clean),
      );
      if (!response.ok) throw new Error(await response.text());
      setData((await response.json()) as SqueezeResponse);
      setSymbol(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Short-squeeze lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runFocusList() {
    const symbols = focusSymbols
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);
    if (!symbols.length) return;
    setBatchLoading(true);
    setError("");
    try {
      const response = await fetch("/v1/live/short-squeeze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          include_rejected: true,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setBatch((await response.json()) as BatchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Short-squeeze focus scan failed.");
    } finally {
      setBatchLoading(false);
    }
  }

  useEffect(() => {
    void load("GME");
  }, []);

  const candidate = data?.candidate;
  const snapshot = candidate?.snapshot;
  const scores = candidate?.scores;
  const shortDate =
    candidate?.evidence.short_interest_as_of ??
    candidate?.snapshot.source_evidence.short_interest_as_of ??
    "Unavailable";

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCANNERS / SHORT SQUEEZE</div>
          <h1>Short Squeeze</h1>
          <p>
            Reported short-interest pressure plus a separate live price/volume
            trigger. Short-sale volume is never treated as short interest.
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
            <div className="panel__title">Squeeze Focus List</div>
            <div className="panel__subtitle">
              Maximum 20 symbols · state-first ranking · reported short-interest required
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
                    <th>Short Float</th>
                    <th>Days to Cover</th>
                    <th>RVOL</th>
                    <th>5D Return</th>
                    <th>Dollar Liquidity</th>
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
                      <td>{row.candidate.scores.overall.toFixed(0)}</td>
                      <td>{(row.candidate.snapshot.short_float_pct * 100).toFixed(1)}%</td>
                      <td>{row.candidate.snapshot.days_to_cover.toFixed(1)}</td>
                      <td>{row.candidate.snapshot.relative_volume?.toFixed(2) ?? "—"}×</td>
                      <td>
                        {row.candidate.snapshot.return_5d_pct != null
                          ? (row.candidate.snapshot.return_5d_pct * 100).toFixed(1) + "%"
                          : "—"}
                      </td>
                      <td>{money(row.candidate.snapshot.average_daily_dollar_volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : batch ? (
            <div className="empty-live-state">
              <strong>No verified rows returned.</strong>
              <span>Some symbols may not expose current short-interest metadata.</span>
            </div>
          ) : null}

          {batch?.errors.length ? (
            <div className="warning-strip">
              {batch.errors.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
        </div>
      </section>

      {data ? (
        <>
          {data.warnings.length ? (
            <div className="warning-strip">
              {data.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          ) : null}

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-card__label">State</div>
              <div className="metric-card__value">
                <span className={stateClass(candidate!.state)}>
                  {candidate!.state.toUpperCase()}
                </span>
              </div>
              <div className="metric-card__detail">Pressure + trigger gates</div>
            </div>
            <div className="metric-card metric-card--purple">
              <div className="metric-card__label">Short Float</div>
              <div className="metric-card__value">
                {(snapshot!.short_float_pct * 100).toFixed(1)}%
              </div>
              <div className="metric-card__detail">As of {shortDate}</div>
            </div>
            <div className="metric-card metric-card--green">
              <div className="metric-card__label">Days to Cover</div>
              <div className="metric-card__value">{snapshot!.days_to_cover.toFixed(1)}</div>
              <div className="metric-card__detail">Reported short ratio</div>
            </div>
            <div className="metric-card metric-card--orange">
              <div className="metric-card__label">Relative Volume</div>
              <div className="metric-card__value">
                {snapshot!.relative_volume?.toFixed(2) ?? "—"}×
              </div>
              <div className="metric-card__detail">Latest daily bar vs prior 20</div>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Squeeze Score Profile</div>
                  <div className="panel__subtitle">{data.source}</div>
                </div>
              </div>
              <div className="panel__body score-stack">
                {[
                  ["Overall", scores!.overall],
                  ["Pressure", scores!.pressure],
                  ["Borrow", scores!.borrow],
                  ["Float", scores!.float],
                  ["Trigger", scores!.trigger],
                  ["Liquidity", scores!.liquidity],
                ].map(([label, raw]) => {
                  const value = Number(raw);
                  return (
                    <div className="score-row" key={String(label)}>
                      <span>{label}</span>
                      <div className="score-track"><span style={{ width: value + "%" }} /></div>
                      <strong>{value.toFixed(0)}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Hard Gates</div>
                  <div className="panel__subtitle">Pressure and current trigger requirements</div>
                </div>
              </div>
              <div className="panel__body gate-list">
                {candidate!.gates.map((gate) => (
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

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Evidence & Trigger Context</div>
                <div className="panel__subtitle">
                  Reported pressure stays separate from current price behavior
                </div>
              </div>
            </div>
            <div className="panel__body context-grid">
              <div><span>Float Shares</span><strong>{snapshot!.float_shares != null ? (snapshot!.float_shares / 1_000_000).toFixed(1) + "M" : "—"}</strong></div>
              <div><span>5D Return</span><strong>{snapshot!.return_5d_pct != null ? (snapshot!.return_5d_pct * 100).toFixed(1) + "%" : "—"}</strong></div>
              <div><span>20D Return</span><strong>{snapshot!.return_20d_pct != null ? (snapshot!.return_20d_pct * 100).toFixed(1) + "%" : "—"}</strong></div>
              <div><span>20D Breakout</span><strong>{snapshot!.breakout_pct != null ? (snapshot!.breakout_pct * 100).toFixed(1) + "%" : "—"}</strong></div>
              <div><span>Dollar Liquidity</span><strong>{money(snapshot!.average_daily_dollar_volume)}</strong></div>
              <div><span>Distance to 52W High</span><strong>{snapshot!.distance_to_52w_high_pct != null ? (snapshot!.distance_to_52w_high_pct * 100).toFixed(1) + "%" : "—"}</strong></div>
              <div><span>Borrow Fee</span><strong>{snapshot!.borrow_fee_pct != null ? (snapshot!.borrow_fee_pct * 100).toFixed(1) + "%" : "Neutral / unavailable"}</strong></div>
              <div><span>Utilization</span><strong>{snapshot!.utilization_pct != null ? (snapshot!.utilization_pct * 100).toFixed(1) + "%" : "Neutral / unavailable"}</strong></div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
