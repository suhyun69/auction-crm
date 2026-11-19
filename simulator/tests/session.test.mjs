import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_SCENARIO_ID, MAX_BIDS_PER_PARTICIPANT, MAX_CUSTOM_PARTICIPANTS, MAX_RUN_EVENTS, MAX_TRAFFIC_RECORDS, SimulationSession, traceClient } from '../session.mjs';
import { createDryRunClient } from '../clients.mjs';

const scenario = { name: 'Session test', seed: 42, durationMs: 1000, tickMs: 10, minIncrement: 1,
  participants: [ { id: 'a', name: 'A', budget: 100, participationProbability: 1, reactionMs: { min: 1, max: 1 }, increment: { min: 1, max: 2 } },
    { id: 'b', name: 'B', budget: 200, participationProbability: 1, reactionMs: { min: 1, max: 1 }, increment: { min: 1, max: 2 } } ] };
function session(t, options = {}) {
  const result = new SimulationSession({ scenarios: [{ id: 'test', description: 'test preview', scenario }], createClient: () => createDryRunClient(), ...options });
  t.after(() => result.dispose());
  return result;
}
function command(s, input) {
  if (!input || Array.isArray(input)) return s.command(input);
  return s.command({ ...input, sessionId: s.sessionId, runId: s.getSnapshot().run?.runId ?? null });
}
function start(s, values = {}) { return command(s, { action: 'start', scenarioId: 'test', mode: 'dry-run', speed: 1, ...values }); }
function errorStatus(status) { return error => error.status === status; }
async function until(predicate) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  assert.fail('state transition timed out');
}

test('catalogue previews are detached and polling does not run the engine', t => {
  let calls = 0;
  const s = session(t, { createClient() { calls++; return createDryRunClient(); } });
  const first = s.getSnapshot();
  assert.equal(first.run, null); assert.equal(first.scenarios[0].participantCount, 2);
  first.scenarios[0].participants[0].budget = 0;
  assert.equal(s.getSnapshot().scenarios[0].participants[0].budget, 100);
  assert.equal(calls, 0);
  assert.notEqual(s.sessionId, session(t).sessionId);
});

test('shared run rejects double start and pause freezes time until resume', async t => {
  const s = session(t);
  const initial = start(s);
  assert.ok(initial.run.runId);
  assert.throws(() => start(s), errorStatus(409));
  const pause = command(s, { action: 'pause' });
  assert.ok(['pausing', 'paused'].includes(pause.run.phase));
  await until(() => s.getSnapshot().run.phase === 'paused');
  const before = s.getSnapshot();
  await new Promise(resolve => setTimeout(resolve, 30));
  for (let i = 0; i < 10; i++) assert.equal(s.getSnapshot().run.elapsedMs, before.run.elapsedMs);
  assert.equal(s.getSnapshot().run.runId, initial.run.runId);
  const sped = command(s, { action: 'speed', speed: 4 });
  assert.equal(sped.run.speed, 4); assert.equal(sped.run.phase, 'paused');
  assert.throws(() => command(s, { action: 'pause' }), errorStatus(409));
  command(s, { action: 'resume' });
  await until(() => s.getSnapshot().run.elapsedMs > before.run.elapsedMs);
  const stopped = command(s, { action: 'stop' });
  assert.ok(['stopping', 'stopped'].includes(stopped.run.phase));
  await until(() => s.getSnapshot().run.phase === 'stopped');
  assert.ok(s.getSnapshot().revision > before.revision);
  assert.throws(() => command(s, { action: 'resume' }), errorStatus(409));
});

test('dry-run never uses real client and can complete then start a fresh run', async t => {
  const s = session(t, { createClient: () => { throw new Error('unexpected HTTP'); } });
  const first = start(s, { speed: 1000 });
  await until(() => s.getSnapshot().run.phase === 'completed');
  const result = s.getSnapshot().run;
  assert.ok(result.totals.accepted > 0); assert.equal(result.elapsedMs, 1000);
  assert.equal(result.unresolvedAttempts, 0); assert.ok(result.events.length <= MAX_RUN_EVENTS);
  assert.ok(result.finishedAt);
  const next = start(s, { speed: 1000 });
  assert.notEqual(next.run.runId, first.run.runId);
  assert.equal(next.run.elapsedMs, 0);
});

