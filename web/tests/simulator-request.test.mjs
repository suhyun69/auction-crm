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
test('브라우저가 접속한 Host(포트 매핑·프록시)와 같은 원점이면 받고, 다른 원점은 그래도 거부한다', () => {
  // 컨테이너 안 서버는 localhost:3000으로 받지만 브라우저는 호스트 포트 3102로 접속한 경우
  const mapped = headers => new Request('http://localhost:3000/api/simulator', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
  assert.doesNotThrow(() => checkControlOrigin(mapped({ Origin: 'http://localhost:3102', Host: 'localhost:3102' })));
  assert.doesNotThrow(() => checkControlOrigin(mapped({ Origin: 'https://auction.example', Host: 'web:3000', 'X-Forwarded-Host': 'auction.example' })));
  assert.throws(() => checkControlOrigin(mapped({ Origin: 'http://evil.example', Host: 'localhost:3102' })), error => error.status === 403);
  assert.throws(() => checkControlOrigin(mapped({ Origin: 'http://localhost:3103', Host: 'localhost:3102' })), error => error.status === 403);
  assert.throws(() => checkControlOrigin(mapped({ Origin: 'null', Host: 'localhost:3102' })), error => error.status === 403);
});
test('body parser accepts one JSON object and rejects malformed or oversized input', async () => {
  assert.deepEqual(await readControlBody(request('{"action":"pause"}')), { action: 'pause' });
  for (const body of ['null', '[]', '{} {}', '{oops']) {
    await assert.rejects(readControlBody(request(body)), error => error.status === 400);
  }
  await assert.rejects(readControlBody(request('{"value":"' + 'x'.repeat(4096) + '"}')), error => error.status === 413);
  await assert.rejects(readControlBody(request('{}', { 'Content-Type': 'text/plain' })), error => error.status === 415);
});
