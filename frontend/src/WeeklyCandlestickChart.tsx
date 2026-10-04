import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type CandlestickData,
  type LineData,
  type Time,
} from "lightweight-charts";

export type WeeklyChartBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type WeeklyChartCandidate = {
  box: {
    body_low: number;
    body_high: number;
    start: string;
    end: string;
  } | null;
  structural_stop: number | null;
  entry_price: number | null;
  state: "rejected" | "developing" | "confirmed";
};

function day(value: string): Time {
  return value.slice(0, 10) as Time;
}

function movingAverage(
  bars: WeeklyChartBar[],
  period: number,
): LineData<Time>[] {
  const points: LineData<Time>[] = [];
  let rolling = 0;
  const queue: number[] = [];

  for (const bar of bars) {
    queue.push(bar.close);
    rolling += bar.close;
    if (queue.length > period) {
      rolling -= queue.shift() ?? 0;
    }
    if (queue.length === period) {
      points.push({
        time: day(bar.timestamp),
        value: rolling / period,
      });
    }
  }
  return points;
}

export function WeeklyCandlestickChart({
  bars,
  candidate,
  height = 430,
}: {
  bars: WeeklyChartBar[];
  candidate: WeeklyChartCandidate | null;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const candles = useMemo<CandlestickData<Time>[]>(
    () =>
      bars.map((bar) => ({
        time: day(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    [bars],
  );
  const ma20 = useMemo(() => movingAverage(bars, 20), [bars]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || candles.length === 0) return;

    const chart = createChart(host, {
      autoSize: true,
      height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: "#09101a",
        },
        textColor: "#7e8da3",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#151f2f" },
        horzLines: { color: "#151f2f" },
      },
      rightPriceScale: {
        borderColor: "#26344a",
        scaleMargins: {
          top: 0.08,
          bottom: 0.10,
        },
      },
      timeScale: {
        borderColor: "#26344a",
        timeVisible: false,
        rightOffset: 4,
        barSpacing: 9,
      },
      crosshair: {
        vertLine: {
          color: "#425675",
          labelBackgroundColor: "#22334f",
        },
        horzLine: {
          color: "#425675",
          labelBackgroundColor: "#22334f",
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#55d983",
      wickDownColor: "#f07472",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    candleSeries.setData(candles);

    const maSeries = chart.addSeries(LineSeries, {
      color: "#4f8cff",
      lineWidth: 2,
      title: "20W MA",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    maSeries.setData(ma20);

    if (candidate?.box) {
      candleSeries.createPriceLine({
        price: candidate.box.body_high,
        color: "#a78bfa",
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Box resistance",
      });
      candleSeries.createPriceLine({
        price: candidate.box.body_low,
        color: "#7c3aed",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Box support",
      });
    }

    if (
      candidate?.structural_stop !== null &&
      candidate?.structural_stop !== undefined
    ) {
      candleSeries.createPriceLine({
        price: candidate.structural_stop,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "Structural stop",
      });
    }

    if (
      candidate?.entry_price !== null &&
      candidate?.entry_price !== undefined &&
      candidate.state === "confirmed"
    ) {
      candleSeries.createPriceLine({
        price: candidate.entry_price,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: "Confirmed close",
      });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [candles, ma20, candidate, height]);

  return (
    <div className="lwc-shell">
      <div
        ref={hostRef}
        className="lwc-chart"
        style={{ height }}
      />
      <div className="lwc-attribution">
        Financial chart rendered with{" "}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
        >
          TradingView Lightweight Charts™
        </a>
        .
      </div>
    </div>
  );
}
