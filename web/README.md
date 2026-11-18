# 경매 대시보드 Web

Next.js App Router + TypeScript + Tailwind CSS를 사용합니다. Node.js 20.9 이상과 npm이 필요합니다.

## 실행

```bash
npm ci
cp .env.example .env.local
npm run dev
```

기본 주소는 http://localhost:3000 입니다. worktree별 포트를 분리할 때는 `npm run dev -- --port 18707`을 사용합니다.

현재 007 화면은 **예시 데이터 미리보기**입니다. 실제 API 호출이나 응찰 등록은 수행하지 않습니다. 상단의 화면 상태 선택으로 기본 현황, 응찰 없음, 로딩, 오류, 긴 이름·큰 금액, 재연결 표현을 확인할 수 있습니다. 고객 이름과 금액 등 표시 타입은 `src/lib/dashboard/types.ts`, 재사용 가능한 화면은 `src/components/dashboard/dashboard-view.tsx`에 있습니다.

## API 연결 설정

008에서 브라우저는 `NEXT_PUBLIC_API_ORIGIN`(기본 `http://localhost:8080`)의 `GET /api/dashboard`를 직접 조회하고 `GET /api/events`에 EventSource로 직접 SSE 연결합니다. Next.js API 프록시는 사용하지 않습니다. 서버 내부 호스트명이 아닌 **브라우저에서 접근 가능한 원점**을 설정해야 합니다.

API의 허용 CORS 원점에 실제 웹 주소(예: `http://localhost:3000` 또는 worktree 포트)를 등록합니다. HTTPS 웹에서는 API도 HTTPS로 제공해야 합니다. `NEXT_PUBLIC_` 값은 브라우저 번들에 포함되므로 비밀 값을 넣지 않습니다. 실행 또는 빌드 후 값을 바꾸면 재시작/재빌드합니다. SSE `ready`와 재연결 후 전체 조회, `dashboard-changed` 수신 후 재조회는 008에서 구현합니다.

## 검증 및 프로덕션 실행

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
npm run start
```

Turbopack가 내부 포트 바인딩 제한으로 실행되지 않는 환경에서는 `npm run build -- --webpack` 및 `npm run dev -- --webpack --port 18707`을 사용합니다. Tailwind 표준 PostCSS 설정으로 두 번들러를 지원하며, 시스템 글꼴을 사용하므로 빌드 중 외부 폰트 다운로드가 필요하지 않습니다.
