# 021 — 시뮬레이터 제어 Origin 검사: 브라우저가 접속한 Host와 비교

- 상태: IN_PROGRESS
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
- [ ] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.
