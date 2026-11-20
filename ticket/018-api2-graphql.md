# 018 — api2 GraphQL (Mercurius)

- 상태: DONE
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
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: `GraphQLModule.forRootAsync` + `MercuriusDriver`(code-first, 메모리 스키마)로 `POST /graphql`, GraphiQL(`/graphiql`), 같은 경로의 WebSocket 구독(graphql-ws)을 열었다. `AuctionResolver`가 `dashboard`·`submitBid`·`dashboardChanged`를 제공하고 REST와 같은 `AuctionService`를 부른다. `submitBid` 입력은 GraphQL 타입 검사 뒤 REST와 같은 Zod 스키마를 `SchemaValidationPipe`로 적용한다(`@Args`는 스키마 옵션이 없다). 금액은 `SafeInt` 스칼라(±2^53−1), 시각은 `DateTime`. `DashboardPublisher`가 `@OnEvent(BID_RECORDED)`로 커밋 알림을 받아 최신 대시보드를 Mercurius PubSub으로 보내며, 읽는 동안 들어온 알림은 묶어 순서대로 한 번 더 보낸다. WebSocket은 `verifyClient`로 허용 원점만 받는다. 전역 예외 필터는 GraphQL 요청에서 `ErrorWithProps`(`extensions.code`: `BAD_REQUEST`·`CONFLICT`·`NOT_FOUND`)를 돌려준다.
- 회귀와 수정: Mercurius 드라이버가 Nest 초기화 도중 `await app.register()`로 REST 경로를 확정시키고 Fastify 전역 오류 처리기를 바꿔, 깨진 JSON의 REST 응답이 Fastify 기본 형식이 되는 회귀를 e2e가 잡았다. 같은 처리기(`handleFastifyError`)를 초기화 전 `configureApp()`과 Mercurius `errorHandler` 옵션 양쪽에 걸어 REST는 기존 오류 본문, `/graphql`은 GraphQL 형식으로 답하게 했다. SSE 테스트의 리스너 수 검사는 새 구독자(GraphQL 알림)를 뺀 기준값 대비로 바꿨다.
- 검증: lint 경고 0, `tsc --noEmit`·build 통과. 단위 8개, e2e 52개(GraphQL 8개: 조회, 2^53−1 금액·재전송, BAD_REQUEST·CONFLICT, SafeInt 거부, `/graphql`과 REST의 본문 오류 형식, 구독이 커밋 후에만·재전송/실패 제외, 동시 20건에서 순서 유지·최종 상태 도달, 허용 원점 연결과 다른 원점 403) 통과. `verify_acceptance.py --impl api2` 통과. curl로 GraphiQL 200, `/graphql` CORS 허용, HTTP 구독 거부(`BAD_REQUEST`)를 확인했다.
- GraphQL 스키마(SDL)는 `api2/README.md` 018 절에 있다. 019(web 연결)의 계약이다.
- 병합 후 회귀: master에서 build, 단위 8개, e2e 52개, 수용 스크립트 통과. `api/`·`web/`·`simulator/`는 바꾸지 않았다.
- 작업 커밋: `38dabe1`
- 병합 커밋: `d909868` (master --no-ff)

