# 012 — 경매 대시보드 시뮬레이션 설정과 시작

- 상태: IN_PROGRESS — 구현·검증·병합 완료, 실제 API live 확인만 남음
- 담당: 루트(시뮬레이터 세션 계약·통합), web(대시보드 화면·설정 모달)
- 선행: 011 완료
- 브랜치: codex/012-dashboard-simulation-control
- worktree: 미사용 — 통합 브랜치 작업 디렉터리에서 구현
- 병합 대상: master

## 배경

지금까지 시뮬레이션은 `/simulator` 별도 화면에서만 시작할 수 있었고, 실행 구성은 미리 준비된 시나리오 JSON 3개로 고정이었다. 경매 대시보드를 보는 중에 원하는 참가자 구성으로 바로 경매를 만들 수 있게 한다.

## 작업과 완료 기준

- [x] 경매 대시보드 상단에 `시뮬레이션 설정`과 `시뮬레이션 시작`을 추가한다.
- [x] `시뮬레이션 설정`은 모달에서 참가자 인원, 기본 성향, 기본 예산, 실행 모드를 정한다. 기본 성향·예산은 전체 참가자에 적용한다.
- [x] 모달에서 참가자 한 명을 선택해 이름·성향·예산 상한·입장 시각을 개별로 바꾼다. 목록에서 각자의 현재 성향·예산을 구분할 수 있다.
- [x] `랜덤`으로 인원·성향·예산·입장 시각을 한 번에 다시 뽑는다. 실행 모드는 유지하고, 뽑은 구성은 언제나 그대로 실행할 수 있다.
- [x] `시뮬레이션 시작`은 저장한 구성 그대로 경매를 시작한다. 실행 중에는 같은 자리에서 일시정지·재개·중지를 조작한다.
- [x] `시뮬레이션 설정`과 `시뮬레이션 시작` 사이에서 배속을 정한다. 실행 중 변경은 바로 반영하고, 시작 시에는 선택한 배속으로 실행한다.
- [x] `/simulator` 화면과 상단 탭 이동을 삭제하고 대시보드 하나로 합친다. 남는 컴포넌트·스타일·헬퍼도 함께 정리한다.
- [x] 실행이 끝나면 완료·중지·오류를 구분해 알리고 최종 최고가·낙찰 예정자·승인/기각 수를 함께 보여준다. 확인으로 닫는다.
- [x] 참가자를 선택하면 초기 설정(성향·예산·입장 시각)과 응찰 시도 내역을 모달로 보여준다. 실행 중 참가자 묶음과 대시보드 순위 행 양쪽에서 열 수 있다.
- [x] 시도 내역은 attempt와 bid를 같은 멱등 키로 묶어 승인·기각·응답 없음을 구분한다.
- [x] 세션 `start`가 준비된 `scenarioId` 외에 직접 구성한 `scenario` 객체를 받는다. 기존 `parseScenario`와 동일한 규칙으로 서버가 다시 검증하고, 잘못된 설정은 사유를 담아 400으로 거부한다.
- [x] 직접 구성한 시나리오는 예약 ID `custom` 한 자리만 차지한다. 준비된 시나리오 목록을 바꾸지 않고, 검증에 실패한 요청은 저장된 구성을 덮어쓰지 않는다.
- [x] CLI와 서버 세션 계약을 보존한다. 준비된 시나리오 JSON 3개는 CLI에서 계속 사용한다.
- [x] 이름 중복·빈 이름·범위 밖 예산과 입장 시각을 화면에서 안내하고 저장을 막는다. 인원은 2~12명으로 제한한다.
- [x] 세션 테스트·웹 테스트·lint·타입·production build와 데스크톱·모바일 브라우저 동작을 검증한다.
- [x] 대시보드 실행 경로와 고정값(가상 시간 60초, tick 1초, 최소 인상 폭 1,000원, 시드 42)을 문서화한다.
- [ ] 실제 Spring API·PostgreSQL로 live 모드를 확인한다. — Docker 미실행. 계약이 같은 임시 HTTP 스텁으로 대체 검증했다.
- [x] 커밋과 `--no-ff` 병합, 병합 후 회귀 확인.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `simulator/session.mjs` | `CUSTOM_SCENARIO_ID`/`MAX_CUSTOM_PARTICIPANTS`, `definitions()`, `resolve()` 추가. `start`가 직접 구성한 시나리오를 받고 검증 순서를 입력 검증 → custom 저장으로 정리. 실행 기록이 `attempt`를 포함하도록 바꾸고 보관 한도를 `MAX_RUN_EVENTS`(200)로 올림 |
| `simulator/tests/session.test.mjs` | 직접 구성 실행·거부·예약 ID와 attempt 보존 테스트 4개 추가 |
| `web/src/lib/simulator/setup.ts` | 신규. 설정 기본값, 인원 증감, 전체 적용, 개별 수정, 랜덤 구성, 검증, 시나리오 변환 |
| `web/tests/simulator-setup.test.mjs` | 신규. 랜덤 구성 유효성·분포·재현성과 증감·전체 적용·검증 테스트 |
| `web/package.json` | 테스트 컴파일 대상에 `setup.ts` 추가 |
| `web/src/components/simulator/simulation-setup-dialog.tsx` | 신규. 설정 모달과 `랜덤` 버튼 |
| `web/src/components/simulator/simulation-launcher.tsx` | 신규. 대시보드 실행 바와 세션 연결(폴링 1초), 배속 선택, 종료 알림, 참가자 묶음 |
| `web/src/lib/simulator/history.ts` | 신규. attempt·bid를 멱등 키로 묶는 참가자별 시도 내역과 이름으로 참가자 찾기 |
| `web/tests/simulator-history.test.mjs` | 신규. 시도 내역·미확정 시도·이름 매칭 테스트 |
| `web/src/components/simulator/participant-detail-dialog.tsx` | 신규. 초기 설정과 응찰 시도 내역 모달 |
| `web/src/components/dashboard/live-dashboard.tsx` | 실행 바 배치, 실행 상태 보관, 참가자 상세 모달 연결 |
| `web/src/components/dashboard/dashboard-view.tsx` | 시뮬레이션 참가자 행에 배지와 상세 열기 추가 |
| `web/src/app/simulator/page.tsx`, `web/src/components/simulator/simulator-panel.tsx`, `web/src/components/app-navigation.tsx` | 삭제. 대시보드 하나로 합침 |
| `web/src/lib/simulator/client.ts` | 패널과 함께 쓰이던 `shouldSyncSimulationSelection` 제거 |
| `web/src/lib/simulator/types.ts` | `CustomScenario`, `start` 명령 확장, 이벤트의 `idempotencyKey` |
| `web/src/app/globals.css` | 실행 바·모달·참가자 묶음·상세 스타일과 모바일 대응, 삭제된 화면의 스타일 정리 |
| `README.md`, `simulator/README.md` | 대시보드 실행 경로와 고정값 문서화 |

