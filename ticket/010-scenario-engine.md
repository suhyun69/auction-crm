# 010 — 가상 경매 참가자 시나리오 엔진

- 상태: DONE
- 담당: 루트(통합·CLI·HTTP·문서), 시나리오 코어 담당 서브에이전트
- 선행 티켓: 009 완료
- 작업 브랜치: `codex/010-scenario-engine`
- 작업 worktree: `/private/tmp/auction-crm-worktrees/010`
- 병합 대상: master

## 범위

- [x] JSON으로 참가자 예산·성향·입장 시각·반응 간격·인상 폭과 실행 기간·시드를 정의한다.
- [x] 현재 최고가와 응찰 응답에 반응해 예산 안에서 결정한다. 본인이 선두이면 스스로 가격을 올리지 않는다.
- [x] `npm run simulate` CLI에 실제 API 실행, API를 호출하지 않는 dry-run, 배속, pause/resume/status/stop을 제공한다.
- [x] API 재시도는 같은 Idempotency-Key를 사용하고 실행별 키를 분리한다. 정상 기각과 전송 오류를 구분한다.
- [x] 참가자 상태·승인/기각·가상 시각·결과를 표시하고 선택한 파일로 JSON 결과를 저장한다.
- [x] 기존 API·웹·개발 DB 시작/종료 동작을 보존한다. 기존 데이터를 초기화하지 않는다.

## 완료 기준

- [x] 시드 재현성, 예산 상한, 본인 선두 대기, 지연 입장, 기각 반응, 종료/오류와 입력 검증을 테스트한다.
- [x] HTTP adapter와 CLI를 격리된 테스트 서버로 실제 호출해 멱등 재시도·중지·배속·dry-run·결과 저장을 검증한다.
- [x] 실행 명령·시나리오 스키마·예산의 의미·현재 DB 이어하기·시드 재현 범위를 문서화한다.
- [x] 검증과 리뷰 후 커밋·master 병합·완료 기록을 남긴다.

## 결과 기록

- 변경 요약: Node 표준 라이브러리 기반 가상 참가자 엔진, JSON 설정, 6인 예시, 실제 HTTP/dry-run, pause/resume/배속/중지, 멱등 재시도와 결과 저장 구현.
- 검증: npm run test:simulator 58개 통과. 실제 Spring API+격리 H2에서 6명 65건 응찰·최고가232057원, 결과/API 일치 및 예산 상한 확인. API bootJar 성공. 리뷰의 personality 배열 coercion과 timeout overflow 수정 및 회귀 검증. 도움말·문서 링크·diff/ignore 검사 통과.
- 작업 커밋: `6176e80`
- 병합 커밋: `aa0933a` (master --no-ff)
