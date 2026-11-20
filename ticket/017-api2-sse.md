# 017 — api2 SSE: 대시보드 변경 알림

- 상태: DONE
- 담당: api2(루트가 직접 수행)
- 선행: 016 병합 완료
- 브랜치: codex/017-api2-sse
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

web의 rest 모드는 `GET /api/events`(SSE)로 변경 알림을 받고 대시보드를 다시 읽는다. `api/`와 같은 이벤트 계약을 api2에 만든다.

## 작업과 완료 기준

- [x] 연결하면 `ready`, 새 응찰이 커밋된 뒤마다 `dashboard-changed`(데이터 `{}`)를 보낸다. 기각도 새 기록이라 알리고, 멱등 재전송·검증 실패·409처럼 기록이 없으면 알리지 않는다.
- [x] heartbeat 주석을 주기적으로 보내고(기본 15초), 제한 시간(기본 30분)이 지나면 연결을 닫는다. 두 값은 환경 변수로 바꾼다.
- [x] 연결이 끊기거나 제한 시간이 지나면 구독을 정리한다. 서버 종료 시 열린 연결을 닫아 종료를 막지 않는다.
- [x] 알림 처리 중 오류가 나도 이미 커밋된 응찰의 응답은 바뀌지 않는다.
- [x] `Content-Type: text/event-stream`, 캐시 금지, `X-Accel-Buffering: no`, 허용 원점 CORS.
- [x] e2e 테스트(두 구독자·heartbeat·재연결·알림 조건·정리·제한 시간·종료)와 `scripts/verify_acceptance.py`를 api2로 실행해 통과한다.
- [x] 학습 노트에 017 개념을 정리한다.
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 결과

- 변경 요약: `AuctionService`가 `em.transactional()`이 끝난 뒤(커밋 후) 새 기록이 생긴 경우에만 `@nestjs/event-emitter`로 `auction.bid-recorded`를 보낸다. 받는 쪽 예외는 잡아서 로그만 남겨 커밋된 응찰의 응답을 지킨다. `AuctionEventsController`는 `@Sse('events')`로 연결마다 Observable을 돌려준다: `ready`를 보낸 뒤 이벤트 리스너(`fromEvent`)와 heartbeat 주석(`interval`)을 합치고, 제한 시간(`timer`)이나 서버 종료(`beforeApplicationShutdown`)에 끝낸다. 간격·제한 시간은 `AUCTION_EVENTS_HEARTBEAT_MS`·`AUCTION_EVENTS_TIMEOUT_MS`(기본 15초·30분). SSE 헤더(`text/event-stream`, no-store 포함 캐시 금지, `X-Accel-Buffering: no`)는 Nest가 붙인다. `scripts/verify_acceptance.py`에 `--impl api2`를 더했다(기본은 기존 Spring jar).
- 검증: lint 경고 0, `tsc --noEmit`·build 통과. 단위 8개, e2e 44개(SSE 6개 추가: 두 구독자 ready·heartbeat·변경·재연결과 구독 정리, 기각은 알리고 재전송·400·409는 알리지 않음, 받는 쪽 실패에도 응찰 200, CORS, 제한 시간 종료와 구독 정리, 서버 종료 시 2초 안에 연결 종료) 통과.
- 수용 테스트: `python3 scripts/verify_acceptance.py --impl api2` 통과(HTTP 판정·정규화·엄격한 입력·재전송/충돌·동시 응찰, SSE 두 구독자 각 ready + 정확히 25건, 재시작 후 같은 요약·순위·시각과 최초 재전송 응답). SIGTERM으로 열린 SSE가 있는 api2가 바로 종료되는 것도 이 과정에서 확인됐다.
- web 연동: 임시 PostgreSQL + api2(18080)에 web 개발 서버를 `NEXT_PUBLIC_API_ORIGIN`·`SIMULATOR_API_ORIGIN=http://localhost:18080`으로 붙여 브라우저에서 live 실행. 대시보드 `실시간 연결됨`, 응찰마다 SSE `dashboard-changed` → 재조회로 갱신, 호출 흐름 패널에 SSE·재조회 표시, 콘솔 오류 없음. api2 DB에 응찰 17건 저장 확인.
- `api/`와 다른 점: 허용하지 않은 원점의 CORS 사전 요청에 `api/`는 403, api2는 허용 헤더 없는 204(브라우저는 둘 다 차단). heartbeat 주석은 `:heartbeat` 대신 `: heartbeat`(SSE 파서는 같게 무시).
- 미실행: 수용 스크립트의 기존 Spring 경로(`--impl api`)는 이번에 jar를 빌드해 돌리지 않았다. 해당 분기는 들여쓰기만 바뀌었고 `py_compile`과 `--help`로 구문을 확인했다.
- 병합 후 회귀: master에서 build, 단위 8개, e2e 44개, `verify_acceptance.py --impl api2` 통과. `api/`·`web/`·`simulator/`는 바꾸지 않았다.
- 작업 커밋: `7b110f7`
- 병합 커밋: `450c570` (master --no-ff)

