import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BID_RECORDED } from '../src/auction/auction.events.js';
import { openSse, until, type SseStream } from './support/sse.js';
import {
  createTestApp,
  postBid,
  resetAuction,
  scalar,
  startDatabase,
} from './support/test-app.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let base: string;
const streams: SseStream[] = [];
const listeners = () => app.get(EventEmitter2).listenerCount(BID_RECORDED);

async function connect(headers?: Record<string, string>) {
  const stream = await openSse(`${base}/api/events`, headers);
  streams.push(stream);
  return stream;
}

beforeAll(async () => {
  container = await startDatabase();
  Object.assign(process.env, {
    AUCTION_EVENTS_HEARTBEAT_MS: '50',
    AUCTION_EVENTS_TIMEOUT_MS: '15000',
  });
  app = await createTestApp();
  // SSE는 끝나지 않는 응답이라 inject 대신 실제 포트로 띄운다.
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterEach(async () => {
  streams.splice(0).forEach((stream) => stream.close());
  await until(() => listeners() === 0);
});
afterAll(async () => {
  await app?.close();
  await container?.stop();
});
beforeEach(() => resetAuction(app));

describe('GET /api/events', () => {
  it('SSE 헤더로 응답하고 ready·heartbeat·커밋된 변경을 두 구독자 모두에게 보낸다', async () => {
    const a = await connect();
    const b = await connect();
    expect(a.response.status).toBe(200);
    expect(a.response.headers.get('content-type')).toMatch(
      /^text\/event-stream/,
    );
    expect(a.response.headers.get('cache-control')).toContain('no-store');
    expect(a.response.headers.get('x-accel-buffering')).toBe('no');

    await a.next('ready');
    await b.next('ready');
    await a.next('heartbeat');
    await postBid(app, { customerName: 'A', amount: 100 });
    await a.next('dashboard-changed');
    await b.next('dashboard-changed');

    // 한쪽이 끊으면 그 구독만 정리되고, 다시 연결하면 ready부터 새로 받는다.
    a.close();
    await until(() => listeners() === 1);
    const reconnected = await connect();
    await reconnected.next('ready');
    await postBid(app, { customerName: 'B', amount: 200 });
    await reconnected.next('dashboard-changed');
  });

  it('새 기록이 커밋됐을 때만 알린다: 기각은 알리고 재전송·검증 실패·409는 알리지 않는다', async () => {
    const stream = await connect();
    await stream.next('ready');
    const changes = () =>
      stream.frames.filter((frame) => frame === 'dashboard-changed').length;

    await postBid(app, { customerName: 'A', amount: 100 }, 'first');
    await until(() => changes() === 1);
    await postBid(app, { customerName: 'A', amount: 100 }, 'first');
    await postBid(app, { customerName: 'A', amount: 0 });
    await postBid(app, { customerName: 'A', amount: 101 }, 'first');
    await postBid(app, { customerName: 'C', amount: 50 });
    await until(() => changes() === 2);
    // 마지막 기각 알림까지 받은 뒤에도 더 오지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(changes()).toBe(2);
  });

  it('알림을 받는 쪽이 실패해도 커밋된 응찰은 200으로 끝난다', async () => {
    const broken = () => {
      throw new Error('broken listener');
    };
    app.get(EventEmitter2).on(BID_RECORDED, broken);
    try {
      const response = await postBid(app, { customerName: 'A', amount: 100 });
      expect(response.statusCode).toBe(200);
      expect(
        Number(await scalar(app, 'select count(*) from auction_bid')),
      ).toBe(1);
    } finally {
      app.get(EventEmitter2).off(BID_RECORDED, broken);
    }
  });

  it('허용한 원점에는 CORS 헤더를 붙인다', async () => {
    const stream = await connect({ origin: 'http://localhost:3000' });
    expect(stream.response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3000',
    );
    await stream.next('ready');
  });
});
