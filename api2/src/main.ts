import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp, setupOpenApi } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  // Spring의 내장 Tomcat 자리. HTTP 서버로 Express 대신 Fastify를 쓴다.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  configureApp(app);
  setupOpenApi(app);
  // SIGTERM에 DB 연결 등을 정리하고 끝낸다.
  app.enableShutdownHooks();
  const config = app.get(ConfigService<Env, true>);
  // 컨테이너에서도 접근하도록 모든 인터페이스에서 듣는다.
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}
await bootstrap();
