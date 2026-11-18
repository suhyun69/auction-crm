export class ControlRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function checkControlOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  try { if (new URL(origin).origin === new URL(request.url).origin) return; } catch { /* reject below */ }
  throw new ControlRequestError("같은 웹 화면에서 제어해 주세요.", 403);
}
export async function readControlBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new ControlRequestError("JSON 형식의 제어 요청이 필요합니다.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ControlRequestError("요청 내용이 필요합니다.", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new ControlRequestError("제어 요청이 너무 큽니다.", 413); }
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body;
  } catch (error) {
    if (error instanceof ControlRequestError) throw error;
    throw new ControlRequestError("제어 요청의 JSON이 올바르지 않습니다.", 400);
  } finally { reader.releaseLock(); }
}
