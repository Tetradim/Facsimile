import { Capacitor } from "@capacitor/core";
import {
  runStandaloneWeeklyScan,
  standaloneProviderStatus,
  type StandaloneScanRequest,
} from "./standalone";
import {
  createStandaloneWatchlist,
  deleteStandaloneWatchlist,
  listStandaloneWatchlists,
  refreshStandaloneWatchlist,
  runStandaloneBacktest,
  standaloneChart,
  standaloneStrategyPresets,
  standaloneWatchlistEvents,
  type StandaloneBacktestRequest,
} from "./standaloneResearch";
import {
  standaloneOpeningBatch,
  standaloneOpeningBreakout,
  type StandaloneOpeningBatchRequest,
} from "./standaloneOpening";
import {
  createStandalonePosition,
  deleteStandalonePosition,
  listStandalonePositions,
  refreshStandalonePosition,
  runStandaloneMonteCarlo,
  type MobileMonteCarloRequest,
} from "./standaloneTrade";

const STORAGE_KEY = "facsimile.apiBaseUrl";
const MODE_KEY = "facsimile.mobileMode";

export type MobileMode = "standalone" | "remote";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getMobileMode(): MobileMode {
  if (!isNativeApp()) return "remote";
  const stored = window.localStorage.getItem(MODE_KEY);
  return stored === "remote" ? "remote" : "standalone";
}

export function setMobileMode(mode: MobileMode): void {
  window.localStorage.setItem(MODE_KEY, mode);
}

export function defaultApiBaseUrl(): string {
  return "";
}

export function getApiBaseUrl(): string {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim()) {
    return normalizeBaseUrl(stored);
  }
  return defaultApiBaseUrl();
}

