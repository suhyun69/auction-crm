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

저장소 루트의 `npm run dev`가 기본으로 api2를 띄운다(PostgreSQL·web 포함, web은 GraphQL로 연결). api2만 따로 띄울 때는 PostgreSQL이 필요하다. 저장소 루트에서 `npm run db:up`으로 개발 DB를 띄운 뒤:

```bash
npm install
npm run start:dev      # 코드 변경 시 다시 시작
```

시작할 때 마이그레이션을 적용하고 경매 1번 행을 만든다. 환경 변수와 기본값은 [.env.example](.env.example)과 `src/config/env.ts`에 있다.

- API 문서: http://localhost:8080/swagger-ui (원본 JSON `/v3/api-docs`)
- 응찰: `curl -X POST localhost:8080/api/bid -H 'content-type: application/json' -H 'Idempotency-Key: k1' -d '{"customerName":"홍길동","amount":1000}'`
- 대시보드: `curl localhost:8080/api/dashboard`
- 변경 알림(SSE): `curl -N localhost:8080/api/events`
- GraphQL: http://localhost:8080/graphiql 에서 조회·응찰을 직접 실행한다. 구독은 같은 `/graphql` 경로의 WebSocket(graphql-ws)이다.

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
├── graphql.config.ts          GraphQL(Mercurius): 경로, GraphiQL, 구독 원점 검사
├── config/env.ts              환경 변수 Zod 스키마
├── common/http/               오류 본문 형식, 전역 예외 필터(REST 본문 / GraphQL extensions.code),
│                              핸들러 밖 오류를 답하는 Fastify 오류 처리기
├── common/validation/         스키마 하나로 인자를 검증하는 파이프(GraphQL @Args용)
├── database/database.module.ts  MikroORM 연결, 시작 시 마이그레이션
├── mikro-orm.config.ts        앱과 마이그레이션 CLI가 같이 쓰는 ORM 설정
├── migrations/                MikroORM 마이그레이션
└── auction/                   경매 기능 모듈
    ├── auction.module.ts
    ├── auction.controller.ts  POST /api/bid, GET /api/dashboard (HTTP만)
    ├── auction-events.controller.ts  GET /api/events (SSE)
    ├── auction.events.ts      앱 안 이벤트 이름·내용(응찰 커밋)
    ├── auction.service.ts     잠금·멱등·판정·대시보드 집계
    ├── bid-judgement.ts       최고가 판정 규칙(순수 함수)
    ├── auction-initializer.service.ts  경매 1번 행 준비
    ├── graphql/               리졸버, GraphQL 타입, SafeInt 스칼라, 구독 알림(DashboardPublisher)
    ├── dto/                   요청 Zod 스키마, 응답 스키마·타입
    └── entities/              Auction · Participant · Bid
test/                          e2e 테스트 (support/: 컨테이너·앱 준비, SSE 클라이언트)
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

### 017 — SSE 변경 알림

| Spring | NestJS | 이 프로젝트에서 |
|---|---|---|
| `ApplicationEventPublisher` / 직접 만든 구독자 목록 | `@nestjs/event-emitter`의 `EventEmitter2`. `EventEmitterModule.forRoot()` 후 주입해 `emit()` | `AuctionService.publish()` |
| `TransactionSynchronization.afterCommit()` | `await em.transactional(...)`이 끝난 뒤에 `emit()`. 커밋 후라는 사실을 코드 순서로 보장 | `submitBid()` |
| `SseEmitter` + 연결별 자원 정리 클래스 | `@Sse('events')`가 `Observable<MessageEvent>`를 받아 Nest가 써 준다. 끊기면 구독이 해제되며 리스너·타이머도 정리 | `AuctionEventsController` |
| `emitter.send(event().name(...).data(...))` | `{ type: 'dashboard-changed', data: {} }`. 주석은 `{ comment: 'heartbeat' }` | 상수 `READY`·`CHANGED`·`HEARTBEAT` |
| `ScheduledExecutor`로 heartbeat, `SseEmitter(timeout)` | RxJS 연산자: `interval()`(heartbeat), `takeUntil(timer(...))`(제한 시간) | `stream()` |
| `@PreDestroy`, graceful shutdown | 생명주기 훅 `beforeApplicationShutdown()`에서 모든 스트림 완료(`app.enableShutdownHooks()` 필요) | `shutdown$` |
| `@SpringBootTest(webEnvironment = RANDOM_PORT)` | `app.listen(0)` + `app.getUrl()`. 끝나지 않는 응답은 `inject()` 대신 실제 포트와 `fetch` 스트림으로 | `test/support/sse.ts` |

알아 둘 차이:

- **Observable은 "구독할 때" 시작된다.** `stream()`은 값을 바로 만들지 않고 계획만 돌려준다. 연결마다 Nest가 구독하므로 리스너·타이머가 연결마다 따로 생기고, 연결이 끝나면 함께 사라진다(`listenerCount`로 확인).
- **`EventEmitter2.emit()`은 동기 호출이다.** 받는 쪽이 예외를 던지면 `emit()`을 부른 곳으로 올라온다. 이미 커밋된 응찰이 500이 되지 않게 `publish()`가 예외를 잡아 로그만 남긴다. (`@OnEvent()`로 단 핸들러는 기본으로 예외를 삼킨다.)
- **CORS 사전 요청.** 허용하지 않은 원점의 사전 요청에 `api/`는 403, api2(`@fastify/cors`)는 허용 헤더 없이 204로 답한다. 브라우저는 두 경우 모두 요청을 막는다.
- **수용 테스트.** `python3 scripts/verify_acceptance.py --impl api2`로 HTTP·SSE·재시작 후 데이터 유지를 `api/`와 같은 시나리오로 확인한다(먼저 `npm run build`).

