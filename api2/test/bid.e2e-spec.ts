import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createTestApp,
  postBid,
  resetAuction,
  scalar,
  startDatabase,
} from './support/test-app.js';

let container: StartedPostgreSqlContainer;
let app: NestFastifyApplication;

const counts = async () => ({
  bids: Number(await scalar(app, 'select count(*) from auction_bid')),
  participants: Number(
    await scalar(app, 'select count(*) from auction_participant'),
  ),
  highest: await scalar(app, 'select highest_amount from auction'),
});

beforeAll(async () => {
  container = await startDatabase();
  app = await createTestApp();
});
afterAll(async () => {
  await app?.close();
  await container?.stop();
});
beforeEach(() => resetAuction(app));

describe('POST /api/bid 판정', () => {
  it('최고가 초과만 승인하고 같거나 낮은 응찰도 기록한다', async () => {
    expect(
      (await postBid(app, { customerName: '홍길동', amount: 150000 })).json()
        .status,
    ).toBe('ACCEPTED');
    expect(
      (await postBid(app, { customerName: '김고객', amount: 150000 })).json()
        .status,
    ).toBe('REJECTED');
    const lower = await postBid(app, {
      customerName: '김고객',
      amount: 100000,
    });
    expect(lower.statusCode).toBe(200);
    expect(lower.json()).toMatchObject({
      status: 'REJECTED',
      reason: 'AMOUNT_NOT_HIGH_ENOUGH',
      submittedAmount: 100000,
      highestAmount: 150000,
      highestBidderName: '홍길동',
    });
    expect(await counts()).toEqual({
      bids: 3,
      participants: 2,
      highest: '150000',
    });
  });

  it('상한 금액, 앞뒤 공백을 지운 100자 이름, 200자 키를 받는다', async () => {
    const name = ' '.repeat(200) + '가'.repeat(100) + ' '.repeat(200);
    const response = await postBid(
      app,
      { customerName: name, amount: Number.MAX_SAFE_INTEGER },
      'k'.repeat(200),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ACCEPTED',
      highestBidderName: '가'.repeat(100),
      highestAmount: Number.MAX_SAFE_INTEGER,
    });
  });
});

describe('멱등 키', () => {
  it('새 최고가가 나온 뒤에도 재전송에는 최초 응답을 그대로 돌려준다', async () => {
    const first = await postBid(
      app,
      { customerName: ' 홍길동 ', amount: 100 },
      'retry',
    );
    await postBid(app, { customerName: '다른고객', amount: 200 });
    const replay = await postBid(
      app,
      { customerName: '홍길동', amount: 100 },
      'retry',
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect((await counts()).bids).toBe(2);
  });

  it('기각된 응찰의 재전송도 최초 스냅샷을 돌려주고 두 번 세지 않는다', async () => {
    await postBid(app, { customerName: 'A', amount: 200 });
    const rejected = await postBid(
      app,
      { customerName: 'B', amount: 100 },
      'rejected',
    );
    await postBid(app, { customerName: 'C', amount: 300 });
    const replay = await postBid(
      app,
      { customerName: 'B', amount: 100 },
      'rejected',
    );
    expect(replay.json()).toEqual(rejected.json());
    expect((await counts()).bids).toBe(3);
  });

  it('같은 키에 금액이나 이름이 다르면 409', async () => {
    await postBid(app, { customerName: '홍길동', amount: 100 }, 'retry');
    for (const body of [
      { customerName: '홍길동', amount: 101 },
      { customerName: '다른고객', amount: 100 },
    ]) {
      const conflict = await postBid(app, body, 'retry');
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        status: 409,
        error: 'Conflict',
        message: '동일한 Idempotency-Key가 다른 응찰 요청에 사용되었습니다.',
      });
    }
    expect((await counts()).bids).toBe(1);
  });
});

