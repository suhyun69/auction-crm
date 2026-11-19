"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallFlowPanel, type CallFlowHandle } from "@/components/flow/call-flow-panel";
import { ParticipantDetailDialog } from "@/components/simulator/participant-detail-dialog";
import { SimulationLauncher } from "@/components/simulator/simulation-launcher";
import { createLiveDashboard } from "@/lib/dashboard/live-dashboard";
import type { ConnectionStatus, DashboardData } from "@/lib/dashboard/types";
import { findByName } from "@/lib/simulator/history";
import type { SimulationRun } from "@/lib/simulator/types";
import { DashboardView } from "./dashboard-view";

export function LiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [changedParticipantIds, setChangedParticipantIds] = useState<number[]>([]);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const client = useRef<ReturnType<typeof createLiveDashboard> | null>(null);
  const flow = useRef<CallFlowHandle>(null);

  useEffect(() => {
    const dashboard = createLiveDashboard({
      onData: setData, onLoading: setLoading, onError: setError,
      onConnection: setConnectionStatus, onChanged: setChangedParticipantIds,
      onTraffic: traffic => flow.current?.web(traffic),
    });
    client.current = dashboard;
    return () => {
      dashboard.dispose();
      client.current = null;
    };
  }, []);

  // 순위 행은 이름으로 가상 참가자와 이어진다. 실제 외부 응찰자는 열 상세가 없다.
  const simulationNames = useMemo(
    () => new Set((run?.participants ?? []).map(actor => actor.name.trim())),
    [run],
  );
  const openByName = useCallback((customerName: string) => {
    const actor = findByName(run, customerName);
    if (actor) setSelectedActorId(actor.id);
  }, [run]);
  const selectedActor = run?.participants.find(actor => actor.id === selectedActorId) ?? null;
  // 스냅샷을 받는 순간 호출 흐름에도 넘긴다. 실행 상태 보관과 같은 콜백이라 순서가 어긋나지 않는다.
  const handleRun = useCallback((next: SimulationRun | null) => {
    setRun(next);
    flow.current?.run(next);
  }, []);

  return <div className="split-layout">
    <main className="dashboard-shell live-dashboard split-main">
      <div className="dashboard-content">
        <SimulationLauncher onRun={handleRun} onSelectParticipant={setSelectedActorId} />
        <DashboardView data={data} loading={loading} error={error} connectionStatus={connectionStatus} changedParticipantIds={changedParticipantIds} onRetry={() => client.current?.retry()} simulationNames={simulationNames} onSelectParticipant={openByName} />
        <footer className="page-footer"><span>AUCTION CRM</span><span>금액 KRW · 시간 Asia/Seoul</span></footer>
      </div>
      {selectedActor && <ParticipantDetailDialog participant={selectedActor} events={run?.events ?? []} onClose={() => setSelectedActorId(null)} />}
    </main>
    <CallFlowPanel ref={flow} run={run} />
  </div>;
}
