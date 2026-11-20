/**
 * 경매 안에서 오가는 이벤트. Spring의 ApplicationEventPublisher 대신 @nestjs/event-emitter(EventEmitter2)로 보낸다.
 * 응찰이 커밋된 뒤에만 보내므로, 받는 쪽은 언제 읽어도 새 기록이 DB에 있다.
 */
export const BID_RECORDED = 'auction.bid-recorded';

export class BidRecordedEvent {
  constructor(
    readonly bidId: number,
    readonly status: 'ACCEPTED' | 'REJECTED',
  ) {}
}
