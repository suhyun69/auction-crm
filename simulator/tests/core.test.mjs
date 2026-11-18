import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationEngine, createSeededRandom } from '../core.mjs';

function scenario(overrides = {}) {
  return {
    version: 1, name: '경매', seed: 1234, durationMs: 1000, tickMs: 100, minIncrement: 1,
    participants: [{ id: 'a', name: 'A', budget: 1000, participationProbability: 1,
      reactionMs: { min: 1, max: 1 }, increment: { min: 1, max: 1 } }],
    ...overrides,
  };
}
function api(initial = { highestAmount: 0, highestBidderName: null }) {
  const market = { ...initial };
  const requests = [];
  let reads = 0;
  return {
    market, requests,
    get reads() { return reads; },
    async readDashboard() { reads++; return { summary: { ...market } }; },
    async submitBid(request) {
      requests.push({ ...request });
      const accepted = request.amount > market.highestAmount;
      if (accepted) Object.assign(market, { highestAmount: request.amount, highestBidderName: request.customerName });
      return {
        bidId: requests.length, status: accepted ? 'ACCEPTED' : 'REJECTED',
        reason: accepted ? 'NEW_HIGHEST_BID' : 'AMOUNT_NOT_HIGH_ENOUGH',
        submittedAmount: request.amount, ...market,
      };
    },
  };
}
async function complete(engine) {
  let state;
  for (let count = 0; count < 1000; count++) {
    state = await engine.step();
    if (!['ready', 'running'].includes(state.phase)) return state;
  }
  throw new Error('engine did not terminate');
}

test('same seed and API sequence reproduce traces; different seeds vary behavior', async () => {
  async function run(seed) {
    const events = [];
    const client = api();
    const actors = ['A', 'B', 'C'].map(name => ({
      id: name, name, budget: 100000, personality: 'impulsive', participationProbability: 0.8,
      reactionMs: { min: 100, max: 700 }, increment: { min: 1, max: 50 },
    }));
    const engine = new SimulationEngine(scenario({ seed, durationMs: 10000, participants: actors }), {
      client, runId: 'test-run', onEvent: event => events.push(event),
    });
    const state = await complete(engine);
    return { events, state, requests: client.requests };
  }
  const first = await run('same');
  assert.deepEqual(await run('same'), first);
  assert.notDeepEqual((await run('different')).requests, first.requests);
  assert.equal(first.state.phase, 'completed');
  assert.ok(first.requests.length > 3);
  assert.equal(new Set(first.requests.map(r => r.idempotencyKey)).size, first.requests.length);
});

test('a leading actor waits without outbidding itself or retiring at its budget', async () => {
  const client = api();
  const engine = new SimulationEngine(scenario({ participants: [{
    id: 'a', name: 'A', budget: 1, participationProbability: 1,
    reactionMs: { min: 1, max: 1 }, increment: { min: 1, max: 1 },
  }] }), { client, runId: 'leader' });
  const state = await complete(engine);
  assert.equal(client.requests.length, 1);
  assert.equal(state.participants[0].state, 'leading');
  assert.equal(state.totals.accepted, 1);
  assert.equal(state.elapsedMs, 1000);
});

test('budget is a single-item ceiling, candidates clip safely, outbid actors retire', async () => {
  const client = api();
  const actors = ['A', 'B'].map(name => ({
    id: name, name, budget: 11, participationProbability: 1,
    reactionMs: { min: 1, max: 1 }, increment: { min: 7, max: 7 },
  }));
  const engine = new SimulationEngine(scenario({ participants: actors }), { client, runId: 'budget' });
  const state = await complete(engine);
  assert.deepEqual(client.requests.map(r => r.amount), [7, 11]);
  assert.ok(client.requests.every(r => r.amount <= 11));
  assert.equal(state.participants.find(p => p.name === 'A').state, 'retired');
  assert.equal(state.participants.find(p => p.name === 'B').state, 'leading');
});

test('large safe integers never overflow and no invalid bid is sent', async () => {
  const client = api({ highestAmount: Number.MAX_SAFE_INTEGER - 1, highestBidderName: 'external' });
  const actor = { ...scenario().participants[0], budget: Number.MAX_SAFE_INTEGER,
    increment: { min: 100, max: 100 } };
  const engine = new SimulationEngine(scenario({ participants: [actor] }), { client, runId: 'large' });
  const state = await complete(engine);
  assert.equal(client.requests[0].amount, Number.MAX_SAFE_INTEGER);
  assert.equal(state.market.highestAmount, Number.MAX_SAFE_INTEGER);
});

