"use client";

import { useState } from "react";
import { DashboardView } from "./dashboard-view";
import { demoDashboard, edgeDashboard, emptyDashboard } from "@/lib/dashboard/fixtures";

type Scenario = "default" | "empty" | "loading" | "error" | "edge" | "reconnecting";
const scenarios: { value: Scenario; label: string }[] = [
  { value: "default", label: "기본 현황" }, { value: "empty", label: "응찰 없음" },
  { value: "loading", label: "불러오는 중" }, { value: "error", label: "조회 오류" },
  { value: "edge", label: "긴 이름·큰 금액" }, { value: "reconnecting", label: "연결 복구 중" },
];

export function DemoDashboard() {
  const [scenario, setScenario] = useState<Scenario>("default");
  const data = scenario === "loading" || scenario === "error" ? null : scenario === "empty" ? emptyDashboard : scenario === "edge" ? edgeDashboard : demoDashboard;
  return <main className="dashboard-shell">
    <div className="demo-banner"><div><span className="demo-badge">DEMO</span><span>예시 데이터 미리보기 <span className="demo-description">· 실제 응찰 내역이 아닙니다.</span></span></div>
      <label className="scenario-control">화면 상태<select aria-label="미리보기 상태" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>{scenarios.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    <DashboardView data={data} loading={scenario === "loading"} error={scenario === "error" ? "잠시 후 다시 시도해 주세요." : null} connectionStatus={scenario === "reconnecting" ? "reconnecting" : scenario === "error" ? "disconnected" : "demo"} onRetry={() => setScenario("default")} />
    <footer className="page-footer"><span>AUCTION CRM</span><span>금액 KRW · 시간 Asia/Seoul</span></footer>
  </main>;
}
