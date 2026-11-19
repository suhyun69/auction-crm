import { API_ORIGIN, fetchDashboard } from "./api";
import type { ConnectionStatus, DashboardData, Participant } from "./types";

type Callbacks = {
  onData: (data: DashboardData) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
  onConnection: (status: ConnectionStatus) => void;
  onChanged: (ids: number[]) => void;
  /** 호출 흐름 화면용. SSE 수신과 대시보드 재조회의 시작·끝을 알린다. */
  onTraffic?: (traffic: WebTraffic) => void;
};

export type WebTraffic =
  | { kind: "sse"; name: string }
  | { kind: "refresh"; direction: "request" }
  | { kind: "refresh"; direction: "response"; ok: boolean; durationMs: number };

function participantChanged(previous: Participant | undefined, next: Participant) {
  return !previous || previous.rank !== next.rank || previous.bidCount !== next.bidCount ||
    previous.highestAcceptedAmount !== next.highestAcceptedAmount || previous.lastBidAt !== next.lastBidAt ||
    previous.customerName !== next.customerName;
}

/** Serialized reads publish in order; a dirty flag schedules one follow-up for pending events. */
export function createLiveDashboard(callbacks: Callbacks) {
  let disposed = false;
  let dirty = false;
  let running = false;
  let scheduled = false;
  let previous: DashboardData | null = null;
  let controller: AbortController | null = null;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let source: EventSource | null = null;

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
    callbacks.onTraffic?.({ kind: "refresh", direction: "request" });
    try {
      const data = await fetchDashboard(requestController.signal);
      if (!disposed) callbacks.onTraffic?.({ kind: "refresh", direction: "response", ok: true, durationMs: Date.now() - started });
      if (!disposed) {
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
    } catch {
      if (!disposed) callbacks.onTraffic?.({ kind: "refresh", direction: "response", ok: false, durationMs: Date.now() - started });
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

  function connect() {
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

  connect();
  refresh();

  return {
    retry() {
      if (disposed) return;
      if (source?.readyState !== EventSource.OPEN) connect();
      refresh();
    },
    dispose() {
      disposed = true;
      dirty = false;
      controller?.abort();
      clearTimeout(requestTimer);
      clearTimeout(highlightTimer);
      closeSource();
    },
  };
}
