import type { WebTraffic } from "../dashboard/live-dashboard";
import type { TrafficRecord } from "../simulator/types";

export type FlowNode = "engine" | "api" | "web";
/** 노드 사이 차선. 요청과 응답이 겹치지 않게 방향마다 하나씩 둔다. */
export type FlowLane = "engine-api" | "api-engine" | "api-web" | "web-api";
export type FlowKind = "bid" | "read" | "sse" | "refresh";
export type FlowOutcome = "ACCEPTED" | "REJECTED" | "OK" | "ERROR" | "ABORTED";

export type FlowCall = {
  id: string;
  lane: FlowLane;
  kind: FlowKind;
  direction: "request" | "response" | "push";
  outcome?: FlowOutcome;
  durationMs?: number;
  customerName?: string;
  amount?: number;
  highestAmount?: number;
  name?: string;
  message?: string;
  /** 같은 호출의 요청과 응답을 잇는 키. 응답 패킷은 요청 패킷이 도착한 뒤 출발한다. */
  pair?: string;
  /** web이 GraphQL로 받거나 읽은 호출이면 "graphql" */
  protocol?: "graphql";
  /** 서버 기록은 실행 시작 기준 경과, 브라우저 기록은 수신 시각 기준. 재생 간격 계산에만 쓴다. */
  atMs: number;
};

export type WebTrafficEntry = WebTraffic & { id: number; at: number };

export const LANE_NODES: Record<FlowLane, [FlowNode, FlowNode]> = {
  "engine-api": ["engine", "api"], "api-engine": ["api", "engine"],
  "api-web": ["api", "web"], "web-api": ["web", "api"],
};

export function fromServerRecord(record: TrafficRecord, runId: string): FlowCall {
  const request = record.direction === "request";
  return {
    id: `${runId}:${record.seq}`,
    lane: request ? "engine-api" : "api-engine",
    kind: record.call,
    direction: record.direction,
    outcome: record.outcome,
    durationMs: record.durationMs,
    customerName: record.customerName,
    amount: record.amount,
    highestAmount: record.highestAmount,
    message: record.message,
    pair: `${runId}:${record.callId}`,
    atMs: record.atMs,
  };
}

export function fromWebEntry(entry: WebTrafficEntry): FlowCall {
  const protocol = entry.protocol ? { protocol: entry.protocol } : {};
  if (entry.kind === "sse") {
    return { id: `web:${entry.id}`, lane: "api-web", kind: "sse", direction: "push", name: entry.name, atMs: entry.at, ...protocol };
  }
  if (entry.direction === "request") {
    // 재조회는 한 번에 하나씩만 진행되므로 고정 키로 요청과 응답을 잇는다.
    return { id: `web:${entry.id}`, lane: "web-api", kind: "refresh", direction: "request", pair: "web:refresh", atMs: entry.at, ...protocol };
  }
  return {
    id: `web:${entry.id}`, lane: "api-web", kind: "refresh", direction: "response",
    outcome: entry.ok ? "OK" : "ERROR", durationMs: entry.durationMs, pair: "web:refresh", atMs: entry.at, ...protocol,
  };
}

/**
 * 폴링으로 받은 기록 중 처음 보는 것만 고른다. 서버는 최근 기록만 남기므로
 * 순번 사이가 비면 그만큼은 화면에 오기 전에 밀려난 호출이다.
 */
export function newServerRecords(records: TrafficRecord[], lastSeq: number) {
  const fresh = records.filter(record => record.seq > lastSeq).sort((a, b) => a.seq - b.seq);
  const missed = fresh.length > 0 ? Math.max(0, fresh[0].seq - lastSeq - 1) : 0;
  return { fresh, missed, lastSeq: fresh.at(-1)?.seq ?? lastSeq };
}

export type ScheduleOptions = { windowMs?: number; maxPackets?: number; minGapMs?: number; maxGapMs?: number };

/**
 * 한 번에 몰려 온 호출을 실제 간격의 비율을 살려 windowMs 안에 펼친다.
 * maxPackets를 넘으면 응찰을 먼저 남기고 나머지는 묶음 수로만 돌려준다.
 */
