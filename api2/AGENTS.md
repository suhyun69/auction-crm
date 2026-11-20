# api2 담당 작업 지침

## 담당 범위

- 루트 `AGENTS.md`, `plan.md`, 배정된 `ticket/<번호>-<작업명>.md`와 이 폴더의 `README.md`를 먼저 읽는다.
- 수정 범위는 `api2/`다. `api/`(Spring), `web/`, `simulator/`, 루트 문서는 루트가 조율한다.
- api2는 시뮬레이션 엔진과 web이 쓰는 계약만 제공한다: `POST /api/bid`, `GET /api/dashboard`, `GET /api/events`(SSE)와 GraphQL(`dashboard`, `submitBid`, `dashboardChanged`). 경로·필드·상태 코드·오류 본문·이벤트 이름은 `api/`와 같게 유지한다. 바꿔야 하면 구현 전에 루트에 알린다.
- 학습용 프로젝트다. 새 NestJS 개념을 쓰면 `README.md`의 학습 노트에 Spring 대응과 함께 남긴다.

## NestJS 버전과 규칙

- NestJS 12, MikroORM 7, Zod 4, Fastify 5다. 기억보다 새 버전일 수 있으니 `node_modules`의 타입·README와 https://docs.nestjs.com/llms.txt 의 해당 장을 확인한다.
- 공식 NestJS 에이전트 스킬이 `.agents/skills/`(`.claude/skills/`와 같은 내용)에 있다. 기능·데이터·테스트·운영 작업 전에 해당 스킬을 읽는다.
- 기능별 모듈 구조를 따른다(`src/<기능>/`에 module·controller·service·entities·스키마·spec). 컨트롤러는 HTTP만, 규칙과 데이터 접근은 서비스가 맡는다. ORM 엔티티를 그대로 응답하지 않는다.
- ESM 프로젝트다: 상대 import는 `.js`로 끝나고, `__dirname` 대신 `import.meta.dirname`을 쓴다. 주입받는 클래스는 `import type`으로 불러오지 않는다.
- 엔티티는 `defineEntity()` + `setClass()`로 정의하고 `src/mikro-orm.config.ts`의 `entities`에 등록한다. 스키마 변경은 `npm run migration:create`로 마이그레이션을 만든다.
- 요청 검증은 Zod 스키마를 쓴다(`@Body({ schema })`와 `StandardSchemaValidationPipe`).

## 검증

- `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`(Docker 필요)를 실행한다. 실행하지 못한 검사는 통과로 기록하지 않는다.
- e2e 테스트는 파일마다 Testcontainers PostgreSQL을 띄우고, 테스트 앱은 `new FastifyAdapter()`로 만든다. 개발 DB를 테스트에 쓰지 않는다.
- 서버를 띄워 확인했다면 PID로 종료한다. 다른 프로젝트 프로세스까지 잡는 `pkill -f`를 쓰지 않는다.
- 서브에이전트는 하위 에이전트를 만들지 않고, 커밋·병합·티켓 상태 변경은 루트가 한다.
