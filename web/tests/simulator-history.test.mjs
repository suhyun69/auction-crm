import test from 'node:test';
import assert from 'node:assert/strict';
import historyModule from '../.test-build/simulator/history.js';

const { bidHistory, countOutcomes, findByName } = historyModule;

const attempt = (participantId, elapsedMs, amount, idempotencyKey, highestAmount = 0) =>
  ({ type: 'attempt', participantId, customerName: participantId, elapsedMs, amount, idempotencyKey, highestAmount });
const bid = (participantId, elapsedMs, amount, idempotencyKey, status, highestAmount) =>
  ({ type: 'bid', participantId, customerName: participantId, elapsedMs, amount, idempotencyKey,
     response: { status, highestAmount, highestBidderName: participantId } });

test('시도와 응답을 같은 키로 묶어 참가자별 내역을 만든다', () => {
  const events = [
    { type: 'joined', participantId: 'a', elapsedMs: 0 },
    attempt('a', 1000, 1000, 'k1', 0), bid('a', 1000, 1000, 'k1', 'ACCEPTED', 1000),
    attempt('b', 2000, 1000, 'k2', 1000), bid('b', 2000, 1000, 'k2', 'REJECTED', 1000),
    attempt('a', 3000, 2000, 'k3', 1000), bid('a', 3000, 2000, 'k3', 'ACCEPTED', 2000),
  ];
  const mine = bidHistory(events, 'a');
  assert.deepEqual(mine.map(row => [row.elapsedMs, row.amount, row.outcome]),
    [[1000, 1000, 'ACCEPTED'], [3000, 2000, 'ACCEPTED']]);
  assert.deepEqual(countOutcomes(mine), { accepted: 2, rejected: 0, unresolved: 0 });
  assert.deepEqual(countOutcomes(bidHistory(events, 'b')), { accepted: 0, rejected: 1, unresolved: 0 });
  assert.deepEqual(bidHistory(events, 'none'), []);
});

test('시도 당시 최고가와 판정 직후 최고가를 따로 보존한다', () => {
  const events = [
    attempt('a', 1000, 2000, 'k1', 1500), bid('a', 1000, 2000, 'k1', 'ACCEPTED', 2000),
    // 다른 참가자가 먼저 올려 기각된 경우, 당시 최고가와 앞선 금액이 다르다.
    attempt('a', 2000, 2500, 'k2', 2000), bid('a', 2000, 2500, 'k2', 'REJECTED', 3000),
  ];
  const [first, second] = bidHistory(events, 'a');
  assert.equal(first.highestBefore, 1500);
  assert.equal(first.highestAfter, 2000);
  assert.equal(second.highestBefore, 2000);
  assert.equal(second.highestAfter, 3000);
});

test('응답 없이 끝난 시도는 UNRESOLVED로 남고 금액·키·당시 최고가를 보존한다', () => {
  const events = [attempt('a', 1000, 5000, 'k1', 0), bid('a', 1000, 5000, 'k1', 'ACCEPTED', 5000), attempt('a', 2000, 7000, 'k2', 5000)];
  const mine = bidHistory(events, 'a');
  assert.equal(mine.length, 2);
  assert.deepEqual(mine[1], { elapsedMs: 2000, amount: 7000, outcome: 'UNRESOLVED', highestBefore: 5000, highestAfter: null, idempotencyKey: 'k2' });
  assert.deepEqual(countOutcomes(mine), { accepted: 1, rejected: 0, unresolved: 1 });
});

test('보관 한도로 attempt가 밀려나면 당시 최고가 없이 bid만으로 줄을 만든다', () => {
  const mine = bidHistory([bid('a', 4000, 9000, 'k9', 'REJECTED', 12000)], 'a');
  assert.deepEqual(mine, [{ elapsedMs: 4000, amount: 9000, outcome: 'REJECTED', highestBefore: null, highestAfter: 12000, idempotencyKey: 'k9' }]);
});

test('순위 행의 이름으로 가상 참가자를 찾는다', () => {
  const run = { participants: [{ id: 'actor-1', name: '김민서' }, { id: 'actor-2', name: '이준호' }] };
  assert.equal(findByName(run, '김민서').id, 'actor-1');
  assert.equal(findByName(run, '  이준호  ').id, 'actor-2');
  assert.equal(findByName(run, '박서연'), null);
  assert.equal(findByName(null, '김민서'), null);
});
