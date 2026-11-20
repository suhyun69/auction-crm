import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { EntityManager } from '@mikro-orm/postgresql';

/**
 * e2e 테스트 공용 도구. 파일마다 PostgreSQL 컨테이너 하나와 앱 하나를 띄운다.
 * 앱은 main.ts와 같은 설정(configureApp)을 거치고, 요청은 포트 없이 Fastify inject로 보낸다.
 */
export async function startDatabase(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(
    'postgres:17.5-alpine',
  ).start();
  Object.assign(process.env, {
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_NAME: container.getDatabase(),
    DB_USERNAME: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    AUCTION_WEB_ALLOWED_ORIGINS: 'http://localhost:3000',
  });
  return container;
}

export async function createTestApp(): Promise<NestFastifyApplication> {
  // 환경 변수를 정한 뒤 불러와야 ConfigModule이 컨테이너 주소를 읽는다.
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** 테스트마다 응찰·참가자를 비우고 경매 최고가를 처음 상태로 돌린다. */
export async function resetAuction(app: NestFastifyApplication) {
  const connection = app.get(EntityManager).getConnection();
  await connection.execute(
    'truncate auction_bid, auction_participant restart identity',
  );
  await connection.execute(
    'update auction set highest_amount = null, highest_bidder_name = null',
  );
}

export async function scalar(
  app: NestFastifyApplication,
  sql: string,
): Promise<unknown> {
  const [row] = await app
    .get(EntityManager)
    .getConnection()
    .execute<Record<string, unknown>[]>(sql);
  return Object.values(row ?? {})[0];
}

export async function postBid(
  app: NestFastifyApplication,
  body: unknown,
  key?: string,
) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return app.inject({
    method: 'POST',
    url: '/api/bid',
    headers: {
      'content-type': 'application/json',
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
    payload,
  });
}
