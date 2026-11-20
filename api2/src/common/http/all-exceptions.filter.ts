import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  errorResponse,
  INTERNAL_ERROR,
  UNREADABLE_BODY,
} from './error-response.js';

/**
 * 모든 예외를 `api/`와 같은 오류 본문으로 바꾼다. Spring의 @RestControllerAdvice 자리다.
 * - Nest의 HttpException(400·404·409 …)은 그 상태와 메시지를 쓴다.
 * - Fastify가 본문을 해석하다 낸 오류(깨진 JSON 등)는 400으로 바꾼다.
 * - 그 밖의 예외는 내부 내용을 숨기고 500으로 답한다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // HTTP가 아닌 곳(GraphQL 등)의 예외는 각 계층이 처리한다.
    if (host.getType() !== 'http') throw exception;
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { status, message } = this.describe(exception);
    if (status >= 500)
      this.logger.error(
        '처리되지 않은 예외',
        exception instanceof Error ? exception.stack : String(exception),
      );
    void reply.status(status).send(errorResponse(status, message));
  }

  private describe(exception: unknown): { status: number; message: string } {
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
      return { status, message: this.messageOf(exception) };
    }
    // Fastify의 요청 오류(FST_ERR_CTP_* 등)는 statusCode를 들고 온다.
    const statusCode = (exception as { statusCode?: unknown } | null)
      ?.statusCode;
    if (
      typeof statusCode === 'number' &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
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

  private messageOf(exception: HttpException) {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return String(message[0] ?? exception.message);
    return typeof message === 'string' ? message : exception.message;
  }
}
