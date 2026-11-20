export class ControlRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
/**
 * 다른 사이트의 페이지가 브라우저를 통해 실행을 조작하지 못하게, 제어 요청의 Origin이 이 웹 화면인지 확인한다.
 * Origin이 없는 요청(CLI, curl)은 브라우저 교차 출처 요청이 아니므로 통과시킨다.
 *
 * 서버가 아는 자기 주소(request.url)와 브라우저가 접속한 주소는 다를 수 있다. 컨테이너 포트를 다른 호스트 포트로
 * 내보내거나(Compose `WEB_PORT`) 프록시 뒤에 있으면 request.url은 내부 주소(localhost:3000)다. 그래서 브라우저가
 * 실제로 보낸 Host(프록시면 X-Forwarded-Host)와도 비교한다. 다른 사이트의 페이지는 이 헤더를 바꿀 수 없다.
 */
export function checkControlOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { throw new ControlRequestError("같은 웹 화면에서 제어해 주세요.", 403); }
  if (originUrl.origin === new URL(request.url).origin) return;
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host");
  if (host && originUrl.host === host.toLowerCase()) return;
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
