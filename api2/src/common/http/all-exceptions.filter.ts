import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import mercurius from 'mercurius';
import {
  errorResponse,
  INTERNAL_ERROR,
  UNREADABLE_BODY,
} from './error-response.js';

/** GraphQL 오류의 extensions.code. HTTP 상태와 같은 분류를 이름으로 알린다. */
const GRAPHQL_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

/**
 * 모든 예외를 `api/`와 같은 오류 본문으로 바꾼다. Spring의 @RestControllerAdvice 자리다.
 * - Nest의 HttpException(400·404·409 …)은 그 상태와 메시지를 쓴다.
 * - Fastify가 본문을 해석하다 낸 오류(깨진 JSON 등)는 400으로 바꾼다.
 * - 그 밖의 예외는 내부 내용을 숨기고 500으로 답한다.
 * GraphQL 요청에서는 같은 분류를 extensions.code로 담은 GraphQL 오류를 돌려준다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const { status, message } = describeException(exception);
    if (status >= 500)
      this.logger.error(
        '처리되지 않은 예외',
        exception instanceof Error ? exception.stack : String(exception),
      );
    // GraphQL 리졸버의 예외: 필터가 돌려준 오류가 응답의 errors[]에 들어간다.
    if (host.getType<string>() === 'graphql') {
      return new mercurius.ErrorWithProps(message, {
        code: GRAPHQL_CODES[status] ?? 'INTERNAL_SERVER_ERROR',
      });
    }
    if (host.getType() !== 'http') throw exception;
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    void reply.status(status).send(errorResponse(status, message));
  }
}

/**
 * 예외를 HTTP 상태와 메시지로 분류한다. 예외 필터와, Mercurius가 바꿔 끼운 Fastify 오류 처리기
 * (graphql.config.ts)가 같은 규칙을 쓰도록 함수로 둔다.
 */
export function describeException(exception: unknown): {
  status: number;
  message: string;
} {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500) return { status, message: INTERNAL_ERROR };
    // Nest의 Fastify 어댑터는 Fastify 오류(깨진 JSON 등)를 HttpException으로 감싸고 원래 오류를 cause에 둔다.
    if (
      status === HttpStatus.BAD_REQUEST &&
      (exception.cause as Error | undefined)?.name === 'FastifyError'
    ) {
      return { status, message: UNREADABLE_BODY };
    }
    return { status, message: messageOf(exception) };
  }
  // Fastify의 요청 오류(FST_ERR_CTP_* 등)는 statusCode를 들고 온다.
  const statusCode = (exception as { statusCode?: unknown } | null)?.statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return {
      status: statusCode,
      message:
        statusCode === HttpStatus.BAD_REQUEST
          ? UNREADABLE_BODY
          : String((exception as Error).message),
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: INTERNAL_ERROR,
  };
}

function messageOf(exception: HttpException) {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return String(message[0] ?? exception.message);
  return typeof message === 'string' ? message : exception.message;
}
