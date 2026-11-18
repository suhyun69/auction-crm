import type { DashboardData } from "./types";

export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:8080").replace(/\/+$/, "");

export async function fetchDashboard(signal: AbortSignal): Promise<DashboardData> {
  const response = await fetch(`${API_ORIGIN}/api/dashboard`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`);
  return response.json() as Promise<DashboardData>;
}