describe('잘못된 요청은 저장하지 않고 400', () => {
  it.each([
    '0',
    '-1',
    '9007199254740992',
    '9223372036854775808',
    '1.1',
    '"100"',
    'true',
    'null',
    '{}',
    '[]',
  ])('금액 %s', async (amount) => {
    const response = await postBid(
      app,
      `{"customerName":"A","amount":${amount}}`,
    );
    expect(response.statusCode).toBe(400);
    expect(await counts()).toEqual({ bids: 0, participants: 0, highest: null });
  });

  it('이름·키 규칙 위반은 그 규칙을 알려준다', async () => {
    const cases: [unknown, string | undefined, string][] = [
      [
        { customerName: ' ', amount: 1 },
        undefined,
        'customerName은 공백 제거 후 1~100자여야 합니다.',
      ],
      [
        { customerName: '가'.repeat(101), amount: 1 },
        undefined,
        'customerName은 공백 제거 후 1~100자여야 합니다.',
      ],
      [
        { customerName: 'A', amount: 0 },
        undefined,
        'amount는 1 이상 9007199254740991 이하의 정수여야 합니다.',
      ],
      [
        { customerName: 'A', amount: 1 },
        ' ',
        'Idempotency-Key는 1~200자여야 합니다.',
      ],
      [
        { customerName: 'A', amount: 1 },
        'k'.repeat(201),
        'Idempotency-Key는 1~200자여야 합니다.',
      ],
    ];
    for (const [body, key, message] of cases) {
      const response = await postBid(app, body, key);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        timestamp: expect.any(String),
        status: 400,
        error: 'Bad Request',
        message,
      });
    }
    expect((await counts()).bids).toBe(0);
  });

  it.each([
    '{',
    '{}',
    'null',
    '[]',
    '{"customerName":3,"amount":1}',
    '{"customerName":null,"amount":1}',
    '',
  ])('읽을 수 없는 본문 %j', async (body) => {
    const response = await postBid(app, body);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      error: 'Bad Request',
      message: '요청 본문을 읽을 수 없습니다.',
    });
  });

  it.each([' garbage', ' {}', ' []', ' true', ' null', ' 1'])(
    'JSON 뒤에 붙은 %j',
    async (suffix) => {
      const response = await postBid(
        app,
        '{"customerName":"A","amount":100}' + suffix,
      );
      expect(response.statusCode).toBe(400);
      expect(await counts()).toEqual({
        bids: 0,
        participants: 0,
        highest: null,
      });
    },
  );
});

describe('동시 요청', () => {
  it('같은 참가자의 첫 응찰들이 한 줄로 처리된다', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        postBid(
          app,
          { customerName: '동시 고객', amount: 100 + i },
          `key-${i}`,
        ),
      ),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    expect(await counts()).toEqual({
      bids: 8,
      participants: 1,
      highest: '107',
    });
  });

  it('같은 키의 같은 요청은 기록 하나와 같은 응답만 남긴다', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        postBid(app, { customerName: '동일 고객', amount: 100 }, 'same-key'),
      ),
    );
    const bodies = responses.map((response) => response.json());
    expect(
      bodies.every(
        (body) => JSON.stringify(body) === JSON.stringify(bodies[0]),
      ),
    ).toBe(true);
    expect(await counts()).toMatchObject({ bids: 1, participants: 1 });
  });

  it('같은 키의 서로 다른 요청은 하나만 성공하고 하나는 409', async () => {
    const responses = await Promise.all(
      [0, 1].map((i) =>
        postBid(
          app,
          { customerName: `충돌 고객 ${i}`, amount: 100 + i },
          'conflicting-key',
        ),
      ),
    );
    const statuses = responses.map((response) => response.statusCode);
    expect(statuses.sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await counts()).toMatchObject({ bids: 1, participants: 1 });
  });
});

describe('CORS', () => {
  it('허용한 web 원점의 사전 요청에 응찰 헤더를 허용한다', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/bid',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,idempotency-key',
      },
    });
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type, Idempotency-Key',
    );
  });

  it('다른 원점에는 허용 헤더를 주지 않는다', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { origin: 'http://evil.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
