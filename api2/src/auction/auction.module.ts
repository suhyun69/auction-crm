import { Module } from '@nestjs/common';
import { AuctionInitializer } from './auction-initializer.service.js';
import { AuctionController } from './auction.controller.js';
import { AuctionService } from './auction.service.js';

/** 경매 기능 모듈. 이벤트(017)와 GraphQL(018)이 이 모듈에 더해진다. */
@Module({
  controllers: [AuctionController],
  providers: [AuctionService, AuctionInitializer],
})
export class AuctionModule {}
