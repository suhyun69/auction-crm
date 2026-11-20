import { z } from 'zod';
import { BID_REASONS, BID_STATUSES } from '../entities/bid.entity.js';

/**
 * 응답 모양. Zod 스키마로 정의해 OpenAPI 문서(`@ApiOkResponse({ standardSchema })`)와
 * TypeScript 타입(`z.infer`)을 한곳에서 만든다. 런타임 검증에는 쓰지 않는다.
 */
export const bidResponseSchema = z
  .object({
    bidId: z.number().int().meta({ example: 42 }),
    status: z.enum(BID_STATUSES),
    reason: z.enum(BID_REASONS),
    submittedAmount: z.number().int().meta({ example: 150000 }),
    highestAmount: z.number().int().meta({
      description: '이 응찰을 처음 판정한 직후의 최고가',
      example: 150000,
    }),
    highestBidderName: z.string().meta({ example: '홍길동' }),
  })
  .meta({ id: 'BidResponse' });

export const dashboardParticipantSchema = z
  .object({
    participantId: z.number().int(),
    customerName: z.string(),
    rank: z.number().int().meta({ description: '1부터 시작하는 순위' }),
    highestAcceptedAmount: z
      .number()
      .int()
      .nullable()
      .meta({ description: '승인된 응찰이 없으면 null' }),
    bidCount: z
      .number()
      .int()
      .meta({ description: '승인·기각을 포함한 응찰 수' }),
    lastBidAt: z.iso.datetime().meta({ description: 'UTC ISO-8601 시각' }),
  })
  .meta({ id: 'DashboardParticipant' });

export const dashboardResponseSchema = z
  .object({
    summary: z.object({
      bidCount: z.number().int(),
      participantCount: z.number().int(),
      highestAmount: z
        .number()
        .int()
        .meta({ description: '승인된 응찰이 없으면 0' }),
      highestBidderName: z.string().nullable(),
    }),
    participants: z.array(dashboardParticipantSchema),
  })
  .meta({ id: 'DashboardResponse' });

export const errorResponseSchema = z
  .object({
    timestamp: z.iso.datetime(),
    status: z.number().int().meta({ example: 400 }),
    error: z.string().meta({ example: 'Bad Request' }),
    message: z.string().meta({
      example: 'amount는 1 이상 9007199254740991 이하의 정수여야 합니다.',
    }),
  })
  .meta({ id: 'ErrorResponse' });

export type BidResponse = z.infer<typeof bidResponseSchema>;
export type DashboardParticipant = z.infer<typeof dashboardParticipantSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
