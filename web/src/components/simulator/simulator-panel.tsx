"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppNavigation } from "@/components/app-navigation";
import { createSimulatorClient, shouldSyncSimulationSelection } from "@/lib/simulator/client";
import { formatAmount, formatNumber } from "@/lib/dashboard/format";
import type { ParticipantState, Personality, RunPhase, SimulationEvent, SimulationMode, SimulatorSnapshot } from "@/lib/simulator/types";

const speeds = [.5, 1, 2, 4, 10, 20, 100];
const phaseLabels: Record<RunPhase | "idle", string> = { idle: "실행 대기", running: "실행 중", pausing: "일시정지 중", paused: "일시정지", stopping: "중지 중", stopped: "중지됨", completed: "완료", failed: "실행 오류" };
const personalityLabels: Record<Personality, string> = { cautious: "신중형", competitive: "경쟁형", impulsive: "충동형" };
const actorLabels: Record<ParticipantState, string> = { waiting: "입장 대기", active: "참여 중", leading: "선두", retired: "이탈" };
const activePhases = new Set<RunPhase>(["running", "pausing", "paused", "stopping"]);
function seconds(ms: number) { return `${Number((ms / 1000).toFixed(1))}초`; }
function activity(event: SimulationEvent) {
  const name = event.customerName ?? "참가자";
  if (event.type === "bid") return `${name} · ${formatAmount(event.amount ?? null)} ${event.response?.status === "ACCEPTED" ? "승인" : "기각"}`;
  if (event.type === "joined") return `${name} 입장`;
  if (event.type === "retired") return `${name} 이탈 · ${event.reason === "max-bids" ? "응찰 횟수 도달" : "예산 상한 도달"}`;
  if (event.type === "completed") return "시나리오가 완료되었습니다.";
  if (event.type === "stopped") return "실행을 중지했습니다.";
  if (event.type === "error") return "경매 연결을 확인해 주세요.";
  return null;
}

