import { randomUUID } from 'node:crypto';
import { SimulationEngine } from './core.mjs';
import { parseScenario } from './scenario.mjs';
import { createDryRunClient } from './clients.mjs';

export class SimulationControlError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** 화면에서 직접 구성한 시나리오가 차지하는 예약 ID와 인원 상한. */
export const CUSTOM_SCENARIO_ID = 'custom';
export const MAX_CUSTOM_PARTICIPANTS = 12;
/** 참가자마다 남기는 최근 응찰 기록 수. 일찍 이탈한 참가자의 내역도 남는다. */
export const MAX_BIDS_PER_PARTICIPANT = 20;
/** 예상 밖의 이벤트까지 포함한 전체 상한. */
export const MAX_RUN_EVENTS = 1000;
/** 호출 흐름 화면에 내보내는 최근 API 호출 기록 수. */
export const MAX_TRAFFIC_RECORDS = 200;

/**
 * 엔진의 API 클라이언트를 감싸 요청과 응답을 한 줄씩 남긴다. 재시도는 클라이언트 안에서 일어나므로
 * 논리 호출 하나가 요청 한 줄과 응답(또는 오류) 한 줄이 된다. 엔진과 호출 결과에는 손대지 않는다.
 */
export function traceClient(client, record, now = () => performance.now()) {
  let callId = 0;
  async function traced(call, request, invoke) {
    const id = ++callId;
    const started = now();
    record({ direction: 'request', call, callId: id, ...request });
    try {
      const result = await invoke();
      const durationMs = Math.max(0, Math.round(now() - started));
      if (call === 'bid') {
        record({ direction: 'response', call, callId: id, customerName: request.customerName, amount: request.amount,
          outcome: result?.status, highestAmount: result?.highestAmount, highestBidderName: result?.highestBidderName, durationMs });
      } else {
        record({ direction: 'response', call, callId: id, outcome: 'OK', durationMs,
          highestAmount: result?.summary?.highestAmount, participantCount: result?.summary?.participantCount });
      }
      return result;
    } catch (error) {
      const aborted = error?.name === 'AbortError' || error?.name === 'TimeoutError';
      record({ direction: 'response', call, callId: id, ...request, outcome: aborted ? 'ABORTED' : 'ERROR',
        durationMs: Math.max(0, Math.round(now() - started)), message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return {
    readDashboard: options => traced('read', { method: 'GET', path: '/api/dashboard' }, () => client.readDashboard(options)),
    submitBid: (body, options) => traced('bid', { method: 'POST', path: '/api/bid', customerName: body.customerName, amount: body.amount },
      () => client.submitBid(body, options)),
  };
}

/**
 * 전체 길이로만 자르면 오래된 기록이 먼저 밀려나 일찍 이탈한 참가자의 내역이 통째로 사라진다.
 * 참가자별로 최근 응찰만 남기고, 같은 멱등 키의 attempt와 bid는 함께 버린다.
 */
function retain(events, event) {
  events.push(event);
  if (event.type === 'attempt' || event.type === 'bid') {
    const keys = [];
    for (const item of events) {
      if (item.participantId !== event.participantId) continue;
      if (item.type !== 'attempt' && item.type !== 'bid') continue;
      if (!keys.includes(item.idempotencyKey)) keys.push(item.idempotencyKey);
    }
    while (keys.length > MAX_BIDS_PER_PARTICIPANT) {
      const dropped = keys.shift();
      for (let index = events.length - 1; index >= 0; index--) {
        const item = events[index];
        if (item.participantId === event.participantId && item.idempotencyKey === dropped
            && (item.type === 'attempt' || item.type === 'bid')) events.splice(index, 1);
      }
    }
  }
  while (events.length > MAX_RUN_EVENTS) events.shift();
}

function speedValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000) {
    throw new SimulationControlError('배속은 0 초과 1000 이하의 숫자여야 합니다.');
  }
  return value;
}

/** One Node server owns one shared run. Browser polling never advances the engine. */
export class SimulationSession {
  constructor({ scenarios, createClient }) {
    if (!Array.isArray(scenarios) || scenarios.length === 0 || typeof createClient !== 'function') {
      throw new Error('시나리오 목록과 실제 API client factory가 필요합니다.');
    }
    const ids = new Set();
    this.scenarios = scenarios.map(entry => {
      if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) throw new Error('시나리오 ID는 비어 있지 않고 고유해야 합니다.');
      if (entry.id === CUSTOM_SCENARIO_ID) throw new Error(`'${CUSTOM_SCENARIO_ID}'는 직접 구성한 시나리오의 예약 ID입니다.`);
      ids.add(entry.id);
      return { id: entry.id, description: String(entry.description ?? ''), scenario: parseScenario(entry.scenario) };
    });
    this.createClient = createClient;
    this.sessionId = randomUUID();
    this.revision = 0;
    this.run = null;
    this.custom = null;
  }

  /** 준비된 시나리오 + 가장 최근에 직접 구성한 시나리오. 같은 목록을 조회와 실행이 함께 본다. */
  definitions() { return this.custom ? [...this.scenarios, this.custom] : this.scenarios; }

  getSnapshot() {
    const scenarios = this.definitions().map(({ id, description, scenario }) => ({
      id, description, name: scenario.name, durationMs: scenario.durationMs, tickMs: scenario.tickMs,
      seed: scenario.seed, participantCount: scenario.participants.length,
      participants: scenario.participants.map(({ id, name, budget, personality, joinAtMs }) => ({ id, name, budget, personality, joinAtMs })),
    }));
    let run = null;
    if (this.run) {
      const current = this.run;
      const state = current.engine.getState();
      let phase = state.phase;
      if (current.taskActive && current.stopping) phase = 'stopping';
      else if (current.failure) phase = 'failed';
      else if (['ready', 'running'].includes(phase)) phase = current.paused ? (current.inStep ? 'pausing' : 'paused') : 'running';
      run = { ...state, phase, scenarioId: current.scenarioId, mode: current.mode, speed: current.speed,
        durationMs: current.durationMs, startedAt: current.startedAt, finishedAt: current.finishedAt,
        events: current.events, traffic: current.traffic, unresolvedAttempts: state.totals.attempted - state.totals.accepted - state.totals.rejected,
        ...(current.failure ? { reason: current.failure } : {}) };
    }
    return structuredClone({ sessionId: this.sessionId, revision: this.revision, scenarios, run });
  }

  command(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SimulationControlError('제어 명령이 필요합니다.');
    const { action } = input;
    if (!['start', 'pause', 'resume', 'stop', 'speed'].includes(action)) throw new SimulationControlError('지원하지 않는 제어 명령입니다.');
    if (typeof input.sessionId !== 'string' || !input.sessionId || !Object.hasOwn(input, 'runId') ||
        !(input.runId === null || (typeof input.runId === 'string' && input.runId.length > 0))) {
      throw new SimulationControlError('관측한 세션과 실행 ID가 필요합니다.');
    }
    if (input.sessionId !== this.sessionId || input.runId !== (this.run?.engine.getState().runId ?? null)) {
      throw new SimulationControlError('실행 정보가 변경되었습니다. 최신 상태를 확인한 뒤 다시 조작하세요.', 409);
    }
    if (action === 'start') return this.start(input);
    const current = this.run;
    if (!current?.taskActive || current.stopping || ['completed', 'failed', 'stopped'].includes(current.engine.getState().phase)) {
      throw new SimulationControlError('제어할 실행이 없습니다.', 409);
    }
    if (action === 'pause') {
      if (current.paused) throw new SimulationControlError('이미 일시정지 중입니다.', 409);
      current.paused = true;
    } else if (action === 'resume') {
      if (!current.paused) throw new SimulationControlError('일시정지된 실행만 재개할 수 있습니다.', 409);
      current.paused = false;
    } else if (action === 'speed') {
      current.speed = speedValue(input.speed);
    } else {
      current.stopping = true;
      current.engine.stop('user');
      current.controller.abort(new Error('user stop'));
    }
    this.revision++;
    current.wake?.();
    return this.getSnapshot();
  }

  /** 직접 구성한 시나리오는 저장된 목록을 바꾸지 않고 custom 자리 하나만 대체한다. */
  resolve(input) {
    if (input.scenario === undefined) {
      const found = this.definitions().find(entry => entry.id === input.scenarioId);
      if (!found) throw new SimulationControlError('시나리오를 선택하세요.');
      return found;
    }
    if (!input.scenario || typeof input.scenario !== 'object' || Array.isArray(input.scenario)) {
      throw new SimulationControlError('참가자 설정이 올바르지 않습니다.');
    }
    if (Array.isArray(input.scenario.participants) && input.scenario.participants.length > MAX_CUSTOM_PARTICIPANTS) {
      throw new SimulationControlError(`참가자는 ${MAX_CUSTOM_PARTICIPANTS}명까지 설정할 수 있습니다.`);
    }
    let scenario;
    try { scenario = parseScenario(input.scenario); }
    catch (error) { throw new SimulationControlError(`설정을 확인해 주세요. ${error.message}`); }
    this.custom = { id: CUSTOM_SCENARIO_ID, description: '화면에서 직접 구성한 참가자로 실행합니다.', scenario };
    return this.custom;
  }

  start(input) {
    if (this.run?.taskActive) throw new SimulationControlError('진행 중인 실행을 먼저 중지하세요.', 409);
    if (!['live', 'dry-run'].includes(input.mode)) throw new SimulationControlError('실제 경매 또는 미리보기를 선택하세요.');
    // 저장된 custom 자리를 바꾸기 전에 나머지 입력을 모두 검증한다.
    const speed = speedValue(input.speed ?? 1);
    const definition = this.resolve(input);
    const current = {
      scenarioId: definition.id, mode: input.mode, speed, durationMs: definition.scenario.durationMs,
      paused: false, inStep: false, stopping: false, taskActive: true, events: [], traffic: [], trafficSeq: 0,
      controller: new AbortController(), wake: undefined, startedAt: new Date().toISOString(), finishedAt: null,
    };
    const base = current.mode === 'dry-run' ? createDryRunClient() : this.createClient();
    const startedPerf = performance.now();
    const client = traceClient(base, entry => {
      current.traffic.push({ seq: ++current.trafficSeq, atMs: Math.round(performance.now() - startedPerf), ...entry });
      if (current.traffic.length > MAX_TRAFFIC_RECORDS) current.traffic.shift();
      this.revision++;
    });
    current.engine = new SimulationEngine(definition.scenario, { client, runId: randomUUID(), onEvent: event => {
      // attempt 기록은 응답을 받지 못한 응찰을 사후에 대조할 유일한 단서다.
      retain(current.events, event);
      this.revision++;
    } });
    this.run = current;
    this.revision++;
    current.task = this.loop(current);
    return this.getSnapshot();
  }

  async wait(current, ms) {
    const started = performance.now();
    while (!current.controller.signal.aborted) {
      const remaining = ms === null ? null : ms - (performance.now() - started);
      if (remaining !== null && remaining <= 0) return;
      let commandWake = false;
      await new Promise(resolve => {
        let timer;
        const done = () => {
          clearTimeout(timer);
          current.controller.signal.removeEventListener('abort', done);
          current.wake = undefined;
          resolve();
        };
        current.wake = () => { commandWake = true; done(); };
        current.controller.signal.addEventListener('abort', done, { once: true });
        if (remaining !== null) timer = setTimeout(done, Math.min(remaining, 2147483647));
      });
      if (commandWake || ms === null) return;
    }
  }

  async loop(current) {
    try {
      while (['ready', 'running'].includes(current.engine.getState().phase)) {
        if (current.paused) { await this.wait(current, null); continue; }
        current.inStep = true;
        this.revision++;
        try { await current.engine.step({ signal: current.controller.signal }); }
        finally { current.inStep = false; this.revision++; }
        if (!['ready', 'running'].includes(current.engine.getState().phase)) break;
        if (!current.paused) await this.wait(current, current.engine.scenario.tickMs / current.speed);
      }
    } catch (error) {
      current.failure = error instanceof Error ? error.message : String(error);
      current.engine.stop('runner-error');
    } finally {
      current.taskActive = false;
      current.finishedAt = new Date().toISOString();
      current.wake?.();
      this.revision++;
    }
  }

  /** Useful for server shutdown and bounded integration tests. */
  async dispose() {
    const current = this.run;
    if (current?.taskActive) {
      current.stopping = true;
      current.engine.stop('shutdown');
      current.controller.abort(new Error('session shutdown'));
      current.wake?.();
      await current.task;
    }
  }
}
