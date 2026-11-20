# 016 — api2 REST: 응찰·대시보드

- 상태: DONE
- 담당: api2(루트가 직접 수행)
- 선행: 015 병합 완료
- 브랜치: codex/016-api2-rest
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

시뮬레이션 엔진은 `POST /api/bid`로 응찰하고 `GET /api/dashboard`로 시장을 읽으며, web의 rest 모드도 `GET /api/dashboard`를 쓴다. 두 경로를 `api/`와 같은 계약으로 api2에 만든다.

## 작업과 완료 기준

- [x] `POST /api/bid`: `{customerName, amount}`와 선택 헤더 `Idempotency-Key`를 받아 200으로 `{bidId, status, reason, submittedAmount, highestAmount, highestBidderName}`을 돌려준다.
- [x] 판정: 최고가 초과만 승인하고 같거나 낮으면 기각한다. 승인·기각 모두 저장한다. 이름은 앞뒤 공백을 지워 참가자를 구분한다.
- [x] 검증: 이름 공백 제거 후 1~100자, 금액 1~2⁵³−1 정수, 키 1~200자(공백만 불가). 위반·잘못된 타입·깨진 JSON은 저장 없이 400.
- [x] 멱등: 같은 키·이름·금액은 최초 응답을 그대로 돌려주고, 같은 키에 내용이 다르면 409.
- [x] 동시성: 경매 행을 `SELECT … FOR UPDATE`로 잠가 동시 응찰·같은 키 동시 요청을 한 줄로 세운다.
- [x] `GET /api/dashboard`: 요약과 전체 순위를 쿼리 한 번의 스냅샷으로 만든다. 순위는 승인 최고 금액 내림차순, 승인 이력 없음은 뒤, 같으면 먼저 등록된 순. `Cache-Control: no-store`.
- [x] 오류 본문 `{timestamp, status, error, message}`, CORS(허용 원점, GET·POST·OPTIONS, Content-Type·Idempotency-Key), OpenAPI 문서(`/swagger-ui`, `/v3/api-docs`).
- [x] e2e 테스트(판정·멱등·검증·동시성·순위·일관된 스냅샷)와 실제 시뮬레이션 엔진 연동을 확인한다.
- [x] 학습 노트에 016 개념을 정리한다.
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: `AuctionController`(HTTP만)와 `AuctionService`(잠금·멱등·판정·집계), 순수 함수 `judgeBid()`를 `auction` 모듈에 더했다. 응찰은 `em.transactional()` 안에서 경매 행을 `PESSIMISTIC_WRITE`로 잠근 뒤 멱등 키 조회 → 참가자 조회·생성 → 판정 → 저장 순서로 처리한다. 대시보드는 참가자별 집계 SQL 한 번으로 순위를 만들고 요약을 그 결과에서 계산한다. 요청 본문은 Zod 스키마(`@Body({ schema })` + 전역 `StandardSchemaValidationPipe`)로, `Idempotency-Key`는 `@Headers()`가 스키마를 받지 않아 서비스에서 Zod로 검증한다. 전역 `AllExceptionsFilter`가 Nest 예외·Fastify 본문 오류·그 밖의 예외를 `api/`와 같은 오류 본문으로 바꾼다. 응답도 Zod 스키마로 정의해 OpenAPI(`/swagger-ui`, `/v3/api-docs`)와 타입을 한곳에서 만든다. 전역 설정은 `configureApp()`에 모아 main과 테스트가 같이 쓴다.
- 검증: lint 경고 0, `tsc --noEmit`·build 통과. 단위 8개(판정 규칙, 요청·키 스키마, 환경 변수), e2e 38개 통과. e2e는 Spring `BidControllerTest`·`DashboardControllerTest`의 판정·멱등 재전송·409·잘못된 금액/이름/키/본문/뒤따르는 토큰·상한 경계·동시 첫 응찰 8건·같은 키 동시 8건·같은 키 다른 요청·빈 대시보드·순위·쓰기 중 일관된 스냅샷과 CORS 사전 요청을 옮겼다.
- 실제 연동: 임시 PostgreSQL로 api2를 띄우고 `node simulator/cli.mjs --api http://localhost:18080 --speed 100`을 실행해 60초 시나리오를 끝까지 완료(응찰 65건, 최고가 232,057원). 엔진의 HTTP 클라이언트가 하는 응답 형식 검사를 모두 통과했다. curl로 오류 본문·no-store·CORS·OpenAPI 문서를 확인했다.
- 옮기지 않은 Spring 테스트: 저장 중 실패 시 롤백(어댑터 목 주입)과 대시보드 SQL 1회 통계 검사. 롤백은 `em.transactional()`이, SQL 1회는 코드 구조(쿼리 한 번)가 보장하며 테스트로는 덮지 않았다.
- 병합 후 회귀: master에서 build, 단위 8개, e2e 38개 통과. `api/`·`web/`·`simulator/`는 바꾸지 않았다.
- 작업 커밋: `16bc269`
- 병합 커밋: `8d068f7` (master --no-ff)

## 범위에서 뺀 것

- `api/`는 정수 값을 소수·지수 표기로 쓴 금액(`1.0`, `1e2`)도 400으로 거부한다. JavaScript의 `JSON.parse`는 이를 정수로 읽고, 엔진·web은 이런 값을 보내지 않으므로 api2는 받아들인다.
