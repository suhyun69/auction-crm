import test from 'node:test';
import assert from 'node:assert/strict';
import historyModule from '../.test-build/simulator/history.js';

const { bidHistory, countOutcomes, findByName } = historyModule;

const attempt = (participantId, elapsedMs, amount, idempotencyKey) =>
  ({ type: 'attempt', participantId, customerName: participantId, elapsedMs, amount, idempotencyKey });
const bid = (participantId, elapsedMs, amount, idempotencyKey, status, highestAmount) =>
  ({ type: 'bid', participantId, customerName: participantId, elapsedMs, amount, idempotencyKey,
     response: { status, highestAmount, highestBidderName: participantId } });

test('시도와 응답을 같은 키로 묶어 참가자별 내역을 만든다', () => {
  const events = [
    { type: 'joined', participantId: 'a', elapsedMs: 0 },
    attempt('a', 1000, 1000, 'k1'), bid('a', 1000, 1000, 'k1', 'ACCEPTED', 1000),
    attempt('b', 2000, 1000, 'k2'), bid('b', 2000, 1000, 'k2', 'REJECTED', 1000),
    attempt('a', 3000, 2000, 'k3'), bid('a', 3000, 2000, 'k3', 'ACCEPTED', 2000),
  ];
  const mine = bidHistory(events, 'a');
  assert.deepEqual(mine.map(row => [row.elapsedMs, row.amount, row.outcome, row.highestAmount]),
    [[1000, 1000, 'ACCEPTED', 1000], [3000, 2000, 'ACCEPTED', 2000]]);
  assert.deepEqual(countOutcomes(mine), { accepted: 2, rejected: 0, unresolved: 0 });
  assert.deepEqual(countOutcomes(bidHistory(events, 'b')), { accepted: 0, rejected: 1, unresolved: 0 });
  assert.deepEqual(bidHistory(events, 'none'), []);
});

test('응답 없이 끝난 시도는 UNRESOLVED로 남고 금액과 키를 보존한다', () => {
  const events = [attempt('a', 1000, 5000, 'k1'), bid('a', 1000, 5000, 'k1', 'ACCEPTED', 5000), attempt('a', 2000, 7000, 'k2')];
  const mine = bidHistory(events, 'a');
  assert.equal(mine.length, 2);
  assert.deepEqual(mine[1], { elapsedMs: 2000, amount: 7000, outcome: 'UNRESOLVED', highestAmount: null, idempotencyKey: 'k2' });
  assert.deepEqual(countOutcomes(mine), { accepted: 1, rejected: 0, unresolved: 1 });
});

test('보관 한도로 attempt가 밀려나도 bid만으로 줄을 만든다', () => {
  const mine = bidHistory([bid('a', 4000, 9000, 'k9', 'REJECTED', 12000)], 'a');
  assert.deepEqual(mine, [{ elapsedMs: 4000, amount: 9000, outcome: 'REJECTED', highestAmount: 12000, idempotencyKey: 'k9' }]);
});

test('순위 행의 이름으로 가상 참가자를 찾는다', () => {
  const run = { participants: [{ id: 'actor-1', name: '김민서' }, { id: 'actor-2', name: '이준호' }] };
  assert.equal(findByName(run, '김민서').id, 'actor-1');
  assert.equal(findByName(run, '  이준호  ').id, 'actor-2');
  assert.equal(findByName(run, '박서연'), null);
  assert.equal(findByName(null, '김민서'), null);
});
