import { Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import type { FastifyInstance } from 'fastify';
import { BID_RECORDED } from '../auction.events.js';
import { AuctionService } from '../auction.service.js';
import { toGraphqlDashboard } from './auction.models.js';

export const DASHBOARD_CHANGED = 'DASHBOARD_CHANGED';

/**
 * 응찰 커밋 이벤트를 받아 최신 대시보드를 GraphQL 구독자에게 보낸다.
 * 응찰이 몰리면 읽는 동안 들어온 알림을 하나로 묶어, 끝나면 한 번 더 최신 스냅샷을 읽어 보낸다.
 * 한 번에 하나씩 순서대로 보내므로 구독자는 오래된 스냅샷을 나중에 받지 않는다.
 */
@Injectable()
export class DashboardPublisher {
  private readonly logger = new Logger(DashboardPublisher.name);
  private running = false;
  private dirty = false;

  constructor(
    private readonly auction: AuctionService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  /** `@OnEvent` 핸들러의 예외는 기본으로 삼켜져 응찰 응답에 영향을 주지 않는다. */
  @OnEvent(BID_RECORDED)
  onBidRecorded() {
    this.dirty = true;
    void this.flush();
  }

  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const dashboard = toGraphqlDashboard(
          await this.auction.readDashboard(),
        );
        // Mercurius가 Fastify 인스턴스에 붙인 PubSub. 구독 리졸버가 같은 토픽을 듣는다.
        const app = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
        // publish()는 Promise가 아니라 콜백으로 끝을 알린다. 다음 스냅샷을 보내기 전에 기다린다.
        await new Promise<void>((resolve) =>
          app.graphql.pubsub.publish(
            {
              topic: DASHBOARD_CHANGED,
              payload: { dashboardChanged: dashboard },
            },
            resolve,
          ),
        );
      }
    } catch (error) {
      this.logger.warn(
        `대시보드 구독 알림 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