export function schedule(calls: FlowCall[], options: ScheduleOptions = {}) {
  const { windowMs = 900, maxPackets = 24, minGapMs = 30, maxGapMs = 160 } = options;
  let kept = calls;
  if (calls.length > maxPackets) {
    const bids = calls.filter(call => call.kind === "bid");
    const keep = new Set<FlowCall>(bids.slice(-maxPackets));
    for (let index = calls.length - 1; index >= 0 && keep.size < maxPackets; index--) keep.add(calls[index]);
    kept = calls.filter(call => keep.has(call));
  }
  const dropped = calls.filter(call => !kept.includes(call));
  if (kept.length === 0) return { packets: [], dropped };
  const first = kept[0].atMs;
  const span = Math.max(1, kept.at(-1)!.atMs - first);
  const scale = Math.min(1, windowMs / span);
  const gap = Math.min(maxGapMs, Math.max(minGapMs, windowMs / kept.length));
  const packets: { call: FlowCall; delayMs: number }[] = [];
  let previous = -Infinity;
  for (const call of kept) {
    const delayMs = Math.round(Math.max((call.atMs - first) * scale, previous + gap, 0));
    packets.push({ call, delayMs });
    previous = delayMs;
  }
  return { packets, dropped };
}

/**
 * 응답 패킷이 요청 패킷보다 먼저 API를 떠나지 않게 출발을 늦춘다. arrivals는 호출 사이에 이어지는
 * 상태로, 요청이 앞선 묶음에 있었어도 도착 시각을 기억한다. now·travelMs는 같은 시계 단위다.
 */
export function alignResponses<T extends { call: FlowCall; delayMs: number }>(packets: T[], arrivals: Map<string, number>, now: number, travelMs: number, gapMs = 40): T[] {
  const aligned = packets.map(packet => {
    const { pair, direction } = packet.call;
    if (!pair) return packet;
    if (direction === "request") {
      arrivals.set(pair, now + packet.delayMs + travelMs);
      return packet;
    }
    const arrival = arrivals.get(pair);
    if (arrival === undefined) return packet;
    arrivals.delete(pair);
    return { ...packet, delayMs: Math.max(packet.delayMs, Math.ceil(arrival - now + gapMs)) };
  });
  // 응답을 끝내 받지 못한 요청이 쌓이지 않게 오래된 것부터 버린다.
  while (arrivals.size > 200) arrivals.delete(arrivals.keys().next().value!);
  return aligned;
}

export type FlowStats = {
  engine: { sent: number; accepted: number; rejected: number; errors: number };
  api: { handled: number; totalMs: number; timed: number };
  web: { notified: number; refreshed: number };
};

export function emptyStats(): FlowStats {
  return { engine: { sent: 0, accepted: 0, rejected: 0, errors: 0 }, api: { handled: 0, totalMs: 0, timed: 0 }, web: { notified: 0, refreshed: 0 } };
}

/** 서버 쪽 숫자만 비운다. 브라우저 쪽 알림·재조회는 실행과 무관하게 이어진다. */
export function resetServerStats(stats: FlowStats): FlowStats {
  return { ...emptyStats(), web: { ...stats.web } };
}

export function accumulate(stats: FlowStats, call: FlowCall): FlowStats {
  const next: FlowStats = { engine: { ...stats.engine }, api: { ...stats.api }, web: { ...stats.web } };
  if (call.direction === "request") {
    next.api.handled++;
    if (call.lane === "engine-api") next.engine.sent++;
    else next.web.refreshed++;
  } else if (call.direction === "push") {
    next.web.notified++;
  } else {
    if (call.outcome === "ACCEPTED") next.engine.accepted++;
    if (call.outcome === "REJECTED") next.engine.rejected++;
    if ((call.outcome === "ERROR" || call.outcome === "ABORTED") && call.lane === "api-engine") next.engine.errors++;
    if (typeof call.durationMs === "number") { next.api.totalMs += call.durationMs; next.api.timed++; }
  }
  return next;
}

export function averageMs(stats: FlowStats) {
  return stats.api.timed > 0 ? Math.round(stats.api.totalMs / stats.api.timed) : null;
}

export function involves(call: FlowCall, node: FlowNode) {
  return LANE_NODES[call.lane].includes(node);
}
