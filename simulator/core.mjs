import { createHash } from 'node:crypto';
import { parseScenario, MAX_AMOUNT } from './scenario.mjs';

/** Stable FNV-1a seed hash and Mulberry32 generator; no ambient random or clock. */
export function createSeededRandom(seed) {
  let state = 2166136261;
  for (const code of String(seed)) {
    state ^= code.codePointAt(0);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function copy(value) { return structuredClone(value); }
function validMarket(amount, name) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT
      || (amount > 0 && (typeof name !== 'string' || name.length === 0))) {
    throw new Error('API 최고가 응답이 올바르지 않습니다.');
  }
  return { highestAmount: amount, highestBidderName: amount === 0 ? null : name };
}

export class SimulationEngine {
  constructor(scenario, { client, runId, onEvent = () => {} } = {}) {
    this.scenario = parseScenario(scenario);
    if (!client || typeof client.readDashboard !== 'function' || typeof client.submitBid !== 'function') {
      throw new Error('readDashboard와 submitBid를 제공하는 client가 필요합니다.');
    }
    if (typeof runId !== 'string' || !runId.trim() || runId.length > 80) throw new Error('runId는 1~80자 문자열이어야 합니다.');
    if (typeof onEvent !== 'function') throw new Error('onEvent는 함수여야 합니다.');
    this.client = client;
    this.runId = runId;
    this.onEvent = onEvent;
    this.random = createSeededRandom(this.scenario.seed);
    this.busy = false;
    this.state = {
      runId, phase: 'ready', elapsedMs: 0, tick: 0,
      totals: { attempted: 0, accepted: 0, rejected: 0, errors: 0 },
      market: { highestAmount: 0, highestBidderName: null },
      participants: this.scenario.participants.map(actor => ({
        id: actor.id, name: actor.name, budget: actor.budget, personality: actor.personality,
        state: 'waiting', bidCount: 0, lastAmount: null, nextActionAtMs: actor.joinAtMs, joinAtMs: actor.joinAtMs,
      })),
    };
  }

  getState() { return copy(this.state); }

  event(type, details = {}) {
    this.onEvent(copy({ type, runId: this.runId, elapsedMs: this.state.elapsedMs, tick: this.state.tick, ...details }));
  }

  stop(reason = 'user') {
    if (['completed', 'failed', 'stopped'].includes(this.state.phase)) return this.getState();
    this.state.phase = 'stopped';
    this.state.reason = reason;
    this.event('stopped', { reason });
    return this.getState();
  }

  integer(min, max) { return min + Math.floor(this.random() * (max - min + 1)); }

  schedule(actor, definition) {
    actor.nextActionAtMs = Math.min(MAX_AMOUNT,
      this.state.elapsedMs + this.integer(definition.reactionMs.min, definition.reactionMs.max));
  }

  retired(actor, reason) {
    actor.state = 'retired';
    this.event('retired', { participantId: actor.id, customerName: actor.name, reason });
  }

  refreshLeaders() {
    for (const actor of this.state.participants) {
      if (actor.state === 'active' || actor.state === 'leading') {
        actor.state = actor.name === this.state.market.highestBidderName ? 'leading' : 'active';
      }
    }
  }

  async step({ signal } = {}) {
    if (this.busy) throw new Error('step은 동시에 실행할 수 없습니다.');
    if (['completed', 'failed', 'stopped'].includes(this.state.phase)) return this.getState();
    if (signal?.aborted) return this.stop('aborted');
    this.busy = true;
    this.state.phase = 'running';
    try {
      const dashboard = await this.client.readDashboard({ signal });
      if (signal?.aborted || this.state.phase === 'stopped') return this.stop(signal?.aborted ? 'aborted' : this.state.reason);
      this.state.market = validMarket(dashboard?.summary?.highestAmount, dashboard?.summary?.highestBidderName);
      this.refreshLeaders();
      for (let index = 0; index < this.state.participants.length; index++) {
        if (signal?.aborted || this.state.phase === 'stopped') return this.stop(signal?.aborted ? 'aborted' : this.state.reason);
        const actor = this.state.participants[index];
        const definition = this.scenario.participants[index];
        if (actor.state === 'waiting' && this.state.elapsedMs >= actor.joinAtMs) {
          actor.state = 'active';
          this.event('joined', { participantId: actor.id, customerName: actor.name });
          if (this.state.phase === 'stopped') return this.getState();
        }
        if (!['active', 'leading'].includes(actor.state) || actor.nextActionAtMs > this.state.elapsedMs) continue;
        if (actor.name === this.state.market.highestBidderName) {
          actor.state = 'leading';
          this.schedule(actor, definition);
          continue;
        }
        if (actor.bidCount >= definition.maxBids) { this.retired(actor, 'max-bids'); continue; }
        const remaining = actor.budget - this.state.market.highestAmount;
        if (remaining < this.scenario.minIncrement) { this.retired(actor, 'budget'); continue; }
        this.schedule(actor, definition);
        if (this.random() >= definition.participationProbability) continue;
        const increment = this.integer(definition.increment.min, definition.increment.max);
        // Clip to the actor's ceiling; remaining was checked against the global minimum.
        const amount = this.state.market.highestAmount + Math.min(increment, remaining);
        // UTF-8 actor IDs and run IDs remain valid HTTP header values of fixed length.
        const idempotencyKey = 'sim-' + createHash('sha256')
          .update(JSON.stringify([this.runId, actor.id, actor.bidCount + 1])).digest('hex');
        // 판단 근거였던 최고가를 함께 남긴다. 응답의 최고가는 판정 뒤 값이라 서로 다르다.
        this.event('attempt', { participantId: actor.id, customerName: actor.name, amount, idempotencyKey,
          highestAmount: this.state.market.highestAmount });
        if (this.state.phase === 'stopped') return this.getState();
        this.state.totals.attempted++;
        const response = await this.client.submitBid({ customerName: actor.name, amount, idempotencyKey }, { signal });
        if (response?.status !== 'ACCEPTED' && response?.status !== 'REJECTED') throw new Error('API 응찰 상태가 올바르지 않습니다.');
        this.state.market = validMarket(response.highestAmount, response.highestBidderName);
        actor.bidCount++;
        actor.lastAmount = amount;
        this.state.totals[response.status === 'ACCEPTED' ? 'accepted' : 'rejected']++;
        this.refreshLeaders();
        this.event('bid', { participantId: actor.id, customerName: actor.name, amount, idempotencyKey, response });
        // A returned response is a known outcome, even if stop arrived while it was in flight.
        if (signal?.aborted || this.state.phase === 'stopped') return this.stop(signal?.aborted ? 'aborted' : this.state.reason);
      }
      this.state.tick++;
      this.state.elapsedMs = Math.min(this.scenario.durationMs, this.state.elapsedMs + this.scenario.tickMs);
      if (this.state.elapsedMs >= this.scenario.durationMs) {
        this.state.phase = 'completed';
        this.state.reason = 'duration';
        this.event('completed', { reason: 'duration' });
      }
    } catch (error) {
      if (signal?.aborted || this.state.phase === 'stopped' || error?.name === 'AbortError') return this.stop('aborted');
      this.state.phase = 'failed';
      this.state.reason = error instanceof Error ? error.message : String(error);
      this.state.totals.errors++;
      this.event('error', { reason: this.state.reason });
    } finally {
      this.busy = false;
    }
    return this.getState();
  }
}
