import { defineEntity, p } from '@mikro-orm/postgresql';
import { Participant } from './participant.entity.js';

export const BID_STATUSES = ['ACCEPTED', 'REJECTED'] as const;
export const BID_REASONS = [
  'NEW_HIGHEST_BID',
  'AMOUNT_NOT_HIGH_ENOUGH',
] as const;

/**
 * 응찰 기록. 승인·기각 모두 남기고, 판정 당시의 최고가를 함께 저장해
 * 같은 멱등 키로 다시 들어온 요청에 최초 응답을 그대로 돌려줄 수 있게 한다.
 */
const BidSchema = defineEntity({
  name: 'Bid',
  tableName: 'auction_bid',
  properties: {
    id: p.bigint('number').primary(),
    participant: () => p.manyToOne(Participant).ref(),
    amount: p.bigint('number'),
    status: p.enum(BID_STATUSES),
    reason: p.enum(BID_REASONS),
    highestAmount: p.bigint('number'),
    highestBidderName: p.string().length(100),
    createdAt: p.datetime(),
    idempotencyKey: p
      .string()
      .length(200)
      .nullable()
      .unique('uk_bid_idempotency_key'),
  },
  indexes: [
    {
      name: 'ix_bid_participant_status',
      properties: ['participant', 'status', 'amount'],
    },
    { name: 'ix_bid_created', properties: ['createdAt', 'id'] },
  ],
});

export class Bid extends BidSchema.class {}
BidSchema.setClass(Bid);
