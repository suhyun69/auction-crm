export type SimulationMode = "live" | "dry-run";
export type RunPhase = "running" | "pausing" | "paused" | "stopping" | "stopped" | "completed" | "failed";
export type Personality = "cautious" | "competitive" | "impulsive";
export type ParticipantState = "waiting" | "active" | "leading" | "retired";
export type ScenarioParticipant = { id: string; name: string; budget: number; personality: Personality; joinAtMs: number };
export type ScenarioOption = {
  id: string; name: string; description: string; durationMs: number; tickMs: number; seed: string | number;
  participantCount: number; participants: ScenarioParticipant[];
};
export type RunParticipant = ScenarioParticipant & {
  state: ParticipantState; bidCount: number; lastAmount: number | null; nextActionAtMs: number;
};
export type SimulationEvent = {
  type: string; runId?: string; elapsedMs: number; tick?: number;
  participantId?: string; customerName?: string; amount?: number; reason?: string;
  idempotencyKey?: string;
  response?: { status: "ACCEPTED" | "REJECTED"; highestAmount: number; highestBidderName: string };
};
export type SimulationRun = {
  runId: string; scenarioId: string; mode: SimulationMode; phase: RunPhase; speed: number;
  elapsedMs: number; durationMs: number; tick: number;
  totals: { attempted: number; accepted: number; rejected: number; errors: number };
  market: { highestAmount: number; highestBidderName: string | null };
  participants: RunParticipant[]; events: SimulationEvent[];
  reason?: string; startedAt: string; finishedAt?: string; unresolvedAttempts: number;
};
export type SimulatorSnapshot = { sessionId: string; revision: number; scenarios: ScenarioOption[]; run: SimulationRun | null };
/** 화면에서 직접 구성해 서버로 보내는 시나리오. 서버가 다시 검증한다. */
export type CustomScenario = {
  version: 1; name: string; seed: string | number;
  durationMs: number; tickMs: number; minIncrement: number;
  participants: ScenarioParticipant[];
};
export type SimulationCommand =
  | { action: "start"; scenarioId: string; mode: SimulationMode; speed: number }
  | { action: "start"; scenario: CustomScenario; mode: SimulationMode; speed: number }
  | { action: "pause" | "resume" | "stop" }
  | { action: "speed"; speed: number };
