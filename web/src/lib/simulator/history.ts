import type { RunParticipant, SimulationEvent, SimulationRun } from "./types";

export type BidOutcome = "ACCEPTED" | "REJECTED" | "UNRESOLVED";
export type BidAttempt = {
  elapsedMs: number;
  amount: number;
  outcome: BidOutcome;
  /** 응찰을 결정할 때 보고 있던 최고가. */
  highestBefore: number | null;
  /** 판정 직후의 최고가. 승인이면 응찰 금액과 같고, 기각이면 자신을 앞선 금액이다. */
  highestAfter: number | null;
  idempotencyKey?: string;
};

/**
 * 한 참가자의 응찰 시도 내역. attempt를 기준으로 줄을 만들고 같은 키의 bid 응답으로 결과를 채운다.
 * 응답을 받지 못한 시도는 UNRESOLVED로 남아 실제 저장 여부를 확인할 단서가 된다.
 * 보관 한도를 넘어 attempt가 밀려난 경우에도 bid만으로 줄을 만든다.
 */
export function bidHistory(events: SimulationEvent[], participantId: string): BidAttempt[] {
  const order: string[] = [];
  const attempts = new Map<string, BidAttempt>();
  for (const event of events) {
    if (event.participantId !== participantId) continue;
    if (event.type !== "attempt" && event.type !== "bid") continue;
    const key = event.idempotencyKey ?? `${event.elapsedMs}-${order.length}`;
    if (!attempts.has(key)) {
      attempts.set(key, {
        elapsedMs: event.elapsedMs,
        amount: event.amount ?? 0,
        outcome: "UNRESOLVED",
        highestBefore: null,
        highestAfter: null,
        idempotencyKey: event.idempotencyKey,
      });
      order.push(key);
    }
    const attempt = attempts.get(key)!;
    if (event.type === "attempt" && event.highestAmount !== undefined) {
      attempt.highestBefore = event.highestAmount;
    }
    if (event.type === "bid" && event.response) {
      attempt.outcome = event.response.status;
      attempt.highestAfter = event.response.highestAmount;
      if (event.amount !== undefined) attempt.amount = event.amount;
    }
  }
  return order.map(key => attempts.get(key)!);
}

export function countOutcomes(attempts: BidAttempt[]) {
  return {
    accepted: attempts.filter(attempt => attempt.outcome === "ACCEPTED").length,
    rejected: attempts.filter(attempt => attempt.outcome === "REJECTED").length,
    unresolved: attempts.filter(attempt => attempt.outcome === "UNRESOLVED").length,
  };
}

/** 대시보드 순위는 이름으로 식별하므로, 같은 이름의 가상 참가자를 찾는다. */
export function findByName(run: SimulationRun | null, customerName: string): RunParticipant | null {
  if (!run) return null;
  const name = customerName.trim();
  return run.participants.find(actor => actor.name.trim() === name) ?? null;
}
