import { Module } from '@nestjs/common';
import { AuctionEventsController } from './auction-events.controller.js';
import { AuctionInitializer } from './auction-initializer.service.js';
import { AuctionController } from './auction.controller.js';
import { AuctionService } from './auction.service.js';
import { AuctionResolver } from './graphql/auction.resolver.js';
import { DashboardPublisher } from './graphql/dashboard-publisher.service.js';
import { SafeInt } from './graphql/safe-int.scalar.js';

/** 경매 기능 모듈. REST·SSE 컨트롤러와 GraphQL 리졸버가 같은 AuctionService를 쓴다. */
@Module({
  controllers: [AuctionController, AuctionEventsController],
  providers: [
    AuctionService,
    AuctionInitializer,
    AuctionResolver,
    DashboardPublisher,
    SafeInt,
  ],
})
export class AuctionModule {}
