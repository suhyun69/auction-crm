import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Auction, AUCTION_ID } from './entities/auction.entity.js';

/**
 * 경매 1번 행이 없으면 만든다. 마이그레이션(onModuleInit)이 끝난 뒤인
 * onApplicationBootstrap에서 실행되고, 여러 번 시작해도 한 행만 남는다.
 */
@Injectable()
export class AuctionInitializer implements OnApplicationBootstrap {
  constructor(private readonly em: EntityManager) {}

  async onApplicationBootstrap() {
    // 요청 밖에서 쓰므로 전역 EntityManager 대신 이 작업 전용 fork를 쓴다.
    const em = this.em.fork();
    await em
      .createQueryBuilder(Auction)
      .insert({ id: AUCTION_ID, highestAmount: null, highestBidderName: null })
      .onConflict('id')
      .ignore()
      .execute();
  }
}
