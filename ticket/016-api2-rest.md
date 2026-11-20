# 016 — api2 REST: 응찰·대시보드

- 상태: IN_PROGRESS
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
- [ ] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 범위에서 뺀 것

- `api/`는 정수 값을 소수·지수 표기로 쓴 금액(`1.0`, `1e2`)도 400으로 거부한다. JavaScript의 `JSON.parse`는 이를 정수로 읽고, 엔진·web은 이런 값을 보내지 않으므로 api2는 받아들인다.
