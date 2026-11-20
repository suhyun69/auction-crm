import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { Auction } from './auction/entities/auction.entity.js';
import { Bid } from './auction/entities/bid.entity.js';
import { Participant } from './auction/entities/participant.entity.js';
import { parseEnv, type Env } from './config/env.js';

export const entities = [Auction, Participant, Bid];

/**
 * 앱(DatabaseModule)과 마이그레이션 CLI가 함께 쓰는 ORM 설정.
 * 엔티티를 폴더에서 찾지 않고 직접 나열해 ESM 빌드 경로에 영향받지 않게 한다.
 */
export function createOrmConfig(
  env: Pick<
    Env,
    'DB_HOST' | 'DB_PORT' | 'DB_NAME' | 'DB_USERNAME' | 'DB_PASSWORD'
  >,
) {
  return defineConfig({
    driver: PostgreSqlDriver,
    host: env.DB_HOST,
    port: env.DB_PORT,
    dbName: env.DB_NAME,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    entities,
    extensions: [Migrator],
    migrations: {
      path: import.meta.dirname + '/migrations',
      pathTs: import.meta.dirname + '/migrations',
      tableName: 'mikro_orm_migrations',
      transactional: true,
      emit: 'ts',
      // 스냅샷 파일 이름을 고정해 테스트 DB 이름(test 등)별 파일이 생기지 않게 한다.
      snapshotName: '.snapshot-auction',
    },
  });
}

// `npx mikro-orm migration:*` 명령이 읽는 기본 설정.
export default createOrmConfig(parseEnv());
