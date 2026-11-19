import test from 'node:test';
import assert from 'node:assert/strict';
import setupModule from '../.test-build/simulator/setup.js';

const {
  MIN_PARTICIPANTS, MAX_PARTICIPANTS, MIN_BUDGET, PERSONALITIES,
  applyToAll, defaultSetup, randomSetup, resize, toScenario, updateParticipant, validate,
} = setupModule;

/** 고정 시드 생성기. 같은 수열이면 같은 구성이 나오는지도 함께 본다. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

test('랜덤 구성은 언제나 그대로 실행할 수 있는 설정을 만든다', () => {
  for (let seed = 0; seed < 300; seed++) {
    const setup = randomSetup('live', seeded(seed));
    assert.equal(validate(setup), null, `seed ${seed}`);

    const { participants } = setup;
    assert.ok(participants.length >= MIN_PARTICIPANTS && participants.length <= MAX_PARTICIPANTS);
    assert.equal(new Set(participants.map(actor => actor.name)).size, participants.length);
    assert.equal(new Set(participants.map(actor => actor.id)).size, participants.length);
    // 아무도 0초에 입장하지 않으면 경매가 한동안 비어 있다.
    assert.equal(participants[0].joinAtMs, 0);
    for (const [index, actor] of participants.entries()) {
      assert.ok(PERSONALITIES.includes(actor.personality));
      assert.ok(actor.budget >= MIN_BUDGET && actor.budget % 10_000 === 0);
      if (index > 0) assert.ok(actor.joinAtMs >= participants[index - 1].joinAtMs, '입장 순서대로 정렬된다');
    }
    assert.equal(setup.personality, participants[0].personality);
    assert.equal(setup.budget, participants[0].budget);
  }
});

test('랜덤은 실행 모드를 유지하고 같은 수열이면 같은 구성을 만든다', () => {
  assert.equal(randomSetup('dry-run', seeded(7)).mode, 'dry-run');
  assert.equal(randomSetup('live', seeded(7)).mode, 'live');
  assert.deepEqual(randomSetup('live', seeded(11)).participants, randomSetup('live', seeded(11)).participants);

  const draws = Array.from({ length: 200 }, (_, seed) => randomSetup('live', seeded(seed + 1000)));
  assert.ok(new Set(draws.map(setup => setup.participants.length)).size > 1, '인원이 매번 같지 않다');
  assert.ok(new Set(draws.flatMap(setup => setup.participants.map(actor => actor.personality))).size === PERSONALITIES.length);
  assert.ok(new Set(draws.flatMap(setup => setup.participants.map(actor => actor.budget))).size > 1);
  assert.ok(new Set(draws.flatMap(setup => setup.participants.map(actor => actor.joinAtMs))).size > 1);
});

test('인원 증감과 전체 적용은 개별 설정 위에서 예측 가능하게 동작한다', () => {
  const base = defaultSetup(4);
  assert.equal(resize(base, 1).participants.length, MIN_PARTICIPANTS);
  assert.equal(resize(base, 99).participants.length, MAX_PARTICIPANTS);
  assert.equal(resize(base, 6).participants[5].budget, base.budget, '새 참가자는 현재 기본값을 쓴다');
  assert.deepEqual(resize(base, 2).participants, base.participants.slice(0, 2), '줄이면 뒤에서 덜어낸다');

  const edited = updateParticipant(base, 'actor-2', { budget: 777_000, personality: 'cautious' });
  assert.equal(edited.participants[1].budget, 777_000);
  assert.equal(edited.participants[0].budget, base.budget, '다른 참가자는 그대로다');

  const all = applyToAll(edited, { budget: 50_000 });
  assert.deepEqual(all.participants.map(actor => actor.budget), [50_000, 50_000, 50_000, 50_000]);
  assert.equal(all.participants[1].personality, 'cautious', '예산만 적용하면 성향은 유지된다');
});

test('보낼 수 없는 설정은 사유와 함께 막는다', () => {
  const base = defaultSetup(3);
  assert.equal(validate(base), null);
  assert.match(validate(updateParticipant(base, 'actor-2', { name: base.participants[0].name })), /중복/);
  assert.match(validate(updateParticipant(base, 'actor-1', { name: '   ' })), /이름/);
  assert.match(validate(updateParticipant(base, 'actor-1', { budget: 0 })), /예산/);
  assert.match(validate(updateParticipant(base, 'actor-1', { budget: 1500.5 })), /예산/);
  assert.match(validate(updateParticipant(base, 'actor-1', { joinAtMs: 60_000 })), /입장 시각/);
  assert.match(validate({ ...base, participants: [base.participants[0]] }), /이상/);

  const scenario = toScenario(updateParticipant(base, 'actor-1', { name: '  김민서  ' }));
  assert.equal(scenario.participants[0].name, '김민서', '이름 앞뒤 공백은 보내기 전에 정리한다');
  assert.equal(scenario.version, 1);
  assert.equal(scenario.durationMs, 60_000);
  assert.equal(scenario.participants.length, 3);
});
