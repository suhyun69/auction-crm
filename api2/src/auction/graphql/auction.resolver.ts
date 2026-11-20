import {
  Args,
  Context,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from '@nestjs/graphql';
import type { PubSub } from 'mercurius';
import { SchemaValidationPipe } from '../../common/validation/schema-validation.pipe.js';
import { AuctionService } from '../auction.service.js';
import { submitBidSchema, type SubmitBid } from '../dto/submit-bid.schema.js';
import {
  BidResult,
  Dashboard,
  SubmitBidInput,
  toGraphqlDashboard,
  type BidStatus,
  type BidReason,
} from './auction.models.js';
import { DASHBOARD_CHANGED } from './dashboard-publisher.service.js';

/**
 * GraphQL 입구. 컨트롤러처럼 인자를 받아 AuctionService 하나를 부른다.
 * REST와 같은 서비스를 쓰므로 검증·멱등·판정·커밋 후 알림이 똑같이 적용된다.
 */
@Resolver(() => Dashboard)
export class AuctionResolver {
  constructor(private readonly auction: AuctionService) {}

  @Query(() => Dashboard, { description: '경매 대시보드' })
  async dashboard(): Promise<Dashboard> {
    return toGraphqlDashboard(await this.auction.readDashboard());
  }

  @Mutation(() => BidResult, {
    description: '응찰 등록. 최고가를 넘으면 승인, 같거나 낮으면 기각',
  })
  async submitBid(
    // GraphQL 타입 검사(String!, SafeInt!) 다음에 REST와 같은 Zod 규칙(공백 제거·길이·범위)을 적용한다.
    @Args(
      'input',
      { type: () => SubmitBidInput },
      new SchemaValidationPipe(submitBidSchema),
    )
    input: SubmitBid,
    @Args('idempotencyKey', {
      type: () => String,
      nullable: true,
      description: '재시도할 때 같은 값. 1~200자',
    })
    idempotencyKey?: string | null,
  ): Promise<BidResult> {
    const result = await this.auction.submitBid(
      input,
      idempotencyKey ?? undefined,
    );
    return {
      ...result,
      status: result.status as BidStatus,
      reason: result.reason as BidReason,
    };
  }

  /** WebSocket(graphql-ws)으로만 받는다. 응찰이 커밋될 때마다 최신 대시보드가 온다. */
  @Subscription(() => Dashboard, {
    description: '응찰이 커밋된 뒤의 최신 대시보드',
  })
  dashboardChanged(@Context('pubsub') pubSub: PubSub) {
    return pubSub.subscribe(DASHBOARD_CHANGED);
  }
}
