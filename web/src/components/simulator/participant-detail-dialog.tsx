"use client";

import { useEffect, useRef } from "react";
import { formatAmount } from "@/lib/dashboard/format";
import { bidHistory, countOutcomes, type BidOutcome } from "@/lib/simulator/history";
import type { ParticipantState, Personality, RunParticipant, SimulationEvent } from "@/lib/simulator/types";

const personalityLabels: Record<Personality, string> = { cautious: "신중형", competitive: "경쟁형", impulsive: "충동형" };
const stateLabels: Record<ParticipantState, string> = { waiting: "입장 대기", active: "참여 중", leading: "선두", retired: "이탈" };
const outcomeLabels: Record<BidOutcome, string> = { ACCEPTED: "승인", REJECTED: "기각", UNRESOLVED: "응답 없음" };
const outcomeClasses: Record<BidOutcome, string> = { ACCEPTED: "event-accepted", REJECTED: "event-rejected", UNRESOLVED: "event-unresolved" };

function seconds(ms: number) { return `${Number((ms / 1000).toFixed(1))}초`; }

type Props = {
  participant: RunParticipant;
  events: SimulationEvent[];
  onClose: () => void;
};

export function ParticipantDetailDialog({ participant, events, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const attempts = bidHistory(events, participant.id);
  const counts = countOutcomes(attempts);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="setup-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="setup-dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="setup-header">
          <div className="detail-identity">
            <span className="avatar" aria-hidden="true">{participant.name.slice(0, 1)}</span>
            <div>
              <h2 id="detail-title">{participant.name}</h2>
              <p>{personalityLabels[participant.personality]} · {seconds(participant.joinAtMs)} 입장</p>
            </div>
            <span className={`actor-state state-${participant.state}`}>{stateLabels[participant.state]}</span>
          </div>
          <button ref={closeRef} type="button" className="setup-close" onClick={onClose} aria-label="참가자 정보 닫기">×</button>
        </header>

        <div className="setup-body">
          <section className="setup-section" aria-labelledby="detail-setup-title">
            <h3 id="detail-setup-title">초기 설정</h3>
            <dl className="detail-facts">
              <div><dt>성향</dt><dd>{personalityLabels[participant.personality]}</dd></div>
              <div><dt>예산 상한</dt><dd>{formatAmount(participant.budget)}</dd></div>
              <div><dt>입장 시각</dt><dd>{seconds(participant.joinAtMs)}</dd></div>
              <div><dt>마지막 응찰</dt><dd>{formatAmount(participant.lastAmount)}</dd></div>
            </dl>
            <p className="setup-note">예산은 이 경매에서 지불할 최대 가격입니다. 현재 최고가에 최소 인상 폭을 더할 예산이 없으면 이탈합니다.</p>
          </section>

          <section className="setup-section" aria-labelledby="detail-history-title">
            <div className="setup-section-head">
              <h3 id="detail-history-title">응찰 시도 내역</h3>
              <span className="count-badge">
                시도 {attempts.length} · 승인 {counts.accepted} · 기각 {counts.rejected}
                {counts.unresolved > 0 && ` · 응답 없음 ${counts.unresolved}`}
              </span>
            </div>
            {attempts.length === 0 ? (
              <div className="detail-empty">아직 응찰을 시도하지 않았습니다.</div>
            ) : (
              <ol className="detail-history">
                {[...attempts].reverse().map((attempt, index) => (
                  <li key={attempt.idempotencyKey ?? `${attempt.elapsedMs}-${index}`} className={outcomeClasses[attempt.outcome]}>
                    <span className="activity-dot" aria-hidden="true" />
                    <span className="detail-time">{seconds(attempt.elapsedMs)}</span>
                    <strong className="detail-amount">{formatAmount(attempt.amount)}</strong>
                    <span className="detail-outcome">{outcomeLabels[attempt.outcome]}</span>
                    <span className="detail-highest">{attempt.highestAmount === null ? "—" : `최고가 ${formatAmount(attempt.highestAmount)}`}</span>
                  </li>
                ))}
              </ol>
            )}
            {counts.unresolved > 0 && <p className="unresolved-note">응답을 확인하지 못한 시도가 있습니다. 실제 경매에 저장됐는지 대시보드에서 확인해 주세요.</p>}
            <p className="setup-note">보관 한도를 넘은 오래된 기록은 표시되지 않을 수 있습니다.</p>
          </section>
        </div>

        <footer className="setup-footer">
          <p className="setup-error" />
          <div className="setup-footer-actions">
            <button type="button" className="secondary-button" onClick={onClose}>닫기</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
