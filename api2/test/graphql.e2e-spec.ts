import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient, type Client } from 'graphql-ws';
import WebSocket from 'ws';
import { until } from './support/sse.js';
import {
  createTestApp,
  postBid,
  resetAuction,
  scalar,
  startDatabase,
} from './support/test-app.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;
let wsUrl: string;
const clients: Client[] = [];

type GraphqlResult = {
  data?: any;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function graphql(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlResult> {
  const response = await app.inject({
    method: 'POST',
    url: '/graphql',
    payload: { query, variables },
  });
  return response.json();
}

const SUBMIT = `mutation($input: SubmitBidInput!, $key: String) {
  submitBid(input: $input, idempotencyKey: $key) { bidId status reason submittedAmount highestAmount highestBidderName }
}`;
const submit = (customerName: string, amount: number, key?: string) =>
  graphql(SUBMIT, { input: { customerName, amount }, key });

/** graphql-ws 클라이언트로 구독하고 받은 대시보드를 쌓는다. */
function subscribe(headers: Record<string, string> = {}) {
  const received: { bidCount: number; highestAmount: number }[] = [];
  const client = createClient({
    url: wsUrl,
    // 브라우저 WebSocket은 Origin을 직접 정할 수 없어, 테스트는 ws 패키지로 헤더를 넣는다.
    webSocketImpl: class extends WebSocket {
      constructor(address: string, protocols?: string | string[]) {
        super(address, protocols, { headers });
      }
    },
    retryAttempts: 0,
  });
  clients.push(client);
  let connected!: () => void;
  const ready = new Promise<void>((resolve) => (connected = resolve));
  client.on('connected', () => connected());
  const errors: unknown[] = [];
  client.subscribe(
    {
      query:
        'subscription { dashboardChanged { summary { bidCount highestAmount } } }',
    },
    {
      next: (message) =>
        received.push((message.data as any).dashboardChanged.summary),
      error: (error) => errors.push(error),
      complete: () => {},
    },
  );
  return { received, ready, errors };
}

beforeAll(async () => {
  container = await startDatabase();
  app = await createTestApp();
  await app.listen(0, '127.0.0.1');
  wsUrl = (await app.getUrl()).replace(/^http/, 'ws') + '/graphql';
});
afterEach(async () => {
  await Promise.all(
    clients.splice(0).map((client) => Promise.resolve(client.dispose())),
  );
});
afterAll(async () => {
  await app?.close();
  await container?.stop();
});
beforeEach(() => resetAuction(app));

describe('query dashboard', () => {
  it('REST와 같은 요약과 순위를 돌려준다', async () => {
    await postBid(app, { customerName: 'A', amount: 100 });
    await postBid(app, { customerName: 'B', amount: 100 });
    const result = await graphql(`
      {
        dashboard {
          summary {
            bidCount
            participantCount
            highestAmount
            highestBidderName
          }
          participants {
            rank
            customerName
            highestAcceptedAmount
            bidCount
            lastBidAt
          }
        }
      }
    `);
    expect(result.errors).toBeUndefined();
    expect(result.data.dashboard.summary).toEqual({
      bidCount: 2,
      participantCount: 2,
      highestAmount: 100,
      highestBidderName: 'A',
    });
    expect(
      result.data.dashboard.participants.map((p: any) => [
        p.rank,
        p.customerName,
        p.highestAcceptedAmount,
      ]),
    ).toEqual([
      [1, 'A', 100],
      [2, 'B', null],
    ]);
    expect(result.data.dashboard.participants[0].lastBidAt).toMatch(/Z$/);
  });
});

describe('mutation submitBid', () => {
  it('2^53 - 1까지의 금액을 그대로 주고받고, 재전송에는 최초 결과를 돌려준다', async () => {
    const first = await submit('  홍길동 ', Number.MAX_SAFE_INTEGER, 'g1');
    expect(first.data.submitBid).toEqual({
      bidId: 1,
      status: 'ACCEPTED',
      reason: 'NEW_HIGHEST_BID',
      submittedAmount: Number.MAX_SAFE_INTEGER,
      highestAmount: Number.MAX_SAFE_INTEGER,
      highestBidderName: '홍길동',
    });
    expect(
      (await submit('홍길동', Number.MAX_SAFE_INTEGER, 'g1')).data,
    ).toEqual(first.data);
    expect(Number(await scalar(app, 'select count(*) from auction_bid'))).toBe(
      1,
    );
  });

  it('검증 실패는 BAD_REQUEST, 키 충돌은 CONFLICT로 알리고 저장하지 않는다', async () => {
    await submit('A', 100, 'k');
    const cases: [GraphqlResult, string, string][] = [
      [
        await submit(' ', 1),
        'BAD_REQUEST',
        'customerName은 공백 제거 후 1~100자여야 합니다.',
      ],
      [
        await submit('A', 0),
        'BAD_REQUEST',
        'amount는 1 이상 9007199254740991 이하의 정수여야 합니다.',
      ],
      [
        await submit('A', 1, ' '),
        'BAD_REQUEST',
        'Idempotency-Key는 1~200자여야 합니다.',
      ],
      [
        await submit('A', 101, 'k'),
        'CONFLICT',
        '동일한 Idempotency-Key가 다른 응찰 요청에 사용되었습니다.',
      ],
    ];
    for (const [result, code, message] of cases) {
      expect(result.errors?.[0]).toMatchObject({
        message,
        extensions: { code },
      });
    }
    expect(Number(await scalar(app, 'select count(*) from auction_bid'))).toBe(
      1,
    );
  });

  it('SafeInt 범위를 넘거나 정수가 아닌 금액은 GraphQL 단계에서 거부한다', async () => {
    for (const amount of [Number.MAX_SAFE_INTEGER + 1, 1.5, '100']) {
      const result = await graphql(SUBMIT, {
        input: { customerName: 'A', amount },
      });
      expect(result.errors?.length).toBeGreaterThan(0);
    }
    expect(Number(await scalar(app, 'select count(*) from auction_bid'))).toBe(
      0,
    );
  });
});

describe('본문 오류', () => {
  it('/graphql의 깨진 JSON은 GraphQL 형식으로, REST는 기존 오류 본문으로 답한다', async () => {
    const headers = { 'content-type': 'application/json' };
    const graphqlResponse = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers,
      payload: '{',
    });
    expect(graphqlResponse.json()).toMatchObject({
      data: null,
      errors: [{ message: expect.any(String) }],
    });
    const restResponse = await app.inject({
      method: 'POST',
      url: '/api/bid',
      headers,
      payload: '{',
    });
    expect(restResponse.statusCode).toBe(400);
    expect(restResponse.json()).toMatchObject({
      status: 400,
      message: '요청 본문을 읽을 수 없습니다.',
    });
  });
});

