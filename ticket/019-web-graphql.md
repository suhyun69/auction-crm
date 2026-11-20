# 019 — web 대시보드 GraphQL 연결

- 상태: IN_PROGRESS
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
- [ ] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.
