import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BID_RECORDED } from '../src/auction/auction.events.js';
import { openSse, until } from './support/sse.js';
import { createTestApp, startDatabase } from './support/test-app.js';

/** 제한 시간과 서버 종료로 끝나는 연결. 제한 시간을 짧게 잡으려고 파일을 나눴다. */
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await startDatabase();
  Object.assign(process.env, {
    AUCTION_EVENTS_HEARTBEAT_MS: '50',
    AUCTION_EVENTS_TIMEOUT_MS: '300',
  });
});
afterAll(async () => {
  await container?.stop();
});

async function listeningApp(): Promise<[NestFastifyApplication, string]> {
  const app = await createTestApp();
  await app.listen(0, '127.0.0.1');
  return [app, await app.getUrl()];
}

it('제한 시간이 지나면 연결을 닫고 구독을 정리한다', async () => {
  const [app, base] = await listeningApp();
  try {
    const stream = await openSse(`${base}/api/events`);
    await stream.next('ready');
    await stream.ended;
    expect(app.get(EventEmitter2).listenerCount(BID_RECORDED)).toBe(0);
  } finally {
    await app.close();
  }
});

it('서버를 종료하면 열린 연결을 닫고 바로 끝난다', async () => {
  const [app, base] = await listeningApp();
  const stream = await openSse(`${base}/api/events`);
  await stream.next('ready');
  const started = Date.now();
  await app.close();
  await stream.ended;
  expect(Date.now() - started).toBeLessThan(2000);
  await until(() => app.get(EventEmitter2).listenerCount(BID_RECORDED) === 0);
});