describe('subscription dashboardChanged', () => {
  it('응찰이 커밋되면 최신 대시보드를 보낸다. 재전송·실패는 보내지 않는다', async () => {
    const stream = subscribe();
    await stream.ready;
    await postBid(app, { customerName: 'A', amount: 100 }, 'r');
    await until(() => stream.received.length === 1);
    expect(stream.received[0]).toEqual({ bidCount: 1, highestAmount: 100 });

    await postBid(app, { customerName: 'A', amount: 100 }, 'r');
    await submit('A', 0);
    await submit('B', 200);
    await until(() => stream.received.length === 2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stream.received).toEqual([
      { bidCount: 1, highestAmount: 100 },
      { bidCount: 2, highestAmount: 200 },
    ]);
  });

  it('응찰이 몰려도 순서가 뒤집히지 않고 마지막에는 최종 상태를 받는다', async () => {
    const stream = subscribe();
    await stream.ready;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        postBid(app, { customerName: `c${i}`, amount: 100 + i }),
      ),
    );
    await until(() => stream.received.at(-1)?.bidCount === 20);
    const counts = stream.received.map((summary) => summary.bidCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(stream.received.at(-1)).toEqual({
      bidCount: 20,
      highestAmount: 119,
    });
  });

  it('허용한 원점은 연결하고 다른 원점의 연결은 거부한다', async () => {
    const allowed = subscribe({ origin: 'http://localhost:3000' });
    await allowed.ready;

    const status = await new Promise<number>((resolve) => {
      const socket = new WebSocket(wsUrl, 'graphql-transport-ws', {
        headers: { origin: 'http://evil.example' },
      });
      socket.on('unexpected-response', (_request, response) =>
        resolve(response.statusCode ?? 0),
      );
      socket.on('open', () => {
        socket.close();
        resolve(101);
      });
    });
    expect(status).toBe(403);
  });
});
