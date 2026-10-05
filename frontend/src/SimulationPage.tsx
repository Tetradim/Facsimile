import { useMemo, useState } from "react";
import { Activity, Dices, Play } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type BacktestResponse = {
  stats: {
    signals: number;
  };
  events: Array<{
    intelligence_score: number;
    forward_return_pct: number;
  }>;
  errors: string[];
};

type MonteCarloResponse = {
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

export function SimulationPage() {
  const [symbols, setSymbols] = useState("RKLB,LUNR,ASTS,RXRX");
  const [minScore, setMinScore] = useState("70");
  const [startingEquity, setStartingEquity] = useState("10000");
  const [positionFraction, setPositionFraction] = useState("25");
  const [runs, setRuns] = useState("2000");
  const [tradesPerRun, setTradesPerRun] = useState("50");
  const [result, setResult] = useState<MonteCarloResponse | null>(null);
  const [sourceSignals, setSourceSignals] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setLoading(true);
    setMessage("");
    try {
      const backtestResponse = await fetch("/v1/backtest/weekly-breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: symbols
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean),
          lookback_weeks: 260,
          forward_weeks: 4,
          cooldown_weeks: 4,
          include_developing: false,
        }),
      });
      if (!backtestResponse.ok) {
        throw new Error(await backtestResponse.text());
      }
      const backtest = (await backtestResponse.json()) as BacktestResponse;
      const threshold = Number(minScore);
      const returns = backtest.events
        .filter((event) => event.intelligence_score >= threshold)
        .map((event) => event.forward_return_pct);

      setSourceSignals(returns.length);
      if (returns.length < 2) {
        throw new Error(
          "Not enough historical signals survived the score threshold. " +
          "Add symbols or lower the minimum score.",
        );
      }

      const simulationResponse = await fetch("/v1/simulation/monte-carlo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returns_pct: returns,
          starting_equity: Number(startingEquity),
          position_fraction: Number(positionFraction) / 100,
          runs: Number(runs),
          trades_per_run: Number(tradesPerRun),
          ruin_fraction: 0.5,
          seed: 42,
          sample_paths: 20,
        }),
      });
      if (!simulationResponse.ok) {
        throw new Error(await simulationResponse.text());
      }
      setResult((await simulationResponse.json()) as MonteCarloResponse);
      if (backtest.errors.length) {
        setMessage(backtest.errors.join(" · "));
      }
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    if (!result?.sample_paths.length) return [];
    const maxLength = Math.max(
      ...result.sample_paths.map((path) => path.equity.length),
    );
    return Array.from({ length: maxLength }, (_, index) => {
      const row: Record<string, number> = { trade: index };
      result.sample_paths.slice(0, 12).forEach((path) => {
        const value = path.equity[index];
        if (value !== undefined) row["run" + path.run] = value;
      });
      return row;
    });
  }, [result]);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RESEARCH / EQUITY DISTRIBUTIONS</div>
          <h1>Simulation Lab</h1>
          <p>
            Bootstrap actual historical Facsimile signal returns into thousands
            of randomized trade sequences. Score thresholds and position sizing
            are explicit inputs—not auto-retuned parameters.
          </p>
        </div>
        <div className="live-mode-badge">
          <Dices size={15} />
          MONTE CARLO
        </div>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Simulation inputs</div>
            <div className="panel__subtitle">
              Historical source: 4-week forward returns from completed weekly signals.
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
              <span>Minimum intelligence score</span>
              <input
                value={minScore}
                onChange={(event) => setMinScore(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>Starting equity</span>
              <input
                value={startingEquity}
                onChange={(event) => setStartingEquity(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="field">
              <span>Position fraction %</span>
              <input
                value={positionFraction}
                onChange={(event) => setPositionFraction(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="field">
              <span>Runs</span>
              <select value={runs} onChange={(event) => setRuns(event.target.value)}>
                <option value="1000">1,000</option>
                <option value="2000">2,000</option>
                <option value="5000">5,000</option>
                <option value="10000">10,000</option>
              </select>
            </label>
            <label className="field">
              <span>Trades per run</span>
              <input
                value={tradesPerRun}
                onChange={(event) => setTradesPerRun(event.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
          <button className="button button--primary" onClick={run} disabled={loading}>
            {loading ? <Activity size={16} /> : <Play size={16} fill="currentColor" />}
            {loading ? "Simulating…" : "Run simulation"}
          </button>
          {message ? <div className="connection-status">{message}</div> : null}
        </div>
      </section>

      {result ? (
        <>
          <div className="metrics-grid">
            <div className="metric-card metric-card--purple">
              <div className="metric-card__label">Source Signals</div>
              <div className="metric-card__value">{sourceSignals}</div>
              <div className="metric-card__detail">
                {"Score ≥ " + Number(minScore).toFixed(0)}
              </div>
            </div>
            <div className="metric-card metric-card--green">
              <div className="metric-card__label">Profitable Runs</div>
              <div className="metric-card__value">
                {result.probability_profitable_pct.toFixed(1) + "%"}
              </div>
              <div className="metric-card__detail">
                Ending equity above start
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Median Ending Equity</div>
              <div className="metric-card__value">
                {"$" + result.ending_equity_p50.toLocaleString()}
              </div>
              <div className="metric-card__detail">
                {"P10 $" + result.ending_equity_p10.toLocaleString() +
                  " · P90 $" + result.ending_equity_p90.toLocaleString()}
              </div>
            </div>
            <div className="metric-card metric-card--orange">
              <div className="metric-card__label">90th %ile Max DD</div>
              <div className="metric-card__value">
                {result.max_drawdown_p90_pct.toFixed(1) + "%"}
              </div>
              <div className="metric-card__detail">
                {"Ruin ≤50% start: " + result.probability_ruin_pct.toFixed(1) + "%"}
              </div>
            </div>
          </div>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Sample equity paths</div>
                <div className="panel__subtitle">
                  {"First 12 of " + result.runs.toLocaleString() +
                    " deterministic-seed bootstrap runs"}
                </div>
              </div>
            </div>
            <div className="panel__body chart chart--large">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#202938" vertical={false} />
                  <XAxis
                    dataKey="trade"
                    stroke="#6f7d90"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f1622",
                      border: "1px solid #263246",
                      borderRadius: 10,
                    }}
                  />
                  {result.sample_paths.slice(0, 12).map((path) => (
                    <Line
                      key={path.run}
                      type="monotone"
                      dataKey={"run" + path.run}
                      dot={false}
                      strokeWidth={1.2}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Distribution summary</div>
                <div className="panel__subtitle">
                  Ending equity percentiles across all bootstrap runs
                </div>
              </div>
            </div>
            <div className="panel__body context-grid">
              <div><span>P10</span><strong>{"$" + result.ending_equity_p10.toLocaleString()}</strong></div>
              <div><span>P25</span><strong>{"$" + result.ending_equity_p25.toLocaleString()}</strong></div>
              <div><span>P50</span><strong>{"$" + result.ending_equity_p50.toLocaleString()}</strong></div>
              <div><span>P75</span><strong>{"$" + result.ending_equity_p75.toLocaleString()}</strong></div>
              <div><span>P90</span><strong>{"$" + result.ending_equity_p90.toLocaleString()}</strong></div>
              <div><span>Median max DD</span><strong>{result.max_drawdown_p50_pct.toFixed(1) + "%"}</strong></div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
