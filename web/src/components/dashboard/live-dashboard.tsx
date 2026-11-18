"use client";

import { useEffect, useRef, useState } from "react";
import { AppNavigation } from "@/components/app-navigation";
import { DashboardView } from "./dashboard-view";
import { createLiveDashboard } from "@/lib/dashboard/live-dashboard";
import type { ConnectionStatus, DashboardData } from "@/lib/dashboard/types";

export function LiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [changedParticipantIds, setChangedParticipantIds] = useState<number[]>([]);
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

  return <main className="dashboard-shell live-dashboard">
    <AppNavigation active="dashboard" />
    <DashboardView data={data} loading={loading} error={error} connectionStatus={connectionStatus} changedParticipantIds={changedParticipantIds} onRetry={() => client.current?.retry()} />
    <footer className="page-footer"><span>AUCTION CRM</span><span>금액 KRW · 시간 Asia/Seoul</span></footer>
  </main>;
}
