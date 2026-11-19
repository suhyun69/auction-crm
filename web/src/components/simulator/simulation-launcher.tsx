"use client";

import { useEffect, useRef, useState } from "react";
import { createSimulatorClient } from "@/lib/simulator/client";
import { formatAmount } from "@/lib/dashboard/format";
import { defaultSetup, fromParticipants, toScenario, validate, type SimulationSetup } from "@/lib/simulator/setup";
import type { ParticipantState, Personality, RunPhase, SimulationRun, SimulatorSnapshot } from "@/lib/simulator/types";
import { SimulationSetupDialog } from "./simulation-setup-dialog";

const CUSTOM_SCENARIO_ID = "custom";
const SPEEDS = [0.5, 1, 2, 4, 10, 20, 100];
const activePhases = new Set<RunPhase>(["running", "pausing", "paused", "stopping"]);
const finishedPhases = new Set<RunPhase>(["completed", "stopped", "failed"]);
const phaseLabels: Record<RunPhase, string> = {
  running: "실행 중", pausing: "일시정지 중", paused: "일시정지", stopping: "중지 중",
  stopped: "중지됨", completed: "완료", failed: "실행 오류",
};
const personalityLabels: Record<Personality, string> = { cautious: "신중형", competitive: "경쟁형", impulsive: "충동형" };
const stateLabels: Record<ParticipantState, string> = { waiting: "입장 대기", active: "참여 중", leading: "선두", retired: "이탈" };

function finishedMessage(run: SimulationRun) {
  if (run.phase === "failed") return { title: "경매를 끝까지 진행하지 못했습니다.", detail: run.reason ?? "경매 연결을 확인한 뒤 다시 시작해 주세요.", alert: true };
  const winner = run.market.highestBidderName;
  const summary = `응찰 ${run.totals.accepted + run.totals.rejected}회(승인 ${run.totals.accepted} · 기각 ${run.totals.rejected})`;
  const result = winner ? `최종 최고가 ${formatAmount(run.market.highestAmount)} · ${winner}` : "승인된 응찰이 없습니다";
  if (run.phase === "completed") return { title: "시뮬레이션 경매가 끝났습니다.", detail: `${result} · ${summary}`, alert: false };
  return { title: "시뮬레이션을 중지했습니다.", detail: `${result} · ${summary}`, alert: false };
}

type Props = {
  onRun: (run: SimulationRun | null) => void;
  onSelectParticipant: (participantId: string) => void;
};

export function SimulationLauncher({ onRun, onSelectParticipant }: Props) {
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot | null>(null);
  const [setup, setSetup] = useState<SimulationSetup>(() => defaultSetup());
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const client = useRef<ReturnType<typeof createSimulatorClient> | null>(null);

  useEffect(() => {
    let previous: SimulatorSnapshot | null = null;
    const instance = createSimulatorClient({
      onSnapshot(next) {
        setSnapshot(next);
        onRun(next.run);
        // 새 실행마다 서버에 남은 구성과 배속으로 화면을 맞춘다.
        if (!previous || previous.run?.runId !== next.run?.runId) {
          const custom = next.scenarios.find(item => item.id === CUSTOM_SCENARIO_ID);
          if (custom) setSetup(fromParticipants(custom.participants, next.run?.mode ?? "live"));
          if (next.run) setSpeed(next.run.speed);
        }
        previous = next;
      },
      onError: setError,
      onPending: setPending,
    }, 1000);
    client.current = instance;
    return () => { instance.dispose(); client.current = null; };
  }, [onRun]);

  const run = snapshot?.run ?? null;
  const active = !!run && activePhases.has(run.phase);
  const busy = pending || !snapshot;
  const transitional = run?.phase === "stopping" || run?.phase === "pausing";
  const resume = run?.phase === "paused";
  const finished = run && finishedPhases.has(run.phase) && dismissed !== run.runId ? run : null;
  const notice = finished ? finishedMessage(finished) : null;

  function changeSpeed(value: number) {
    setSpeed(value);
    if (active) void client.current?.command({ action: "speed", speed: value });
  }

  function start() {
    const problem = validate(setup);
    if (problem) { setError(problem); setOpen(true); return; }
    setError(null);
    setDismissed(null);
    void client.current?.command({ action: "start", scenario: toScenario(setup), mode: setup.mode, speed });
  }

  return (
    <section className="simulation-launcher" aria-label="시뮬레이션 실행" aria-busy={busy}>
      <div className="launcher-bar">
        <div className="launcher-info">
          <span className="launcher-badge">시뮬레이션</span>
          <p>
            {run && <span className={`launcher-phase phase-${run.phase}`}><span className="status-dot" />{phaseLabels[run.phase]}</span>}
            <span className="launcher-detail">
              {run
                ? `참가자 ${run.participants.length}명 · 승인 ${run.totals.accepted} · 기각 ${run.totals.rejected}`
                : `참가자 ${setup.participants.length}명 · ${personalityLabels[setup.personality]} · 예산 ${formatAmount(setup.budget)}`}
              {(run?.mode ?? setup.mode) === "dry-run" && " · 미리보기(대시보드에 반영되지 않음)"}
            </span>
          </p>
        </div>

        <div className="launcher-actions">
          <button type="button" className="secondary-button" onClick={() => setOpen(true)} disabled={active}>시뮬레이션 설정</button>
          <label className="launcher-speed">
            <span>배속</span>
            <select aria-label="배속" value={speed} onChange={event => changeSpeed(Number(event.target.value))} disabled={busy || transitional}>
              {SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
          {active ? (
            <>
              <button type="button" className="secondary-button" disabled={busy || transitional}
                onClick={() => void client.current?.command({ action: resume ? "resume" : "pause" })}>
                {resume ? "재개" : "일시정지"}
              </button>
              <button type="button" className="stop-button" disabled={busy || run.phase === "stopping"}
                onClick={() => void client.current?.command({ action: "stop" })}>중지</button>
            </>
          ) : (
            <button type="button" className="primary-button" disabled={busy} onClick={start}>
              <span aria-hidden="true">▶</span> 시뮬레이션 시작
            </button>
          )}
        </div>
      </div>

      {error && <p className="launcher-error" role="alert">{error}</p>}

      {notice && finished && <div className={`launcher-notice ${notice.alert ? "is-alert" : ""}`} role={notice.alert ? "alert" : "status"}>
        <div><strong>{notice.title}</strong><p>{notice.detail}</p></div>
        <button type="button" className="secondary-button" onClick={() => setDismissed(finished.runId)}>확인</button>
      </div>}

      {run && <ul className="launcher-actors" aria-label="가상 참가자">
        {run.participants.map(actor => (
          <li key={actor.id}>
            <button type="button" className={`launcher-actor actor-${actor.state}`} onClick={() => onSelectParticipant(actor.id)}>
              <span className="avatar" aria-hidden="true">{actor.name.slice(0, 1)}</span>
              <span className="launcher-actor-text">
                <strong>{actor.name}</strong>
                <small>{stateLabels[actor.state]} · {actor.bidCount}회</small>
              </span>
            </button>
          </li>
        ))}
      </ul>}

      {open && <SimulationSetupDialog
        setup={setup}
        onClose={() => setOpen(false)}
        onSave={next => { setSetup(next); setError(null); setOpen(false); }}
      />}
    </section>
  );
}
