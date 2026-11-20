# 021 — 시뮬레이터 제어 Origin 검사: 브라우저가 접속한 Host와 비교

- 상태: DONE
- 담당: web(루트가 직접 수행)
- 선행: 020 병합 완료(020 검증 중 발견)
- 브랜치: codex/021-control-origin-host
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

`POST /api/simulator`는 다른 사이트의 페이지가 실행을 조작하지 못하게 Origin을 서버 주소(`request.url`)와 비교한다. Compose에서 `WEB_PORT`를 3000이 아닌 값으로 내보내면 컨테이너 안 Next는 `localhost:3000`으로 요청 주소를 만들어, 브라우저 원점(예: `http://localhost:3102`)과 달라 시작·일시정지·중지가 모두 403이 됐다. 프록시 뒤에서도 같은 문제가 생긴다.

## 작업과 완료 기준

- [x] Origin이 서버 주소와 다르면 브라우저가 실제로 보낸 `Host`(프록시면 `X-Forwarded-Host` 첫 값)와도 비교한다. Origin이 없는 요청(CLI)은 지금처럼 통과, 다른 원점·`null` 원점은 403.
- [x] 단위 테스트(포트 매핑·프록시 허용, 다른 원점·다른 포트·`null` 거부).
- [x] Compose(`WEB_PORT=3102`)에서 브라우저 시작 버튼으로 실행을 확인한다.
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: `checkControlOrigin()`이 Origin을 `request.url`과 먼저 비교하고, 다르면 `X-Forwarded-Host` 첫 값 또는 `Host`와 호스트(포트 포함)를 비교한다. 다른 사이트의 페이지는 브라우저가 붙이는 Host를 바꿀 수 없으므로 교차 출처 차단은 유지된다. Next Server Actions의 Origin·Host 비교와 같은 방식이다.
- 검증: web 테스트 34개 통과(신규 1개), lint 경고 0, `tsc --noEmit`·build 통과. `COMPOSE_PROJECT_NAME=auction-crm-021 WEB_PORT=3102 API_PORT=18082 DB_PORT=55434 docker compose up --build`에서 브라우저 `시뮬레이션 시작` 버튼의 `POST /api/simulator`가 200으로 실행을 시작(이전 403)하고 대시보드가 갱신되는 것을 확인. 같은 컨테이너에 `Origin: http://evil.example`로 보낸 제어 요청은 403. 확인 후 이 스택만 내렸고 사용자의 `auction-crm` 스택은 그대로다.
- 확인하지 못한 것: 같은 원점으로 curl에서 보낸 중지 요청이 Origin 검사는 통과했지만 400을 받았고, 스택을 내린 뒤라 원인(요청 본문의 세션·실행 ID 등)을 확인하지 못했다. 브라우저의 시작 요청은 정상 처리됐다.
- 병합 후 회귀: master에서 web 테스트 34개·lint·tsc·build 통과.
- 작업 커밋: `89e9d4a`
- 병합 커밋: `55fb7f7` (master --no-ff)

