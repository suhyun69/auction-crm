import { connection } from "next/server";
import { simulatorSession } from "@/lib/simulator/server";
import { checkControlOrigin, readControlBody } from "@/lib/simulator/request";

const headers = { "Cache-Control": "no-store" };
export async function GET() {
  await connection();
  return Response.json(simulatorSession().getSnapshot(), { headers });
}
export async function POST(request: Request) {
  try {
    checkControlOrigin(request);
    const body = await readControlBody(request);
    return Response.json(simulatorSession().command(body), { headers });
  } catch (error) {
    const status = error instanceof Error && "status" in error && [400, 403, 409, 413, 415].includes(Number(error.status)) ? Number(error.status) : 500;
    return Response.json({ message: status === 500 ? "시뮬레이터 제어 중 오류가 발생했습니다." : (error as Error).message }, { status, headers });
  }
}
