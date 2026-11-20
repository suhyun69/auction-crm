import { Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import type { Env } from '../config/env.js';
import { createOrmConfig } from '../mikro-orm.config.js';

/** 시작할 때 아직 적용하지 않은 마이그레이션을 실행한다. */
@Injectable()
export class DatabaseMigrator implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrator.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit() {
    if (!this.config.get('DB_MIGRATE_ON_START', { infer: true })) return;
    const applied = await this.orm.migrator.up();
    if (applied.length > 0)
      this.logger.log(
        `마이그레이션 ${applied.length}건 적용: ${applied.map((m) => m.name).join(', ')}`,
      );
  }
}

/**
 * DB 연결 모듈. MikroOrmModule.forRootAsync가 EntityManager와 MikroORM을
 * 앱 전체에 주입할 수 있게 등록한다(Spring의 DataSource·EntityManager 빈 등록).
 */
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createOrmConfig({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_USERNAME: config.get('DB_USERNAME', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
        }),
      driver: PostgreSqlDriver,
    }),
  ],
  providers: [DatabaseMigrator],
})
export class DatabaseModule {}
