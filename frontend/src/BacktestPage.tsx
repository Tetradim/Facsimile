import { useState } from "react";
import { Activity, FlaskConical, Play } from "lucide-react";

type BacktestEvent = {
  symbol: string;
  as_of: string;
  state: string;
  tier: string;
  intelligence_score: number;
  entry_price: number;
  exit_price: number;
  forward_return_pct: number;
  max_favorable_excursion_pct: number;
  max_adverse_excursion_pct: number;
  stop_risk_pct: number | null;
};

type BacktestResponse = {
  coverage: {
    supported_fields: string[];
    omitted_fields: string[];
    full_coverage: boolean;
  };
  stats: {
    signals: number;
    win_rate_pct: number;
    average_return_pct: number;
    median_return_pct: number;
    best_return_pct: number;
    worst_return_pct: number;
    average_mfe_pct: number;
    average_mae_pct: number;
  };
  events: BacktestEvent[];
  errors: string[];
};

export function BacktestPage() {
  const [symbols, setSymbols] = useState("RKLB,LUNR,ASTS,RXRX");
  const [forwardWeeks, setForwardWeeks] = useState("4");
  const [lookbackWeeks, setLookbackWeeks] = useState("156");
  const [usePreset, setUsePreset] = useState(false);
  const [fullCoverage, setFullCoverage] = useState(false);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      let strategy: unknown = null;
      if (usePreset) {
        const presetResponse = await fetch("/v1/strategies/presets");
        if (!presetResponse.ok) throw new Error(await presetResponse.text());
        const presets = (await presetResponse.json()) as unknown[];
        strategy = presets[0] ?? null;
      }

      const response = await fetch("/v1/backtest/weekly-breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: symbols
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean),
          strategy,
          lookback_weeks: Number(lookbackWeeks),
          forward_weeks: Number(forwardWeeks),
          cooldown_weeks: Number(forwardWeeks),
          include_developing: false,
          require_full_strategy_coverage: fullCoverage,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setResult((await response.json()) as BacktestResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed.");
    } finally {
      setLoading(false);
    }
  }

  const stats = result?.stats;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RESEARCH / HISTORICAL REPLAY</div>
          <h1>Backtest Lab</h1>
          <p>
            Replay the weekly engine across historical candles using the same
            strategy contract. Unsupported point-in-time fields are reported,
            never silently fabricated.
          </p>
        </div>
        <div className="live-mode-badge">
          <FlaskConical size={15} />
          RESEARCH MODE
        </div>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Replay configuration</div>
            <div className="panel__subtitle">
              Forward return is measured from the signal close to the selected horizon.
            </div>
          </div>
        </div>
        <div className="panel__body">
          <div className="filter-grid">
            <label className="field">
              <span>Symbols</span>
              <input value={symbols} onChange={(event) => setSymbols(event.target.value)} />
            </label>
            <label className="field">
              <span>Lookback weeks</span>
              <input
                value={lookbackWeeks}
                onChange={(event) => setLookbackWeeks(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>Forward weeks</span>
              <select
                value={forwardWeeks}
                onChange={(event) => setForwardWeeks(event.target.value)}
              >
                <option value="1">1 week</option>
                <option value="4">4 weeks</option>
                <option value="8">8 weeks</option>
                <option value="12">12 weeks</option>
              </select>
            </label>
          </div>
          <div className="quick-row">
            <label className="news-toggle">
              <input
                type="checkbox"
                checked={usePreset}
                onChange={(event) => setUsePreset(event.target.checked)}
              />
              Apply Medical Catalyst Weekly preset where history supports it
            </label>
            <label className="news-toggle">
              <input
                type="checkbox"
                checked={fullCoverage}
                onChange={(event) => setFullCoverage(event.target.checked)}
              />
              Require full point-in-time coverage
            </label>
          </div>
          <button className="button button--primary" onClick={run} disabled={loading}>
            {loading ? <Activity size={16} /> : <Play size={16} fill="currentColor" />}
            {loading ? "Replaying…" : "Run historical replay"}
          </button>
          {error ? <div className="live-error">{error}</div> : null}
        </div>
      </section>

      {result ? (
        <>
          {!result.coverage.full_coverage ? (
            <div className="warning-strip">
              <span>
                Historical coverage omitted: {result.coverage.omitted_fields.join(", ")}.
                These fields were not treated as if historical values existed.
              </span>
            </div>
          ) : null}

          <div className="metrics-grid">
            <div className="metric-card metric-card--green">
              <div className="metric-card__label">Signals</div>
              <div className="metric-card__value">{stats?.signals ?? 0}</div>
              <div className="metric-card__detail">Non-overlapping events</div>
            </div>
            <div className="metric-card metric-card--purple">
              <div className="metric-card__label">Win Rate</div>
              <div className="metric-card__value">{stats?.win_rate_pct.toFixed(1)}%</div>
              <div className="metric-card__detail">Forward return above zero</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Average Return</div>
              <div className="metric-card__value">{stats?.average_return_pct.toFixed(2)}%</div>
              <div className="metric-card__detail">{forwardWeeks}-week horizon</div>
            </div>
            <div className="metric-card metric-card--orange">
              <div className="metric-card__label">Avg MAE</div>
              <div className="metric-card__value">{stats?.average_mae_pct.toFixed(2)}%</div>
              <div className="metric-card__detail">Worst excursion after signal</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Historical signals</div>
                <div className="panel__subtitle">
                  {"Best " + (stats?.best_return_pct.toFixed(2) ?? "0.00") +
                    "% · Worst " + (stats?.worst_return_pct.toFixed(2) ?? "0.00") +
                    "% · Median " + (stats?.median_return_pct.toFixed(2) ?? "0.00") + "%"}
                </div>
              </div>
            </div>
            <div className="panel__body table-wrap">
              <table className="scanner-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Tier</th>
                    <th>Score</th>
                    <th>Entry</th>
                    <th>Forward Return</th>
                    <th>MFE</th>
                    <th>MAE</th>
                    <th>Stop Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.slice(0, 100).map((event) => (
                    <tr key={event.symbol + "-" + event.as_of}>
                      <td>{new Date(event.as_of).toLocaleDateString()}</td>
                      <td><strong>{event.symbol}</strong></td>
                      <td>{event.tier}</td>
                      <td>{event.intelligence_score.toFixed(0)}</td>
                      <td>{"$" + event.entry_price.toFixed(2)}</td>
                      <td className={event.forward_return_pct >= 0 ? "positive" : "negative"}>
                        {event.forward_return_pct.toFixed(2)}%
                      </td>
                      <td className="positive">{event.max_favorable_excursion_pct.toFixed(2)}%</td>
                      <td className="negative">{event.max_adverse_excursion_pct.toFixed(2)}%</td>
                      <td>
                        {event.stop_risk_pct !== null
                          ? event.stop_risk_pct.toFixed(2) + "%"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {result.errors.length ? (
            <div className="warning-strip">
              {result.errors.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
