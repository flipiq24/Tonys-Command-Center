const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOKEN_KEY = "tcc_auth_token";

function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const t = getToken();
  return {
    "Content-Type": "application/json",
    ...(t ? { "x-tcc-token": t } : {}),
    ...extra,
  };
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function hasAuthToken(): boolean {
  return !!sessionStorage.getItem(TOKEN_KEY);
}

async function handleResponse<T>(res: Response, label: string): Promise<T> {
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
  return res.json();
}

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { headers: headers() });
  return handleResponse<T>(res, `GET ${path}`);
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res, `POST ${path}`);
}

export const API_BASE = `${BASE}/api`;
