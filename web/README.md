# 경매 대시보드 Web

Next.js App Router + TypeScript + Tailwind CSS를 사용합니다. Node.js 20.9 이상과 npm이 필요합니다.

## 실행

```bash
npm ci
cp .env.example .env.local
npm run dev
```

기본 주소는 http://localhost:3000 입니다. worktree별 포트를 분리할 때는 `npm run dev -- --port 18707`을 사용합니다.

메인 화면은 실제 API 데이터를 조회합니다. 응찰 등록은 외부 시스템이 API로 수행하며 대시보드는 현황을 표시합니다. API를 먼저 실행하세요. 고객 이름과 금액 등 표시 타입은 `src/lib/dashboard/types.ts`, 화면은 `src/components/dashboard/dashboard-view.tsx`에 있습니다. `fixtures.ts`는 개발 참고 자료이며 메인 화면에 포함되지 않습니다.

## API 연결 설정

브라우저는 `NEXT_PUBLIC_API_ORIGIN`(기본 `http://localhost:8080`)의 `GET /api/dashboard`를 직접 조회하고 `GET /api/events`에 EventSource로 직접 SSE 연결합니다. Next.js API 프록시는 사용하지 않습니다. 서버 내부 호스트명이 아닌 **브라우저에서 접근 가능한 원점**을 설정해야 합니다.

`NEXT_PUBLIC_API_PROTOCOL=graphql`(api2 전용)이면 대시보드를 GraphQL로 연결합니다. 최초 진입과 WebSocket (재)연결 때 `query dashboard`(POST `/graphql`)로 전체를 읽고, 이후에는 `subscription dashboardChanged`(graphql-ws, 같은 `/graphql` 경로)가 보내 주는 최신 대시보드를 다시 조회하지 않고 바로 그립니다. 조회 중에 더 새 구독 메시지를 이미 그렸다면 늦게 온 조회 결과는 버립니다. 기본값 `rest`는 아래 SSE 방식이며 Spring api와 api2 모두에서 동작합니다.

API의 허용 CORS 원점에 실제 웹 주소(예: `http://localhost:3000` 또는 worktree 포트)를 등록합니다. HTTPS 웹에서는 API도 HTTPS로 제공해야 합니다. `NEXT_PUBLIC_` 값은 브라우저 번들에 포함되므로 비밀 값을 넣지 않습니다. 실행 또는 빌드 후 값을 바꾸면 재시작/재빌드합니다. 최초 진입, SSE 연결/`ready`와 재연결 후 전체 조회하며, `dashboard-changed` 수신 시 재조회합니다. 동시에 하나의 조회만 수행해 응답 순서를 보장하며, 진행 중인 조회에 변경이 오면 응답을 반영한 뒤 후속 조회하여 최신 상태를 복원합니다. 연속 변경은 하나의 후속 조회로 합칩니다. 조회 실패 시 마지막 데이터와 재시도 버튼을 표시하며, 연결 복구 시 최신 데이터를 다시 가져옵니다. 화면을 떠나면 HTTP 요청과 SSE 연결 및 타이머를 정리합니다.

## 검증 및 프로덕션 실행

```bash
npm run lint
npm test
npx --no-install tsc --noEmit
npm run build
npm run start
```

Turbopack가 내부 포트 바인딩 제한으로 실행되지 않는 환경에서는 `npm run build -- --webpack` 및 `npm run dev -- --webpack --port 18707`을 사용합니다. Tailwind 표준 PostCSS 설정으로 두 번들러를 지원하며, 시스템 글꼴을 사용하므로 빌드 중 외부 폰트 다운로드가 필요하지 않습니다.

## 웹 시뮬레이터

`/simulator`에서 시나리오와 실제 경매/미리보기를 선택하고 시작·일시정지·재개·중지·배속을 조작한다. 참가자의 예산 상한·성향·입장 시각·현재 상태와 최근 응찰을 표시한다. 대시보드와 상단 메뉴로 이동할 수 있다.

실행은 브라우저가 아닌 Next Node 서버의 단일 공유 메모리 세션에 있다. 여러 탭과 새로고침은 같은 실행을 보며, 화면을 닫아도 실행을 중지하지 않는다. 서버를 재시작하면 이 제어 세션은 초기화된다. 실제 API 원점은 서버 환경의 `SIMULATOR_API_ORIGIN`, `NEXT_PUBLIC_API_ORIGIN`, `API_PORT`(기본8080) 순으로 선택한다. 실제 실행은 기존 경매에 응찰을 추가하고, 미리보기는 API에 접근하지 않는다.
