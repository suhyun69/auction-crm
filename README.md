# Auction CRM

외부 응찰 요청을 판정·저장하고, 참가자 순위와 요약 숫자를 실시간으로 보여주는 경매 대시보드다.

## 구성과 환경

- `api/`: Java 21, Spring Boot, JPA, PostgreSQL(개발, Docker), 인메모리 H2(자동 테스트). 기존 헥사고날 구조와 ArchUnit 규칙을 유지한다.
- `web/`: Next.js App Router, React, TypeScript, Tailwind CSS.
- `plan.md`, `ticket/`: API 계약·작업 범위·티켓별 검증 및 병합 기록.
- `AGENTS.md`, `.codex/agents/`: 루트와 web/api 담당자의 작업 지침.

JDK 21, Node.js 20.9 이상, npm, Docker(Compose v2 포함, 예: Docker Desktop)가 필요하다. 실제 검증 환경은 JDK 21.0.10 / Node 26.8.1 / npm 11.19.0이다. Gradle은 저장소 wrapper를 사용하고 웹 의존성은 npm lockfile로 설치한다. 통합 검증 스크립트는 Python 3.9 이상 표준 라이브러리만 사용한다.

## 로컬 실행

저장소 루트에서 웹 의존성을 처음 한 번 설치한 뒤 다음 명령으로 Docker·PostgreSQL·API·웹을 함께 실행한다. Docker가 꺼져 있으면 Docker Desktop을 자동으로 켜고 준비될 때까지 기다린다(기본 120초, `DOCKER_START_TIMEOUT_MS`로 조정).

```bash
npm --prefix web ci
npm run dev
```

`npm run dev`는 루트 [`compose.yaml`](compose.yaml)의 PostgreSQL 컨테이너를 먼저 제거하고 새로 만든 뒤 API와 웹을 띄운다. DB 데이터는 컨테이너의 tmpfs에만 있으므로 **실행할 때마다 빈 DB에서 시작**한다. Ctrl+C로 두 서버와 자식 프로세스, DB 컨테이너를 함께 정리한다. 한 서버가 실패하거나 종료돼도 다른 서버를 종료한다. 통합 명령은 macOS/Linux에서 동작하며 추가 npm 패키지는 필요 없다. macOS에서 `JAVA_HOME`이 없으면 설치된 JDK 21을 자동으로 선택한다.

포트를 바꾸면 웹 API 주소와 API의 CORS 원점도 기본값을 함께 맞춘다.

```bash
API_PORT=8081 WEB_PORT=3001 DB_PORT=5433 npm run dev
```

`NEXT_PUBLIC_API_ORIGIN`이나 `AUCTION_WEB_ALLOWED_ORIGINS`를 명령 실행 환경에서 직접 지정하면 그 값을 우선한다. 통합 실행의 웹 API 주소는 `.env.local`보다 우선한다. Turbopack 사용이 제한된 환경에서는 `npm run dev -- --webpack`으로 실행한다. 두 서버 로그는 `[api]`, `[web]` 접두사로 구분한다.

### Docker Compose로 전부 실행

JDK·Node 없이 Docker만으로 DB·API·웹을 모두 컨테이너로 실행할 수도 있다. Docker를 켠 상태에서 저장소 루트에서 실행한다. 코드 수정은 즉시 반영되지 않으며, 바꾼 뒤 다시 실행하면 `--build`가 이미지를 새로 만든다. 첫 빌드는 Gradle·npm 의존성 다운로드로 몇 분 걸린다.

```bash
docker compose up --build
```

Ctrl+C로 멈추고, 컨테이너까지 지우려면 `docker compose down`을 실행한다. DB는 tmpfs에 있으므로 멈췄다가 다시 시작해도 빈 DB로 시작한다. 포트는 `API_PORT=8081 WEB_PORT=3001 DB_PORT=5433 docker compose up --build`처럼 바꾸며, 웹 API 주소와 CORS 원점도 함께 맞춰진다. 웹 API 주소는 빌드할 때 이미지에 들어가므로 `API_PORT`를 바꾸면 `--build`가 필요하다.

### 개별 실행

개별 실행도 가능하다. API를 따로 띄울 때는 Docker를 켠 상태에서 먼저 DB를 준비한다. `npm run db:up`도 기존 컨테이너를 지우고 빈 DB로 새로 만든다. 끝나면 `npm run db:down`으로 정리한다.

