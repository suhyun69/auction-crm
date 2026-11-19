"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { formatAmount, formatNumber } from "@/lib/dashboard/format";
import type { WebTraffic } from "@/lib/dashboard/live-dashboard";
import {
  accumulate, alignResponses, averageMs, emptyStats, fromServerRecord, fromWebEntry, involves, newServerRecords, resetServerStats, schedule,
  type FlowCall, type FlowLane, type FlowNode, type FlowStats,
} from "@/lib/flow/traffic";
import type { RunPhase, SimulationRun } from "@/lib/simulator/types";
import { DEFAULT_VIEW, FlowScene, TRAVEL_MS, type ActivePacket, type NodeInfo, type View } from "./flow-scene";

export type CallFlowHandle = {
  /** 시뮬레이터 스냅샷을 받을 때마다 호출한다. 처음 보는 호출 기록만 재생한다. */
  run: (run: SimulationRun | null) => void;
  /** 브라우저가 SSE를 받거나 대시보드를 다시 조회할 때 호출한다. */
  web: (traffic: WebTraffic) => void;
};

type Filter = "bid" | "read" | "web";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "bid", label: "응찰" }, { key: "read", label: "엔진 조회" }, { key: "web", label: "SSE·재조회" },
];
const MAX_LOG = 60;
const MAX_ACTIVE = 90;
const LANE_TEXT: Record<FlowLane, string> = {
  "engine-api": "Engine → API", "api-engine": "API → Engine", "api-web": "API → Web", "web-api": "Web → API",
};
const NODE_TITLES: Record<FlowNode, string> = { api: "API", engine: "Simulation Engine", web: "Web" };
const phaseLabels: Record<RunPhase, string> = {
  running: "실행 중", pausing: "일시정지 중", paused: "일시정지", stopping: "중지 중",
  stopped: "중지됨", completed: "완료", failed: "실행 오류",
};

function filterOf(call: FlowCall): Filter {
  return call.kind === "bid" ? "bid" : call.kind === "read" ? "read" : "web";
}

function describe(call: FlowCall) {
  if (call.kind === "sse") return `SSE ${call.name ?? "알림"}`;
  if (call.direction === "request") {
    if (call.kind === "bid") return `POST /api/bid · ${call.customerName ?? ""} ${call.amount !== undefined ? formatAmount(call.amount) : ""}`.trim();
    return "GET /api/dashboard";
  }
  if (call.outcome === "ERROR") return call.message ? `오류 · ${call.message}` : "오류";
  if (call.outcome === "ABORTED") return "취소됨";
  if (call.kind === "bid") {
    const verdict = call.outcome === "ACCEPTED" ? "승인" : "기각";
    return `${verdict} · ${call.customerName ?? ""} ${call.amount !== undefined ? formatAmount(call.amount) : ""}`.trim();
  }
  if (call.kind === "read") return call.highestAmount !== undefined ? `대시보드 · 최고가 ${formatAmount(call.highestAmount)}` : "대시보드";
  return "대시보드 갱신";
}

function outcomeClass(call: FlowCall) {
  if (call.outcome === "ACCEPTED") return "is-accepted";
  if (call.outcome === "REJECTED") return "is-rejected";
  if (call.outcome === "ERROR" || call.outcome === "ABORTED") return "is-error";
  return "";
}

function nodeInfo(stats: FlowStats, run: SimulationRun | null): Record<FlowNode, NodeInfo> {
  const average = averageMs(stats);
  const preview = run?.mode === "dry-run";
  return {
    api: {
      title: preview ? "API · 미리보기 시장" : "API",
      lines: [`처리 ${formatNumber(stats.api.handled)}건`, average === null ? "평균 응답 —" : `평균 응답 ${formatNumber(average)}ms`],
    },
    engine: {
      title: "Simulation Engine",
      lines: [`요청 ${formatNumber(stats.engine.sent)}`, `승인 ${formatNumber(stats.engine.accepted)} · 기각 ${formatNumber(stats.engine.rejected)}`],
      dimmed: !run,
    },
    web: {
      title: "Web",
      lines: [`SSE ${formatNumber(stats.web.notified)} · 재조회 ${formatNumber(stats.web.refreshed)}`],
    },
  };
}

