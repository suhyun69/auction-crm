import {
  Field,
  GraphQLISODateTime,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import type { DashboardResponse } from '../dto/auction.responses.js';
import { SafeInt } from './safe-int.scalar.js';

/**
 * GraphQL 타입(code-first). 클래스와 데코레이터에서 스키마(SDL)가 만들어진다.
 * REST 응답과 같은 필드 이름을 써서 web이 같은 모양으로 다룬다.
 */
export enum BidStatus {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}
export enum BidReason {
  NEW_HIGHEST_BID = 'NEW_HIGHEST_BID',
  AMOUNT_NOT_HIGH_ENOUGH = 'AMOUNT_NOT_HIGH_ENOUGH',
}
registerEnumType(BidStatus, { name: 'BidStatus' });
registerEnumType(BidReason, { name: 'BidReason' });

@ObjectType({ description: '응찰 판정 결과. 재전송이면 최초 판정 당시의 값' })
export class BidResult {
  @Field(() => SafeInt) bidId: number;
  @Field(() => BidStatus) status: BidStatus;
  @Field(() => BidReason) reason: BidReason;
  @Field(() => SafeInt) submittedAmount: number;
  @Field(() => SafeInt, { description: '이 응찰을 처음 판정한 직후의 최고가' })
  highestAmount: number;
  @Field() highestBidderName: string;
}

@ObjectType()
export class DashboardSummary {
  @Field(() => SafeInt, { description: '승인·기각을 포함한 응찰 수' })
  bidCount: number;
  @Field(() => Int) participantCount: number;
  @Field(() => SafeInt, { description: '승인된 응찰이 없으면 0' })
  highestAmount: number;
  @Field(() => String, { nullable: true }) highestBidderName: string | null;
}

@ObjectType()
export class DashboardParticipant {
  @Field(() => SafeInt) participantId: number;
  @Field() customerName: string;
  @Field(() => Int, { description: '1부터 시작하는 순위' }) rank: number;
  @Field(() => SafeInt, {
    nullable: true,
    description: '승인된 응찰이 없으면 null',
  })
  highestAcceptedAmount: number | null;
  @Field(() => SafeInt) bidCount: number;
  @Field(() => GraphQLISODateTime) lastBidAt: Date;
}

@ObjectType({ description: '같은 스냅샷에서 만든 요약과 전체 순위' })
export class Dashboard {
  @Field(() => DashboardSummary) summary: DashboardSummary;
  @Field(() => [DashboardParticipant]) participants: DashboardParticipant[];
}

@InputType()
export class SubmitBidInput {
  @Field({ description: '앞뒤 공백 제거 후 1~100자 고객 이름' })
  customerName: string;
  @Field(() => SafeInt, { description: '원화 정수 금액(1 이상)' })
  amount: number;
}

/** REST 응답(시각은 ISO 문자열)을 GraphQL 모양(시각은 Date)으로 바꾼다. */
export function toGraphqlDashboard(dashboard: DashboardResponse): Dashboard {
  return {
    summary: dashboard.summary,
    participants: dashboard.participants.map((participant) => ({
      ...participant,
      lastBidAt: new Date(participant.lastBidAt),
    })),
  };
}
