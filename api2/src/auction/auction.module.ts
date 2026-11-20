import { Module } from '@nestjs/common';
import { AuctionInitializer } from './auction-initializer.service.js';

/** 경매 기능 모듈. 응찰·대시보드·이벤트(016~018)가 이 모듈에 더해진다. */
@Module({
  providers: [AuctionInitializer],
})
export class AuctionModule {}
