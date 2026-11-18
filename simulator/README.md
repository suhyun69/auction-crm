# 경매 참가자 시나리오 엔진

가상 참가자들이 각자의 예산, 성향, 입장 시각과 반응 속도로 `GET /api/dashboard`를 보고 `POST /api/bid`를 호출한다. 기존 대시보드에는 응찰 결과가 SSE로 반영된다. 엔진은 Node.js 표준 라이브러리만 사용하며 별도 패키지 설치가 필요 없다.

## 바로 실행

API 없이 예시 경매를 미리 본다. 60초의 가상 경매를 10배속으로 실행한다.

```bash
npm run simulate:demo
```

실제 경매는 첫 터미널에서 기존 `npm run dev`를 실행한 뒤 두 번째 터미널에서 시작한다.

```bash
npm run simulate
```

이 명령은 현재 API의 경매를 이어서 사용한다. DB를 초기화하거나 서버를 시작·종료하지 않는다. 기존 최고가가 모든 참가자의 예산을 넘으면 새 응찰이 없을 수 있다. 기존 참가자와 이름이 같으면 API 규칙대로 같은 사람으로 처리된다. 현재 개발 서버의 `npm run dev` 자체가 PostgreSQL을 새로 준비하는 기존 동작은 그대로다.

```bash
npm run simulate -- --api http://localhost:8081 --speed 4 --seed evening
npm run simulate -- --dry-run --speed 1000 --output simulator/runs/preview.json
npm run simulate -- --scenario simulator/scenarios/standard.json --output simulator/runs/live.json
```

`--dry-run`은 HTTP를 전혀 호출하지 않는 빈 로컬 시장이다. 실제 API 원점은 `--api`, `SIMULATOR_API_ORIGIN`, `http://localhost:${API_PORT 또는 8080}` 순으로 선택한다. 상대 파일 경로는 명령을 실행한 디렉터리 기준이다. 결과 파일은 기존 파일을 덮어쓰지 않으며 `simulator/runs/`는 Git에서 제외된다.

## 실행 제어

실행 중 명령을 입력하고 Enter를 누른다.

| 명령 | 동작 |
|---|---|
| `pause` | 진행 중인 tick이 완료된 후 가상 시간 정지 |
| `resume` | 계속 실행 |
| `speed 4` | tick 간 대기 시간을 4배속으로 변경 |
| `status` | 현재 가상 시각, 최고가, 승인·기각 수 표시 |
| `stop` | 중지하고 결과 저장 |
| Ctrl+C | 진행 중 HTTP 요청 취소, 중지 결과 저장 후 종료 |

배속은 0 초과 1000 이하이며 참가자의 예산이나 성향을 바꾸지 않는다. 실제 HTTP 응답 시간은 생략하지 않으므로 정확한 벽시계 시간이나 초당 요청 수를 보장하는 부하 시험 도구는 아니다. 한 tick 안에서는 참가자를 정의 순서대로 처리하며 HTTP 요청을 겹치지 않는다. 배속 변경은 현재 tick 또는 대기 이후부터 적용된다. 일시정지/중지는 경매 API 자체를 정지시키거나 이미 처리된 응찰을 취소하지 않는다.

종료 코드는 완료/`stop`은 0, 설정·API 오류는 1, Ctrl+C/종료 시그널은 130이다. 터미널 없이도 끝까지 실행할 수 있다.

## 시나리오 JSON

[standard.json](scenarios/standard.json)에 예시 참가자 6명이 있다. 최소 구성은 다음과 같다.

```json
{
  "version": 1,
  "name": "저녁 경매",
  "seed": 42,
  "durationMs": 60000,
  "tickMs": 1000,
  "minIncrement": 1000,
  "participants": [
    {
      "id": "minseo",
      "name": "김민서",
      "budget": 80000,
      "personality": "cautious",
      "joinAtMs": 0,
      "reactionMs": { "min": 3000, "max": 6000 },
      "increment": { "min": 1000, "max": 2000 },
      "participationProbability": 0.55,
      "maxBids": 50
    }
  ]
}
```

