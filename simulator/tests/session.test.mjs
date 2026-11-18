import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationSession } from '../session.mjs';
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
  assert.equal(result.unresolvedAttempts, 0); assert.ok(result.events.length <= 100);
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