export function CallFlowPanel({ run, ref }: { run: SimulationRun | null; ref: Ref<CallFlowHandle> }) {
  const [packets, setPackets] = useState<ActivePacket[]>([]);
  const [log, setLog] = useState<FlowCall[]>([]);
  const [stats, setStats] = useState<FlowStats>(emptyStats);
  const [filters, setFilters] = useState<Record<Filter, boolean>>({ bid: true, read: true, web: true });
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [badges, setBadges] = useState<Partial<Record<FlowLane, number>>>({});
  const [missed, setMissed] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const cursor = useRef({ seen: false, runId: null as string | null, seq: 0, webId: 0 });
  const settings = useRef({ filters, paused });
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arrivals = useRef(new Map<string, number>());

  useEffect(() => { settings.current = { filters, paused }; }, [filters, paused]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => { query.removeEventListener("change", update); clearTimeout(badgeTimer.current); };
  }, []);

  const ingest = useCallback((calls: FlowCall[], animate = true) => {
    if (calls.length === 0) return;
    setStats(current => calls.reduce(accumulate, current));
    setLog(current => [...calls].reverse().concat(current).slice(0, MAX_LOG));
    const { filters: shown, paused: stopped } = settings.current;
    if (stopped || !animate) return;
    const planned = schedule(calls.filter(call => shown[filterOf(call)]));
    const scheduled = alignResponses(planned.packets, arrivals.current, performance.now(), TRAVEL_MS);
    const { dropped } = planned;
    if (scheduled.length > 0) {
      setPackets(current => current.concat(scheduled.map(({ call, delayMs }) => ({ id: call.id, call, delayMs }))).slice(-MAX_ACTIVE));
    }
    if (dropped.length > 0) {
      const counts: Partial<Record<FlowLane, number>> = {};
      for (const call of dropped) counts[call.lane] = (counts[call.lane] ?? 0) + 1;
      setBadges(counts);
      clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(() => setBadges({}), 1400);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    run(next) {
      const position = cursor.current;
      // 화면을 연 뒤 처음 받은 스냅샷에 이미 쌓여 있던 기록은 지난 일이므로 목록에만 두고 재생하지 않는다.
      const firstLook = !position.seen;
      position.seen = true;
      if (!next) return;
      if (position.runId !== next.runId) {
        position.runId = next.runId;
        position.seq = 0;
        setStats(resetServerStats);
        setLog(current => current.filter(call => call.id.startsWith("web:")));
        setMissed(0);
      }
      const { fresh, missed: skipped, lastSeq } = newServerRecords(next.traffic ?? [], position.seq);
      position.seq = lastSeq;
      if (skipped > 0 && !firstLook) setMissed(count => count + skipped);
      ingest(fresh.map(record => fromServerRecord(record, next.runId)), !firstLook);
    },
    web(traffic) {
      const id = ++cursor.current.webId;
      ingest([fromWebEntry({ ...traffic, id, at: performance.now() })]);
    },
  }), [ingest]);

  const removePacket = useCallback((id: string) => setPackets(current => current.filter(packet => packet.id !== id)), []);
  function toggleFilter(key: Filter) {
    setFilters(current => ({ ...current, [key]: !current[key] }));
    setPackets(current => current.filter(packet => filterOf(packet.call) !== key));
  }

  const preview = run?.mode === "dry-run";
  const nodes = nodeInfo(stats, run);
  const visibleLog = log.filter(call => filters[filterOf(call)]);
  const selectedLog = selected ? visibleLog.filter(call => involves(call, selected)).slice(0, 8) : [];
  const idleLanes: FlowLane[] = preview ? ["api-web", "web-api"] : [];

  return (
    <aside className={`flow-panel ${collapsed ? "is-collapsed" : ""}`} aria-labelledby="flow-title">
      <header className="flow-header">
        <div className="flow-heading">
          <div className="eyebrow">CALL FLOW</div>
          <h2 id="flow-title">호출 흐름</h2>
          <p className="flow-status">
            {run
              ? <><span className={`launcher-phase phase-${run.phase}`}><span className="status-dot" />{phaseLabels[run.phase]}</span>{preview ? "미리보기 · 실제 API를 부르지 않습니다" : "실제 경매 API 호출"}</>
              : "시뮬레이션을 시작하면 엔진의 API 호출이 표시됩니다"}
          </p>
        </div>
        <button type="button" className="secondary-button flow-collapse" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>
          {collapsed ? "펼치기" : "접기"}
        </button>
      </header>

      <div className="flow-body">
        <div className="flow-toolbar">
          <div className="flow-filters" role="group" aria-label="표시할 호출">
            {FILTERS.map(({ key, label }) => (
              <button key={key} type="button" className={`flow-chip chip-${key}`} aria-pressed={filters[key]} onClick={() => toggleFilter(key)}>
                <span className="chip-dot" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <div className="flow-tools">
            <button type="button" className="secondary-button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>
              {paused ? "애니메이션 재개" : "애니메이션 멈춤"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setView(DEFAULT_VIEW)}>시점 초기화</button>
          </div>
        </div>

        <FlowScene view={view} onView={setView} nodes={nodes} selected={selected} onSelect={setSelected}
          packets={packets} paused={paused} reducedMotion={reducedMotion} onPacketDone={removePacket} idleLanes={idleLanes} badges={badges} />

        <ul className="flow-legend" aria-label="패킷 색 안내">
          <li><span className="legend-dot packet-bid" />응찰 요청</li>
          <li><span className="legend-dot packet-accepted" />승인</li>
          <li><span className="legend-dot packet-rejected" />기각</li>
          <li><span className="legend-dot packet-read" />엔진 조회</li>
          <li><span className="legend-dot packet-sse" />SSE 알림</li>
          <li><span className="legend-dot packet-refresh" />Web 재조회</li>
          <li><span className="legend-dot packet-error" />오류</li>
        </ul>
        {preview && <p className="flow-note">미리보기는 엔진 안의 로컬 시장에 응찰하므로 Web으로 가는 알림이 없습니다.</p>}
        {missed > 0 && <p className="flow-note">고배속이라 이번 실행에서 호출 {formatNumber(missed)}건이 화면에 오기 전에 지나갔습니다. 이 호출은 그림과 숫자에 빠져 있습니다.</p>}

        <div className="flow-details">
          {selected ? (
            <section className="flow-node-card" aria-label={`${NODE_TITLES[selected]} 상세`}>
              <div className="flow-card-head">
                <strong>{NODE_TITLES[selected]}</strong>
                <button type="button" className="setup-close" aria-label="노드 선택 해제" onClick={() => setSelected(null)}>×</button>
              </div>
              <p>{nodes[selected].lines.join(" · ")}</p>
              {selectedLog.length === 0 ? <p className="flow-empty">이 노드를 지난 호출이 아직 없습니다.</p> : <CallList calls={selectedLog} />}
            </section>
          ) : (
            <section className="flow-log" aria-label="최근 호출">
              <div className="flow-card-head"><strong>최근 호출</strong><small>노드를 누르면 해당 노드만 볼 수 있습니다</small></div>
              {visibleLog.length === 0 ? <p className="flow-empty">아직 표시할 호출이 없습니다.</p> : <CallList calls={visibleLog.slice(0, 30)} />}
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}

function CallList({ calls }: { calls: FlowCall[] }) {
  return <ol className="flow-calls">
    {calls.map(call => (
      <li key={call.id} className={outcomeClass(call)}>
        <span className={`legend-dot ${call.kind === "bid" ? (call.direction === "request" ? "packet-bid" : call.outcome === "ACCEPTED" ? "packet-accepted" : call.outcome === "REJECTED" ? "packet-rejected" : "packet-error") : call.outcome === "ERROR" ? "packet-error" : `packet-${call.kind}`}`} aria-hidden="true" />
        <span className="flow-call-lane">{LANE_TEXT[call.lane]}</span>
        <span className="flow-call-text">{describe(call)}</span>
        <span className="flow-call-ms">{call.durationMs !== undefined ? `${formatNumber(call.durationMs)}ms` : ""}</span>
      </li>
    ))}
  </ol>;
}
