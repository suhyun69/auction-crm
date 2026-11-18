# Auction CRM

외부 응찰 요청을 판정하고 참가자 순위를 실시간으로 표시하는 경매 대시보드다.

## 구성

- `api/`: Java 21, Spring Boot, JPA, H2 기반 API.
- `web/`: Next.js App Router, TypeScript, Tailwind CSS 기반 대시보드.
- `plan.md`, `ticket/`: 구현 계약과 티켓별 진행·검증 기록.
- `AGENTS.md`, `.codex/agents/`: 루트 및 담당 서브에이전트 작업 지침.

## 개발 환경

JDK 21과 Node.js 20.9 이상, npm이 필요하다. 이 저장소는 Node 26.8.1/npm 11.19.0에서 생성됐으며 npm lockfile을 사용한다. Gradle은 저장소의 wrapper를 사용한다.

```bash
cd api
./gradlew bootRun
```

API는 기본 `http://localhost:8080`, Swagger는 `http://localhost:8080/swagger-ui.html`이다. 개발 데이터는 `api/data/`의 파일 H2에 저장된다. JDK가 여러 개면 `JAVA_HOME`을 JDK 21 설치 경로로 지정한다.

별도 터미널에서 웹을 실행한다.

```bash
cd web
npm ci
npm run dev
```

웹은 기본 `http://localhost:3000`이다. 각 서버는 터미널에서 Ctrl+C로 종료한다. 응찰 API와 화면은 후속 티켓에서 구현한다.

## 검증

```bash
cd api
./gradlew test
```

```bash
cd web
npm run lint
npx --no-install tsc --noEmit
npm run build
```

API 테스트는 인메모리 H2를 사용한다. 개발 DB를 테스트로 초기화하지 않는다.

## 티켓과 worktree

티켓별 `codex/<번호>-<작업명>` 브랜치를 생성하고 독립 worktree에서 구현·검증한 뒤 루트가 `master`에 `--no-ff` 병합한다. 루트는 티켓 기록과 통합 검증을 담당한다.

동시 실행할 경우 API는 `--server.port`와 `--spring.datasource.url`, 웹은 `npm run dev -- --port <번호>`로 포트와 DB 경로를 분리한다. 개발 산출물, DB, 환경 비밀 파일은 Git에서 제외하며 `.env.example`만 예시로 추적한다.

환경에서 Turbopack의 내부 포트 생성이 제한되면 `npm run build -- --webpack`으로 빌드를 검증할 수 있다. 기본 템플릿의 Google Fonts는 빌드 시 네트워크 접근이 필요하다.
