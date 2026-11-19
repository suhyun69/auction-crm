import type { SimulationCommand, SimulatorSnapshot } from "./types";

type Callbacks = {
  onSnapshot: (snapshot: SimulatorSnapshot) => void;
  onError: (message: string | null) => void;
  onPending: (pending: boolean) => void;
};

/** GET reads never overlap; a command invalidates any older GET before mutation. */
export function createSimulatorClient(callbacks: Callbacks, pollMs = 500) {
  let disposed = false;
  let reading = false;
  let pending = false;
  let generation = 0;
  let last: SimulatorSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controllers = new Set<AbortController>();

  function accept(snapshot: SimulatorSnapshot) {
    if (last?.sessionId === snapshot.sessionId && snapshot.revision < last.revision) return;
    last = snapshot;
    callbacks.onSnapshot(snapshot);
  }
  async function request(method: string, body?: SimulationCommand & { sessionId: string; runId: string | null }) {
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/simulator", {
        method, cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "시뮬레이터 요청에 실패했습니다.");
      return data as SimulatorSnapshot;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed) timer = setTimeout(() => { void read(); }, pollMs);
  }
  async function read() {
    if (disposed || reading || pending) return;
    reading = true;
    const current = generation;
    try {
      const snapshot = await request("GET");
      if (!disposed && current === generation) { accept(snapshot); callbacks.onError(null); }
    } catch (error) {
      if (!disposed && current === generation) callbacks.onError(error instanceof Error ? error.message : "연결 상태를 확인해 주세요.");
    } finally { reading = false; schedule(); }
  }
  void read();
  return {
    async command(command: SimulationCommand) {
      if (disposed || pending) return;
      if (!last) { callbacks.onError("현재 실행 상태를 먼저 불러와 주세요."); return; }
      const identity = { sessionId: last.sessionId, runId: last.run?.runId ?? null };
      pending = true;
      generation++;
      clearTimeout(timer);
      callbacks.onPending(true);
      // The previous read is obsolete even if the server completes it after this POST.
      for (const controller of controllers) controller.abort();
      try {
        const snapshot = await request("POST", { ...command, ...identity });
        if (!disposed) { accept(snapshot); callbacks.onError(null); }
      } catch (error) {
        if (!disposed) callbacks.onError(error instanceof Error ? error.message : "제어 요청에 실패했습니다.");
      } finally {
        pending = false;
        if (!disposed) { callbacks.onPending(false); schedule(); }
      }
    },
    refresh() { if (!disposed) { clearTimeout(timer); void read(); } },
    dispose() {
      disposed = true;
      generation++;
      clearTimeout(timer);
      for (const controller of controllers) controller.abort();
    },
  };
}