test('late arrivals do not bid early and entry is emitted at its logical tick', async () => {
  const client = api();
  const events = [];
  const actor = { ...scenario().participants[0], joinAtMs: 300 };
  const engine = new SimulationEngine(scenario({ participants: [actor] }), {
    client, runId: 'late', onEvent: event => events.push(event),
  });
  for (let n = 0; n < 3; n++) await engine.step();
  assert.equal(client.requests.length, 0);
  await engine.step();
  assert.equal(client.requests.length, 1);
  assert.equal(events.find(e => e.type === 'joined').elapsedMs, 300);
});

test('a rejected bid updates the authoritative market and subsequent decision', async () => {
  const client = api();
  const submit = client.submitBid;
  let first = true;
  client.submitBid = async request => {
    if (first) { first = false; Object.assign(client.market, { highestAmount: 50, highestBidderName: 'external' }); }
    return submit(request);
  };
  const engine = new SimulationEngine(scenario(), { client, runId: 'rejected' });
  const state = await complete(engine);
  assert.deepEqual(client.requests.map(r => r.amount), [1, 51]);
  assert.deepEqual(state.totals, { attempted: 2, accepted: 1, rejected: 1, errors: 0 });
});

test('maxBids limits new decisions, and a zero participation probability sends no requests', async () => {
  const client = api();
  // An external bidder always wins so the actor can attempt again.
  client.submitBid = async request => {
    client.requests.push(request);
    Object.assign(client.market, { highestAmount: request.amount + 1, highestBidderName: 'external' });
    return { status: 'REJECTED', ...client.market };
  };
  const actor = { ...scenario().participants[0], maxBids: 2 };
  const state = await complete(new SimulationEngine(scenario({ participants: [actor] }), { client, runId: 'max' }));
  assert.equal(client.requests.length, 2);
  assert.equal(state.participants[0].state, 'retired');
  const idle = api();
  await complete(new SimulationEngine(scenario({ participants: [{ ...actor, participationProbability: 0 }] }), { client: idle, runId: 'idle' }));
  assert.equal(idle.requests.length, 0);
});

test('snapshots and emitted payloads cannot mutate engine state', async () => {
  const engine = new SimulationEngine(scenario(), { client: api(), runId: 'copies', onEvent: event => {
    if (event.response) event.response.highestAmount = -1;
  } });
  const initial = engine.getState();
  initial.participants[0].name = 'tampered';
  await engine.step();
  assert.equal(engine.getState().participants[0].name, 'A');
  assert.equal(engine.getState().market.highestAmount, 1);
});

test('stop before a step performs no HTTP and remains stopped', async () => {
  const client = api();
  const engine = new SimulationEngine(scenario(), { client, runId: 'stop' });
  engine.stop('requested');
  assert.equal((await engine.step()).phase, 'stopped');
  assert.equal(client.reads, 0);
  assert.equal(client.requests.length, 0);
});

test('API read and unknown bid failures stop without inventing a result', async () => {
  const readFailure = api();
  readFailure.readDashboard = async () => { throw new Error('offline'); };
  let engine = new SimulationEngine(scenario(), { client: readFailure, runId: 'read-error' });
  let state = await engine.step();
  assert.equal(state.phase, 'failed');
  assert.equal(state.reason, 'offline');
  assert.equal(state.totals.errors, 1);
  assert.equal(state.totals.attempted, 0);
  const unknown = api();
  unknown.submitBid = async () => { throw new Error('unknown outcome'); };
  engine = new SimulationEngine(scenario(), { client: unknown, runId: 'bid-error' });
  state = await engine.step();
  assert.equal(state.phase, 'failed');
  assert.deepEqual(state.totals, { attempted: 1, accepted: 0, rejected: 0, errors: 1 });
  assert.equal(state.participants[0].lastAmount, null);
});

