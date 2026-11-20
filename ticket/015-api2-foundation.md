# 015 — api2 프로젝트 기반 (NestJS · Fastify · MikroORM · Zod)

- 상태: IN_PROGRESS
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
- [ ] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## api2 전체 티켓

| 티켓 | 내용 |
|---|---|
| 015 | 프로젝트 기반(이 티켓) |
| 016 | REST `POST /api/bid`, `GET /api/dashboard`: 잠금·멱등·판정·집계, 오류 형식, CORS, OpenAPI |
| 017 | SSE `GET /api/events`: 커밋 후 알림, heartbeat, 연결 정리 |
| 018 | GraphQL(Mercurius): `dashboard`, `submitBid`, `dashboardChanged` 구독 |
| 019 | web 대시보드 GraphQL 연결(`NEXT_PUBLIC_API_PROTOCOL=graphql|rest`) |
| 020 | 연결 전환: compose·dev 스크립트·문서를 api2 기준으로(`API_IMPL=api`로 Spring 선택 가능). `api/`는 삭제하지 않음 |
