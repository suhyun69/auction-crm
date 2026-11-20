import { z } from 'zod';

/**
 * 환경 변수 스키마. Spring의 application.yml + @Value 역할이다.
 * 앱은 ConfigModule이, 마이그레이션 CLI는 parseEnv()가 같은 스키마로 검증한다.
 * 잘못된 값이 있으면 첫 요청이 아니라 시작할 때 멈춘다.
 */
const origins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1).default('auction'),
  DB_USERNAME: z.string().min(1).default('auction'),
  DB_PASSWORD: z.string().default('auction'),
  /** 시작할 때 아직 적용하지 않은 마이그레이션을 실행한다(Spring의 ddl-auto 자리). */
  DB_MIGRATE_ON_START: z.stringbool().default(true),
  /** 브라우저에서 접근할 웹 원점. 여러 개는 쉼표로 구분한다. */
  AUCTION_WEB_ALLOWED_ORIGINS: origins.default(['http://localhost:3000']),
  /** SSE heartbeat 주석 간격(ms). 프록시가 조용한 연결을 끊지 않게 한다. */
  AUCTION_EVENTS_HEARTBEAT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000),
  /** SSE 연결 하나를 열어 두는 최대 시간(ms). 지나면 닫고, 브라우저가 다시 연결한다. */
  AUCTION_EVENTS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_800_000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  return envSchema.parse(source);
}
