import { Module } from '@nestjs/common';
import { AuctionEventsController } from './auction-events.controller.js';
import { AuctionInitializer } from './auction-initializer.service.js';
import { AuctionController } from './auction.controller.js';
import { AuctionService } from './auction.service.js';

/** 경매 기능 모듈. GraphQL(018)이 이 모듈에 더해진다. */
@Module({
  controllers: [AuctionController, AuctionEventsController],
  providers: [AuctionService, AuctionInitializer],
})
export class AuctionModule {}
