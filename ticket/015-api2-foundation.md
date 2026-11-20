# 015 — api2 프로젝트 기반 (NestJS · Fastify · MikroORM · Zod)

- 상태: DONE
- 담당: api2(루트가 직접 수행)
- 선행: 013 병합 완료
- 브랜치: codex/015-api2-foundation
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

`api/`(Spring Boot)를 그대로 둔 채, 시뮬레이션 엔진과 web이 쓰는 기능만 NestJS로 다시 만든 `api2/`로 연결을 바꾼다(015~020). Java를 NestJS로 옮기며 익히는 것이 목적이라 NestJS 커뮤니티의 기능별 모듈 구조를 따르고, 새 개념은 `api2/README.md` 학습 노트에 남긴다. 이 티켓은 HTTP 기능 없이 프로젝트 기반만 만든다.

## 작업과 완료 기준

- [x] Nest CLI(NestJS 12)로 `api2/`를 만들고 HTTP 어댑터를 Fastify로 바꾼다. 쓰지 않는 생성물(Express 어댑터, 원격 측정 SaaS 모듈, 배포 도구, 샘플 컨트롤러)은 뺀다.
- [x] 환경 변수를 Zod 스키마로 시작할 때 검증한다. 포트·DB 접속·허용 원점의 기본값은 `api/`와 같다.
- [x] MikroORM 7로 `auction`·`auction_participant`·`auction_bid` 엔티티를 정의하고 첫 마이그레이션을 만든다. 테이블·컬럼·유니크·인덱스 이름은 `api/`와 같다(엔진·web이 쓰지 않는 `auction.highest_bid_id` 제외).
- [x] 시작할 때 마이그레이션을 적용하고 경매 1번 행을 한 번만 만든다.
- [x] 단위 테스트(환경 변수)와 e2e 테스트(빈 PostgreSQL에서 시작·재시작)를 둔다. e2e는 Testcontainers로 파일마다 DB를 띄운다.
- [x] `api2/README.md`(실행·구조·학습 노트)와 `api2/AGENTS.md`(작업 지침)를 쓴다.
- [x] lint·build·단위·e2e 테스트와 실제 기동을 확인한다.
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: Nest CLI가 만든 기본 프로젝트(ESM, Vitest, oxlint, TypeScript 6)에서 Express 어댑터·`@nestjs/observe`(원격 측정 SaaS)·`@nestjs/mau`(배포 도구)·샘플 컨트롤러를 빼고 Fastify 어댑터로 바꿨다. 환경 변수는 `src/config/env.ts`의 Zod 스키마를 `ConfigModule.forRoot({ validationSchema })`와 마이그레이션 CLI가 함께 쓴다. 엔티티는 MikroORM 7 권장 방식인 `defineEntity()` + `setClass()`로 정의했고, 금액은 `bigint` 컬럼을 숫자로 받는다(`p.bigint('number')`). 시작할 때 `DatabaseMigrator.onModuleInit()`이 마이그레이션을, `AuctionInitializer.onApplicationBootstrap()`이 경매 1번 행(`insert … on conflict do nothing`)을 처리한다. 공식 Nest 에이전트 스킬(`.agents/skills`, `.claude/skills`)은 참고 문서로 남겼다.
- 검증: `npm run lint` 경고 0, `tsc --noEmit` 통과, `npm run build` 통과, 단위 테스트 3개(환경 변수 기본값·변환·거부), e2e 1개(Testcontainers PostgreSQL 17.5에서 시작 → 테이블 4개·경매 행 1개, 재시작 → 마이그레이션·경매 행 그대로) 통과.
- 실제 기동: 임시 PostgreSQL 컨테이너로 `node dist/main.js`를 두 번 띄워 첫 기동에서 마이그레이션 1건 적용·경매 행 생성, 두 번째 기동에서 변경 없음을 확인. 생성된 SQL의 테이블·컬럼·유니크·인덱스 이름이 `api/`의 JPA 정의와 같은 것을 확인.
- `api/`와 다른 점: `auction.highest_bid_id`를 두지 않았다. 상태·사유 컬럼은 `text` + check 제약이다(`api/`는 varchar). 스키마는 `ddl-auto` 대신 마이그레이션 파일로 관리한다.
- 병합 후 회귀: master에서 build, 단위 3개, e2e 1개 통과. `api/`·`web/`·`simulator/`는 바꾸지 않았다.
- 작업 커밋: `d3796d5`
- 병합 커밋: `c73c1d9` (master --no-ff)

## api2 전체 티켓

| 티켓 | 내용 |
|---|---|
| 015 | 프로젝트 기반(이 티켓) |
| 016 | REST `POST /api/bid`, `GET /api/dashboard`: 잠금·멱등·판정·집계, 오류 형식, CORS, OpenAPI |
| 017 | SSE `GET /api/events`: 커밋 후 알림, heartbeat, 연결 정리 |
| 018 | GraphQL(Mercurius): `dashboard`, `submitBid`, `dashboardChanged` 구독 |
| 019 | web 대시보드 GraphQL 연결(`NEXT_PUBLIC_API_PROTOCOL=graphql|rest`) |
| 020 | 연결 전환: compose·dev 스크립트·문서를 api2 기준으로(`API_IMPL=api`로 Spring 선택 가능). `api/`는 삭제하지 않음 |