## 결과

- 변경 요약: 경매 대시보드 하나에서 참가자 구성을 모달로 정하거나 `랜덤`으로 뽑고, 배속을 고른 뒤 실행·일시정지·중지한다. 실행이 끝나면 결과를 알리고, 참가자를 선택하면 초기 설정과 응찰 시도 내역을 모달로 본다. 서버 세션이 직접 구성한 시나리오를 준비된 시나리오와 같은 규칙으로 검증해 `custom` 한 자리에 보관하며, `/simulator` 화면은 삭제하고 CLI 경로는 그대로다.
- 랜덤 범위: 인원 2~12명, 성향 3종, 예산 30,000~1,000,000원(1만원 단위), 입장 0~30초(1초 단위). 적어도 한 명은 0초에 입장하고 입장 순서대로 정렬한다. 60초 경매에서 늦게 들어온 참가자도 경쟁할 시간이 남도록 입장은 앞쪽 절반에서 뽑는다. 실행 모드는 랜덤 대상이 아니다.
- 검증: `npm run test:simulator` 70개 통과(신규 4개 포함), `web` 19개 통과(신규 8개 포함. 랜덤 구성 300회가 모두 검증을 통과하고 인원·성향·예산·입장이 실제로 분포하는지, 시도 내역이 멱등 키로 묶이고 미확정 시도가 남는지 확인), `npm run lint` 경고 0, `npx --no-install tsc --noEmit` 통과, `npm run build -- --webpack` 통과(`/simulator` 라우트 사라진 것 확인).
- 브라우저 검증(Next dev 3100): 미리보기 모드에서 인원 4→6, 기본 성향 일괄 충동형, 박서연만 신중형·900,000원 개별 변경 후 시작 → 세션 조회에서 `박서연/cautious/900000/active`, 150,000원 참가자 전원 상한 도달 `retired` 확인. 랜덤 연속 실행에서 9명·8명으로 매번 달라지고 뽑은 구성이 그대로 적용됨을 확인. 20× 실행 완료 후 `시뮬레이션 경매가 끝났습니다 · 최종 최고가 235,343원 · 한예준 · 응찰 89회(승인 89 · 기각 0)` 알림과 확인 닫기, 참가자 묶음에서 한예준 상세(충동형·960,000원·17초 입장, 시도 16 · 승인 16, 59/57/51초 기록) 확인. 계약이 같은 임시 HTTP 스텁 API로 live 모드를 돌려 대시보드가 `실시간 연결됨`·총 응찰 63회·최고가 149,267원으로 갱신되고, 순위 행의 `시뮬레이션` 배지를 눌러 같은 상세(김민서 경쟁형·150,000원·0초·시도 18)가 열리는 것을 확인. 실행 중 설정 버튼 비활성, 이름 중복 저장 차단, 1024px·375px 가로 넘침 없음 확인. `git ls-files --others --ignored` 소스 숨김 검사 통과.
- 미검증: 실제 Spring API·PostgreSQL을 띄운 live 모드. Docker 미실행으로 대신 같은 HTTP 계약의 임시 스텁(저장소에 포함하지 않음)으로 확인했다. 스텁은 멱등 키·승인 규칙·SSE 알림만 흉내내므로 동시성·영속성은 010·009에서 검증된 기존 경로에 의존한다.
- 병합 후 회귀: master에서 시뮬레이터 70개·웹 19개 테스트, lint, `tsc --noEmit`, production webpack build 통과. `api/`는 이 티켓에서 변경하지 않았다.
- 작업 커밋: `09bf440`
- 병합 커밋: `3bcdec2` (master --no-ff)
- 남은 항목: 실제 Spring API·PostgreSQL로 live 모드 확인. 사용자가 `docker compose up --build`로 직접 진행 중이며, 확인되면 상태를 DONE으로 바꾼다.