```bash
# DB (저장소 루트)
npm run db:up
```

```bash
# API 터미널
cd api
./gradlew bootRun
```

```bash
# 웹 터미널
cd web
npm run dev
```

- 대시보드: [http://localhost:3000](http://localhost:3000)
- API 요약: [http://localhost:8080/api/dashboard](http://localhost:8080/api/dashboard)
- Swagger: [http://localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html)

최초에는 0건과 빈 참가자 목록을 표시한다. 아래 POST 예제를 실행하면 새로고침 없이 카드와 순위가 바뀐다. 화면에는 응찰 입력 폼이 없으며 외부 시스템이 API로 응찰한다.

통합 실행은 Ctrl+C 한 번으로 종료한다. 통합 명령은 SSE 정상 종료 대기를 기본 5초로 제한하며, `SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE`로 조정할 수 있다. 개별 API 실행은 열린 SSE 연결 때문에 종료 시 최대 약 30초 기다릴 수 있다. 개발 데이터는 실행마다 초기화되므로 유지할 데이터를 개발 DB에 두지 않는다. 데이터·빌드 산출물·환경 비밀 파일은 Git에서 제외한다.

## 가상 참가자 시뮬레이터

웹에서 조작하려면 `npm run dev` 실행 후 [대시보드](http://localhost:3000)를 연다. 별도 화면 없이 대시보드 상단에서 모두 조작한다.

- `시뮬레이션 설정`을 누르면 참가자 인원(2~12명)·기본 성향·기본 예산과 참가자별 이름·성향·예산·입장 시각을 모달에서 정한다. `랜덤`은 실행 모드만 유지한 채 인원·성향·예산·입장 시각을 한 번에 다시 뽑는다.
- 설정과 시작 사이의 `배속`으로 속도를 정하며 실행 중에도 바꿀 수 있다.
- `시뮬레이션 시작`으로 그 구성대로 경매를 시작하고, 같은 자리에서 일시정지·재개·중지를 조작한다.
- 실행이 끝나면 최종 최고가·낙찰 예정자·승인/기각 수를 알림으로 보여준다.
- 참가자를 누르면 초기 설정과 응찰 시도 내역을 모달로 본다. 실행 중 참가자 묶음과 대시보드 순위의 `시뮬레이션` 배지가 붙은 행 양쪽에서 열 수 있다.
- 넓은 화면(1100px 이상)에서는 오른쪽 절반의 `호출 흐름`이 Simulation Engine·API·Web 사이의 호출을 입체 그림의 패킷으로 보여준다. 응찰 요청·승인·기각·엔진 조회·SSE 알림·Web 재조회를 색으로 구분하고, 드래그나 방향키로 돌려보며 노드를 눌러 해당 노드의 최근 호출을 본다. 좁은 화면에서는 대시보드 아래에 접을 수 있게 놓인다.

- 시나리오 3개 중 선택하고 참가자 예산·성향·입장 시각을 확인한다.
- 실제 경매 또는 API를 호출하지 않는 미리보기를 선택해 시작한다.
- 일시정지·재개·중지·배속을 조작하고 참가자 상태·응찰 수·가상 시간·최근 활동을 확인한다.
- 실제 경매 모드의 응찰은 기존 대시보드에 실시간 반영된다.

웹 실행은 같은 Next 서버의 모든 탭이 공유한다. 화면 이동이나 새로고침으로 실행이 중복되지 않으며 탭을 닫아도 계속된다. 중지 버튼으로 끝내고, 웹 서버 재시작 시 제어 세션은 초기화된다.


```bash
# API 없이 자동 응찰 미리보기
npm run simulate:demo

# 실행 중인 API에 가상 참가자로 응찰
npm run simulate -- --speed 4
```

참가자별 예산·성향·입장 시각·반응 간격은 JSON으로 정의한다. 실행 중 `pause`, `resume`, `speed 4`, `status`, `stop`을 입력할 수 있다. 실제 실행은 기존 경매에 응찰을 추가하며 DB를 초기화하지 않는다. API가 8081이면 `--api http://localhost:8081`을 지정한다.

상세 설정·결과 저장·시드 재현 범위는 [시뮬레이터 문서](simulator/README.md)를 참조한다. 테스트는 `npm run test:simulator`로 실행한다.

## 응찰 API

```bash
curl -i http://localhost:8080/api/bid \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: example-001' \
  -d '{"customerName":"홍길동","amount":150000}'
```

```json
{
  "bidId": 1,
  "status": "ACCEPTED",
  "reason": "NEW_HIGHEST_BID",
  "submittedAmount": 150000,
  "highestAmount": 150000,
  "highestBidderName": "홍길동"
}
```

첫 응찰 또는 현재 최고가를 초과하면 승인된다. 동일가·낮은 금액은 `REJECTED / AMOUNT_NOT_HIGH_ENOUGH`이며 승인과 기각 모두 HTTP 200으로 저장한다. 기각은 기존 개인 승인 최고가를 낮추지 않는다.

- 이름: 앞뒤 공백 제거 후 1~100자. 동일한 이름은 같은 참가자다.
- 금액: 1~9,007,199,254,740,991원의 JSON 정수. 문자열·소수·지수 표기·잘못된 본문은 400이다.
- `Idempotency-Key`: 선택 헤더, 공백만인 값 제외 1~200자. 같은 키·정규화 이름·금액은 최초 응답을 돌려주며 추가 저장하지 않는다. 같은 키의 다른 요청은 409다. 키가 없으면 매 요청이 새 응찰이다.
- 응답 최고가는 요청 판정 시점 값이다. 재송신 응답은 이후 최고가가 변해도 최초 값을 유지한다.
- 잘못된 입력과 멱등 재송신은 새 응찰·참가자 수에 포함하지 않는다.

## 대시보드와 실시간 갱신

| 경로 | 역할 |
|---|---|
| `POST /api/bid` | 응찰 판정과 저장 |
| `GET /api/dashboard` | 요약과 참가자 전체 목록 |
| `GET /api/events` | SSE 연결과 변경 알림 |

대시보드는 총 응찰 수(승인·기각 포함), 현재 최고가, 참가자 수를 표시한다. 참가자별 승인 최고가 내림차순이며 승인 이력이 없는 참가자는 하단에 `—`로 표시한다. 응찰 횟수와 마지막 응찰 시각도 함께 표시한다. 금액은 원화, 화면 시각은 한국 시간이다.

응찰을 커밋한 뒤에만 `dashboard-changed` 이벤트를 전송한다. 브라우저는 최초·`ready`·재연결 때 전체 조회하고, 진행 중인 조회가 있으면 변경 신호를 모아 후속 조회한다. 조회 실패 시 기존 데이터를 유지하고 다시 시도할 수 있다. 과거 이벤트는 재생하지 않는다.

터미널에서도 이벤트를 확인할 수 있다.

```bash
curl -N http://localhost:8080/api/events
```

## 환경 변수와 포트

| 설정 | 기본값 | 의미 |
|---|---|---|
| 웹 `NEXT_PUBLIC_API_ORIGIN` | `http://localhost:8080` | 브라우저에서 접근할 API 원점 |
| API `SERVER_PORT` | `8080` | API 포트 |
| `DB_PORT` | `5432` | 호스트에 공개할 PostgreSQL 포트(compose와 API가 함께 사용) |
| API `DB_URL` | `jdbc:postgresql://localhost:${DB_PORT}/auction` | DB URL |
| API `DB_USERNAME` / `DB_PASSWORD` | `auction` / `auction` | 개발 DB 계정 |
| API `AUCTION_WEB_ALLOWED_ORIGINS` | `http://localhost:3000` | 허용 웹 원점, 여러 값은 쉼표로 구분 |
| API `AUCTION_EVENTS_HEARTBEAT_MS` | `15000` | SSE heartbeat 간격 |
| API `AUCTION_EVENTS_TIMEOUT_MS` | `1800000` | SSE 연결 timeout, 이후 자동 재연결 |

웹의 `.env.local`을 바꾼 뒤 개발 서버를 재시작한다. `NEXT_PUBLIC_*`는 브라우저 번들에 포함되므로 프로덕션에서는 **빌드할 때** 값을 설정하고 변경 시 다시 빌드한다. 브라우저가 API에 직접 접근하므로 웹 주소를 API의 CORS 허용 원점과 일치시켜야 한다. 호스트를 `127.0.0.1`로 바꾸거나 웹 포트를 바꾼 경우도 해당 원점을 허용 목록에 추가한다.

worktree마다 API/웹/DB 포트를 분리한다. Compose 프로젝트 이름도 worktree마다 달라야 컨테이너가 겹치지 않는다. 예: `COMPOSE_PROJECT_NAME=auction-crm-007 API_PORT=8081 WEB_PORT=3001 DB_PORT=5433 npm run dev`. 이 경우 웹 API 원점은 8081, API 허용 웹 원점은 `http://localhost:3001`로 자동 설정된다.

## 자동 검증

```bash
cd api
./gradlew test bootJar
```

```bash
cd web
npm ci
npm run lint
npx --no-install tsc --noEmit
npm test
npm run build -- --webpack
```

일반 환경에서는 `npm run build`도 사용할 수 있다. 이 작업 환경은 Turbopack 내부 포트 사용을 제한하므로 공식 `--webpack` 옵션으로 프로덕션 빌드를 검증했다. 시스템 글꼴을 사용해 Google Fonts 다운로드는 필요 없다. 빌드 후 `npm start`로 웹을 실행할 수 있다.

저장소 루트에서 실행하는 다음 스크립트는 별도 포트·임시 PostgreSQL 컨테이너·자체 API 프로세스를 사용한다(Docker 필요). 개발 DB에 접근하지 않고 종료 시 컨테이너를 제거한다.

```bash
python3 scripts/verify_acceptance.py
```

검증 내용: 승인·기각·재응찰, 이름 정규화, 입력 오류, 멱등 재송신·409 충돌, 동시 응찰 20회, 동일 키 동시 요청 10회, 두 SSE 연결에 신규 기록 이벤트만 25회 전달, 서버 재시작 후 동일한 요약·순위·시각·최초 응답 보존. API JAR 경로를 바꾸려면 `--jar /absolute/path/app.jar`를 지정한다.

## 브라우저 수용 검증 절차

1. 두 개의 별도 브라우저 세션에서 대시보드를 연다. 처음 접속하면 현재 DB 상태가 보이고 `실시간 연결됨`을 표시한다.
2. 서로 다른 이름으로 최고가보다 높은 응찰과 낮은 응찰을 POST한다. 두 화면의 응찰 수와 참가자 수가 갱신되고 승인 최고가 순서로 정렬되는지 확인한다.
3. 같은 멱등 키와 요청을 재송신한다. 응답과 카운트가 유지되는지 확인한다. 다른 금액에 같은 키를 쓰면 409인지 확인한다.
4. 연속 응찰 중 화면이 계속 갱신되는지 확인한다. 기각은 개인 최고가를 낮추지 않으며 변경된 행이 잠시 강조된다.
5. API를 종료하면 기존 데이터를 유지한 채 재연결 상태를 보이는지 확인한다. 같은 DB로 API를 재시작하고 다시 응찰하면 새로고침 없이 두 화면에 반영되는지 확인한다.
6. 조회 요청 실패 상태에서 다시 시도 버튼으로 복구하고, 모바일 폭과 긴 이름·큰 금액에도 가로 넘침 없이 읽을 수 있는지 확인한다.

008에서는 실제 두 Chromium 세션으로 위 흐름과 서버 재시작을 검증했다. 추가 제어 브라우저 검증으로 최초 조회/ready 사이 변경, 느린 조회 중 40개 이벤트, 최대 동시 조회 1개, 지속 이벤트 중 순차 갱신, 조회 503 후 재시도도 통과했다. 009 최종 검증은 API 105개, 웹 단위 테스트 5개와 lint·타입·프로덕션 빌드다. 티켓에 실제 커밋·병합 결과를 기록한다.

## 범위와 작업 방식

현재는 단일 경매, 단일 API 인스턴스, 소규모 참가자 전체 목록 조회를 대상으로 한다. 이름으로 참가자를 식별하므로 동명이인은 구분하지 못한다. 여러 경매·경매 종료/낙찰 확정·고객 ID·인증/인가·운영 DB 마이그레이션·배포·다중 서버 이벤트 전달은 후속 범위다.

티켓마다 별도 `codex/<번호>-<작업명>` 브랜치와 worktree에서 작업한다. 루트가 담당 web/api 에이전트에 배정하고 결과를 검토한 뒤 `master`에 `--no-ff` 병합한다. 소스가 ignore 규칙에 숨지 않았는지도 검사한다. 작업 내역은 `ticket/` 문서를 참조한다.
