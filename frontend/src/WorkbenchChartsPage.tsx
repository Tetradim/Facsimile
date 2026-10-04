import { useEffect, useMemo, useState } from "react";
import { Activity, Search } from "lucide-react";
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
  WeeklyCandlestickChart,
  type WeeklyChartBar,
  type WeeklyChartCandidate,
} from "./WeeklyCandlestickChart";

type ChartResponse = {
  symbol: string;
  profile: {
    company: string;
    price: number;
    sector: string | null;
    industry: string | null;
  };
  bars: WeeklyChartBar[];
  candidate: WeeklyChartCandidate & {
    stop_risk_pct: number | null;
    metrics: Record<string, number | string | boolean | null>;
  };
  source: string;
};

export function WorkbenchChartsPage() {
  const [symbol, setSymbol] = useState("RKLB");
  const [loadedSymbol, setLoadedSymbol] = useState("RKLB");
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextSymbol = symbol) {
    const clean = nextSymbol.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/v1/live/chart/" + encodeURIComponent(clean) + "?limit=140",
      );
      if (!response.ok) throw new Error(await response.text());
      setData((await response.json()) as ChartResponse);
      setLoadedSymbol(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load chart.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("RKLB");
  }, []);

  const volume = useMemo(
    () =>
      (data?.bars ?? []).slice(-40).map((bar) => ({
        week: bar.timestamp.slice(0, 10),
        volume: bar.volume,
      })),
    [data],
  );

  const metrics = data?.candidate.metrics ?? {};

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ANALYTICS / LIVE WEEKLY CHART</div>
          <h1>Charts</h1>
          <p>
            True weekly OHLC candles with the live consolidation box, resistance,
            structural stop, confirmed close, and 20-week moving average.
          </p>
        </div>
        <div className="symbol-search">
          <Search size={16} />
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            aria-label="Ticker symbol"
          />
          <button className="text-button" onClick={() => load()}>
            Load
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">
              {loadedSymbol}
              {data?.profile.company ? " · " + data.profile.company : ""}
            </div>
            <div className="panel__subtitle">
              {data
                ? data.source +
                  " · " +
                  data.candidate.state.toUpperCase() +
                  " · $" +
                  data.profile.price.toFixed(2)
                : "Loading completed weekly candles…"}
            </div>
          </div>
          {loading ? <Activity size={18} /> : null}
        </div>
        <div className="panel__body">
          {error ? <div className="live-error">{error}</div> : null}
          {data?.bars.length ? (
            <WeeklyCandlestickChart
              bars={data.bars}
              candidate={data.candidate}
              height={470}
            />
          ) : null}
        </div>
      </section>

      {data ? (
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Weekly Volume</div>
                <div className="panel__subtitle">Last 40 completed weeks</div>
              </div>
            </div>
            <div className="panel__body chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volume}>
                  <CartesianGrid stroke="#202938" vertical={false} />
                  <XAxis
                    dataKey="week"
                    stroke="#6f7d90"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis stroke="#6f7d90" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f1622",
                      border: "1px solid #263246",
                      borderRadius: 10,
                    }}
                  />
                  <Bar dataKey="volume" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Scanner Context</div>
                <div className="panel__subtitle">Live engine evidence</div>
              </div>
            </div>
            <div className="panel__body context-grid">
              <div>
                <span>Box width</span>
                <strong>
                  {data.candidate.box
                    ? (
                        (data.candidate.box.body_high /
                          data.candidate.box.body_low -
                          1) *
                        100
                      ).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Stop risk</span>
                <strong>
                  {data.candidate.stop_risk_pct !== null
                    ? (data.candidate.stop_risk_pct * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Close location</span>
                <strong>
                  {typeof metrics.close_location === "number"
                    ? (metrics.close_location * 100).toFixed(0) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Upper wick</span>
                <strong>
                  {typeof metrics.upper_wick_ratio === "number"
                    ? (metrics.upper_wick_ratio * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>NATR 14</span>
                <strong>
                  {typeof metrics.natr_14 === "number"
                    ? (metrics.natr_14 * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>RelVol</span>
                <strong className="positive">
                  {typeof metrics.volume_vs_average === "number"
                    ? metrics.volume_vs_average.toFixed(2) + "×"
                    : "—"}
                </strong>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
