import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { DashboardResponse } from '../src/auction/dto/auction.responses.js';
import {
  createTestApp,
  postBid,
  resetAuction,
  startDatabase,
} from './support/test-app.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;

async function dashboard(): Promise<DashboardResponse> {
  const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
  expect(response.statusCode).toBe(200);
  return response.json();
}

beforeAll(async () => {
  container = await startDatabase();
  app = await createTestApp();
});
afterAll(async () => {
  await app?.close();
  await container?.stop();
});
beforeEach(() => resetAuction(app));

describe('GET /api/dashboard', () => {
  it('비어 있으면 0과 null을 명시하고 캐시하지 않게 한다', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      summary: {
        bidCount: 0,
        participantCount: 0,
        highestAmount: 0,
        highestBidderName: null,
      },
      participants: [],
    });
  });

  it('승인 최고가순으로, 승인 이력이 없는 참가자는 뒤에 둔다', async () => {
    await postBid(app, { customerName: 'A', amount: 100 }, 'first');
    await postBid(app, { customerName: 'B', amount: 200 });
    await postBid(app, { customerName: 'C', amount: 150 });
    await postBid(app, { customerName: 'A', amount: 300 });
    await postBid(app, { customerName: 'A', amount: 10 });
    await postBid(app, { customerName: 'D', amount: 100 });
    await postBid(app, { customerName: 'A', amount: 100 }, 'first');

    const result = await dashboard();
    expect(result.summary).toEqual({
      bidCount: 6,
      participantCount: 4,
      highestAmount: 300,
      highestBidderName: 'A',
    });
    expect(
      result.participants.map((p) => [
        p.rank,
        p.customerName,
        p.highestAcceptedAmount,
        p.bidCount,
      ]),
    ).toEqual([
      [1, 'A', 300, 3],
      [2, 'B', 200, 1],
      [3, 'C', null, 1],
      [4, 'D', null, 1],
    ]);
    expect(result.participants[0]!.lastBidAt).toMatch(/Z$/);
  });

  it('응찰이 커밋되는 동안 읽어도 요약과 순위가 서로 맞는다', async () => {
    const writer = (async () => {
      for (let i = 1; i <= 40; i++)
        await postBid(app, { customerName: `customer-${i}`, amount: i });
    })();
    const reader = (async () => {
      for (let i = 0; i < 80; i++) {
        const result = await dashboard();
        expect(result.summary.bidCount).toBe(result.summary.participantCount);
        expect(result.participants).toHaveLength(
          result.summary.participantCount,
        );
        expect(result.summary.highestAmount).toBe(result.summary.bidCount);
        expect(
          result.participants.reduce((sum, p) => sum + p.bidCount, 0),
        ).toBe(result.summary.bidCount);
        if (result.participants.length > 0) {
          expect(result.participants[0]!.highestAcceptedAmount).toBe(
            result.summary.highestAmount,
          );
          expect(result.participants[0]!.customerName).toBe(
            result.summary.highestBidderName,
          );
        }
      }
    })();
    await Promise.all([writer, reader]);
    expect((await dashboard()).summary.bidCount).toBe(40);
  });
});
