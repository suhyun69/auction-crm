import { z } from 'zod';
import { UNREADABLE_BODY } from '../../common/http/error-response.js';

/** JSON에서 정확히 표현되는 가장 큰 정수(2^53 - 1). 금액 상한이다. */
export const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
export const MAX_NAME_LENGTH = 100;
export const MAX_KEY_LENGTH = 200;

export const NAME_LENGTH_MESSAGE = `customerName은 공백 제거 후 1~${MAX_NAME_LENGTH}자여야 합니다.`;
export const AMOUNT_RANGE_MESSAGE = `amount는 1 이상 ${MAX_AMOUNT} 이하의 정수여야 합니다.`;
export const KEY_MESSAGE = `Idempotency-Key는 1~${MAX_KEY_LENGTH}자여야 합니다.`;

/**
 * `POST /api/bid` 본문. Spring의 BidWebRequest + 엄격한 역직렬화 + 값 객체(CustomerName, BidAmount) 검증을
 * Zod 스키마 하나로 옮겼다. 타입이 틀리면(이름이 문자열이 아님, 금액이 정수가 아님) 본문을 읽을 수 없다고 답하고,
 * 값 범위가 틀리면 그 규칙을 알려준다. 통과한 이름은 앞뒤 공백이 지워진 값이다.
 */
export const submitBidSchema = z.object(
  {
    customerName: z
      .string({ error: UNREADABLE_BODY })
      .trim()
      .min(1, NAME_LENGTH_MESSAGE)
      .max(MAX_NAME_LENGTH, NAME_LENGTH_MESSAGE)
      .meta({
        description: '앞뒤 공백 제거 후 1~100자 고객 이름',
        example: '홍길동',
      }),
    amount: z
      .number({ error: UNREADABLE_BODY })
      // 소수는 본문 오류로, 정수지만 범위 밖이면 범위 오류로 알린다. 검사 순서가 곧 메시지 우선순위다.
      // (.int()는 안전한 정수 범위까지 함께 검사해 2^53 같은 값도 본문 오류로 묶어 버린다.)
      .refine(Number.isInteger, UNREADABLE_BODY)
      .min(1, AMOUNT_RANGE_MESSAGE)
      .max(MAX_AMOUNT, AMOUNT_RANGE_MESSAGE)
      .meta({
        type: 'integer',
        description: '원화 정수 금액',
        example: 150000,
      }),
  },
  { error: UNREADABLE_BODY },
);

export type SubmitBid = z.infer<typeof submitBidSchema>;

/** 헤더는 `@Headers()`가 스키마를 받지 않아 서비스에서 이 스키마로 검증한다. 없으면 null. */
export const idempotencyKeySchema = z
  .string()
  .max(MAX_KEY_LENGTH, KEY_MESSAGE)
  .refine((key) => key.trim().length > 0, KEY_MESSAGE)
  .optional()
  .transform((key) => key ?? null);
