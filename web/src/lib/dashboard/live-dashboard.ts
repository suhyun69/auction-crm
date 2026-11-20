import { API_ORIGIN, fetchDashboard } from "./api";
import type { ConnectionStatus, DashboardData, Participant } from "./types";

type Callbacks = {
  onData: (data: DashboardData) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
  onConnection: (status: ConnectionStatus) => void;
  onChanged: (ids: number[]) => void;
  /** 호출 흐름 화면용. 변경 알림(SSE·GraphQL 구독) 수신과 대시보드 조회의 시작·끝을 알린다. */
  onTraffic?: (traffic: WebTraffic) => void;
};

/** graphql 모드에서만 `protocol: "graphql"`이 붙는다. */
export type WebTraffic = (
  | { kind: "sse"; name: string }
  | { kind: "refresh"; direction: "request" }
  | { kind: "refresh"; direction: "response"; ok: boolean; durationMs: number }
) & { protocol?: "graphql" };

/**
 * GraphQL로 대시보드를 읽고 구독하는 연결. 실제 구현은 graphql.ts(graphql-ws)이고, 테스트는 가짜를 넘긴다.
 * subscribe는 연결 해제 함수를 돌려준다.
 */
export type DashboardLink = {
  query: (signal: AbortSignal) => Promise<DashboardData>;
  subscribe: (handlers: {
    /** 연결(재연결 포함)될 때마다. 그동안 놓친 변경이 있을 수 있어 전체를 다시 읽는다. */
    onConnected: () => void;
    onClosed: () => void;
    /** 커밋된 응찰 뒤의 최신 대시보드 */
    onData: (data: DashboardData) => void;
    /** 다시 연결하지 않는 실패 */
    onFailed: () => void;
  }) => () => void;
};

type Options = {
  /** 넘기면 graphql 모드: SSE·REST 조회 대신 이 연결로 읽고 구독한다. */
  graphql?: DashboardLink;
};

function participantChanged(previous: Participant | undefined, next: Participant) {
  return !previous || previous.rank !== next.rank || previous.bidCount !== next.bidCount ||
    previous.highestAcceptedAmount !== next.highestAcceptedAmount || previous.lastBidAt !== next.lastBidAt ||
    previous.customerName !== next.customerName;
}

/**
 * Serialized reads publish in order; a dirty flag schedules one follow-up for pending events.
 * rest 모드: SSE 알림마다 GET /api/dashboard로 다시 읽는다.
 * graphql 모드: (재)연결 때 query로 읽고, 구독이 보내 준 대시보드는 다시 읽지 않고 바로 그린다.
 */
