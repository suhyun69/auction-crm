import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, type MercuriusDriverConfig } from '@nestjs/mercurius';
import { AuctionModule } from './auction/auction.module.js';
import { envSchema } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { graphqlConfig } from './graphql.config.js';

@Module({
  imports: [
    // 전역 설정. 시작할 때 Zod 스키마로 환경 변수를 검증한다.
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // 앱 안의 이벤트 버스(Spring의 ApplicationEventPublisher). EventEmitter2를 주입할 수 있게 된다.
    EventEmitterModule.forRoot(),
    DatabaseModule,
    // GraphQL 서버. Fastify 위에서 Mercurius로 돈다. 리졸버는 각 기능 모듈에 둔다.
    GraphQLModule.forRootAsync<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      inject: [ConfigService],
      useFactory: graphqlConfig,
    }),
    AuctionModule,
  ],
})
export class AppModule {}