export function setApiBaseUrl(value: string): void {
  const normalized = normalizeBaseUrl(value);
  if (normalized) {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function standaloneFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const parsed = new URL(path, "https://facsimile.local");
  const pathname = parsed.pathname;

  if (pathname === "/health") {
    return jsonResponse({
      status: "ok",
      service: "facsimile-android-standalone",
      mode: "standalone",
    });
  }

  if (pathname === "/v1/live/providers") {
    return jsonResponse(standaloneProviderStatus());
  }

  if (pathname === "/v1/live/scan/weekly-breakout") {
    const request: StandaloneScanRequest = init?.body
      ? JSON.parse(String(init.body))
      : {};
    const result = await runStandaloneWeeklyScan(request);
    return jsonResponse(result);
  }

  if (pathname === "/v1/strategies/presets") {
    return jsonResponse(standaloneStrategyPresets());
  }

  if (pathname.startsWith("/v1/live/chart/")) {
    const symbol = decodeURIComponent(
      pathname.slice("/v1/live/chart/".length),
    );
    const weeks = Number(parsed.searchParams.get("weeks") ?? "104");
    const result = await standaloneChart(
      symbol,
      Number.isFinite(weeks) ? weeks : 104,
    );
    return jsonResponse(result);
  }

  if (pathname === "/v1/backtest/weekly-breakout") {
    const request = init?.body
      ? JSON.parse(String(init.body)) as {
          symbols?: string[];
          lookback_weeks?: number;
          forward_weeks?: number;
        }
      : {};
    const symbols = (request.symbols ?? [])
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter(Boolean);
    const weeks = Math.max(
      52,
      Math.min(request.lookback_weeks ?? 260, 520),
    );
    const forwardWeeks = Math.max(
      1,
      Math.min(request.forward_weeks ?? 4, 26),
    );
    const benchmark = await standaloneChart("SPY", weeks);
    const preset =
      standaloneStrategyPresets().find(
        (item) => item.name === "Weekly Breakout Technical",
      ) ?? null;

    const events: Array<{
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
    }> = [];
    const errors: string[] = [];

    for (const symbol of symbols) {
      try {
        const chart = await standaloneChart(symbol, weeks);
        const result = await runStandaloneBacktest({
          profile: {
            symbol,
            sector: chart.profile.sector,
            industry: chart.profile.industry,
            market_cap: chart.profile.market_cap,
          },
          weekly_bars: chart.bars,
          benchmark_bars: benchmark.bars,
          strategy: preset,
          max_holding_weeks: forwardWeeks,
          initial_equity: 10000,
          position_size_pct: 1,
          slippage_pct: 0,
        });
        for (const trade of result.trades) {
          events.push({
            symbol,
            as_of: trade.signal_time,
            state: "confirmed",
            tier: trade.tier,
            intelligence_score: trade.overall,
            entry_price: trade.entry_price,
            exit_price: trade.exit_price,
            forward_return_pct: trade.return_pct * 100,
            max_favorable_excursion_pct: Math.max(
              0,
              trade.return_pct * 100,
            ),
            max_adverse_excursion_pct: Math.min(
              0,
              trade.return_pct * 100,
            ),
            stop_risk_pct:
              trade.stop_price == null || trade.entry_price <= 0
                ? null
                : ((trade.entry_price - trade.stop_price) /
                    trade.entry_price) *
                  100,
          });
        }
      } catch (error) {
        errors.push(
          symbol +
            ": " +
            (error instanceof Error ? error.message : "backtest failed"),
        );
      }
    }

    const returns = events.map((event) => event.forward_return_pct);
    const ordered = [...returns].sort((a, b) => a - b);
    const median =
      ordered.length === 0
        ? 0
        : ordered.length % 2
          ? ordered[Math.floor(ordered.length / 2)]
          : (ordered[ordered.length / 2 - 1] +
              ordered[ordered.length / 2]) /
            2;
    const stats = {
      signals: events.length,
      win_rate_pct: events.length
        ? (returns.filter((value) => value > 0).length / events.length) *
          100
        : 0,
      average_return_pct: events.length
        ? returns.reduce((sum, value) => sum + value, 0) / events.length
        : 0,
      median_return_pct: median,
      best_return_pct: events.length ? Math.max(...returns) : 0,
      worst_return_pct: events.length ? Math.min(...returns) : 0,
      average_mfe_pct: events.length
        ? events.reduce(
            (sum, event) =>
              sum + event.max_favorable_excursion_pct,
            0,
          ) / events.length
        : 0,
      average_mae_pct: events.length
        ? events.reduce(
            (sum, event) =>
              sum + event.max_adverse_excursion_pct,
            0,
          ) / events.length
        : 0,
    };
    return jsonResponse({
      request,
      coverage: {
        supported_fields: [],
        omitted_fields: [],
        full_coverage: true,
      },
      stats,
      events,
      errors,
    });
  }

  if (pathname === "/v1/backtest/weekly") {
    const request: StandaloneBacktestRequest = init?.body
      ? JSON.parse(String(init.body))
      : {
          profile: { symbol: "" },
          weekly_bars: [],
        };
    const result = await runStandaloneBacktest(request);
    return jsonResponse(result);
  }

  if (pathname.startsWith("/v1/live/opening-breakout/") && pathname !== "/v1/live/opening-breakout/batch") {
    const symbol = decodeURIComponent(
      pathname.slice("/v1/live/opening-breakout/".length),
    );
    return jsonResponse(await standaloneOpeningBreakout(symbol));
  }

  if (pathname === "/v1/live/opening-breakout/batch" && init?.method === "POST") {
    const request: StandaloneOpeningBatchRequest = init?.body
      ? JSON.parse(String(init.body))
      : { symbols: [] };
    return jsonResponse(await standaloneOpeningBatch(request));
  }

  if (pathname === "/v1/simulation/monte-carlo" && init?.method === "POST") {
    const request: MobileMonteCarloRequest = init?.body
      ? JSON.parse(String(init.body))
      : { returns_pct: [] };
    return jsonResponse(runStandaloneMonteCarlo(request));
  }

  if (pathname === "/v1/positions" && (!init?.method || init.method === "GET")) {
    return jsonResponse(listStandalonePositions());
  }

  if (pathname === "/v1/positions" && init?.method === "POST") {
    const body = init.body
      ? JSON.parse(String(init.body))
      : {};
    return jsonResponse(createStandalonePosition(body));
  }

  if (pathname.startsWith("/v1/positions/")) {
    const parts = pathname.split("/").filter(Boolean);
    const id = parts[2] ?? "";
    const action = parts[3] ?? "";

    if (action === "refresh" && init?.method === "POST") {
      return jsonResponse(await refreshStandalonePosition(id));
    }

    if (!action && init?.method === "DELETE") {
      deleteStandalonePosition(id);
      return jsonResponse({ deleted: true });
    }
  }

  if (pathname === "/v1/watchlists" && (!init?.method || init.method === "GET")) {
    return jsonResponse(listStandaloneWatchlists());
  }

  if (pathname === "/v1/watchlists" && init?.method === "POST") {
    const body = init.body
      ? JSON.parse(String(init.body))
      : {};
    return jsonResponse(createStandaloneWatchlist(body));
  }

  if (pathname.startsWith("/v1/watchlists/")) {
    const parts = pathname.split("/").filter(Boolean);
    const id = parts[2] ?? "";
    const action = parts[3] ?? "";

    if (action === "refresh" && init?.method === "POST") {
      return jsonResponse(await refreshStandaloneWatchlist(id));
    }

    if (action === "events" && (!init?.method || init.method === "GET")) {
      const limit = Number(parsed.searchParams.get("limit") ?? "100");
      return jsonResponse(
        standaloneWatchlistEvents(
          id,
          Number.isFinite(limit) ? limit : 100,
        ),
      );
    }

    if (!action && init?.method === "DELETE") {
      deleteStandaloneWatchlist(id);
      return jsonResponse({ status: "deleted", id });
    }
  }

  return jsonResponse(
    {
      detail:
        "This endpoint is not implemented in standalone Android mode. " +
        "Switch to Remote mode in Settings to use the Python API.",
    },
    501,
  );
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (isNativeApp() && getMobileMode() === "standalone") {
    return standaloneFetch(path, init);
  }
  return fetch(apiUrl(path), init);
}
