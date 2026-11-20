import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * 스키마 하나로 인자 하나를 검증하는 파이프. REST의 `@Body({ schema })`처럼
 * 스키마를 받는 데코레이터가 없는 곳(GraphQL `@Args`)에 `@Args('input', new SchemaValidationPipe(schema))`로 붙인다.
 * 실패하면 첫 메시지로 400(BadRequestException)을 던지고, 성공하면 스키마가 변환한 값(예: trim)을 돌려준다.
 */
@Injectable()
export class SchemaValidationPipe<
  T extends StandardSchemaV1,
> implements PipeTransform {
  constructor(private readonly schema: T) {}

  async transform(value: unknown): Promise<StandardSchemaV1.InferOutput<T>> {
    const result = await this.schema['~standard'].validate(value);
    if (result.issues)
      throw new BadRequestException(
        result.issues[0]?.message ?? '요청 값이 올바르지 않습니다.',
      );
    return result.value;
  }
}
