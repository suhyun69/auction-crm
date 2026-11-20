import { idempotencyKeySchema, submitBidSchema } from './submit-bid.schema.js';

describe('submitBidSchema', () => {
  it('이름의 앞뒤 공백을 지운 값을 돌려준다', () => {
    expect(
      submitBidSchema.parse({ customerName: '  홍길동 ', amount: 5 }),
    ).toEqual({ customerName: '홍길동', amount: 5 });
  });

  it('타입이 틀리면 본문을 읽을 수 없다고, 범위가 틀리면 그 규칙을 알려준다', () => {
    const message = (input: unknown) =>
      submitBidSchema.safeParse(input).error?.issues[0]?.message;
    expect(message({ customerName: 3, amount: 1 })).toBe(
      '요청 본문을 읽을 수 없습니다.',
    );
    expect(message({ customerName: 'A', amount: 1.5 })).toBe(
      '요청 본문을 읽을 수 없습니다.',
    );
    expect(message(null)).toBe('요청 본문을 읽을 수 없습니다.');
    expect(message({ customerName: '   ', amount: 1 })).toBe(
      'customerName은 공백 제거 후 1~100자여야 합니다.',
    );
    expect(
      message({ customerName: 'A', amount: Number.MAX_SAFE_INTEGER + 1 }),
    ).toBe('amount는 1 이상 9007199254740991 이하의 정수여야 합니다.');
  });
});

describe('idempotencyKeySchema', () => {
  it('없으면 null, 있으면 1~200자이고 공백만은 안 된다', () => {
    expect(idempotencyKeySchema.parse(undefined)).toBeNull();
    expect(idempotencyKeySchema.parse('k'.repeat(200))).toBe('k'.repeat(200));
    expect(idempotencyKeySchema.safeParse('   ').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('k'.repeat(201)).success).toBe(false);
  });
});
