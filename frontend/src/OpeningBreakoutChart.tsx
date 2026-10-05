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

export type IntradayBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function pointTime(value: string): Time {
  return Math.floor(new Date(value).getTime() / 1000) as Time;
}

function cumulativeVwap(bars: IntradayBar[]): LineData<Time>[] {
  let pv = 0;
  let volume = 0;
  const output: LineData<Time>[] = [];
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    pv += typical * bar.volume;
    volume += bar.volume;
    if (volume > 0) {
      output.push({
        time: pointTime(bar.timestamp),
        value: pv / volume,
      });
    }
  }
  return output;
}

export function OpeningBreakoutChart({
  bars,
  openingHigh,
  openingLow,
  structuralStop,
  height = 430,
}: {
  bars: IntradayBar[];
  openingHigh: number | null;
  openingLow: number | null;
  structuralStop: number | null;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const candles = useMemo<CandlestickData<Time>[]>(
    () =>
      bars.map((bar) => ({
        time: pointTime(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    [bars],
  );
  const vwap = useMemo(() => cumulativeVwap(bars), [bars]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !candles.length) return;

    const chart = createChart(host, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#09101a" },
        textColor: "#7e8da3",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#151f2f" },
        horzLines: { color: "#151f2f" },
      },
      rightPriceScale: { borderColor: "#26344a" },
      timeScale: {
        borderColor: "#26344a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
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
    });
    candleSeries.setData(candles);

    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#4f8cff",
      lineWidth: 2,
      title: "VWAP",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    vwapSeries.setData(vwap);

    if (openingHigh !== null) {
      candleSeries.createPriceLine({
        price: openingHigh,
        color: "#a78bfa",
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "OR High",
      });
    }
    if (openingLow !== null) {
      candleSeries.createPriceLine({
        price: openingLow,
        color: "#7c3aed",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "OR Low",
      });
    }
    if (structuralStop !== null) {
      candleSeries.createPriceLine({
        price: structuralStop,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "Stop",
      });
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, vwap, openingHigh, openingLow, structuralStop, height]);

  return (
    <div className="lwc-shell">
      <div ref={hostRef} className="lwc-chart" style={{ height }} />
      <div className="lwc-attribution">
        Financial chart rendered with{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>
        .
      </div>
    </div>
  );
}
