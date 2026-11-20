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

/**
 * 대시보드 연결 방식. `rest`는 GET /api/dashboard + SSE(Spring api, api2 모두),
 * `graphql`은 GraphQL query + subscription(api2 전용)이다. 빌드할 때 정해진다.
 */
export type ApiProtocol = "rest" | "graphql";
export const API_PROTOCOL: ApiProtocol = process.env.NEXT_PUBLIC_API_PROTOCOL === "graphql" ? "graphql" : "rest";
