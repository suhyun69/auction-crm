import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpClient, createDryRunClient } from '../clients.mjs';

async function server(t, handler) {
  const instance = createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => { instance.closeAllConnections(); return new Promise(resolve => instance.close(resolve)); });
  return `http://127.0.0.1:${instance.address().port}`;
}
const accepted = { bidId: 1, status: 'ACCEPTED', reason: 'NEW_HIGHEST_BID', submittedAmount: 100, highestAmount: 100, highestBidderName: 'A' };

test('lost response retries the identical logical bid/key and creates one stored bid', async t => {
  const calls = [];
  const stored = new Map();
  const origin = await server(t, async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls.push({ method: req.method, url: req.url, key: req.headers['idempotency-key'], body: JSON.parse(raw) });
    stored.set(req.headers['idempotency-key'], accepted);
    if (calls.length === 1) { req.socket.destroy(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(stored.get(req.headers['idempotency-key'])));
  });
  const result = await createHttpClient({ apiOrigin: origin }).submitBid({ customerName: 'A', amount: 100, idempotencyKey: 'run:a:1' });
  assert.deepEqual(result, accepted);
  assert.equal(calls.length, 2); assert.equal(stored.size, 1);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].url, '/api/bid');
});

test('business conflict is not retried or reported as a normal rejection', async t => {
  let calls = 0;
  const origin = await server(t, (req, res) => { calls++; res.statusCode = 409; res.end('{"message":"conflict"}'); });
  await assert.rejects(createHttpClient({ apiOrigin: origin }).submitBid({ customerName: 'A', amount: 100, idempotencyKey: 'key' }), /409/);
  assert.equal(calls, 1);
});

test('request timeout is bounded and user cancellation skips further retries', async t => {
  let calls = 0;
  const origin = await server(t, () => { calls++; });
  await assert.rejects(createHttpClient({ apiOrigin: origin, timeoutMs: 30, retries: 0 }).readDashboard(), /abort|timeout/i);
  const control = new AbortController();
  control.abort(new Error('user stop'));
  const before = calls;
  await assert.rejects(createHttpClient({ apiOrigin: origin }).readDashboard({ signal: control.signal }), /user stop/);
  assert.equal(calls, before);
});

test('dry-run preserves per-user best and key response after market changes', async () => {
  const client = createDryRunClient();
  const first = await client.submitBid({ customerName: 'A', amount: 100, idempotencyKey: 'a1' });
  await client.submitBid({ customerName: 'B', amount: 200, idempotencyKey: 'b1' });
  const rejected = await client.submitBid({ customerName: 'A', amount: 150, idempotencyKey: 'a2' });
  assert.equal(rejected.status, 'REJECTED');
  assert.deepEqual(await client.submitBid({ customerName: 'A', amount: 100, idempotencyKey: 'a1' }), first);
  const state = await client.readDashboard();
  assert.equal(state.summary.bidCount, 3);
  assert.equal(state.summary.highestAmount, 200);
  assert.equal(state.participants.find(p => p.customerName === 'A').highestAcceptedAmount, 100);
});

test('malformed successful API response fails instead of corrupting the market', async t => {
  const origin = await server(t, (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"status":"ACCEPTED"}'); });
  await assert.rejects(createHttpClient({ apiOrigin: origin, retries: 0 }).readDashboard(), /응답 형식/);
});