| 필드 | 의미 / 기본값 |
|---|---|
| `name` | 시나리오 이름, 필수 |
| `version` | 1 |
| `seed` | 정수 또는 문자열 난수 시드, 기본 42 |
| `durationMs` | 경매를 관찰하는 가상 시간, 기본 60000 |
| `tickMs` | 한 번의 판단이 진행하는 가상 시간, 기본 1000 |
| `minIncrement` | 실제 응찰의 최소 인상 폭, 기본 1000원 |
| 참가자 `id` | 실행 내 고유 식별자, 1~60자 |
| 참가자 `name` | API에 보내는 이름, 앞뒤 공백 제거 후 1~100자, 실행 내 고유 |
| `budget` | 이 경매에서 지불할 최대 금액, 필수 양의 정수 |
| `personality` | 아래 성향, 기본 competitive |
| `joinAtMs` | 가상 입장 시각, 기본 0 |
| `reactionMs` | 다음 판단까지 기다릴 무작위 범위, 성향별 기본값 |
| `increment` | 인상 폭 추첨 범위, 성향별 기본값 |
| `participationProbability` | 판단 기회마다 실제 응찰할 확률, 0~1 |
| `maxBids` | 이 참가자의 새 응찰 결정 상한, 기본 50 |

금액·시각·횟수는 안전한 정수 범위 안에서 검증한다. 예산은 **누적 지출 지갑이 아니라 한 물건에 낼 최대 가격**이다. 현재 선두는 자신을 상대로 가격을 올리지 않고, 다른 참가자에게 밀리면 다시 판단한다. 현재 최고가에 최소 인상 폭을 더할 예산이 없거나 응찰 상한에 도달하면 이탈한다. 마지막 참가자가 선두로 남아도 시나리오는 설정한 기간까지 관찰한다.

`increment.min/max`는 추첨 범위다. 예산에 닿으면 실제 인상 폭은 남은 예산만큼 줄어들 수 있으며 전역 `minIncrement`는 항상 보장한다. 반응 시각과 입장 시각은 다음 tick에서 평가하므로 `tickMs`보다 촘촘하게 행동하지 않는다. 기간 이후에 입장하도록 설정한 참가자는 이번 실행에서 대기 상태로 남는다.

| 성향 | 응찰 확률 | 반응 간격 | 인상 폭 기본값 |
|---|---|---|---|
| cautious — 신중형 | 55% | 3~6초 | 최소 인상 폭의 1~2배 |
| competitive — 경쟁형 | 90% | 1~2.5초 | 1~4배 |
| impulsive — 충동형 | 75% | 0.5~1.5초 | 1~8배 |

원하는 참가자마다 이 기본값을 덮어쓸 수 있다. 실제 API가 다른 참가자의 동시 응찰로 기각하면 응답의 최고가를 기준으로 다음 행동을 판단한다.

## 결과와 재송신

`--output` JSON에는 정규화된 시나리오, 실행 ID, 가상 시각, 참가자 상태, 승인/기각/오류 합계, 이벤트와 `unresolvedAttempts`가 담긴다. 참가자 상태는 `waiting`, `active`, `leading`, `retired`이고 실행 상태는 `ready`, `running`, `completed`, `failed`, `stopped`다.

네트워크 오류·timeout·429·5xx에는 최대 2회 추가 재시도를 하며, 한 요청당 기본 제한 시간은 5초다. 동일 논리 응찰은 재시도해도 동일한 `Idempotency-Key`를 사용한다. 키는 실행 ID·참가자 ID·시도 번호로 만든 고정 길이 ASCII 해시다. 다른 실행에는 새 실행 ID를 사용한다. 정상적인 `REJECTED` 응답과 409/전송 실패를 구분하며, 최종 오류가 나면 경매 판단을 이어가지 않고 실행을 중단한다.

응답을 받기 전에 중지·전송 실패가 발생하면 서버에서 이미 저장됐는지는 확정할 수 없다. 이 경우 `unresolvedAttempts`와 POST 직전 `attempt` 이벤트에 남긴 키·이름·금액으로 요청을 식별할 수 있다. 현재 버전은 저장 파일에서 중단 지점을 자동 복원하지 않는다.

같은 시드·같은 시나리오·같은 API 응답 순서면 판단과 인상 폭이 재현된다. 실행 ID·실제 시작/종료 시각은 매번 달라진다. 실제 DB의 기존 최고가나 다른 호출이 달라지면 같은 시드여도 결과가 달라질 수 있다. API 없는 dry-run은 독립적인 같은 초기 시장에서 비교할 수 있다.

## 검증

```bash
npm run test:simulator
```

코어 예산·선두 대기·지연 입장·시드 재현성, 입력 검증, 격리 HTTP 서버의 응답 유실/멱등 재시도, CLI pause/resume/배속/취소/결과 저장을 검증한다. API·웹 구현이나 Docker 시작/종료 스크립트는 변경하지 않는다.
