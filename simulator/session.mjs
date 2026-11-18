import { randomUUID } from 'node:crypto';
import { SimulationEngine } from './core.mjs';
import { parseScenario } from './scenario.mjs';
import { createDryRunClient } from './clients.mjs';

export class SimulationControlError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
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
      ids.add(entry.id);
      return { id: entry.id, description: String(entry.description ?? ''), scenario: parseScenario(entry.scenario) };
    });
    this.createClient = createClient;
    this.sessionId = randomUUID();
    this.revision = 0;
    this.run = null;
  }

  getSnapshot() {
    const scenarios = this.scenarios.map(({ id, description, scenario }) => ({
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
        events: current.events, unresolvedAttempts: state.totals.attempted - state.totals.accepted - state.totals.rejected,
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

  start(input) {
    if (this.run?.taskActive) throw new SimulationControlError('진행 중인 실행을 먼저 중지하세요.', 409);
    const definition = this.scenarios.find(entry => entry.id === input.scenarioId);
    if (!definition) throw new SimulationControlError('시나리오를 선택하세요.');
    if (!['live', 'dry-run'].includes(input.mode)) throw new SimulationControlError('실제 경매 또는 미리보기를 선택하세요.');
    const speed = speedValue(input.speed ?? 1);
    const current = {
      scenarioId: definition.id, mode: input.mode, speed, durationMs: definition.scenario.durationMs,
      paused: false, inStep: false, stopping: false, taskActive: true, events: [],
      controller: new AbortController(), wake: undefined, startedAt: new Date().toISOString(), finishedAt: null,
    };
    const client = current.mode === 'dry-run' ? createDryRunClient() : this.createClient();
    current.engine = new SimulationEngine(definition.scenario, { client, runId: randomUUID(), onEvent: event => {
      if (event.type !== 'attempt') {
        current.events.push(event);
        if (current.events.length > 100) current.events.shift();
      }
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
