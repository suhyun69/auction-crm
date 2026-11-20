import { defineEntity, p } from '@mikro-orm/postgresql';
import { Auction } from './auction.entity.js';

/** 응찰자. 앞뒤 공백을 제거한 이름이 경매 안에서 참가자를 구분한다. */
const ParticipantSchema = defineEntity({
  name: 'Participant',
  tableName: 'auction_participant',
  properties: {
    id: p.bigint('number').primary(),
    auction: () => p.manyToOne(Auction).ref(),
    customerName: p.string().length(100),
    createdAt: p.datetime(),
  },
  uniques: [
    {
      name: 'uk_participant_auction_name',
      properties: ['auction', 'customerName'],
    },
  ],
  indexes: [
    { name: 'ix_participant_created', properties: ['createdAt', 'id'] },
  ],
});

export class Participant extends ParticipantSchema.class {}
ParticipantSchema.setClass(Participant);
