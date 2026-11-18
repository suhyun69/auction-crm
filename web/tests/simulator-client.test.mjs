import test from 'node:test';
import assert from 'node:assert/strict';
import clientModule from '../.test-build/simulator/client.js';
const { createSimulatorClient, shouldSyncSimulationSelection } = clientModule;
const tick = () => new Promise(resolve => setImmediate(resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = (revision, sessionId = 'server-a') => ({ sessionId, revision, scenarios: [], run: null });
function setup(t) {
  const previous = global.fetch;
  const requests = [], states = [], errors = [], pending = [];
  global.fetch = (_url, options) => new Promise(resolve => { requests.push({ ...options, respond: (body, status = 200) => resolve(Response.json(body, { status })) }); });
  const client = createSimulatorClient({ onSnapshot: value => states.push(value), onError: value => errors.push(value), onPending: value => pending.push(value) }, 15);
  t.after(() => { client.dispose(); global.fetch = previous; });
  return { client, requests, states, errors, pending };
}
test('a command carries observed identity and invalidates slow GET and lower revision', async t => {
  const s = setup(t);
  s.requests[0].respond(snapshot(1)); await tick();
  await sleep(25);
  const command = s.client.command({ action: 'pause' });
  assert.equal(s.requests[1].signal.aborted, true);
  assert.deepEqual(JSON.parse(s.requests[2].body), { action: 'pause', sessionId: 'server-a', runId: null });
  s.requests[2].respond(snapshot(8)); await command;
  s.requests[1].respond(snapshot(2)); await tick();
  assert.deepEqual(s.states.map(x => x.revision), [1, 8]);
  await sleep(25);
  s.requests[3].respond(snapshot(7)); await tick();
  assert.deepEqual(s.states.map(x => x.revision), [1, 8]);
});
test('polls are serialized and a new server session can restart its revision', async t => {
  const s = setup(t);
  await sleep(40); assert.equal(s.requests.length, 1);
  s.requests[0].respond(snapshot(100)); await tick();
  await sleep(25); assert.equal(s.requests.length, 2);
  s.requests[1].respond(snapshot(0, 'server-b')); await tick();
  assert.equal(s.states.at(-1).sessionId, 'server-b');
  assert.equal(s.states.at(-1).revision, 0);
});
test('conflicts retain data and duplicate commands are suppressed while pending', async t => {
  const s = setup(t);
  s.requests[0].respond(snapshot(3)); await tick();
  const first = s.client.command({ action: 'start', scenarioId: 'x', mode: 'dry-run', speed: 1 });
  await s.client.command({ action: 'stop' });
  assert.equal(s.requests.filter(x => x.method === 'POST').length, 1);
  s.requests[1].respond({ message: '이미 실행 중입니다.' }, 409); await first;
  assert.equal(s.states.at(-1).revision, 3);
  assert.equal(s.errors.at(-1), '이미 실행 중입니다.');
  assert.deepEqual(s.pending, [true, false]);
});
test('dispose aborts requests, drops late data and stops polling without sending stop', async t => {
  const s = setup(t);
  s.client.dispose();
  assert.equal(s.requests[0].signal.aborted, true);
  s.requests[0].respond(snapshot(10)); await tick();
  await sleep(30);
  assert.equal(s.requests.length, 1); assert.equal(s.states.length, 0);
  assert.equal(s.requests.filter(x => x.method === 'POST').length, 0);
});

test('new completed run synchronizes selectors while repeated terminal polls preserve preview choices', () => {
  const completed = (id, scenarioId) => ({ ...snapshot(5), run: { runId: id, scenarioId, phase: 'completed' } });
  assert.equal(shouldSyncSimulationSelection(snapshot(1), completed('new-run', 'quick-duel')), true);
  assert.equal(shouldSyncSimulationSelection(completed('old-run', 'standard'), completed('new-run', 'quick-duel')), true);
  assert.equal(shouldSyncSimulationSelection(completed('same-run', 'quick-duel'), completed('same-run', 'quick-duel')), false);
  assert.equal(shouldSyncSimulationSelection({ ...snapshot(4), run: { runId: 'x', phase: 'running' } }, completed('x', 'quick-duel')), true);
  assert.equal(shouldSyncSimulationSelection(snapshot(9), snapshot(0, 'new-server')), true);
});