test('stop aborts pending POST and prevents overlapping replacement until drain', async t => {
  let submitted = false;
  let aborted = false;
  let finish;
  const s = session(t, { createClient: () => ({
    readDashboard: async () => ({ summary: { highestAmount: 0, highestBidderName: null } }),
    submitBid: async (_body, { signal }) => {
      submitted = true;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; finish = () => reject(signal.reason); }, { once: true });
      });
    },
  }) });
  start(s, { mode: 'live' });
  await until(() => submitted);
  assert.equal(command(s, { action: 'stop' }).run.phase, 'stopping');
  assert.ok(aborted);
  assert.throws(() => start(s), errorStatus(409));
  finish();
  await until(() => s.getSnapshot().run.phase === 'stopped');
  assert.equal(s.getSnapshot().run.unresolvedAttempts, 1);
  assert.equal(s.getSnapshot().run.totals.accepted, 0);
});

test('live API failure becomes terminal error with no duplicate runner', async t => {
  const s = session(t, { createClient: () => ({ readDashboard: async () => { throw new Error('API offline'); }, submitBid() { assert.fail('must not bid'); } }) });
  start(s, { mode: 'live' });
  await until(() => s.getSnapshot().run.phase === 'failed');
  const run = s.getSnapshot().run;
  assert.equal(run.totals.errors, 1); assert.match(run.reason, /API offline/);
  assert.ok(run.events.some(event => event.type === 'error'));
  assert.throws(() => command(s, { action: 'speed', speed: 4 }), errorStatus(409));
});

test('invalid commands/configuration fail without creating a run', t => {
  const s = session(t);
  for (const input of [null, [], { action: 'unknown' }, { action: 'start', scenarioId: '../file', mode: 'live' },
    { action: 'start', scenarioId: 'test', mode: 'unknown' }, { action: 'start', scenarioId: 'test', mode: 'live', speed: '4' },
    { action: 'start', scenarioId: 'test', mode: 'live', speed: 0 }, { action: 'start', scenarioId: 'test', mode: 'live', speed: Infinity }]) {
    assert.throws(() => command(s, input), errorStatus(400));
    assert.equal(s.getSnapshot().run, null);
  }
  assert.throws(() => command(s, { action: 'resume' }), errorStatus(409));
});

