# 경매 대시보드 구현 계획

## 목표와 구성

외부 시스템이 고객 이름과 금액으로 응찰하면 API가 누적 데이터에 따라 승인 또는 기각하고, 저장 결과를 대시보드에 실시간 반영한다.

- `api/`: 기존 Spring Boot + Java 21 + JPA 템플릿을 확장한다. 개발 DB는 Docker PostgreSQL이다.
- `web/`: Next.js App Router + TypeScript로 대시보드를 새로 만든다.
- HTTP로 등록·조회하고 SSE로 변경을 알린다. 데이터의 기준은 DB다.
- `api/architecture.md`의 헥사고날 계층, DTO 분리, 유스케이스 트랜잭션 경계와 ArchUnit 규칙을 유지한다.

## 제품 규칙

- 단일 경매, 원화 정수 금액. 허용 범위는 1~9,007,199,254,740,991원이다.
- 이름은 앞뒤 공백 제거 후 1~100자. 정규화된 이름을 참가자 식별자로 사용한다.
- 첫 유효 응찰 또는 현재 최고가를 초과하는 응찰은 승인한다. 동일가와 낮은 금액은 기각한다.
- 승인·기각 모두 저장한다. 입력 오류와 멱등 재요청은 새 기록을 만들지 않는다.
- 참가자별 승인된 최고 금액을 기준으로 내림차순 정렬한다. 기각은 기존 개인 최고가를 낮추지 않는다.
- 승인 이력이 없는 참가자는 목록 하단에 표시한다. 동률은 최초 참가 시각, ID 순으로 고정한다.
- 상단에는 총 응찰 수, 현재 최고가, 참가자 수를 표시한다. 금액 합산은 지표에 포함하지 않는다.
- 경매 종료·낙찰 확정·여러 경매·회원 인증·외부 배포·다중 API 서버는 이번 범위에 포함하지 않는다.

## API 계약

### POST /api/bid

선택 헤더: `Idempotency-Key`. 같은 키와 같은 정규화 요청이면 최초 응답을 재사용하며, 다른 요청이면 409다. 키가 없으면 각 호출이 새 응찰이다.

요청:

```json
{"customerName":"홍길동","amount":150000}
```

응답(승인·기각 모두 HTTP 200):

```json
{
  "bidId": 42,
  "status": "ACCEPTED",
  "reason": "NEW_HIGHEST_BID",
  "submittedAmount": 150000,
  "highestAmount": 150000,
  "highestBidderName": "홍길동"
}
```

기각 시 `status=REJECTED`, `reason=AMOUNT_NOT_HIGH_ENOUGH`. 응답의 최고가는 해당 요청 판정 시점 값이다. 잘못된 입력은 400이며 기존 공통 오류 형식을 따른다.

### GET /api/dashboard

```json
{
  "summary": {"bidCount":1,"participantCount":1,"highestAmount":150000,"highestBidderName":"홍길동"},
  "participants": [
    {"participantId":1,"customerName":"홍길동","rank":1,"highestAcceptedAmount":150000,"bidCount":1,"lastBidAt":"2026-11-18T13:00:00Z"}
  ]
}
```

초기 상태는 카운트·최고가 0, 최고가 고객 null, 목록 빈 배열이다. 승인 이력이 없는 개인 금액은 null이다. 시각은 UTC ISO 8601로 전송하고 화면은 Asia/Seoul로 표시한다. 초기 버전은 소규모 참가자 전체 목록을 조회한다.

### GET /api/events

SSE 연결 준비 시 `ready`, 새 응찰 커밋 후 `dashboard-changed`, 유휴 시 heartbeat를 전송한다. 변경 이벤트는 재조회 신호이며 과거 이벤트 재생은 제공하지 않는다. 브라우저는 최초 조회와 ready/재연결 후 전체 조회를 수행한다.

## 데이터와 정합성

- 경매: 단일 고정 행, 현재 최고 금액, 최고 응찰 참조.
- 참가자: 경매 ID, 정규화 고객 이름, 최초 참가 시각. 경매 ID+이름 유일 제약.
- 응찰: 참가자, 금액, 상태, 사유, 접수 시각, 선택 멱등 키와 최초 판정 응답. 멱등 키 유일 제약.
- 시작 시 경매 행을 준비한다. 응찰 시 해당 행의 비관적 잠금 아래 멱등 확인·참가자 생성·판정·저장·최고가 갱신을 원자적으로 수행한다.
- 조회의 요약과 목록은 같은 DB 스냅샷으로 구성한다. 이벤트는 커밋 후 발행한다.
- 웹은 이벤트를 합쳐 조회하고 이전 요청의 늦은 응답이 화면을 덮어쓰지 않도록 한다. 조회 도중 변경 이벤트가 오면 추가 조회한다.
- 개발은 Docker PostgreSQL(실행마다 초기화), 수용 검증은 임시 PostgreSQL 컨테이너, 자동 테스트는 격리된 인메모리 H2를 사용한다.

