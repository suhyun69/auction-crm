import type { CustomScenario, Personality, ScenarioParticipant } from "./types";

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 12;
export const MIN_BUDGET = 1000;
export const MAX_BUDGET = 1_000_000_000;
export const DEFAULT_BUDGET = 150_000;
export const DEFAULT_PERSONALITY: Personality = "competitive";
export const SCENARIO_NAME = "직접 구성한 경매";

export const PERSONALITIES: readonly Personality[] = ["cautious", "competitive", "impulsive"];

const JOIN_STEP_MS = 3_000;
const DURATION_MS = 60_000;
// 60초 경매에서 늦게 들어온 참가자도 경쟁할 시간이 남도록 입장은 앞쪽 절반에서 뽑는다.
const RANDOM_JOIN_MAX_MS = 30_000;
const RANDOM_BUDGET_MIN = 30_000;
const RANDOM_BUDGET_MAX = 1_000_000;
const RANDOM_BUDGET_STEP = 10_000;
const TICK_MS = 1_000;
const MIN_INCREMENT = 1_000;
const SEED = 42;
const NAMES = ["김민서", "이준호", "박서연", "최도윤", "정수빈", "윤지우", "한예준", "오하린", "배시우", "신채은", "임건우", "문아린"];

export type SimulationSetup = {
  personality: Personality;
  budget: number;
  mode: "live" | "dry-run";
  participants: ScenarioParticipant[];
};

function makeParticipant(index: number, personality: Personality, budget: number): ScenarioParticipant {
  return {
    id: `actor-${index + 1}`,
    name: NAMES[index % NAMES.length],
    personality,
    budget,
    joinAtMs: index * JOIN_STEP_MS,
  };
}

export function defaultSetup(count = 4): SimulationSetup {
  const size = clampCount(count);
  return {
    personality: DEFAULT_PERSONALITY,
    budget: DEFAULT_BUDGET,
    mode: "live",
    participants: Array.from({ length: size }, (_, index) => makeParticipant(index, DEFAULT_PERSONALITY, DEFAULT_BUDGET)),
  };
}

function step(min: number, max: number, size: number, random: () => number) {
  return min + Math.floor(random() * (Math.floor((max - min) / size) + 1)) * size;
}

function shuffled(values: readonly string[], random: () => number) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }
  return list;
}

/**
 * 인원·성향·예산·입장 시각을 모두 무작위로 정한다.
 * 적어도 한 명은 0초에 입장해 경매가 곧바로 시작되고, 입장 순서대로 정렬한다.
 */
export function randomSetup(mode: SimulationSetup["mode"], random: () => number = Math.random): SimulationSetup {
  const count = step(MIN_PARTICIPANTS, MAX_PARTICIPANTS, 1, random);
  const names = shuffled(NAMES, random).slice(0, count);
  const drawn = names.map((name, index) => ({
    name,
    personality: PERSONALITIES[Math.floor(random() * PERSONALITIES.length)],
    budget: step(RANDOM_BUDGET_MIN, RANDOM_BUDGET_MAX, RANDOM_BUDGET_STEP, random),
    joinAtMs: index === 0 ? 0 : step(0, RANDOM_JOIN_MAX_MS, 1_000, random),
  }));
  const participants = drawn
    .sort((left, right) => left.joinAtMs - right.joinAtMs)
    .map((actor, index) => ({ ...actor, id: `actor-${index + 1}` }));
  return { personality: participants[0].personality, budget: participants[0].budget, mode, participants };
}

export function clampCount(count: number) {
  if (!Number.isFinite(count)) return MIN_PARTICIPANTS;
  return Math.min(MAX_PARTICIPANTS, Math.max(MIN_PARTICIPANTS, Math.round(count)));
}

/** 인원을 줄이면 뒤에서 덜고, 늘리면 현재 기본값으로 새 참가자를 붙인다. */
export function resize(setup: SimulationSetup, count: number): SimulationSetup {
  const size = clampCount(count);
  if (size === setup.participants.length) return setup;
  if (size < setup.participants.length) return { ...setup, participants: setup.participants.slice(0, size) };
  const added = Array.from({ length: size - setup.participants.length },
    (_, offset) => makeParticipant(setup.participants.length + offset, setup.personality, setup.budget));
  return { ...setup, participants: [...setup.participants, ...added] };
}

/** 기본 성향·예산은 전체에 적용한다. 이후 개별 설정으로 덮어쓸 수 있다. */
export function applyToAll(setup: SimulationSetup, patch: { personality?: Personality; budget?: number }): SimulationSetup {
  const next = { ...setup, ...patch };
  return {
    ...next,
    participants: setup.participants.map(actor => ({
      ...actor,
      ...(patch.personality !== undefined ? { personality: patch.personality } : {}),
      ...(patch.budget !== undefined ? { budget: patch.budget } : {}),
    })),
  };
}

export function updateParticipant(setup: SimulationSetup, id: string, patch: Partial<ScenarioParticipant>): SimulationSetup {
  return { ...setup, participants: setup.participants.map(actor => (actor.id === id ? { ...actor, ...patch } : actor)) };
}

/** 서버가 다시 검증하지만, 보내기 전에 같은 규칙으로 안내한다. */
export function validate(setup: SimulationSetup): string | null {
  const { participants } = setup;
  if (participants.length < MIN_PARTICIPANTS) return `참가자는 ${MIN_PARTICIPANTS}명 이상이어야 합니다.`;
  if (participants.length > MAX_PARTICIPANTS) return `참가자는 ${MAX_PARTICIPANTS}명까지 설정할 수 있습니다.`;
  const names = new Set<string>();
  for (const actor of participants) {
    const name = actor.name.trim();
    if (!name || name.length > 100) return "참가자 이름은 공백을 제외하고 1~100자여야 합니다.";
    if (names.has(name)) return `참가자 이름 '${name}'이 중복됩니다. 서로 다른 이름을 사용해 주세요.`;
    names.add(name);
    if (!Number.isSafeInteger(actor.budget) || actor.budget < MIN_BUDGET || actor.budget > MAX_BUDGET) {
      return `예산은 ${MIN_BUDGET.toLocaleString("ko-KR")}원 이상 ${MAX_BUDGET.toLocaleString("ko-KR")}원 이하의 정수여야 합니다.`;
    }
    if (!Number.isSafeInteger(actor.joinAtMs) || actor.joinAtMs < 0 || actor.joinAtMs >= DURATION_MS) {
      return `입장 시각은 0초 이상 ${DURATION_MS / 1000}초 미만이어야 합니다.`;
    }
  }
  return null;
}

export function toScenario(setup: SimulationSetup): CustomScenario {
  return {
    version: 1,
    name: SCENARIO_NAME,
    seed: SEED,
    durationMs: DURATION_MS,
    tickMs: TICK_MS,
    minIncrement: MIN_INCREMENT,
    participants: setup.participants.map(actor => ({ ...actor, name: actor.name.trim() })),
  };
}

/** 서버에 남아 있는 직접 구성 시나리오로 화면 설정을 복원한다. */
export function fromParticipants(participants: ScenarioParticipant[], mode: "live" | "dry-run"): SimulationSetup {
  if (participants.length < MIN_PARTICIPANTS) return { ...defaultSetup(), mode };
  return {
    personality: participants[0].personality,
    budget: participants[0].budget,
    mode,
    participants: participants.map(actor => ({ ...actor })),
  };
}