test('abort stops cleanly before IO and during an in-flight read', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = api();
  let engine = new SimulationEngine(scenario(), { client, runId: 'abort-first' });
  assert.equal((await engine.step({ signal: controller.signal })).phase, 'stopped');
  assert.equal(client.reads, 0);
  const during = new AbortController();
  const waiting = api();
  waiting.readDashboard = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  engine = new SimulationEngine(scenario(), { client: waiting, runId: 'abort-during' });
  const pending = engine.step({ signal: during.signal });
  during.abort();
  const state = await pending;
  assert.equal(state.phase, 'stopped');
  assert.equal(state.totals.errors, 0);
});

test('concurrent step calls are rejected so HTTP decisions cannot overlap', async () => {
  let release;
  const client = api();
  client.readDashboard = () => new Promise(resolve => { release = () => resolve({ summary: client.market }); });
  const engine = new SimulationEngine(scenario(), { client, runId: 'exclusive' });
  const pending = engine.step();
  await assert.rejects(engine.step(), /동시에/);
  release();
  await pending;
});

test('malformed market and bid status responses fail clearly', async () => {
  const client = api();
  client.readDashboard = async () => ({ summary: { highestAmount: '100', highestBidderName: 'external' } });
  assert.equal((await new SimulationEngine(scenario(), { client, runId: 'bad-market' }).step()).phase, 'failed');
  const badBid = api();
  badBid.submitBid = async () => ({ status: 'WHATEVER' });
  assert.equal((await new SimulationEngine(scenario(), { client: badBid, runId: 'bad-bid' }).step()).phase, 'failed');
});

test('seed generator is reproducible and stays in the half-open unit interval', () => {
  const one = createSeededRandom('seed');
  const two = createSeededRandom('seed');
  for (let n = 0; n < 100; n++) {
    const value = one();
    assert.equal(value, two());
    assert.ok(value >= 0 && value < 1);
  }
});


test('Unicode IDs produce bounded ASCII request keys and separate actors/runs', async () => {
  async function keys(runId) {
    const client = api();
    const actors = ['하나', '둘'].map(name => ({ ...scenario().participants[0], id: name, name }));
    await complete(new SimulationEngine(scenario({ participants: actors }), { client, runId }));
    return client.requests.map(r => r.idempotencyKey);
  }
  const first = await keys('실행 한글');
  assert.ok(first.length > 1);
  assert.ok(first.every(key => /^sim-[a-f0-9]{64}$/.test(key)));
  assert.equal(new Set(first).size, first.length);
  assert.deepEqual(await keys('실행 한글'), first);
  assert.notDeepEqual(await keys('다른 실행'), first);
});

test('stopping from an entry event prevents a new API decision', async () => {
  const client = api();
  let engine;
  engine = new SimulationEngine(scenario(), { client, runId: 'stop-entry', onEvent: event => {
    if (event.type === 'joined') engine.stop('entry-stop');
  } });
  const state = await engine.step();
  assert.equal(state.phase, 'stopped');
  assert.equal(client.requests.length, 0);
});

test('a known in-flight response is recorded once before stopping', async () => {
  const client = api();
  const submit = client.submitBid;
  let release;
  client.submitBid = request => new Promise(resolve => {
    release = async () => resolve(await submit(request));
  });
  const engine = new SimulationEngine(scenario(), { client, runId: 'stop-bid' });
  const pending = engine.step();
  await new Promise(resolve => setImmediate(resolve));
  engine.stop('user');
  await release();
  const state = await pending;
  assert.equal(state.phase, 'stopped');
  assert.equal(state.totals.accepted, 1);
  assert.equal(state.totals.attempted, 1);
  assert.equal(state.market.highestAmount, 1);
  await engine.step();
  assert.equal(client.requests.length, 1);
});


test('unknown outcomes preserve the original request key in an attempt event', async () => {
  const events = [];
  const client = api();
  client.submitBid = async () => { throw new Error('connection lost after write'); };
  const engine = new SimulationEngine(scenario(), { client, runId: 'unknown', onEvent: event => events.push(event) });
  const state = await engine.step();
  assert.equal(state.phase, 'failed');
  const attempt = events.find(event => event.type === 'attempt');
  assert.equal(attempt.customerName, 'A');
  assert.equal(attempt.amount, 1);
  assert.match(attempt.idempotencyKey, /^sim-[a-f0-9]{64}$/);
  assert.equal(events.some(event => event.type === 'bid'), false);
});
