import "server-only";
import { SimulationSession } from "../../../../simulator/session.mjs";
import { createHttpClient } from "../../../../simulator/clients.mjs";
import standard from "../../../../simulator/scenarios/standard.json";
import duel from "../../../../simulator/scenarios/quick-duel.json";
import late from "../../../../simulator/scenarios/late-challenger.json";

const globalSession = globalThis as typeof globalThis & { auctionSimulationSession?: InstanceType<typeof SimulationSession> };
export function simulatorSession() {
  globalSession.auctionSimulationSession ??= new SimulationSession({
    scenarios: [
      { id: "standard", description: "서로 다른 성향의 참가자 6명이 차례로 입장합니다.", scenario: standard },
      { id: "quick-duel", description: "두 참가자의 짧고 빠른 경쟁을 확인합니다.", scenario: duel },
      { id: "late-challenger", description: "늦게 입장하는 도전자가 경매의 흐름을 바꿉니다.", scenario: late },
    ],
    createClient: () => createHttpClient({ apiOrigin: process.env.SIMULATOR_API_ORIGIN ?? process.env.NEXT_PUBLIC_API_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? 8080}` }),
  });
  return globalSession.auctionSimulationSession;
}