export function createLiveDashboard(callbacks: Callbacks, options: Options = {}) {
  const link = options.graphql;
  const protocol = link ? { protocol: "graphql" as const } : {};
  let disposed = false;
  let dirty = false;
  let running = false;
  let scheduled = false;
  let previous: DashboardData | null = null;
  let controller: AbortController | null = null;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let source: EventSource | null = null;
  let closeSubscription: (() => void) | null = null;
  let subscriptionOpen = false;
  /** 구독으로 받은 대시보드 수. 조회가 진행되는 동안 바뀌었는지 확인하는 데 쓴다. */
  let pushes = 0;

  function refresh() {
    if (disposed) return;
    dirty = true;
    if (running || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!disposed) void read();
    });
  }

  /** 새 스냅샷을 그리고, 바뀐 행을 잠시 강조한다. */
  function apply(data: DashboardData) {
    const oldRows = new Map(previous?.participants.map((row) => [row.participantId, row]));
    const changed = previous ? data.participants.filter((row) => participantChanged(oldRows.get(row.participantId), row)).map((row) => row.participantId) : [];
    if (changed.length > 0) {
      clearTimeout(highlightTimer);
      callbacks.onChanged(changed);
      highlightTimer = setTimeout(() => { if (!disposed) callbacks.onChanged([]); }, 1800);
    }
    previous = data;
    callbacks.onData(data);
    callbacks.onError(null);
  }

  async function read() {
    if (running || !dirty || disposed) return;
    running = true;
    dirty = false;
    controller = new AbortController();
    const requestController = controller;
    // A lost HTTP connection must not block later SSE invalidations indefinitely.
    requestTimer = setTimeout(() => requestController.abort(), 15000);
    callbacks.onLoading(true);
    const started = Date.now();
    callbacks.onTraffic?.({ kind: "refresh", direction: "request", ...protocol });
    const pushesAtStart = pushes;
    try {
      const data = link ? await link.query(requestController.signal) : await fetchDashboard(requestController.signal);
      if (!disposed) callbacks.onTraffic?.({ kind: "refresh", direction: "response", ok: true, durationMs: Date.now() - started, ...protocol });
      // graphql 모드에서 조회와 구독은 다른 연결로 온다. 조회하는 동안 더 새 구독 메시지를 이미 그렸다면
      // (응찰 수가 더 많다면) 늦게 도착한 조회 결과는 옛 값이라 버린다. DB 초기화처럼 정말 줄어든 경우는 받아들인다.
      const stale = pushes !== pushesAtStart && previous !== null && data.summary.bidCount < previous.summary.bidCount;
      if (!disposed && !stale) apply(data);
      else if (!disposed) callbacks.onError(null);
    } catch {
      if (!disposed) callbacks.onTraffic?.({ kind: "refresh", direction: "response", ok: false, durationMs: Date.now() - started, ...protocol });
      if (!disposed) callbacks.onError("연결 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      clearTimeout(requestTimer);
      if (controller === requestController) controller = null;
      running = false;
      if (!disposed) {
        if (dirty) refresh();
        else callbacks.onLoading(false);
      }
    }
  }

  function onEvent(event: Event) {
    if (!disposed) callbacks.onTraffic?.({ kind: "sse", name: event.type });
    refresh();
  }

  function closeSource() {
    if (!source) return;
    source.onopen = null;
    source.onerror = null;
    source.removeEventListener("ready", onEvent);
    source.removeEventListener("dashboard-changed", onEvent);
    source.close();
    source = null;
  }

  function connectSse() {
    closeSource();
    callbacks.onConnection("connecting");
    source = new EventSource(`${API_ORIGIN}/api/events`);
    source.onopen = () => {
      if (disposed) return;
      callbacks.onConnection("connected");
      refresh();
    };
    source.addEventListener("ready", onEvent);
    source.addEventListener("dashboard-changed", onEvent);
    source.onerror = () => {
      if (!disposed) callbacks.onConnection(source?.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    };
  }

  function connectGraphql(graphql: DashboardLink) {
    closeSubscription?.();
    subscriptionOpen = false;
    callbacks.onConnection("connecting");
    let failed = false;
    closeSubscription = graphql.subscribe({
      onConnected() {
        if (disposed || failed) return;
        subscriptionOpen = true;
        callbacks.onConnection("connected");
        refresh();
      },
      onClosed() {
        if (disposed || failed) return;
        subscriptionOpen = false;
        callbacks.onConnection("reconnecting");
      },
      onData(data) {
        if (disposed) return;
        callbacks.onTraffic?.({ kind: "sse", name: "dashboardChanged", protocol: "graphql" });
        pushes++;
        apply(data);
      },
      onFailed() {
        if (disposed) return;
        failed = true;
        subscriptionOpen = false;
        callbacks.onConnection("disconnected");
      },
    });
  }

  function connect() {
    if (link) connectGraphql(link);
    else connectSse();
  }

  connect();
  refresh();

  return {
    retry() {
      if (disposed) return;
      const open = link ? subscriptionOpen : source?.readyState === EventSource.OPEN;
      if (!open) connect();
      refresh();
    },
    dispose() {
      disposed = true;
      dirty = false;
      controller?.abort();
      clearTimeout(requestTimer);
      clearTimeout(highlightTimer);
      closeSource();
      closeSubscription?.();
      closeSubscription = null;
    },
  };
}
