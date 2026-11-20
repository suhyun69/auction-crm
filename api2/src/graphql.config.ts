import { ConfigService } from '@nestjs/config';
import type { MercuriusDriverConfig } from '@nestjs/mercurius';
import { handleFastifyError } from './common/http/fastify-error-handler.js';
import type { Env } from './config/env.js';

import { GRAPHQL_PATH } from './common/http/graphql-path.js';

export { GRAPHQL_PATH };

/**
 * GraphQL(Mercurius) 설정. 스키마는 코드(클래스·데코레이터)에서 메모리로 만든다(code-first).
 * - HTTP: POST /graphql, 화면은 /graphiql
 * - 구독: 같은 /graphql 경로의 WebSocket(graphql-ws). 허용한 web 원점만 연결을 받는다.
 */
export function graphqlConfig(
  config: ConfigService<Env, true>,
): MercuriusDriverConfig {
  const origins = new Set(
    config.get('AUCTION_WEB_ALLOWED_ORIGINS', { infer: true }),
  );
  return {
    autoSchemaFile: true,
    sortSchema: true,
    path: GRAPHQL_PATH,
    graphiql: true,
    errorHandler: handleFastifyError,
    subscription: {
      // 브라우저는 Origin을 보낸다. 다른 사이트의 페이지가 연결하지 못하게 막는다.
      // Origin이 없는 연결(서버·테스트 클라이언트)은 CORS와 마찬가지로 막지 않는다.
      verifyClient: (info, next) =>
        next(
          !info.req.headers.origin || origins.has(info.origin),
          403,
          'Forbidden',
        ),
    },
  };
}
