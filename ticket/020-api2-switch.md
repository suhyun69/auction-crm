# 020 — API 연결을 api2로 전환

- 상태: DONE
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
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: `scripts/dev.mjs`가 `API_IMPL`(기본 `api2`)을 읽어 api2는 `nest start --watch`(PORT·DB_HOST·허용 원점 전달), api는 기존 `gradlew bootRun`으로 띄운다. 웹에는 `NEXT_PUBLIC_API_PROTOCOL`을 api2면 `graphql`, api면 `rest`로 넘기되 직접 지정한 값을 우선한다. JDK 탐색은 Spring일 때만 한다. api2 의존성이 없으면 `npm --prefix api2 ci`를 안내한다. `api2/Dockerfile`(Node 22, 빌드 후 `node dist/main.js`)과 `.dockerignore`를 더했다. `compose.yaml`의 api는 `build: ./${API_IMPL:-api2}`이고, 두 구현이 각자 읽는 DB 변수(Spring `DB_URL`, api2 `DB_HOST`·`DB_PORT`·`DB_NAME`)를 함께 넘긴다. web 이미지는 `NEXT_PUBLIC_API_PROTOCOL` 빌드 인자(compose 기본 `graphql`)를 받는다. `verify_acceptance.py`의 기본 대상을 api2로 바꿨다(`--impl api`로 Spring). README(구성·실행·Compose·개별 실행·환경 변수·자동 검증), plan, AGENTS(api2 검증 기준), api2 README를 고쳤다.
- 검증(사용자의 기존 `auction-crm` Compose 스택을 건드리지 않도록 별도 프로젝트 이름과 포트 사용):
  - `npm run dev`(기본, `COMPOSE_PROJECT_NAME=auction-crm-020`, 웹 3101·API 18081·DB 55433): api2·웹 시작, 로그 `API(api2) … 대시보드 연결 graphql`, 브라우저에서 시뮬레이션 실행 중 `실시간 연결됨`, `/graphql` 조회 2회·SSE 0회로 구독 갱신. SIGINT로 두 서버와 DB 컨테이너 정리 확인.
  - `API_IMPL=api npm run dev`(같은 포트): Spring 시작, 로그 `대시보드 연결 rest`, 브라우저에서 SSE `dashboard-changed` → `GET /api/dashboard` 재조회로 갱신, GraphQL 요청 0회.
  - `docker compose up --build -d --wait`(`auction-crm-020c`, 웹 3102·API 18082·DB 55434): api2 컨테이너가 마이그레이션 적용 후 시작, 세 컨테이너 healthy, 웹 컨테이너의 엔진이 `http://api:8080`(api2)로 응찰(33건)하고 브라우저 대시보드가 GraphQL 구독으로 갱신. 확인 후 이 스택만 내렸다.
  - `docker compose config`로 `API_IMPL=api NEXT_PUBLIC_API_PROTOCOL=rest`가 `api/` 빌드와 rest 인자로 풀리는 것을 확인(Spring 이미지 빌드는 하지 않음).
- 기존 문제(이 티켓 변경과 무관, 후속 필요): Compose에서 `WEB_PORT`를 3000이 아닌 값으로 바꾸면, 컨테이너 안 웹은 3000으로 받으므로 시뮬레이터 제어 API(`POST /api/simulator`)의 Origin 검사가 브라우저 원점(예: `http://localhost:3102`)을 거부해 시작 버튼이 403으로 실패한다. 검증에서는 시작 명령만 컨테이너 내부 원점으로 보내 우회했다. 기본 포트(3000)에서는 생기지 않는다. → 021에서 수정.
- 참고: api2 시작 시 Fastify 경고 `FSTWRN004`(오류 처리기를 같은 범위에서 다시 설정)가 한 번 찍힌다. 018에서 Mercurius 등록 순서 때문에 의도적으로 처리기를 겹쳐 설정한 결과이며 동작에는 영향이 없다.
- 병합 후 회귀: master에서 `node --check scripts/dev.mjs`, `docker compose config`, api2 build·단위 8개·e2e 52개, `verify_acceptance.py`(기본 api2), web 테스트 33개·lint 통과.
- 작업 커밋: `f32d377`
- 병합 커밋: `c1b23ce` (master --no-ff)

