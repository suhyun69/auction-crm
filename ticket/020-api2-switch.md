# 020 — API 연결을 api2로 전환

- 상태: IN_PROGRESS
- 담당: 루트(통합 실행·Compose·문서), api2/web(검증)
- 선행: 019 병합 완료
- 브랜치: codex/020-api2-switch
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

015~019에서 만든 api2(NestJS)와 web의 GraphQL 연결을 기본 실행 경로로 삼는다. `api/`(Spring)는 지우지 않고 설정으로 계속 고를 수 있게 둔다.

## 작업과 완료 기준

- [x] `npm run dev`가 기본으로 api2를 띄우고 web을 graphql 모드로 연결한다. `API_IMPL=api`이면 Spring을 띄우고 web을 rest 모드로 연결한다. 직접 지정한 `NEXT_PUBLIC_API_PROTOCOL`은 우선한다.
- [x] api2 Docker 이미지(Node 22)를 만들고 `docker compose up --build`의 api 서비스를 api2로 바꾼다. web 이미지는 연결 방식을 빌드 인자로 받는다. Spring은 `API_IMPL=api NEXT_PUBLIC_API_PROTOCOL=rest`로 고른다.
- [x] 수용 테스트 스크립트의 기본 대상을 api2로 바꾸고 `--impl api`로 Spring을 고른다.
- [x] README·plan·AGENTS 문서를 api2 기준으로 고친다.
- [x] `npm run dev`(기본·`API_IMPL=api` 시작 확인)와 `docker compose up --build`(api2)로 브라우저에서 시뮬레이션 실행을 확인한다.
- [ ] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.
