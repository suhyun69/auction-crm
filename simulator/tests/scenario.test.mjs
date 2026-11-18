import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenario, MAX_AMOUNT } from '../scenario.mjs';

const base = () => ({ name: '시험 경매', participants: [{ id: 'a', name: ' 가상 참가자 ', budget: 100000 }] });

test('normalizes names and fills detached, personality-specific defaults', () => {
  const input = base();
  const result = parseScenario(input);
  assert.equal(result.version, 1);
  assert.equal(result.seed, 42);
  assert.equal(result.durationMs, 60000);
  assert.equal(result.tickMs, 1000);
  assert.equal(result.minIncrement, 1000);
  assert.equal(result.participants[0].name, '가상 참가자');
  assert.equal(result.participants[0].personality, 'competitive');
  assert.equal(result.participants[0].participationProbability, 0.9);
  assert.deepEqual(result.participants[0].reactionMs, { min: 1000, max: 2500 });
  result.participants[0].name = 'changed';
  assert.equal(input.participants[0].name, ' 가상 참가자 ');
  const personalities = ['cautious', 'competitive', 'impulsive'].map(personality => parseScenario({
    ...base(), participants: [{ ...base().participants[0], personality }],
  }).participants[0]);
  assert.deepEqual(personalities.map(p => p.participationProbability), [0.55, 0.9, 0.75]);
  assert.deepEqual(personalities.map(p => p.increment.max), [2000, 4000, 8000]);
});

test('preserves internal spaces/case, exact safe upper bound and zero probability', () => {
  const input = base();
  input.seed = 'repeatable';
  input.participants[0] = { id: 'a', name: '  Alice  A  ', budget: MAX_AMOUNT, participationProbability: 0 };
  const actor = parseScenario(input).participants[0];
  assert.equal(actor.name, 'Alice  A');
  assert.equal(actor.budget, MAX_AMOUNT);
  assert.equal(actor.participationProbability, 0);
  assert.equal(parseScenario({ ...base(), minIncrement: MAX_AMOUNT }).participants[0].increment.max, MAX_AMOUNT);
});

for (const [label, mutate] of [
  ['string duration', s => { s.durationMs = '1000'; }],
  ['fractional tick', s => { s.tickMs = 0.5; }],
  ['tick larger than duration', s => { s.durationMs = 10; s.tickMs = 11; }],
  ['invalid version', s => { s.version = 2; }],
  ['boolean seed', s => { s.seed = true; }],
  ['unsafe seed', s => { s.seed = MAX_AMOUNT + 1; }],
  ['empty participants', s => { s.participants = []; }],
  ['string budget', s => { s.participants[0].budget = '1000'; }],
  ['negative budget', s => { s.participants[0].budget = -1; }],
  ['unsafe budget', s => { s.participants[0].budget = MAX_AMOUNT + 1; }],
  ['empty name', s => { s.participants[0].name = '  '; }],
  ['long normalized name', s => { s.participants[0].name = '가'.repeat(101); }],
  ['unknown personality', s => { s.participants[0].personality = 'random'; }],
  ['array personality', s => { s.participants[0].personality = ['competitive']; }],
  ['object personality', s => { s.participants[0].personality = {}; }],
  ['number personality', s => { s.participants[0].personality = 42; }],
  ['boolean personality', s => { s.participants[0].personality = true; }],
  ['null personality', s => { s.participants[0].personality = null; }],
  ['invalid probability', s => { s.participants[0].participationProbability = NaN; }],
  ['string probability', s => { s.participants[0].participationProbability = '1'; }],
  ['probability greater than one', s => { s.participants[0].participationProbability = 1.1; }],
  ['negative arrival', s => { s.participants[0].joinAtMs = -1; }],
  ['invalid reaction range', s => { s.participants[0].reactionMs = { min: 5, max: 4 }; }],
  ['reaction zero', s => { s.participants[0].reactionMs = { min: 0, max: 1 }; }],
  ['increment below market minimum', s => { s.participants[0].increment = { min: 1, max: 1000 }; }],
  ['zero max bids', s => { s.participants[0].maxBids = 0; }],
  ['duplicate normalized names', s => { s.participants.push({ id: 'b', name: '가상 참가자', budget: 2000 }); }],
  ['duplicate ids', s => { s.participants.push({ id: 'a', name: '다른 참가자', budget: 2000 }); }],
]) {
  test(`rejects ${label}`, () => {
    const input = base(); mutate(input);
    assert.throws(() => parseScenario(input));
  });
}
