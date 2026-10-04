import { Capacitor } from "@capacitor/core";
import {
  runStandaloneWeeklyScan,
  standaloneProviderStatus,
  type StandaloneScanRequest,
} from "./standalone";

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
  if (path === "/health") {
    return jsonResponse({
      status: "ok",
      service: "facsimile-android-standalone",
      mode: "standalone",
    });
  }

  if (path === "/v1/live/providers") {
    return jsonResponse(standaloneProviderStatus());
  }

  if (path === "/v1/live/scan/weekly-breakout") {
    const request: StandaloneScanRequest = init?.body
      ? JSON.parse(String(init.body))
      : {};
    const result = await runStandaloneWeeklyScan(request);
    return jsonResponse(result);
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
