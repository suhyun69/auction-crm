import { test } from 'node:test';
import assert from 'node:assert/strict';
import dashboardModule from '../.test-build/live-dashboard.js';
const { createLiveDashboard } = dashboardModule;
const tick = () => new Promise(resolve => setImmediate(resolve));
const snapshot = count => ({
  summary: { bidCount: count, participantCount: 1, highestAmount: count * 1000, highestBidderName: '테스트' },
  participants: [{ participantId: 1, rank: 1, customerName: '테스트', highestAcceptedAmount: count * 1000, bidCount: count, lastBidAt: '2026-11-18T00:00:00Z' }],
});

function setup(t) {
  const originalFetch = global.fetch;
  const originalSource = global.EventSource;
  const requests = [];
  const sources = [];
  class FakeSource extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
    readyState = 0;
    constructor() { super(); sources.push(this); }
    open() { this.readyState = 1; this.onopen?.(new Event('open')); }
    close() { this.readyState = 2; }
    emit(type) { this.dispatchEvent(new Event(type)); }
  }
  global.EventSource = FakeSource;
  global.fetch = (_url, options) => new Promise((resolve, reject) => {
    const request = { signal: options.signal, options, respond: data => resolve({ ok: true, json: async () => data }), fail: () => reject(new Error('offline')) };
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    requests.push(request);
  });
  const state = { data: [], errors: [], connections: [], changed: [], loading: [], traffic: [] };
  const client = createLiveDashboard({
    onData: value => state.data.push(value), onError: value => state.errors.push(value),
    onConnection: value => state.connections.push(value), onChanged: value => state.changed.push(value),
    onLoading: value => state.loading.push(value), onTraffic: value => state.traffic.push(value),
  });
  t.after(() => { client.dispose(); global.fetch = originalFetch; global.EventSource = originalSource; });
  return { requests, sources, state, client };
}

test('initial read works before SSE; ready closes the initial/connect gap', async t => {
  const { requests, sources, state } = setup(t);
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.cache, 'no-store');
  requests[0].respond(snapshot(1)); await tick();
  sources[0].open(); sources[0].emit('ready'); await tick();
  assert.equal(requests.length, 2);
  requests[1].respond(snapshot(2)); await tick();
  assert.deepEqual(state.data.map(x => x.summary.bidCount), [1, 2]);
  assert.equal(state.connections.at(-1), 'connected');
});

test('in-flight events coalesce, publish progress and cannot reverse read order', async t => {
  const { requests, sources, state } = setup(t);
  await tick();
  for (let n = 0; n < 10; n++) sources[0].emit('dashboard-changed');
  await tick(); assert.equal(requests.length, 1);
  requests[0].respond(snapshot(1)); await tick();
  assert.equal(requests.length, 2);
  assert.equal(state.data.at(-1).summary.bidCount, 1);
  // Continue invalidating while the second read is pending: the first result still remains visible.
  for (let n = 0; n < 10; n++) sources[0].emit('dashboard-changed');
  requests[1].respond(snapshot(2)); await tick();
  assert.equal(requests.length, 3);
  assert.equal(state.data.at(-1).summary.bidCount, 2);
  requests[2].respond(snapshot(3)); await tick();
  assert.deepEqual(state.data.map(x => x.summary.bidCount), [1, 2, 3]);
  assert.deepEqual(state.changed.at(-1), [1]);
  assert.equal(state.loading.at(-1), false);
});

test('failed refresh keeps prior data; retry reads again and clears the error', async t => {
  const { requests, sources, state, client } = setup(t);
  await tick(); requests[0].respond(snapshot(1)); await tick();
  sources[0].open(); await tick(); requests[1].fail(); await tick();
  assert.equal(state.data.at(-1).summary.bidCount, 1);
  assert.ok(state.errors.at(-1));
  client.retry(); await tick(); requests[2].respond(snapshot(3)); await tick();
  assert.equal(state.data.at(-1).summary.bidCount, 3);
  assert.equal(state.errors.at(-1), null);
});

test('dispose aborts pending HTTP, closes SSE, removes listeners and suppresses updates', async t => {
  const { requests, sources, state, client } = setup(t);
  await tick();
  const updates = JSON.stringify(state);
  client.dispose();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(sources[0].readyState, 2);
  sources[0].emit('ready'); sources[0].emit('dashboard-changed'); client.retry();
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(state), updates);
});

test('SSE reconnect refreshes the snapshot and retry replaces a permanently closed stream', async t => {
  const { requests, sources, state, client } = setup(t);
  await tick(); requests[0].respond(snapshot(1)); await tick();
  sources[0].readyState = 0; sources[0].onerror();
  assert.equal(state.connections.at(-1), 'reconnecting');
  sources[0].open(); sources[0].emit('ready'); await tick();
  requests[1].respond(snapshot(2)); await tick();
  assert.equal(state.data.at(-1).summary.bidCount, 2);
  sources[0].readyState = 2; sources[0].onerror();
  assert.equal(state.connections.at(-1), 'disconnected');
  client.retry(); await tick();
  assert.equal(sources.length, 2);
  assert.equal(sources[0].readyState, 2);
  requests[2].respond(snapshot(3)); await tick();
  assert.equal(state.data.at(-1).summary.bidCount, 3);
});

test('SSE 수신과 재조회 요청·응답을 호출 흐름으로 알린다', async t => {
  const { requests, sources, state } = setup(t);
  await tick();
  requests[0].respond(snapshot(1)); await tick();
  sources[0].open(); await tick();
  requests[1].respond(snapshot(1)); await tick();
  state.traffic.length = 0;
  sources[0].emit('dashboard-changed'); await tick();
  requests[2].fail(); await tick();
  assert.deepEqual(state.traffic.map(item => [item.kind, item.name ?? item.direction, item.ok]),
    [['sse', 'dashboard-changed', undefined], ['refresh', 'request', undefined], ['refresh', 'response', false]]);
  assert.ok(Number.isFinite(state.traffic[2].durationMs));
});