test('very slow session wait is stoppable without Node timeout overflow', async t => {
  const s = session(t);
  start(s, { speed: 1e-9 });
  await until(() => s.getSnapshot().run.tick === 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(s.getSnapshot().run.tick, 1);
  await s.dispose();
  assert.equal(s.getSnapshot().run.phase, 'stopped');
});


test('delayed control from a previous run or server session cannot mutate a new run', async t => {
  const s = session(t);
  const old = start(s, { speed: 1000 });
  await until(() => s.getSnapshot().run.phase === 'completed');
  const next = start(s);
  const stale = { sessionId: old.sessionId, runId: old.run.runId };
  for (const action of ['pause', 'stop', 'speed', 'start']) {
    assert.throws(() => s.command({ ...stale, action, speed: 4, scenarioId: 'test', mode: 'dry-run' }), errorStatus(409));
  }
  assert.equal(s.getSnapshot().run.runId, next.run.runId);
  assert.equal(s.getSnapshot().run.phase, 'running');
  const restarted = session(t);
  assert.throws(() => restarted.command({ action: 'start', sessionId: old.sessionId, runId: null, scenarioId: 'test', mode: 'dry-run' }), errorStatus(409));
  assert.equal(restarted.getSnapshot().run, null);
  assert.throws(() => s.command({ action: 'stop' }), errorStatus(400));
});

test('화면에서 직접 구성한 시나리오로 실행하고 목록에 custom 한 자리만 유지한다', async t => {
  const s = session(t);
  const custom = { ...scenario, name: '직접 구성한 경매',
    participants: [{ ...scenario.participants[0], id: 'c1', name: 'C1', budget: 500 }, { ...scenario.participants[1], id: 'c2', name: 'C2', budget: 900 }] };
  const snapshot = command(s, { action: 'start', scenario: custom, mode: 'dry-run', speed: 1 });
  assert.equal(snapshot.run.scenarioId, CUSTOM_SCENARIO_ID);
  assert.deepEqual(snapshot.run.participants.map(actor => [actor.name, actor.budget]), [['C1', 500], ['C2', 900]]);
  assert.deepEqual(snapshot.scenarios.map(entry => entry.id), ['test', CUSTOM_SCENARIO_ID]);

  await until(() => s.getSnapshot().run.phase === 'completed');
  const again = command(s, { action: 'start', scenario: { ...custom, participants: [custom.participants[0]] }, mode: 'dry-run', speed: 1 });
  assert.deepEqual(again.scenarios.map(entry => entry.id), ['test', CUSTOM_SCENARIO_ID]);
  assert.equal(again.run.participants.length, 1);
  // 저장된 custom 자리는 조회와 scenarioId 재실행이 같은 정의를 본다.
  assert.equal(s.getSnapshot().scenarios.at(-1).participantCount, 1);
});

test('잘못된 직접 구성 시나리오는 400으로 거부하고 저장된 설정을 바꾸지 않는다', async t => {
  const s = session(t);
  const custom = { ...scenario, participants: [{ ...scenario.participants[0], id: 'c1', name: 'C1' }, { ...scenario.participants[1], id: 'c2', name: 'C2' }] };
  command(s, { action: 'start', scenario: custom, mode: 'dry-run', speed: 1 });
  await until(() => s.getSnapshot().run.phase === 'completed');
  const saved = s.getSnapshot().scenarios.at(-1);

  const tooMany = { ...custom, participants: Array.from({ length: MAX_CUSTOM_PARTICIPANTS + 1 },
    (_, index) => ({ ...custom.participants[0], id: `x${index}`, name: `X${index}` })) };
  for (const input of [{ scenario: tooMany }, { scenario: { ...custom, participants: [] } }, { scenario: [] },
      { scenario: { ...custom, participants: [{ ...custom.participants[0], budget: 0 }] } },
      { scenario: custom, mode: 'nope' }, { scenario: custom, speed: 0 }]) {
    assert.throws(() => command(s, { action: 'start', mode: 'dry-run', speed: 1, ...input }), errorStatus(400));
  }
  assert.deepEqual(s.getSnapshot().scenarios.at(-1), saved);
  assert.throws(() => command(s, { action: 'start', scenarioId: 'missing', mode: 'dry-run', speed: 1 }), errorStatus(400));
});

test('custom은 준비된 시나리오가 쓸 수 없는 예약 ID다', () => {
  assert.throws(() => new SimulationSession({ scenarios: [{ id: CUSTOM_SCENARIO_ID, scenario }], createClient: () => createDryRunClient() }),
    /예약 ID/);
});

test('실행 기록은 attempt를 포함해 보관 한도 안에서 유지된다', async t => {
  const s = session(t);
  start(s, { speed: 1000 });
  await until(() => s.getSnapshot().run.phase === 'completed');
  const { events } = s.getSnapshot().run;
  assert.ok(events.length <= MAX_RUN_EVENTS);
  const attempts = events.filter(event => event.type === 'attempt');
  const bids = events.filter(event => event.type === 'bid');
  assert.ok(attempts.length > 0, 'attempt 기록이 남는다');
  // 같은 키로 시도와 결과를 이을 수 있어야 참가자별 내역을 복원한다.
  for (const bid of bids) assert.ok(attempts.some(attempt => attempt.idempotencyKey === bid.idempotencyKey));
  for (const attempt of attempts) assert.ok(attempt.participantId && attempt.amount > 0);
});

test('참가자별 보관으로 먼저 이탈한 참가자의 기록도 남는다', async t => {
  const s = session(t);
  start(s, { speed: 1000 });
  await until(() => s.getSnapshot().run.phase === 'completed');
  const { events, participants } = s.getSnapshot().run;
  const attemptsOf = id => events.filter(event => event.participantId === id && event.type === 'attempt');

  const retired = participants.find(actor => actor.state === 'retired' && actor.bidCount > 0);
  assert.ok(retired, '예산이 작은 참가자가 먼저 이탈한다');
  // 전체 길이로만 잘랐다면 먼저 멈춘 참가자의 기록이 통째로 밀려났을 자리다.
  assert.ok(attemptsOf(retired.id).length > 0, '이탈한 참가자의 시도 기록이 남는다');

  for (const actor of participants) {
    const keys = new Set(attemptsOf(actor.id).map(event => event.idempotencyKey));
    assert.ok(keys.size <= MAX_BIDS_PER_PARTICIPANT, `${actor.name} 기록이 참가자 상한 안에 있다`);
  }
  assert.ok(events.filter(event => event.type === 'attempt').every(event => Number.isSafeInteger(event.highestAmount)),
    'attempt에 판단 근거였던 당시 최고가가 들어 있다');
});

test('호출 기록은 요청과 응답을 짝지어 순번대로 남고 보관 한도를 지킨다', async t => {
  const s = session(t);
  start(s, { speed: 1000 });
  await until(() => s.getSnapshot().run.phase === 'completed');
  const { traffic, events } = s.getSnapshot().run;
  assert.ok(traffic.length > 0 && traffic.length <= MAX_TRAFFIC_RECORDS);
  for (let i = 1; i < traffic.length; i++) {
    assert.equal(traffic[i].seq, traffic[i - 1].seq + 1, '순번은 빈틈없이 증가한다');
    assert.ok(traffic[i].atMs >= traffic[i - 1].atMs);
  }
  assert.ok(traffic.at(-1).seq > MAX_TRAFFIC_RECORDS, '이 실행은 한도보다 많은 호출을 만든다');
  assert.ok(traffic.some(item => item.call === 'read' && item.direction === 'request' && item.path === '/api/dashboard'));
  const bidResponses = traffic.filter(item => item.call === 'bid' && item.direction === 'response');
  assert.ok(bidResponses.length > 0);
  for (const response of bidResponses) {
    assert.ok(['ACCEPTED', 'REJECTED'].includes(response.outcome));
    const request = traffic.find(item => item.callId === response.callId && item.direction === 'request');
    if (request) assert.equal(request.amount, response.amount);
  }
  // 호출 기록은 참가자 내역을 위한 events와 별개다.
  assert.ok(events.every(event => !('direction' in event)));
});

test('traceClient는 결과와 오류를 바꾸지 않고 그대로 전달한다', async () => {
  const records = [];
  let clock = 0;
  const failure = new Error('API 500: down');
  const client = traceClient({
    async readDashboard() { clock += 7; return { summary: { highestAmount: 5, participantCount: 1 } }; },
    async submitBid() { clock += 3; throw failure; },
  }, entry => records.push(entry), () => clock);
  assert.equal((await client.readDashboard()).summary.highestAmount, 5);
  await assert.rejects(client.submitBid({ customerName: 'A', amount: 9, idempotencyKey: 'k' }), failure);
  assert.deepEqual(records.map(item => [item.callId, item.call, item.direction, item.outcome, item.durationMs]),
    [[1, 'read', 'request', undefined, undefined], [1, 'read', 'response', 'OK', 7],
     [2, 'bid', 'request', undefined, undefined], [2, 'bid', 'response', 'ERROR', 3]]);
  assert.equal(records[3].customerName, 'A');
  assert.match(records[3].message, /down/);
});
