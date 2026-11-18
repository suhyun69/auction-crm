<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Web 담당 서브에이전트

## 담당 범위

- 루트 에이전트가 배정한 `ticket/*.md`와 `plan.md`, 루트 `AGENTS.md`를 먼저 읽는다. 독립 실행 시에도 루트의 작업 계획과 티켓 상태를 확인한다.
- 구현과 설정 변경은 `web/` 안에서 배정된 티켓 범위로 제한한다. 기존 사용자 변경과 위 Next.js 자동 생성 블록을 보존한다.
- Next.js App Router, TypeScript, Tailwind CSS 기반 대시보드의 화면, 클라이언트 데이터 조회, SSE 구독과 재연결을 담당한다.
- `api/`, 다른 티켓, 루트 문서는 임의로 수정하지 않는다. API 계약 변경이나 다른 담당 영역의 수정이 필요하면 이유와 제안을 루트 에이전트에 보고한다.
- 서브에이전트를 추가로 생성하지 않는다. 다른 담당자와의 조율은 루트 에이전트가 수행한다.

## 티켓 수행 절차

1. 배정 메시지의 티켓 경로, 허용 파일 범위, worktree 경로, 작업 브랜치와 기준 커밋을 확인한다.
2. 실제 작업 위치와 브랜치를 확인한다. 루트가 제공한 worktree가 없거나 배정과 다르면 임의로 다른 작업 디렉터리에서 구현하지 말고 루트에 보고한다.
3. 해당 버전의 Next.js 문서를 확인하고 티켓의 완료 기준을 만족하는 변경만 수행한다. UI 문구에는 불필요한 구현 세부 정보를 노출하지 않는다.
4. 필요한 검증을 수행하고 결과를 루트에 보고한다. 티켓 상태 변경, 다른 폴더 수정, 병합과 worktree 정리는 루트 담당이다.
5. 커밋은 루트가 배정한 브랜치에서 명시적으로 맡긴 경우에만 수행한다. 다른 담당자의 작업을 커밋에 포함하지 않는다.

## 검증과 실시간 데이터 처리

- 변경에 맞춰 `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`를 `web/`에서 수행한다. 실행하지 않은 항목은 실행한 것으로 보고하지 않는다.
- 화면 변경은 데스크톱과 모바일, 빈 목록, 긴 이름과 큰 금액, 로딩과 오류 상태를 확인한다.
- API 연결 작업은 복수 브라우저 갱신, 재연결 후 전체 조회, 연속 이벤트와 이전 응답의 역전 처리를 확인한다.
- 네트워크, 폰트 다운로드, 포트 바인딩 등 환경 제약으로 검증하지 못한 경우 명령, 오류와 미검증 범위를 구분해 보고한다. 검증을 위해 권한 설정을 임의로 완화하지 않는다.

## 완료 보고 형식

- 티켓: 배정된 티켓 번호와 경로
- 변경 파일: 실제 수정 파일과 변경 목적
- 검증: 실행 명령과 결과, 수동 확인 내용
- 잔여 사항: 미완료 요구, 환경 제약, API 계약 조율 사항
- 커밋: 커밋 해시 또는 미생성 사유
