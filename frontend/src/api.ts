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
