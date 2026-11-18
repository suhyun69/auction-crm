import test from 'node:test';
import assert from 'node:assert/strict';
import requestModule from '../.test-build/simulator/request.js';
const { checkControlOrigin, readControlBody } = requestModule;
function request(body, headers = {}) {
  return new Request('http://localhost:3000/api/simulator', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
}
test('control mutations accept same origin or CLI, reject another browser origin', () => {
  assert.doesNotThrow(() => checkControlOrigin(request('{}')));
  assert.doesNotThrow(() => checkControlOrigin(request('{}', { Origin: 'http://localhost:3000' })));
  assert.throws(() => checkControlOrigin(request('{}', { Origin: 'https://other.example' })), error => error.status === 403);
});
test('body parser accepts one JSON object and rejects malformed or oversized input', async () => {
  assert.deepEqual(await readControlBody(request('{"action":"pause"}')), { action: 'pause' });
  for (const body of ['null', '[]', '{} {}', '{oops']) {
    await assert.rejects(readControlBody(request(body)), error => error.status === 400);
  }
  await assert.rejects(readControlBody(request('{"value":"' + 'x'.repeat(4096) + '"}')), error => error.status === 413);
  await assert.rejects(readControlBody(request('{}', { 'Content-Type': 'text/plain' })), error => error.status === 415);
});
