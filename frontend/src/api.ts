import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "facsimile.apiBaseUrl";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function defaultApiBaseUrl(): string {
  if (isNativeApp()) {
    return "http://10.0.2.2:8765";
  }
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

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(apiUrl(path), init);
}
