export const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
export const PERSONALITIES = Object.freeze({
  cautious: { probability: 0.55, reaction: [3000, 6000], multiplier: 2 },
  competitive: { probability: 0.9, reaction: [1000, 2500], multiplier: 4 },
  impulsive: { probability: 0.75, reaction: [500, 1500], multiplier: 8 },
});

function object(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field}: 객체가 필요합니다.`);
  return value;
}
function integer(value, field, min = 1) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${field}: ${min} 이상의 안전한 정수가 필요합니다.`);
  return value;
}
function text(value, field, max) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new Error(`${field}: 앞뒤 공백 제거 후 1~${max}자 문자열이 필요합니다.`);
  }
  return value.trim();
}
function range(value, fallback, field, minimum = 1) {
  const raw = value === undefined ? { min: fallback[0], max: fallback[1] } : object(value, field);
  const min = integer(raw.min, `${field}.min`, minimum);
  const max = integer(raw.max, `${field}.max`, minimum);
  if (max < min) throw new Error(`${field}: max는 min 이상이어야 합니다.`);
  return { min, max };
}

/** Validate JSON without coercion and return a detached, fully defaulted scenario. */
export function parseScenario(raw) {
  object(raw, 'scenario');
  if (raw.version !== undefined && raw.version !== 1) throw new Error('version: 지원하는 버전은 1입니다.');
  const name = text(raw.name, 'name', 200);
  const seed = raw.seed === undefined ? 42 : raw.seed;
  if (!(typeof seed === 'string' && seed.length > 0 && seed.length <= 200)
      && !(typeof seed === 'number' && Number.isSafeInteger(seed))) {
    throw new Error('seed: 1~200자 문자열 또는 안전한 정수가 필요합니다.');
  }
  const durationMs = integer(raw.durationMs === undefined ? 60000 : raw.durationMs, 'durationMs');
  const tickMs = integer(raw.tickMs === undefined ? 1000 : raw.tickMs, 'tickMs');
  if (tickMs > durationMs) throw new Error('tickMs: durationMs 이하여야 합니다.');
  const minIncrement = integer(raw.minIncrement === undefined ? 1000 : raw.minIncrement, 'minIncrement');
  if (!Array.isArray(raw.participants) || raw.participants.length === 0) throw new Error('participants: 참가자가 한 명 이상 필요합니다.');
  const ids = new Set();
  const names = new Set();
  const participants = raw.participants.map((value, index) => {
    const field = `participants[${index}]`;
    object(value, field);
    const id = text(value.id, `${field}.id`, 60);
    const participantName = text(value.name, `${field}.name`, 100);
    if (ids.has(id)) throw new Error(`${field}.id: 중복된 참가자 ID입니다.`);
    if (names.has(participantName)) throw new Error(`${field}.name: 중복된 정규화 이름입니다.`);
    ids.add(id); names.add(participantName);
    const personality = value.personality === undefined ? 'competitive' : value.personality;
    if (typeof personality !== 'string' || !Object.hasOwn(PERSONALITIES, personality)) throw new Error(`${field}.personality: cautious, competitive, impulsive 중 하나여야 합니다.`);
    const defaults = PERSONALITIES[personality];
    const probability = value.participationProbability === undefined ? defaults.probability : value.participationProbability;
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`${field}.participationProbability: 0~1의 숫자가 필요합니다.`);
    }
    return {
      id, name: participantName, budget: integer(value.budget, `${field}.budget`), personality,
      joinAtMs: integer(value.joinAtMs === undefined ? 0 : value.joinAtMs, `${field}.joinAtMs`, 0),
      reactionMs: range(value.reactionMs, defaults.reaction, `${field}.reactionMs`),
      increment: range(value.increment, [minIncrement, Math.min(MAX_AMOUNT, minIncrement * defaults.multiplier)], `${field}.increment`, minIncrement),
      participationProbability: probability,
      maxBids: integer(value.maxBids === undefined ? 50 : value.maxBids, `${field}.maxBids`),
    };
  });
  return { version: 1, name, seed, durationMs, tickMs, minIncrement, participants };
}
