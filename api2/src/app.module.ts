import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuctionModule } from './auction/auction.module.js';
import { envSchema } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [
    // 전역 설정. 시작할 때 Zod 스키마로 환경 변수를 검증한다.
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    DatabaseModule,
    AuctionModule,
  ],
})
export class AppModule {}
