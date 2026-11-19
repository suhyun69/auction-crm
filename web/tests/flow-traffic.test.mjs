import test from 'node:test';
import assert from 'node:assert/strict';
import trafficModule from '../.test-build/flow/flow/traffic.js';

const { accumulate, alignResponses, averageMs, emptyStats, fromServerRecord, fromWebEntry, involves, newServerRecords, resetServerStats, schedule } = trafficModule;

const record = (seq, atMs, direction, call, extra = {}) => ({ seq, atMs, direction, call, callId: seq, ...extra });

test('처음 보는 기록만 고르고 밀려난 호출 수를 센다', () => {
  const records = [record(5, 50, 'request', 'read'), record(3, 30, 'request', 'read'), record(4, 40, 'response', 'read')];
  assert.deepEqual(newServerRecords(records, 3), { fresh: [records[2], records[0]], missed: 0, lastSeq: 5 });
  assert.equal(newServerRecords(records, 0).missed, 2, '1·2번은 화면에 오기 전에 밀려났다');
  assert.deepEqual(newServerRecords(records, 5), { fresh: [], missed: 0, lastSeq: 5 });
});

test('서버·브라우저 기록을 차선과 종류로 바꾼다', () => {
  const request = fromServerRecord(record(1, 10, 'request', 'bid', { customerName: 'A', amount: 1000 }), 'run');
  assert.deepEqual([request.id, request.lane, request.kind, request.direction], ['run:1', 'engine-api', 'bid', 'request']);
  const response = fromServerRecord(record(2, 12, 'response', 'bid', { outcome: 'REJECTED', durationMs: 2 }), 'run');
  assert.deepEqual([response.lane, response.outcome], ['api-engine', 'REJECTED']);
  assert.equal(fromWebEntry({ id: 1, at: 5, kind: 'sse', name: 'dashboard-changed' }).lane, 'api-web');
  assert.equal(fromWebEntry({ id: 2, at: 6, kind: 'refresh', direction: 'request' }).lane, 'web-api');
  const failed = fromWebEntry({ id: 3, at: 7, kind: 'refresh', direction: 'response', ok: false, durationMs: 9 });
  assert.deepEqual([failed.lane, failed.outcome], ['api-web', 'ERROR']);
  assert.ok(involves(request, 'engine') && involves(request, 'api') && !involves(request, 'web'));
});

test('몰려 온 호출을 순서대로 간격을 두어 창 안에 펼친다', () => {
  const calls = [0, 1, 2, 500, 501].map((at, index) => fromServerRecord(record(index + 1, at, 'request', 'read'), 'run'));
  const { packets, dropped } = schedule(calls, { windowMs: 900 });
  assert.equal(dropped.length, 0);
  const delays = packets.map(packet => packet.delayMs);
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] > delays[i - 1], '순서와 간격이 유지된다');
  assert.equal(delays[0], 0);
  assert.ok(delays[3] >= 400, '실제로 떨어진 호출은 그 비율만큼 떨어져 재생된다');

  const long = Array.from({ length: 50 }, (_, index) => fromServerRecord(record(index + 1, index * 1000, 'request', 'read'), 'run'));
  assert.ok(schedule(long, { windowMs: 900, maxPackets: 60, minGapMs: 1 }).packets.at(-1).delayMs <= 900, '긴 구간도 창 안으로 압축한다');
});

test('상한을 넘으면 응찰을 먼저 남기고 나머지는 묶음으로 돌려준다', () => {
  const calls = Array.from({ length: 30 }, (_, index) =>
    fromServerRecord(record(index + 1, index, 'request', index % 10 === 0 ? 'bid' : 'read'), 'run'));
  const { packets, dropped } = schedule(calls, { maxPackets: 8 });
  assert.equal(packets.length, 8);
  assert.equal(dropped.length, 22);
  assert.equal(packets.filter(packet => packet.call.kind === 'bid').length, 3);
  const seqs = packets.map(packet => Number(packet.call.id.split(':')[1]));
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), '남긴 패킷도 원래 순서다');
});

test('노드별 누적 수와 평균 응답 시간을 센다', () => {
  let stats = emptyStats();
  const calls = [
    fromServerRecord(record(1, 0, 'request', 'bid'), 'run'),
    fromServerRecord(record(2, 4, 'response', 'bid', { outcome: 'ACCEPTED', durationMs: 4 }), 'run'),
    fromServerRecord(record(3, 5, 'request', 'bid'), 'run'),
    fromServerRecord(record(4, 13, 'response', 'bid', { outcome: 'REJECTED', durationMs: 8 }), 'run'),
    fromWebEntry({ id: 1, at: 0, kind: 'sse', name: 'dashboard-changed' }),
    fromWebEntry({ id: 2, at: 1, kind: 'refresh', direction: 'request' }),
    fromWebEntry({ id: 3, at: 2, kind: 'refresh', direction: 'response', ok: true, durationMs: 12 }),
  ];
  for (const call of calls) stats = accumulate(stats, call);
  assert.deepEqual(stats.engine, { sent: 2, accepted: 1, rejected: 1, errors: 0 });
  assert.deepEqual(stats.web, { notified: 1, refreshed: 1 });
  assert.equal(stats.api.handled, 3);
  assert.equal(averageMs(stats), 8);
  assert.equal(averageMs(emptyStats()), null);
  const reset = resetServerStats(stats);
  assert.deepEqual([reset.engine.sent, reset.api.handled, reset.web.notified], [0, 0, 1]);
});

test('응답은 같은 호출의 요청 패킷이 도착한 뒤 출발한다', () => {
  const request = fromServerRecord(record(1, 0, 'request', 'bid'), 'run');
  const response = fromServerRecord({ ...record(2, 3, 'response', 'bid', { outcome: 'ACCEPTED' }), callId: 1 }, 'run');
  const other = fromServerRecord({ ...record(3, 4, 'response', 'read'), callId: 9 }, 'run');
  const arrivals = new Map();
  const aligned = alignResponses([{ call: request, delayMs: 0 }, { call: response, delayMs: 50 }, { call: other, delayMs: 90 }], arrivals, 1000, 800);
  assert.equal(aligned[0].delayMs, 0);
  assert.equal(aligned[1].delayMs, 840, '요청 도착(800) 뒤 간격을 두고 출발한다');
  assert.equal(aligned[2].delayMs, 90, '짝이 없는 응답은 그대로 둔다');
  assert.equal(arrivals.size, 0);

  // 요청이 앞 묶음에 있었으면 다음 묶음의 응답도 그 도착 시각을 따른다.
  alignResponses([{ call: request, delayMs: 100 }], arrivals, 0, 800);
  assert.equal(alignResponses([{ call: response, delayMs: 0 }], arrivals, 500, 800)[0].delayMs, 440);
  const web = [fromWebEntry({ id: 1, at: 0, kind: 'refresh', direction: 'request' }), fromWebEntry({ id: 2, at: 1, kind: 'refresh', direction: 'response', ok: true, durationMs: 1 })];
  assert.equal(web[0].pair, web[1].pair);
});
