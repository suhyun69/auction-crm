import type { FastifyReply, FastifyRequest } from 'fastify';
import { GraphQLError } from 'graphql';
import mercurius, { type MercuriusContext } from 'mercurius';
import { describeException } from './all-exceptions.filter.js';
import { errorResponse } from './error-response.js';
import { GRAPHQL_PATH } from './graphql-path.js';

/**
 * 컨트롤러·리졸버에 닿기 전에 Fastify에서 난 오류(깨진 JSON, 빈 본문 등)를 답하는 Fastify 오류 처리기.
 * 핸들러 안에서 난 예외는 Nest 예외 필터가 처리하므로 여기 오지 않는다.
 *
 * Nest는 원래 초기화 마지막에 자기 처리기를 설치한다. 그런데 Mercurius 드라이버가 초기화 도중
 * `await app.register()`로 그때까지 등록된 REST 경로를 확정시키고, 전역 처리기도 자기 것으로 바꾼다.
 * 그래서 이 처리기를 두 곳에 건다:
 * - configureApp(): 초기화 전에 설치해 REST 경로가 이 처리기로 확정되게 한다.
 * - Mercurius `errorHandler` 옵션: /graphql 경로가 쓰는 처리기.
 * /graphql 요청은 Mercurius 기본 형식(`{ data, errors }`), 그 밖은 예외 필터와 같은 REST 오류 본문으로 답한다.
 */
export function handleFastifyError(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (request.url.split('?')[0] === GRAPHQL_PATH) {
    const graphqlError =
      error instanceof GraphQLError
        ? error
        : new GraphQLError(error.message, { originalError: error });
    const { statusCode, response } = mercurius.defaultErrorFormatter(
      { errors: [graphqlError] },
      { reply, app: request.server } as unknown as MercuriusContext,
    );
    void reply.code(statusCode).send(response);
    return;
  }
  const { status, message } = describeException(error);
  void reply.code(status).send(errorResponse(status, message));
}
