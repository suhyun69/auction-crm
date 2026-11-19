"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  useEffect(() => {
    const dashboard = createLiveDashboard({
      onData: setData, onLoading: setLoading, onError: setError,
      onConnection: setConnectionStatus, onChanged: setChangedParticipantIds,
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

  return <main className="dashboard-shell live-dashboard">
    <SimulationLauncher onRun={setRun} onSelectParticipant={setSelectedActorId} />
    <DashboardView data={data} loading={loading} error={error} connectionStatus={connectionStatus} changedParticipantIds={changedParticipantIds} onRetry={() => client.current?.retry()} simulationNames={simulationNames} onSelectParticipant={openByName} />
    {selectedActor && <ParticipantDetailDialog participant={selectedActor} events={run?.events ?? []} onClose={() => setSelectedActorId(null)} />}
    <footer className="page-footer"><span>AUCTION CRM</span><span>금액 KRW · 시간 Asia/Seoul</span></footer>
  </main>;
}
