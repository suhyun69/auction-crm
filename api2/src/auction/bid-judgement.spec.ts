import { judgeBid } from './bid-judgement.js';

describe('judgeBid', () => {
  it('첫 응찰은 금액과 상관없이 승인한다', () => {
    expect(
      judgeBid({ highestAmount: null, highestBidderName: null }, 'A', 1),
    ).toEqual({
      status: 'ACCEPTED',
      reason: 'NEW_HIGHEST_BID',
      highestAmount: 1,
      highestBidderName: 'A',
    });
  });

  it('최고가를 넘으면 승인하고, 같거나 낮으면 현재 최고가를 유지한 채 기각한다', () => {
    const market = { highestAmount: 100, highestBidderName: 'A' };
    expect(judgeBid(market, 'B', 101)).toMatchObject({
      status: 'ACCEPTED',
      highestAmount: 101,
      highestBidderName: 'B',
    });
    for (const amount of [100, 99]) {
      expect(judgeBid(market, 'B', amount)).toEqual({
        status: 'REJECTED',
        reason: 'AMOUNT_NOT_HIGH_ENOUGH',
        highestAmount: 100,
        highestBidderName: 'A',
      });
    }
  });
});