### 018 — GraphQL (Mercurius)

| Spring | NestJS | 이 프로젝트에서 |
|---|---|---|
| (Spring for GraphQL의 `@Controller` + `@QueryMapping`) | `@Resolver()` 클래스의 `@Query`·`@Mutation`·`@Subscription` 메서드 | `graphql/auction.resolver.ts` |
| `schema.graphqls` 파일을 먼저 작성(schema-first) | 클래스·데코레이터에서 스키마를 만든다(code-first): `@ObjectType`, `@InputType`, `@Field`, `registerEnumType` | `graphql/auction.models.ts` |
| 커스텀 스칼라 `GraphQLScalarType` | `@Scalar('SafeInt')` 클래스(`parseValue`·`parseLiteral`·`serialize`) | `SafeInt` |
| `@Argument` + 검증 | `@Args('input', 옵션, 파이프)`. 스키마를 받는 옵션이 없어 같은 Zod 스키마를 쓰는 파이프를 직접 붙인다 | `SchemaValidationPipe` |
| `@GraphQlExceptionHandler` | 같은 전역 예외 필터가 GraphQL에서는 오류를 **돌려준다**(`ErrorWithProps` + `extensions.code`) | `AllExceptionsFilter` |
| `@SubscriptionMapping` + `Flux` | `@Subscription`이 Mercurius PubSub의 `subscribe(토픽)`을 돌려주고, 발행은 `pubsub.publish({ topic, payload })` | `DashboardPublisher` |
| `@EventListener` | `@OnEvent(BID_RECORDED)`. 핸들러 예외는 기본으로 삼켜져 응찰 응답에 영향이 없다 | `onBidRecorded()` |
| WebSocket 핸드셰이크 인터셉터 | Mercurius `subscription.verifyClient`로 Origin 검사 | `graphql.config.ts` |

알아 둘 차이:

- **같은 서비스, 두 입구.** 컨트롤러(REST)와 리졸버(GraphQL)는 둘 다 `AuctionService`를 부른다. 규칙은 한곳에 있고 입구만 다르다.
- **GraphQL 오류는 HTTP 200으로 온다.** 실패는 상태 코드가 아니라 응답의 `errors[].extensions.code`(`BAD_REQUEST`, `CONFLICT`)로 구분한다. 타입이 틀린 입력(문자열 금액, 2^53 이상)은 리졸버에 오기 전에 GraphQL 검증 단계에서 거부된다.
- **`Int`는 32비트다.** 원화 금액은 21억을 넘을 수 있어 `SafeInt` 스칼라(±2^53 − 1)를 따로 만들었다. 순위·참가자 수처럼 작은 값만 `Int`를 쓴다.
- **구독은 WebSocket으로만.** Nest의 Mercurius 드라이버는 HTTP로 온 구독 연산을 거부한다. 구독 메시지는 응찰마다 최신 대시보드를 통째로 담으므로, 받는 쪽은 다시 조회할 필요가 없다. 응찰이 몰리면 읽는 동안 들어온 알림을 묶어 마지막 스냅샷을 한 번 더 보낸다(순서는 항상 오래된 것 → 새것).
- **플러그인 등록 순서가 동작을 바꾼다.** Nest는 경로 등록 → 초기화 훅(`onModuleInit`) → 오류 처리기 설치 순서로 시작한다. Mercurius 드라이버가 초기화 훅 안에서 `await app.register()`를 부르면 그때까지 등록된 REST 경로가 확정되는데, 그 시점에는 Nest 처리기가 아직 없어 깨진 JSON 같은 오류가 Fastify 기본 형식으로 나갔다. 그래서 같은 오류 처리기(`handleFastifyError`)를 초기화 전에 `configureApp()`에서 걸고, Mercurius의 `errorHandler` 옵션에도 넘긴다. 테스트가 이 회귀를 잡았다.
- **`DateTime`은 `Date`를 받는다.** Nest의 `GraphQLISODateTime`은 `Date`만 직렬화하므로 리졸버가 ISO 문자열을 `Date`로 바꿔 넘긴다.

GraphQL 스키마(019에서 web이 쓰는 계약):

```graphql
enum BidReason {
  AMOUNT_NOT_HIGH_ENOUGH
  NEW_HIGHEST_BID
}

type BidResult {
  bidId: SafeInt!
  highestAmount: SafeInt!
  highestBidderName: String!
  reason: BidReason!
  status: BidStatus!
  submittedAmount: SafeInt!
}

enum BidStatus {
  ACCEPTED
  REJECTED
}

type Dashboard {
  participants: [DashboardParticipant!]!
  summary: DashboardSummary!
}

type DashboardParticipant {
  bidCount: SafeInt!
  customerName: String!
  highestAcceptedAmount: SafeInt
  lastBidAt: DateTime!
  participantId: SafeInt!
  rank: Int!
}

type DashboardSummary {
  bidCount: SafeInt!
  highestAmount: SafeInt!
  highestBidderName: String
  participantCount: Int!
}

scalar DateTime

type Mutation {
  submitBid(idempotencyKey: String, input: SubmitBidInput!): BidResult!
}

type Query {
  dashboard: Dashboard!
}

scalar SafeInt

input SubmitBidInput {
  amount: SafeInt!
  customerName: String!
}

type Subscription {
  dashboardChanged: Dashboard!
}
```

