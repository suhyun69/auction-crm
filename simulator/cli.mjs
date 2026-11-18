import { readFile, mkdir, open } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { parseScenario } from './scenario.mjs';
import { SimulationEngine } from './core.mjs';
import { createHttpClient, createDryRunClient } from './clients.mjs';

const help = `경매 참가자 시뮬레이터
사용: npm run simulate -- [옵션]
  --scenario <file>  시나리오 JSON (기본: simulator/scenarios/standard.json)
  --dry-run          HTTP/DB 접근 없이 로컬 시장에서 미리보기
  --api <origin>     실제 API 원점 (기본: http://localhost:8080)
  --seed <value>     시나리오 난수 시드 덮어쓰기
  --speed <number>   가상 시간 배속, 0 초과~1000 (기본: 1)
  --output <file>    시나리오·상태·이벤트 JSON 저장 (기존 파일 덮어쓰지 않음)
  --quiet           개별 참가자 이벤트 출력 생략
  --help            도움말
실행 중 입력: pause / resume / speed 4 / status / stop / help
예산은 한 경매에서 지불할 최대 가격입니다. 실제 실행은 현재 DB에 응찰을 추가합니다.`;

function options(argv) {
  const result = { scenario: fileURLToPath(new URL('./scenarios/standard.json', import.meta.url)), speed: 1, dryRun: false, quiet: false };
  const values = { '--scenario': 'scenario', '--api': 'api', '--seed': 'seed', '--speed': 'speed', '--output': 'output' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--quiet') result.quiet = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (values[arg]) {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${arg} 값이 필요합니다.`);
      result[values[arg]] = argv[++i];
    } else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  result.speed = parseSpeed(result.speed);
  return result;
}
function parseSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed <= 0 || speed > 1000) throw new Error('배속은 0 초과~1000이어야 합니다.');
  return speed;
}

async function main() {
  const opts = options(process.argv.slice(2));
  if (opts.help) { console.log(help); return; }
  const raw = JSON.parse(await readFile(resolve(opts.scenario), 'utf8'));
  if (opts.seed !== undefined) raw.seed = opts.seed;
  const scenario = parseScenario(raw);
  const apiOrigin = opts.api ?? process.env.SIMULATOR_API_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? 8080}`;
  const events = [];
  const control = new AbortController();
  let paused = false;
  let speed = opts.speed;
  let wake;
  let interrupted = false;
  const startedAt = new Date().toISOString();
  let output;
  const client = opts.dryRun ? createDryRunClient() : createHttpClient({ apiOrigin,
    onRetry: info => { events.push({ type: 'retry', ...info }); if (!opts.quiet) console.log(`[retry] ${info.path} 재시도 ${info.attempt}`); },
  });
  if (opts.output) {
    const path = resolve(opts.output);
    await mkdir(dirname(path), { recursive: true });
    output = await open(path, 'wx');
  }
  const engine = new SimulationEngine(scenario, { client, runId: randomUUID(), onEvent(event) {
    events.push(event);
    if (opts.quiet) return;
    const time = `[${(event.elapsedMs / 1000).toFixed(1)}s]`;
    if (event.type === 'bid') console.log(`${time} ${event.customerName}: ${event.amount?.toLocaleString('ko-KR')}원 → ${event.response?.status === 'ACCEPTED' ? '승인' : '기각'}`);
    else if (event.type === 'error') console.error(`${time} ${event.reason ?? event.message ?? 'API 호출 실패'}`);
    else if (event.customerName && event.type !== 'attempt') console.log(`${time} ${event.customerName}: ${event.type}${event.reason ? ` (${event.reason})` : ''}`);
  } });
  const status = () => {
    const state = engine.getState();
    console.log(`[status] ${paused ? 'paused' : state.phase} ${(state.elapsedMs / 1000).toFixed(1)}s, ${speed}x, 최고가 ${state.market.highestAmount.toLocaleString('ko-KR')}원, 승인 ${state.totals.accepted} / 기각 ${state.totals.rejected}`);
  };
  const stop = (reason, isSignal = false) => {
    interrupted ||= isSignal;
    engine.stop(reason);
    control.abort(new Error(reason));
    wake?.();
  };
  const onSignal = () => stop('interrupted', true);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const lines = createInterface({ input: process.stdin, terminal: false });
  lines.on('line', line => {
    const [command, value, extra] = line.trim().split(/\s+/);
    try {
      if (command === 'pause') { paused = true; console.log('[control] paused (현재 tick 완료 후 대기)'); wake?.(); }
      else if (command === 'resume') { paused = false; console.log('[control] resumed'); wake?.(); }
      else if (command === 'speed' && value && !extra) { speed = parseSpeed(value); console.log(`[control] speed ${speed}x`); wake?.(); }
      else if (command === 'status') status();
      else if (command === 'stop') stop('user');
      else if (command === 'help') console.log('pause / resume / speed 4 / status / stop');
      else if (command) console.log('[control] 알 수 없는 명령. help로 확인하세요.');
    } catch (error) { console.error(`[control] ${error.message}`); }
  });
  async function wait(ms) {
    const started = performance.now();
    while (!control.signal.aborted) {
      const remaining = ms === null ? null : ms - (performance.now() - started);
      if (remaining !== null && remaining <= 0) return;
      let commandWake = false;
      await new Promise(done => {
        let timer;
        const finish = () => { clearTimeout(timer); control.signal.removeEventListener('abort', finish); wake = undefined; done(); };
        wake = () => { commandWake = true; finish(); };
        control.signal.addEventListener('abort', finish, { once: true });
        // Node의 약24일 timeout 상한을 넘는 배속/긴 tick도 1ms로 잘못 단축하지 않는다.
        if (remaining !== null) timer = setTimeout(finish, Math.min(remaining, 2147483647));
      });
      if (commandWake || ms === null) return;
    }
  }
  console.log(`[simulate] ${scenario.name} · seed=${scenario.seed} · ${speed}x · ${opts.dryRun ? 'DRY RUN (HTTP 없음)' : apiOrigin}`);
  console.log('[simulate] 입력 명령: pause / resume / speed 4 / status / stop');
  try {
    while (['ready', 'running'].includes(engine.getState().phase)) {
      if (paused) { await wait(null); continue; }
      await engine.step({ signal: control.signal });
      if (['ready', 'running'].includes(engine.getState().phase)) await wait(scenario.tickMs / speed);
    }
  } finally {
    lines.close();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    const state = engine.getState();
    const result = { schemaVersion: 1, mode: opts.dryRun ? 'dry-run' : 'live', apiOrigin: opts.dryRun ? null : apiOrigin,
      startedAt, finishedAt: new Date().toISOString(), scenario, ...state, unresolvedAttempts: state.totals.attempted - state.totals.accepted - state.totals.rejected, events };
    if (output) { try { await output.writeFile(JSON.stringify(result, null, 2) + '\n'); } finally { await output.close(); } }
    status();
    console.log(`[simulate] ${state.phase}${state.reason ? `: ${state.reason}` : ''}${opts.output ? ` · 결과 ${resolve(opts.output)}` : ''}`);
    process.exitCode = interrupted ? 130 : state.phase === 'failed' ? 1 : 0;
  }
}

main().catch(error => { console.error(`[simulate] ${error.message}`); process.exitCode = 1; });
