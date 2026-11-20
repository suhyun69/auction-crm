import { createClient } from "graphql-ws";
import { API_ORIGIN } from "./api";
import type { DashboardLink } from "./live-dashboard";
import type { DashboardData } from "./types";

const DASHBOARD_FIELDS = `
  summary { bidCount participantCount highestAmount highestBidderName }
  participants { participantId customerName rank highestAcceptedAmount bidCount lastBidAt }
`;
const DASHBOARD_QUERY = `query Dashboard { dashboard { ${DASHBOARD_FIELDS} } }`;
const DASHBOARD_SUBSCRIPTION = `subscription DashboardChanged { dashboardChanged { ${DASHBOARD_FIELDS} } }`;

type GraphqlResponse<T> = { data?: T | null; errors?: { message: string }[] };

/**
 * api2의 GraphQL로 대시보드를 읽고 구독한다.
 * 조회는 HTTP POST /graphql, 구독은 같은 경로의 WebSocket(graphql-ws 프로토콜)이다.
 * 끊기면 graphql-ws가 다시 연결하고 구독도 다시 맺는다.
 */
export function createGraphqlDashboardLink(origin: string = API_ORIGIN): DashboardLink {
  const httpUrl = `${origin}/graphql`;
  const wsUrl = httpUrl.replace(/^http/, "ws");

  return {
    async query(signal) {
      const response = await fetch(httpUrl, {
        method: "POST",
        cache: "no-store",
        signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: DASHBOARD_QUERY }),
      });
      const body = (await response.json()) as GraphqlResponse<{ dashboard: DashboardData }>;
      if (!response.ok || body.errors?.length || !body.data) {
        throw new Error(body.errors?.[0]?.message ?? `GraphQL request failed: ${response.status}`);
      }
      return body.data.dashboard;
    },

    subscribe({ onConnected, onClosed, onData, onFailed }) {
      const client = createClient({
        url: wsUrl,
        lazy: false,
        // 서버 재시작·네트워크 끊김은 계속 다시 시도한다. 거절(원점 불허 등)은 retry에서 끊김으로 보인다.
        retryAttempts: Number.POSITIVE_INFINITY,
        shouldRetry: () => true,
        on: { connected: onConnected, closed: onClosed },
      });
      const unsubscribe = client.subscribe<{ dashboardChanged: DashboardData }>(
        { query: DASHBOARD_SUBSCRIPTION },
        {
          next: result => {
            if (result.data?.dashboardChanged) onData(result.data.dashboardChanged);
          },
          error: () => onFailed(),
          complete: () => {},
        },
      );
      return () => {
        unsubscribe();
        void client.dispose();
      };
    },
  };
}
