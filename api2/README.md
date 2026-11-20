# api2 — NestJS로 옮긴 경매 API

`api/`(Spring Boot)가 하던 일 중 시뮬레이션 엔진과 web이 쓰는 부분을 NestJS로 다시 만든 서버다.
Java/Spring을 NestJS로 옮기며 익히는 것이 목적이라, 티켓마다 새로 쓴 개념을 아래 [학습 노트](#학습-노트-spring--nestjs)에 정리한다.

| 쓰는 곳 | 통신 | 티켓 |
|---|---|---|
| 시뮬레이션 엔진 | REST `POST /api/bid` | 016 |
| web (rest 모드) | REST `GET /api/dashboard`, SSE `GET /api/events` | 016, 017 |
| web (graphql 모드) | GraphQL `query dashboard`, `subscription dashboardChanged` | 018, 019 |

스택: NestJS 12 · Fastify 5 · MikroORM 7(PostgreSQL) · Zod 4 · Mercurius(GraphQL) · Vitest

## 실행

PostgreSQL이 필요하다. 저장소 루트에서 `npm run db:up`으로 개발 DB를 띄운 뒤:

```bash
npm install
npm run start:dev      # 코드 변경 시 다시 시작
```

시작할 때 마이그레이션을 적용하고 경매 1번 행을 만든다. 환경 변수와 기본값은 [.env.example](.env.example)과 `src/config/env.ts`에 있다.

- API 문서: http://localhost:8080/swagger-ui (원본 JSON `/v3/api-docs`)
- 응찰: `curl -X POST localhost:8080/api/bid -H 'content-type: application/json' -H 'Idempotency-Key: k1' -d '{"customerName":"홍길동","amount":1000}'`
- 대시보드: `curl localhost:8080/api/dashboard`

| 명령 | 하는 일 |
|---|---|
| `npm run build` / `npm run start:prod` | 빌드 / 빌드 결과 실행(`node dist/main.js`) |
| `npm test` | 단위 테스트(`src/**/*.spec.ts`) |
| `npm run test:e2e` | e2e 테스트(`test/**/*.e2e-spec.ts`). Docker로 PostgreSQL을 띄운다(Testcontainers) |
| `npm run lint` / `npm run format` | oxlint / prettier |
| `npm run migration:create` | 엔티티와 DB 차이로 새 마이그레이션 생성(DB 연결 필요) |
| `npm run migration:up` / `migration:list` | 마이그레이션 적용 / 목록 |

## 구조

NestJS 커뮤니티에서 흔한 "기능별 모듈" 구조다. 계층별 폴더(controller/, usecase/ …)로 나누지 않고, 한 기능의 컨트롤러·서비스·엔티티를 한 폴더에 모은다.

```
src/
├── main.ts                    앱 시작: Fastify 어댑터, 종료 훅, 포트
├── app.module.ts              루트 모듈: 설정·DB·기능 모듈을 묶는다
├── app.setup.ts               main.ts와 테스트가 같이 쓰는 설정: CORS, 검증 파이프, 예외 필터, OpenAPI
├── config/env.ts              환경 변수 Zod 스키마
├── common/http/               오류 본문 형식, 전역 예외 필터
├── database/database.module.ts  MikroORM 연결, 시작 시 마이그레이션
├── mikro-orm.config.ts        앱과 마이그레이션 CLI가 같이 쓰는 ORM 설정
├── migrations/                MikroORM 마이그레이션
└── auction/                   경매 기능 모듈
    ├── auction.module.ts
    ├── auction.controller.ts  POST /api/bid, GET /api/dashboard (HTTP만)
    ├── auction.service.ts     잠금·멱등·판정·대시보드 집계
    ├── bid-judgement.ts       최고가 판정 규칙(순수 함수)
    ├── auction-initializer.service.ts  경매 1번 행 준비
    ├── dto/                   요청 Zod 스키마, 응답 스키마·타입
    └── entities/              Auction · Participant · Bid
test/                          e2e 테스트 (support/test-app.ts: 컨테이너·앱 준비)
```

테이블·컬럼·제약 이름은 `api/`와 같다(`auction`, `auction_participant`, `auction_bid`). 다만 `api/`의 `auction.highest_bid_id`는 엔진·web이 쓰지 않아 옮기지 않았다.

## 학습 노트: Spring → NestJS

### 015 — 프로젝트 기반

| Spring | NestJS | 이 프로젝트에서 |
|---|---|---|
| `@SpringBootApplication` + 컴포넌트 스캔 | 스캔이 없다. `@Module({ imports, providers, controllers })`에 직접 등록 | `app.module.ts`, `auction.module.ts` |
| `@Service`, `@Component` | `@Injectable()` 클래스를 모듈의 `providers`에 등록 | `AuctionInitializer` |
| 생성자 주입 | 같다. 타입으로 찾으므로 주입받는 클래스는 `import type`으로 불러오면 안 된다 | `constructor(private readonly em: EntityManager)` |
| `application.yml` + `@Value` | `@nestjs/config`의 `ConfigModule` + `ConfigService.get()` | `ConfigModule.forRoot({ validationSchema: envSchema })` |
| `@Validated @ConfigurationProperties` | Zod 스키마로 시작할 때 검증·변환(문자열 → 숫자·불리언·목록) | `src/config/env.ts` |
| 내장 Tomcat | HTTP 어댑터를 고른다(Express 기본, 여기서는 Fastify) | `new FastifyAdapter()` |
| JPA `@Entity` | MikroORM `defineEntity()` + `setClass()`(v7 권장 방식) | `auction/entities/*.entity.ts` |
| `EntityManager` (JPA) | MikroORM `EntityManager`. 요청 밖 작업은 `em.fork()`로 따로 쓴다 | `AuctionInitializer` |
| `ddl-auto: update` | 마이그레이션 파일로 스키마를 관리하고 시작할 때 적용 | `DatabaseMigrator.onModuleInit()` |
| `ApplicationRunner`, `@PostConstruct` | 생명주기 훅: 모든 모듈의 `onModuleInit` → `onApplicationBootstrap` | 마이그레이션(앞) → 경매 행 준비(뒤) |
| `@SpringBootTest` + H2 | `Test.createTestingModule({ imports: [AppModule] })` + 실제 PostgreSQL(Testcontainers) | `test/database.e2e-spec.ts` |

알아 둘 차이:

- **ESM 프로젝트다.** 상대 경로 import는 `.js`로 끝난다(`./app.module.js`). `__dirname` 대신 `import.meta.dirname`을 쓴다.
- **`bigint` 컬럼.** PostgreSQL `bigint`는 기본적으로 문자열로 온다. 금액은 2⁵³−1 이하라 `p.bigint('number')`로 숫자로 받는다.
- **환경 변수는 모듈을 불러올 때 읽힌다.** 그래서 e2e 테스트는 컨테이너 주소를 정한 뒤 `AppModule`을 동적으로 불러온다.
- **테스트 앱도 어댑터를 지정한다.** `createNestApplication(new FastifyAdapter())`로 만들지 않으면 Express를 찾는다.

### 016 — REST 응찰·대시보드

| Spring | NestJS | 이 프로젝트에서 |
|---|---|---|
| `@RestController`, `@PostMapping`, `@GetMapping` | `@Controller('api')`, `@Post('bid')`, `@Get('dashboard')` | `auction.controller.ts` |
| 컨트롤러 → 유스케이스 → 도메인 서비스 → 어댑터 | 컨트롤러(HTTP만) → 서비스(규칙·데이터 접근). 순수 규칙은 함수로 떼어 단위 테스트 | `AuctionService`, `judgeBid()` |
| `@RequestBody` + Bean Validation + 값 객체 | `@Body({ schema })` + Zod. 전역 `StandardSchemaValidationPipe`가 검증·변환(이름 trim) | `submit-bid.schema.ts` |
| `@RequestHeader` | `@Headers('idempotency-key')`. 스키마·파이프를 못 받아 서비스에서 Zod로 검증 | `idempotencyKeySchema` |
| `ResponseEntity.status(...)` | `@HttpCode(200)`(POST 기본은 201), `@Header('Cache-Control', 'no-store')` | 컨트롤러 |
| `@Transactional` | `em.transactional(async (em) => …)`: 콜백 안의 em으로 작업하면 끝날 때 flush·커밋, 예외면 롤백 | `submitBid()` |
| `@Lock(PESSIMISTIC_WRITE)` / `findForUpdate` | `findOneOrFail(Auction, id, { lockMode: LockMode.PESSIMISTIC_WRITE })` → `SELECT … FOR UPDATE` | 응찰 직렬화 |
| JPQL 프로젝션 쿼리 | `em.getConnection().execute(sql, params)`로 SQL 한 번 | `readDashboard()` |
| `@RestControllerAdvice` + `ErrorResponse` | 전역 `ExceptionFilter`(`@Catch()`)가 모든 예외를 같은 본문으로 | `AllExceptionsFilter` |
| 업무 예외(`InvalidInputException` …) | Nest 내장 예외(`BadRequestException`, `ConflictException`)를 던지면 상태 코드가 정해진다 | 서비스 |
| `WebMvcConfigurer.addCorsMappings` | `app.enableCors({ origin, methods, allowedHeaders, maxAge })` | `configureApp()` |
| springdoc 애너테이션 | `@nestjs/swagger` 데코레이터. Zod 스키마를 `standardSchema`로 넘기면 문서가 된다 | `@ApiOkResponse({ standardSchema })` |
| MockMvc | `app.inject()`(Fastify): 포트 없이 요청 | `test/*.e2e-spec.ts` |

알아 둘 차이:

- **테스트 앱은 `main.ts`를 거치지 않는다.** 전역 파이프·필터·CORS를 `configureApp()`에 모아 main과 테스트가 같이 부른다.
- **Fastify가 먼저 막는 요청도 있다.** 깨진 JSON은 컨트롤러 전에 Fastify가 거부하고, Nest 어댑터가 `HttpException`으로 감싸 원래 오류를 `cause`에 둔다. 예외 필터가 이를 `요청 본문을 읽을 수 없습니다.`로 바꾼다.
- **Zod `.int()`는 안전한 정수인지까지 본다.** 소수(본문 오류)와 범위 밖 정수(범위 오류)를 다른 메시지로 알리려고 `Number.isInteger` 검사를 범위 검사 앞에 따로 두었다.
- **동시성 테스트.** Node는 스레드가 하나지만 DB 호출을 기다리는 동안 다른 요청이 끼어든다. 그래서 `Promise.all`로 동시에 보내도 잠금이 없으면 경합이 실제로 생기고, 잠금이 이를 막는지 확인할 수 있다.
- **`api/`와 다른 점.** 정수 값을 `1.0`·`1e2`처럼 쓴 금액을 받아들인다(`JSON.parse`가 정수로 읽는다). 엔진·web은 이런 값을 보내지 않는다.

