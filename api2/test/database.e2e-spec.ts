import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * 빈 PostgreSQL에서 앱을 띄우면 마이그레이션과 경매 초기화가 끝나 있어야 한다.
 * 테스트 파일마다 컨테이너를 따로 띄워 다른 파일과 DB를 공유하지 않는다.
 */
let container: StartedPostgreSqlContainer;

async function startApp() {
  // ConfigModule은 모듈 파일을 불러올 때 환경 변수를 읽으므로, 값을 정한 뒤 동적으로 불러온다.
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  // main.ts와 같은 Fastify 어댑터를 쓴다. 넘기지 않으면 Express를 찾는다.
  const app = moduleRef.createNestApplication(new FastifyAdapter());
  await app.init();
  return app;
}

async function rows(app: INestApplication, sql: string) {
  return app.get(EntityManager).fork().getConnection().execute(sql);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17.5-alpine').start();
  Object.assign(process.env, {
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_NAME: container.getDatabase(),
    DB_USERNAME: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
  });
});

afterAll(async () => {
  await container?.stop();
});

describe('빈 데이터베이스에서 시작', () => {
  it('테이블을 만들고 경매 1번 행을 한 번만 준비한다', async () => {
    const first = await startApp();
    const tables = await rows(
      first,
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      'auction',
      'auction_bid',
      'auction_participant',
      'mikro_orm_migrations',
    ]);
    expect(
      await rows(
        first,
        'select id, highest_amount, highest_bidder_name from auction',
      ),
    ).toEqual([{ id: '1', highest_amount: null, highest_bidder_name: null }]);
    await first.close();

    // 다시 시작해도 마이그레이션을 반복하지 않고 경매 행도 늘지 않는다.
    const second = await startApp();
    expect(
      await rows(second, 'select count(*)::int as count from auction'),
    ).toEqual([{ count: 1 }]);
    expect(
      await rows(
        second,
        'select count(*)::int as count from mikro_orm_migrations',
      ),
    ).toEqual([{ count: 1 }]);
    await second.close();
  });
});
