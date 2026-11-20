import { CustomScalar, Scalar } from '@nestjs/graphql';
import { GraphQLError, Kind, type ValueNode } from 'graphql';

/**
 * GraphQL 기본 Int는 32비트(약 21억)라 원화 금액을 담지 못한다.
 * 금액은 JSON에서 정확히 표현되는 정수 범위(±2^53 - 1)를 쓰는 이 스칼라로 주고받는다.
 */
@Scalar('SafeInt', () => SafeInt)
export class SafeInt implements CustomScalar<number, number> {
  description = '정밀도 손실 없이 표현되는 정수(최대 9007199254740991)';

  parseValue(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new GraphQLError(
        'SafeInt는 9007199254740991 이하의 정수여야 합니다.',
      );
    }
    return value;
  }

  serialize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new GraphQLError('SafeInt로 나타낼 수 없는 값입니다.');
    }
    return value;
  }

  parseLiteral(ast: ValueNode): number {
    if (ast.kind !== Kind.INT)
      throw new GraphQLError('SafeInt는 정수 리터럴이어야 합니다.', {
        nodes: ast,
      });
    return this.parseValue(Number(ast.value));
  }
}