## 티켓과 병합 순서

티켓은 `ticket/<번호>-<작업명>.md` 형식으로 관리한다. 각 티켓의 상세 범위·완료 기준·검증은 아래 문서를 따른다. 기본 실행 순서는 번호순이며, 007은 001 이후 독립 작업이 가능하다.

| 번호 | 작업 | 선행 티켓 | 문서 |
|---|---|---|---|
| 001 | 저장소 기준점과 개발 환경 정리 | 없음 | [001-repository-baseline.md](ticket/001-repository-baseline.md) |
| 002 | 경매 도메인과 응찰 규칙 | 001 | [002-auction-domain.md](ticket/002-auction-domain.md) |
| 003 | 영속성 모델과 경매 잠금 | 002 | [003-auction-persistence.md](ticket/003-auction-persistence.md) |
| 004 | 응찰 API와 멱등 처리 | 003 | [004-bid-api.md](ticket/004-bid-api.md) |
| 005 | 대시보드 요약과 순위 조회 | 004 | [005-dashboard-api.md](ticket/005-dashboard-api.md) |
| 006 | 커밋 후 SSE 변경 알림 | 005 | [006-auction-events.md](ticket/006-auction-events.md) |
| 007 | Next.js 프로젝트와 화면 골격 | 001 | [007-nextjs-shell.md](ticket/007-nextjs-shell.md) |
| 008 | 조회 API와 실시간 화면 연결 | 006, 007 | [008-dashboard-integration.md](ticket/008-dashboard-integration.md) |
| 009 | 전체 흐름 검증과 실행 문서 | 008 | [009-acceptance-and-docs.md](ticket/009-acceptance-and-docs.md) |

## worktree 작업 규칙

1. 티켓 상태는 `TODO → IN_PROGRESS → DONE`으로 갱신한다. 검증 실패나 미완료 사항이 있으면 DONE으로 바꾸지 않는다.
2. 현재 통합 브랜치는 `master`다. 작업 시작 시 실제 통합 브랜치를 확인한다. 선행 티켓이 병합된 최신 통합 브랜치에서 티켓별 `codex/<번호>-<slug>` 브랜치와 별도 worktree를 만든다.
3. 초기 확인 시 `api/`는 미추적 상태다. worktree에는 미추적 파일이 전달되지 않으므로, 001 worktree를 만들기 전에 기존 API와 계획/티켓을 검토해 통합 브랜치에 초기 기준 커밋으로 기록해야 한다. 001의 환경 정리는 별도 worktree에서 수행한다. 이 문서 작성 단계에서는 커밋·브랜치·worktree를 생성하지 않는다.
4. 예시: `git worktree add ../auction-crm-002 -b codex/002-auction-domain master`. 각 worktree는 독립된 API 포트·웹 포트·파일 DB 경로를 사용한다.
5. 티켓 범위만 구현하고 해당 검증을 수행한다. 티켓에 변경 요약과 실제 검증 결과를 기록하고 소스와 함께 커밋한다.
6. 병합 직전에 최신 통합 브랜치를 작업 브랜치에 반영하고 충돌을 해결한다. 반영으로 영향받은 검증을 다시 수행한다.
7. 통합 브랜치의 작업 디렉터리가 깨끗한 상태에서 `git merge --no-ff codex/<번호>-<slug>`로 병합하고 관련 회귀 검사를 확인한다. 티켓에 완료 커밋과 병합 결과를 남긴다.
8. 병합 및 검증 성공 후에만 worktree와 작업 브랜치를 정리한다. 다음 티켓은 갱신된 통합 브랜치에서 시작한다. 사용자 변경은 삭제하거나 덮어쓰지 않는다.

## 최종 수용 기준

- 외부 POST 요청에 승인/기각과 판정 시점 최고가를 응답하고 기록을 보존한다.
- 동일가·낮은 금액은 기각되며 순위와 개인 승인 최고가가 훼손되지 않는다.
- 동시 응찰에서 최고가와 참가자·기록 수가 일관되고, 동일 멱등 키는 한 번만 반영된다.
- 브라우저 두 개에서 응찰 카운트·최고가·참가자 순위가 새로고침 없이 갱신된다.
- 연결 복구 및 API 재시작 후 전체 조회로 최신 상태를 복원한다.
- 서버 재시작 후 파일 DB 데이터가 유지되며 API 테스트와 웹 정적 검사/build가 통과한다.

