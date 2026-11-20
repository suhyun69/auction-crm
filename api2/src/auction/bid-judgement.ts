import type { BID_REASONS, BID_STATUSES } from './entities/bid.entity.js';

export type Market = {
  highestAmount: number | null;
  highestBidderName: string | null;
};
export type Judgement = {
  status: (typeof BID_STATUSES)[number];
  reason: (typeof BID_REASONS)[number];
  highestAmount: number;
  highestBidderName: string;
};

/**
 * 최고가 판정 규칙(api/의 Auction.bid). 현재 최고가를 넘어야 승인되고, 같거나 낮으면 기각된다.
 * 프레임워크와 DB를 모르는 순수 함수라 단위 테스트로 바로 확인한다.
 */
export function judgeBid(
  market: Market,
  customerName: string,
  amount: number,
): Judgement {
  if (market.highestAmount === null || amount > market.highestAmount) {
    return {
      status: 'ACCEPTED',
      reason: 'NEW_HIGHEST_BID',
      highestAmount: amount,
      highestBidderName: customerName,
    };
  }
  return {
    status: 'REJECTED',
    reason: 'AMOUNT_NOT_HIGH_ENOUGH',
    highestAmount: market.highestAmount,
    highestBidderName: market.highestBidderName ?? '',
  };
}
