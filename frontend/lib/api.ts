"use client";

import { AIExtraction } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "sc_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  // Mirror to a cookie so middleware / SSR can read auth state.
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=43200; samesite=lax`;
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractErrorMessage(data, res.status), data);
  }
  return data as T;
}

/** Pull a human-readable message out of a DRF error body, including field
 * validation errors like {"entreprise": ["Ce champ est obligatoire."]}. */
function extractErrorMessage(data: unknown, status: number): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.detail;
    if (typeof obj.error === "string") return obj.error;
    // First field error: "champ: message"
    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      const msg = Array.isArray(val) ? val.join(", ") : String(val);
      parts.push(key === "non_field_errors" ? msg : `${key}: ${msg}`);
    }
    if (parts.length) return parts.join(" · ");
  }
  return `Erreur ${status}`;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Upload an invoice image to the Django scanner bridge (which calls the AI). */
export async function scannerUpload(
  file: File
): Promise<{ data: AIExtraction; erreurs: string[]; confiance: number }> {
  const form = new FormData();
  form.append("file", file);
  return api.post("/api/scanner/upload/", form);
}
