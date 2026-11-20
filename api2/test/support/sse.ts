/**
 * 테스트용 SSE 클라이언트. 실제 포트로 연결해 받은 프레임을 이름 목록으로 쌓는다.
 * 이벤트는 `event:` 이름, 주석(`: heartbeat`)은 'heartbeat'로 기록한다.
 */
export type SseStream = {
  response: Response;
  frames: string[];
  ended: Promise<void>;
  next(name: string, timeoutMs?: number): Promise<void>;
  close(): void;
};

export async function openSse(
  url: string,
  headers: Record<string, string> = {},
): Promise<SseStream> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { accept: 'text/event-stream', ...headers },
    signal: controller.signal,
  });
  const frames: string[] = [];
  const waiters = new Set<() => void>();
  const notify = () => waiters.forEach((wake) => wake());

  const ended = (async () => {
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = '';
    let pending: string | null = null;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          if (line.startsWith('event:')) pending = line.slice(6).trim();
          else if (line.startsWith(':'))
            pending = line.slice(1).trim() || 'comment';
          else if (line === '' && pending !== null) {
            frames.push(pending);
            pending = null;
            notify();
          }
        }
      }
    } catch {
      // 테스트가 연결을 끊으면 읽기가 중단된다.
    } finally {
      notify();
    }
  })();

  let seen = 0;
  return {
    response,
    frames,
    ended,
    /** 앞서 확인한 프레임 이후에 name이 올 때까지 기다린다. */
    async next(name, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const index = frames.indexOf(name, seen);
        if (index >= 0) {
          seen = index + 1;
          return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new Error(
            `SSE 이벤트를 받지 못함: ${name} (받은 것: ${frames.join(', ')})`,
          );
        await new Promise<void>((resolve) => {
          const wake = () => {
            waiters.delete(wake);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(wake, remaining);
          waiters.add(wake);
        });
      }
    },
    close: () => controller.abort(),
  };
}

export async function until(check: () => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error('조건이 시간 안에 충족되지 않음');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
