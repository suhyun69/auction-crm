# 019 — web 대시보드 GraphQL 연결

- 상태: DONE
- 담당: web(루트가 직접 수행)
- 선행: 018 병합 완료
- 브랜치: codex/019-web-graphql
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

api2의 GraphQL(018)로 대시보드를 읽고, SSE 알림 → 재조회 대신 구독으로 바뀐 대시보드를 바로 받는다. Spring `api/`와도 계속 쓸 수 있게 기존 REST·SSE 연결은 설정으로 남긴다.

## 작업과 완료 기준

- [x] `NEXT_PUBLIC_API_PROTOCOL=graphql|rest`(기본 `rest`)로 대시보드 연결 방식을 고른다. `rest`는 지금 동작 그대로다.
- [x] graphql 모드: 처음과 (재)연결 때 `query dashboard`(HTTP)로 전체를 읽고, `subscription dashboardChanged`(graphql-ws)로 받은 대시보드를 바로 그린다.
- [x] 연결 상태(연결 중·연결됨·재연결 중·끊김), 재시도, 변경 행 강조를 rest 모드와 같게 유지한다.
- [x] 늦게 도착한 오래된 스냅샷(응찰 수가 더 적은 것)이 새 스냅샷을 덮지 않는다.
- [x] 호출 흐름 패널이 graphql 모드에서 API → Web을 "GraphQL 구독", Web → API를 "GraphQL 조회"로 표시한다.
- [x] web 테스트·lint·타입·production build와 두 모드의 브라우저 동작(api2 연결)을 확인한다.
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: `NEXT_PUBLIC_API_PROTOCOL`(기본 `rest`)을 `API_PROTOCOL`로 읽는다. `createLiveDashboard`가 선택 인자로 GraphQL 연결(`DashboardLink`: `query`·`subscribe`)을 받으면 graphql 모드가 된다. 처음과 (재)연결마다 query로 전체를 읽고, 구독 메시지의 대시보드는 다시 조회하지 않고 같은 `apply()`로 그린다(변경 행 강조 포함). 조회 중에 구독 메시지를 이미 그렸고 조회 결과의 응찰 수가 더 적으면 늦게 온 결과로 보고 버린다. 구독 없이 줄어든 결과(DB 초기화)는 받아들인다. 실제 연결은 `lib/dashboard/graphql.ts`(fetch + graphql-ws, 무한 재연결)이고 테스트는 가짜 연결을 쓴다. rest 모드의 SSE·REST 경로는 그대로다. 호출 흐름 패널은 graphql 모드에서 차선·범례·필터·노드 이름을 "GraphQL 구독/조회"로 바꾸고, 기록에 `POST /graphql · query dashboard`, `GraphQL 구독 · dashboardChanged`를 표시한다.
- 검증: `npm run lint` 경고 0, `tsc --noEmit` 통과, `npm run build`(rest 기본, `NEXT_PUBLIC_API_PROTOCOL=graphql`) 통과. web 테스트 33개 통과(신규 6개: 구독 메시지는 재조회 없이 그림, 연결 직후 재조회, 늦은 옛 조회 결과 버림, DB 초기화 결과 수용, 실패 시 끊김과 retry 재구독, dispose 정리, 호출 흐름 protocol 전달).
- 브라우저(임시 PostgreSQL + api2 18080, web 개발 서버 3100): graphql 모드에서 시뮬레이션 실행 중 응찰 수가 23 → 30으로 늘어나는 동안 `/graphql` POST는 2회(최초·연결 직후)뿐이고 `/api/events` 요청 0회, `실시간 연결됨`, 호출 흐름에 `GraphQL 구독 · dashboardChanged` 확인. api2를 껐다 켜자 `다시 연결 중` → `실시간 연결됨`과 재조회 1회 확인. 새로고침 후 새 콘솔 오류 없음. rest 모드(같은 api2)에서 SSE `dashboard-changed` → `GET /api/dashboard` 재조회로 갱신되고 라벨이 `SSE·재조회`인 것 확인.
- 병합 후 회귀: master에서 web lint·tsc·테스트 33개·build 통과. `api/`·`api2/`·`simulator/`는 바꾸지 않았다.
- 작업 커밋: `390853f`
- 병합 커밋: `8522cf8` (master --no-ff)

