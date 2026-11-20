import {
  Controller,
  Sse,
  type BeforeApplicationShutdown,
  type MessageEvent,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  fromEvent,
  interval,
  map,
  merge,
  Subject,
  takeUntil,
  timer,
  Observable,
} from 'rxjs';
import type { Env } from '../config/env.js';
import { BID_RECORDED } from './auction.events.js';

const READY: MessageEvent = { type: 'ready', data: {} };
const CHANGED: MessageEvent = { type: 'dashboard-changed', data: {} };
const HEARTBEAT: MessageEvent = { comment: 'heartbeat' };

/**
 * `GET /api/events` (SSE). api/의 SseEmitter + 연결별 자원 정리(AuctionSseConnection)를
 * Observable 하나로 표현한다. Nest가 구독하며 이벤트를 써 주고,
 * 클라이언트가 끊으면 구독을 해제한다(이벤트 리스너·타이머가 함께 정리된다).
 */
@ApiTags('Auction')
@Controller('api')
export class AuctionEventsController implements BeforeApplicationShutdown {
  private readonly shutdown$ = new Subject<void>();
  private readonly heartbeatMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly events: EventEmitter2,
    config: ConfigService<Env, true>,
  ) {
    this.heartbeatMs = config.get('AUCTION_EVENTS_HEARTBEAT_MS', {
      infer: true,
    });
    this.timeoutMs = config.get('AUCTION_EVENTS_TIMEOUT_MS', { infer: true });
  }

  @Sse('events')
  @ApiOperation({
    summary: '경매 변경 SSE',
    description:
      'ready 후 새 응찰 커밋마다 dashboard-changed를 보낸다. heartbeat 주석으로 연결을 유지한다. 재연결 시 과거 이벤트를 재생하지 않으므로 대시보드를 다시 조회해야 한다.',
  })
  @ApiProduces('text/event-stream')
  stream(): Observable<MessageEvent> {
    const changes = fromEvent(this.events, BID_RECORDED).pipe(
      map(() => CHANGED),
    );
    const heartbeats = interval(this.heartbeatMs).pipe(map(() => HEARTBEAT));
    return new Observable<MessageEvent>((subscriber) => {
      // ready를 먼저 보낸 뒤 같은 순간에 리스너를 붙여, 그 사이 커밋된 응찰을 놓치지 않는다.
      subscriber.next(READY);
      return merge(changes, heartbeats)
        .pipe(takeUntil(merge(timer(this.timeoutMs), this.shutdown$)))
        .subscribe(subscriber);
    });
  }

  /** 열린 스트림이 HTTP 서버 종료를 막지 않도록 종료 직전에 모두 끝낸다. */
  beforeApplicationShutdown() {
    this.shutdown$.next();
    this.shutdown$.complete();
  }
}