## 서브에이전트 운영

- 루트 `AGENTS.md`가 티켓 배정, worktree, 검증 및 병합 절차를 정의한다.
- `.codex/agents/web.toml`: web 담당 커스텀 에이전트. 세부 구현 지침은 `web/AGENTS.md`를 따른다.
- `.codex/agents/api.toml`: api 담당 커스텀 에이전트. 세부 구현 지침은 `api/AGENTS.md`와 `api/architecture.md`를 따른다.
- 001과 009는 루트가 주관하고, 002~006은 api, 007~008은 web에 배정한다.
- 루트가 worktree와 브랜치, 티켓·허용 범위·API 계약·완료 기준을 전달한다. 담당자는 구현·검증 결과를 반환하고 루트가 리뷰와 병합을 수행한다.
- 커스텀 역할을 선택할 수 없는 도구에서는 루트가 해당 역할 TOML과 폴더 지침을 읽도록 배정 메시지에 포함한다. 모델과 권한은 상위 세션을 따른다.
- 서브에이전트는 배정받지 않은 티켓을 시작하거나 하위 에이전트를 추가 생성하지 않는다.

## 추가 티켓: 가상 참가자 시나리오 엔진

- [010-scenario-engine.md](ticket/010-scenario-engine.md): 기존 경매 API를 호출하는 JSON 시나리오와 Node 기반 가상 참가자 엔진.
- 예산·성향·입장·반응 속도, 가상 시간/배속/일시정지, 난수 시드, 결과 기록을 제공한다. 실제 경매와 dry-run을 구분하고 기존 API·웹·DB 운영 흐름을 보존한다.

## 추가 티켓: 웹 시뮬레이터 제어

- [011-web-simulator.md](ticket/011-web-simulator.md): /simulator에서 시나리오 선택·시작·일시정지/재개·중지·배속·참가자별 상태를 조작한다.
- 기존 엔진을 단일 Next Node 서버의 메모리 세션으로 재사용하며 여러 탭의 상태와 실행 대상을 동기화한다. 실제 경매/독립 미리보기를 구분하고 기존 CLI와 API를 보존한다.

## 추가 티켓: 대시보드 시뮬레이션 설정과 시작

- [012-dashboard-simulation-control.md](ticket/012-dashboard-simulation-control.md): 경매 대시보드에서 참가자 인원·성향·예산을 모달로 구성하고 그 구성으로 바로 실행·일시정지·중지한다.
- 세션 `start`가 준비된 `scenarioId` 외에 직접 구성한 `scenario`를 받고 서버가 기존 규칙으로 다시 검증한다. 직접 구성한 시나리오는 예약 ID `custom` 한 자리를 차지하며 기존 /simulator 화면과 CLI 경로를 보존한다.

## 추가 티켓: 시뮬레이션 호출 흐름 시각화

- [013-call-flow-visualizer.md](ticket/013-call-flow-visualizer.md): 대시보드를 왼쪽 절반, Simulation Engine·API·Web 사이 호출을 CSS 3D 그림으로 재생하는 패널을 오른쪽 절반에 둔다.
- 세션이 엔진의 API 클라이언트를 감싸 호출 기록(`run.traffic`)을 스냅샷으로 내보내고, 브라우저가 SSE 수신과 대시보드 재조회를 더한다. 엔진 코어와 기존 `events`·API는 바꾸지 않는다.

## 추가 티켓: api2 (NestJS로 옮긴 API)

- `api/`(Spring)를 그대로 두고, 시뮬레이션 엔진과 web이 쓰는 기능만 NestJS 12 · Fastify · MikroORM · Zod · Mercurius(GraphQL)로 다시 만든 `api2/`로 연결을 바꾼다. NestJS 학습이 목적이라 커뮤니티의 기능별 모듈 구조를 따르고 `api2/README.md`에 학습 노트를 남긴다.
- 엔진은 REST 응찰, web은 GraphQL 조회·구독(rest 모드도 유지)을 쓴다. REST·SSE 계약은 `api/`와 같다.
- [015-api2-foundation.md](ticket/015-api2-foundation.md): 프로젝트 기반(Fastify, Zod 설정, MikroORM 엔티티·마이그레이션, 경매 초기화).
- 016 REST 응찰·대시보드, 017 SSE, 018 GraphQL, 019 web GraphQL 연결.
- [020-api2-switch.md](ticket/020-api2-switch.md): `npm run dev`·`docker compose`·수용 테스트의 기본 API를 api2로, 웹 대시보드 연결을 GraphQL로 전환한다. `API_IMPL=api`(웹은 rest)로 Spring을 계속 고를 수 있고 `api/`는 지우지 않는다.

