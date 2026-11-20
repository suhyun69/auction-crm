# 018 — api2 GraphQL (Mercurius)

- 상태: IN_PROGRESS
- 담당: api2(루트가 직접 수행)
- 선행: 017 병합 완료
- 브랜치: codex/018-api2-graphql
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

web의 graphql 모드(019)는 대시보드를 GraphQL로 읽고, SSE 알림 → 재조회 대신 구독으로 바뀐 대시보드를 바로 받는다. REST와 같은 서비스 위에 GraphQL 입구를 만든다.

## 작업과 완료 기준

- [x] `@nestjs/graphql` + `@nestjs/mercurius`(code-first)로 `POST /graphql`과 GraphiQL(`/graphiql`)을 연다.
- [x] `query dashboard`, `mutation submitBid(input, idempotencyKey)`, `subscription dashboardChanged`(WebSocket, graphql-ws).
- [x] 금액은 2⁵³−1까지 담는 `SafeInt` 스칼라, 시각은 `DateTime`(ISO-8601 UTC).
- [x] `submitBid`는 REST와 같은 서비스·검증·멱등·판정을 쓴다. 오류는 `extensions.code`(`BAD_REQUEST`, `CONFLICT`)로 알린다.
- [x] 응찰이 커밋된 뒤 최신 대시보드를 구독자에게 보낸다. 몰려 오면 최신 스냅샷으로 묶어 순서대로 보낸다. 재전송·실패한 요청은 보내지 않는다.
- [x] WebSocket 연결은 허용 원점만 받는다. HTTP의 `/graphql`도 같은 CORS를 쓴다.
- [x] e2e 테스트(조회·응찰·검증·충돌·구독·원점)와 실제 확인.
- [x] 학습 노트에 018 개념과 GraphQL 스키마를 정리한다.
- [ ] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.
