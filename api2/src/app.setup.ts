import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { handleFastifyError } from './common/http/fastify-error-handler.js';
import type { Env } from './config/env.js';

/**
 * main.ts와 e2e 테스트가 함께 쓰는 앱 설정. 테스트 앱은 main.ts를 거치지 않으므로
 * 전역 파이프·필터·CORS를 여기 한곳에 둔다.
 */
export function configureApp(app: NestFastifyApplication) {
  const config = app.get(ConfigService<Env, true>);

  // 브라우저에서 직접 부르는 web 원점만 허용한다(api/의 AuctionWebConfig).
  app.enableCors({
    origin: config.get('AUCTION_WEB_ALLOWED_ORIGINS', { infer: true }),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    maxAge: 300,
  });

  // `@Body({ schema })`처럼 스키마를 단 인자를 Zod로 검증한다. 실패하면 첫 메시지 하나로 400.
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) =>
        new BadRequestException(
          issues[0]?.message ?? '요청 값이 올바르지 않습니다.',
        ),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // 핸들러 밖(본문 해석 등)에서 난 오류. GraphQL 등록 순서 때문에 초기화 전에 걸어 둔다(fastify-error-handler.ts).
  app.getHttpAdapter().getInstance().setErrorHandler(handleFastifyError);
  return app;
}

/**
 * OpenAPI 문서(springdoc 자리). Zod 스키마로 단 본문·응답이 그대로 문서에 들어간다.
 * 주소는 api/와 같다: 화면 /swagger-ui, 원본 JSON /v3/api-docs.
 */
export function setupOpenApi(app: NestFastifyApplication) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Auction API (api2)')
      .setDescription('NestJS로 옮긴 경매 응찰·대시보드 API')
      .setVersion('1')
      .build(),
  );
  SwaggerModule.setup('swagger-ui', app, document, {
    jsonDocumentUrl: 'v3/api-docs',
  });
}
