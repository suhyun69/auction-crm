"use client";

import { useEffect, useRef, useState } from "react";
import { formatAmount } from "@/lib/dashboard/format";
import {
  MAX_BUDGET, MAX_PARTICIPANTS, MIN_BUDGET, MIN_PARTICIPANTS, PERSONALITIES,
  applyToAll, clampCount, randomSetup, resize, updateParticipant, validate,
  type SimulationSetup,
} from "@/lib/simulator/setup";
import type { Personality, SimulationMode } from "@/lib/simulator/types";

const personalityLabels: Record<Personality, string> = { cautious: "신중형", competitive: "경쟁형", impulsive: "충동형" };
const personalityHints: Record<Personality, string> = {
  cautious: "3~6초마다 판단하고 55% 확률로 조금씩 올립니다.",
  competitive: "1~2.5초마다 판단하고 90% 확률로 적극적으로 올립니다.",
  impulsive: "0.5~1.5초마다 판단하고 크게 올립니다.",
};
const personalities = PERSONALITIES;

type Props = {
  setup: SimulationSetup;
  onSave: (setup: SimulationSetup) => void;
  onClose: () => void;
};

export function SimulationSetupDialog({ setup, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(setup);
  const [selectedId, setSelectedId] = useState(setup.participants[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selected = draft.participants.find(actor => actor.id === selectedId) ?? draft.participants[0];

  function change(next: SimulationSetup) {
    setDraft(next);
    setMessage(null);
    if (!next.participants.some(actor => actor.id === selectedId)) {
      setSelectedId(next.participants[next.participants.length - 1]?.id ?? "");
    }
  }
  function patchSelected(patch: Parameters<typeof updateParticipant>[2]) {
    if (selected) change(updateParticipant(draft, selected.id, patch));
  }
  function save() {
    const problem = validate(draft);
    if (problem) { setMessage(problem); return; }
    onSave({ ...draft, participants: draft.participants.map(actor => ({ ...actor, name: actor.name.trim() })) });
  }

  return (
    <div className="setup-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header className="setup-header">
          <div>
            <h2 id="setup-title">시뮬레이션 설정</h2>
            <p>가상 참가자 구성을 정한 뒤 경매를 시작합니다.</p>
          </div>
          <button ref={closeRef} type="button" className="setup-close" onClick={onClose} aria-label="설정 닫기">×</button>
        </header>

        <div className="setup-body">
          <section className="setup-section" aria-labelledby="setup-common-title">
            <div className="setup-section-head">
              <h3 id="setup-common-title">전체 설정</h3>
              <button type="button" className="random-button" onClick={() => change(randomSetup(draft.mode))}
                title="인원, 성향, 예산, 입장 시각을 모두 무작위로 정합니다">
                <span aria-hidden="true">↻</span> 랜덤
              </button>
            </div>
            <div className="setup-grid">
              <label className="field-label">참가자 인원
                <div className="stepper">
                  <button type="button" onClick={() => change(resize(draft, draft.participants.length - 1))}
                    disabled={draft.participants.length <= MIN_PARTICIPANTS} aria-label="참가자 한 명 줄이기">−</button>
                  <input type="number" inputMode="numeric" aria-label="참가자 인원"
                    min={MIN_PARTICIPANTS} max={MAX_PARTICIPANTS} value={draft.participants.length}
                    onChange={event => change(resize(draft, clampCount(Number(event.target.value))))} />
                  <button type="button" onClick={() => change(resize(draft, draft.participants.length + 1))}
                    disabled={draft.participants.length >= MAX_PARTICIPANTS} aria-label="참가자 한 명 늘리기">+</button>
                </div>
              </label>
              <label className="field-label">기본 성향
                <select value={draft.personality} onChange={event => change(applyToAll(draft, { personality: event.target.value as Personality }))}>
                  {personalities.map(value => <option key={value} value={value}>{personalityLabels[value]}</option>)}
                </select>
              </label>
              <label className="field-label">기본 예산
                <input type="number" inputMode="numeric" step={1000} min={MIN_BUDGET} max={MAX_BUDGET}
                  value={draft.budget}
                  onChange={event => change(applyToAll(draft, { budget: Math.trunc(Number(event.target.value)) }))} />
              </label>
              <label className="field-label">실행 모드
                <select value={draft.mode} onChange={event => change({ ...draft, mode: event.target.value as SimulationMode })}>
                  <option value="live">실제 경매</option>
                  <option value="dry-run">미리보기</option>
                </select>
              </label>
            </div>
            <p className="setup-note">
              {draft.mode === "live"
                ? "응찰이 실제 경매에 저장되고 대시보드에 반영됩니다."
                : "실제 경매에 영향을 주지 않는 가상 경매입니다. 대시보드는 바뀌지 않습니다."}
              {" "}기본 성향과 기본 예산은 모든 참가자에게 적용되며, 아래에서 한 명씩 다르게 바꿀 수 있습니다.
              {" "}랜덤은 실행 모드를 그대로 두고 인원·성향·예산·입장 시각을 다시 뽑습니다.
            </p>
          </section>

          <section className="setup-section" aria-labelledby="setup-actor-title">
            <h3 id="setup-actor-title">참가자별 설정</h3>
            <div className="setup-actor-layout">
              <ul className="setup-actor-list" aria-label="참가자 목록">
                {draft.participants.map((actor, index) => (
                  <li key={actor.id}>
                    <button type="button" className={actor.id === selected?.id ? "is-selected" : ""}
                      aria-pressed={actor.id === selected?.id} onClick={() => setSelectedId(actor.id)}>
                      <span className="avatar" aria-hidden="true">{actor.name.trim().slice(0, 1) || index + 1}</span>
                      <span className="setup-actor-text">
                        <strong>{actor.name.trim() || `참가자 ${index + 1}`}</strong>
                        <small>{personalityLabels[actor.personality]} · {formatAmount(actor.budget)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {selected && <div className="setup-actor-form">
                <label className="field-label">이름
                  <input type="text" maxLength={100} value={selected.name}
                    onChange={event => patchSelected({ name: event.target.value })} />
                </label>
                <label className="field-label">성향
                  <select value={selected.personality} onChange={event => patchSelected({ personality: event.target.value as Personality })}>
                    {personalities.map(value => <option key={value} value={value}>{personalityLabels[value]}</option>)}
                  </select>
                </label>
                <label className="field-label">예산 상한
                  <input type="number" inputMode="numeric" step={1000} min={MIN_BUDGET} max={MAX_BUDGET}
                    value={selected.budget} onChange={event => patchSelected({ budget: Math.trunc(Number(event.target.value)) })} />
                </label>
                <label className="field-label">입장 시각(초)
                  <input type="number" inputMode="numeric" step={1} min={0} max={59}
                    value={Math.round(selected.joinAtMs / 1000)}
                    onChange={event => patchSelected({ joinAtMs: Math.max(0, Math.trunc(Number(event.target.value))) * 1000 })} />
                </label>
                <p className="setup-note setup-actor-note">{personalityHints[selected.personality]} 예산은 이 경매에서 지불할 최대 가격입니다.</p>
              </div>}
            </div>
          </section>
        </div>

        <footer className="setup-footer">
          <p className="setup-error" role={message ? "alert" : undefined}>{message}</p>
          <div className="setup-footer-actions">
            <button type="button" className="secondary-button" onClick={onClose}>취소</button>
            <button type="button" className="primary-button" onClick={save}>설정 저장</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