export function SimulatorPanel() {
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scenarioId, setScenarioId] = useState("");
  const [mode, setMode] = useState<SimulationMode>("live");
  const [speed, setSpeed] = useState(1);
  const client = useRef<ReturnType<typeof createSimulatorClient> | null>(null);
  useEffect(() => {
    let previous: SimulatorSnapshot | null = null;
    const instance = createSimulatorClient({
      onSnapshot(next) {
        setSnapshot(next);
        if (shouldSyncSimulationSelection(previous, next)) {
          setScenarioId(next.run?.scenarioId ?? next.scenarios[0]?.id ?? "");
          setMode(next.run?.mode ?? "live");
          setSpeed(next.run?.speed ?? 1);
        }
        previous = next;
      },
      onError: setError, onPending: setPending,
    });
    client.current = instance;
    return () => { instance.dispose(); client.current = null; };
  }, []);

  const scenario = snapshot?.scenarios.find(item => item.id === scenarioId);
  const run = snapshot?.run?.scenarioId === scenarioId ? snapshot.run : null;
  const active = !!snapshot?.run && activePhases.has(snapshot.run.phase);
  const phase = run?.phase ?? "idle";
  const participants = run?.participants ?? scenario?.participants.map(actor => ({ ...actor, state: "waiting" as const, bidCount: 0, lastAmount: null, nextActionAtMs: actor.joinAtMs })) ?? [];
  const elapsed = run?.elapsedMs ?? 0;
  const duration = run?.durationMs ?? scenario?.durationMs ?? 0;
  const percent = duration > 0 ? Math.min(100, elapsed / duration * 100) : 0;
  const events = (run?.events ?? []).filter(event => activity(event)).slice(-12).reverse();
  const busy = pending || !snapshot;
  const transitional = phase === "stopping" || phase === "pausing";
  const resume = phase === "paused";

  function changeSpeed(value: number) {
    setSpeed(value);
    if (active) void client.current?.command({ action: "speed", speed: value });
  }

  return <main className="dashboard-shell simulator-shell">
    <AppNavigation active="simulator" />
    <header className="page-header">
      <div><div className="eyebrow">AUCTION SIMULATOR</div><h1>경매 시뮬레이터</h1><p className="page-description">다양한 참가자들이 만들어가는 경매를 실행하고 관찰하세요.</p></div>
      <span className={`simulation-phase phase-${phase}`} role="status"><span className="status-dot" />{phaseLabels[phase]}</span>
    </header>

    {error && <div className="error-banner" role="alert"><div><strong>시뮬레이터를 확인해 주세요.</strong><p>{error}</p></div><button className="secondary-button" onClick={() => client.current?.refresh()}>다시 불러오기</button></div>}
    {phase === "failed" && <div className="error-banner" role="alert"><div><strong>실행을 이어갈 수 없습니다.</strong><p>{run?.reason ?? "경매 연결을 확인한 뒤 다시 시작해 주세요."}</p></div></div>}

    <section className="simulation-controls" aria-label="시뮬레이터 제어" aria-busy={busy}>
      <div className="simulation-settings">
        <label className="field-label">시나리오<select aria-label="시나리오" value={scenarioId} onChange={event => setScenarioId(event.target.value)} disabled={busy || active}>
          {!snapshot && <option value="">불러오는 중…</option>}
          {snapshot?.scenarios.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="field-label">실행 모드<select aria-label="실행 모드" value={mode} onChange={event => setMode(event.target.value as SimulationMode)} disabled={busy || active}>
          <option value="live">실제 경매</option><option value="dry-run">미리보기</option>
        </select></label>
        <label className="field-label speed-field">배속<select aria-label="배속" value={speed} onChange={event => changeSpeed(Number(event.target.value))} disabled={busy || transitional}>
          {speeds.map(value => <option value={value} key={value}>{value}×</option>)}
        </select></label>
      </div>
      <div className="simulation-action-row"><p className="mode-description">{mode === "live" ? "응찰이 실제 경매에 저장되고 대시보드에 반영됩니다." : "실제 경매에 영향을 주지 않는 가상 경매입니다."}</p>
        <div className="simulation-actions">
          <button className="primary-button" disabled={busy || active || !scenario} onClick={() => void client.current?.command({ action: "start", scenarioId, mode, speed })}><span aria-hidden="true">▶</span> {run ? "다시 시작" : "시작"}</button>
          <button className="secondary-button" disabled={busy || transitional || !["running", "paused"].includes(phase)} onClick={() => void client.current?.command({ action: resume ? "resume" : "pause" })}>{resume ? "재개" : "일시정지"}</button>
          <button className="stop-button" disabled={busy || !active || phase === "stopping"} onClick={() => void client.current?.command({ action: "stop" })}>중지</button>
        </div>
      </div>
    </section>

    <section className="simulation-overview" aria-label="실행 요약">
      <article className="simulation-progress-card"><div className="progress-heading"><span>가상 경매 시간</span><strong>{seconds(elapsed)} <span>/ {seconds(duration)}</span></strong></div>
        <div className="simulation-progress" role="progressbar" aria-label="경매 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>
        <p>{scenario?.description ?? "시나리오를 불러오고 있습니다."}</p>
      </article>
      <article className="simulation-stat"><span>현재 최고가</span><strong className={(run?.market.highestAmount ?? 0) > 999999999 ? "long-amount" : ""}>{formatAmount(run?.market.highestAmount ?? 0)}</strong><small>{run?.market.highestBidderName ?? "첫 응찰 대기"}</small></article>
      <article className="simulation-stat"><span>이번 실행 응찰</span><strong>{formatNumber((run?.totals.accepted ?? 0) + (run?.totals.rejected ?? 0))}<small>회</small></strong><small>승인 {run?.totals.accepted ?? 0} · 기각 {run?.totals.rejected ?? 0}</small></article>
    </section>

    <div className="simulation-detail-grid">
      <section className="participants-panel simulation-participants" aria-labelledby="simulation-participants-title">
        <div className="panel-header"><div className="panel-title"><h2 id="simulation-participants-title">참가자 상태</h2><span className="count-badge">{participants.length}명</span></div><span className="sort-note">{run ? "실행 현황" : "시나리오 미리보기"}</span></div>
        {!snapshot ? <div className="loading-state" role="status"><span className="spinner" />참가자를 불러오는 중입니다</div> : <ul className="simulation-actor-list" aria-label="가상 참가자 목록">
          {participants.map(actor => <li key={actor.id} className={`simulation-actor actor-${actor.state}`} data-actor-id={actor.id}>
            <div className="actor-identity"><span className="avatar" aria-hidden="true">{actor.name.slice(0, 1)}</span><div><strong>{actor.name}</strong><span className="actor-personality">{personalityLabels[actor.personality]} · {seconds(actor.joinAtMs)} 입장</span></div><span className={`actor-state state-${actor.state}`}>{actorLabels[actor.state]}</span></div>
            <div className="actor-metrics"><div><span>예산 상한</span><strong>{formatAmount(actor.budget)}</strong></div><div><span>마지막 응찰</span><strong>{formatAmount(actor.lastAmount)}</strong></div><div><span>응찰 횟수</span><strong>{actor.bidCount}회</strong></div></div>
          </li>)}
        </ul>}
        <div className="panel-footer"><span className="info-symbol" aria-hidden="true">i</span>예산은 한 물건에 지불할 최대 가격입니다. 선두인 참가자는 다음 응찰을 기다립니다.</div>
      </section>

      <section className="participants-panel simulation-activity" aria-labelledby="simulation-activity-title"><div className="panel-header"><div className="panel-title"><h2 id="simulation-activity-title">최근 활동</h2></div><span className="count-badge">{run?.mode === "dry-run" ? "미리보기" : "경매"}</span></div>
        {events.length ? <ol className="activity-list">{events.map((event, index) => <li key={`${event.elapsedMs}-${event.type}-${index}`} className={event.type === "bid" ? `event-${event.response?.status.toLowerCase()}` : ""}><span className="activity-dot" /><div><p>{activity(event)}</p><time>{seconds(event.elapsedMs)}</time></div></li>)}</ol> : <div className="activity-empty"><span aria-hidden="true">↗</span><h3>경매장의 소식을 기다립니다</h3><p>실행을 시작하면 입장과 응찰 내역이<br />여기에 차례로 표시됩니다.</p></div>}
        {!!run?.unresolvedAttempts && <p className="unresolved-note">응답을 확인하지 못한 요청 {run.unresolvedAttempts}건이 있습니다. 실제 경매 현황을 확인해 주세요.</p>}
      </section>
    </div>
    <footer className="page-footer"><span>AUCTION CRM</span><Link href="/">실시간 대시보드 보기 →</Link></footer>
  </main>;
}
