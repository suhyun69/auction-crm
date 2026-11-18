import type { Metadata } from "next";
import { SimulatorPanel } from "@/components/simulator/simulator-panel";
export const metadata: Metadata = { title: "시뮬레이터 | Auction CRM" };
export default function SimulatorPage() { return <SimulatorPanel />; }
