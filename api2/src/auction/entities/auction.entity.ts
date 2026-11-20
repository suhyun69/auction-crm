import { defineEntity, p } from '@mikro-orm/postgresql';

/** 경매 하나. 지금은 id=1 한 건만 쓰며, 응찰을 한 줄로 세우는 잠금 대상이기도 하다. */
export const AUCTION_ID = 1;

const AuctionSchema = defineEntity({
  name: 'Auction',
  tableName: 'auction',
  properties: {
    id: p.bigint('number').primary().autoincrement(false),
    highestAmount: p.bigint('number').nullable(),
    highestBidderName: p.string().length(100).nullable(),
  },
});

export class Auction extends AuctionSchema.class {}
AuctionSchema.setClass(Auction);
