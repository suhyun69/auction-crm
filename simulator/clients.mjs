/** HTTP는 재시도해도 같은 논리 응찰 키를 사용한다. */
export function createHttpClient({ apiOrigin, timeoutMs = 5000, retries = 2, onRetry = () => {}, fetchImpl = fetch }) {
  const origin = new URL(apiOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.search || origin.hash || !['', '/'].includes(origin.pathname)) {
    throw new Error('API 주소는 http(s) 원점이어야 합니다. 예: http://localhost:8080');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(retries) || retries < 0 || retries > 5) {
    throw new Error('잘못된 HTTP timeout/retries 설정입니다.');
  }
  async function request(path, body, { signal } = {}) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      let retryable = true;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const response = await fetchImpl(new URL(path, origin), {
          method: body ? 'POST' : 'GET',
          headers: body ? { 'Content-Type': 'application/json', 'Idempotency-Key': body.idempotencyKey } : { Accept: 'application/json' },
          body: body ? JSON.stringify({ customerName: body.customerName, amount: body.amount }) : undefined,
          cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        if (!response.ok) {
          retryable = response.status >= 500 || response.status === 429;
          const detail = (await response.text()).slice(0, 300);
          throw new Error(`API ${response.status}: ${detail}`);
        }
        const data = await response.json();
        if (body) {
          if (!Number.isSafeInteger(data.bidId) || data.bidId < 1 || data.submittedAmount !== body.amount ||
              !['ACCEPTED', 'REJECTED'].includes(data.status) ||
              !Number.isSafeInteger(data.highestAmount) || data.highestAmount < body.amount ||
              typeof data.highestBidderName !== 'string' ||
              data.reason !== (data.status === 'ACCEPTED' ? 'NEW_HIGHEST_BID' : 'AMOUNT_NOT_HIGH_ENOUGH') ||
              (data.status === 'ACCEPTED' && (data.highestAmount !== body.amount || data.highestBidderName !== body.customerName))) {
            throw new Error('응찰 API 응답 형식이 올바르지 않습니다.');
          }
        } else if (!data.summary || !Number.isSafeInteger(data.summary.highestAmount) || data.summary.highestAmount < 0 ||
            !(data.summary.highestBidderName === null || typeof data.summary.highestBidderName === 'string') || !Array.isArray(data.participants)) {
          throw new Error('대시보드 API 응답 형식이 올바르지 않습니다.');
        }
        return data;
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (!retryable || attempt >= retries) throw error;
        onRetry({ path, attempt: attempt + 1, idempotencyKey: body?.idempotencyKey, message: error.message });
      }
    }
  }
  return {
    readDashboard: options => request('/api/dashboard', undefined, options),
    submitBid: (body, options) => request('/api/bid', body, options),
  };
}

/** 실제 API/DB에 접근하지 않는, 같은 승인 규칙의 로컬 미리보기 시장. */
export function createDryRunClient() {
  let highestAmount = 0;
  let highestBidderName = null;
  const bids = [];
  const participants = new Map();
  const keys = new Map();
  return {
    async readDashboard({ signal } = {}) {
      signal?.throwIfAborted();
      const rows = [...participants.values()].sort((a, b) => (b.highestAcceptedAmount ?? -1) - (a.highestAcceptedAmount ?? -1) || a.participantId - b.participantId);
      return {
        summary: { bidCount: bids.length, participantCount: rows.length, highestAmount, highestBidderName },
        participants: rows.map((row, index) => ({ ...row, rank: index + 1 })),
      };
    },
    async submitBid({ customerName, amount, idempotencyKey }, { signal } = {}) {
      signal?.throwIfAborted();
      if (keys.has(idempotencyKey)) {
        const previous = keys.get(idempotencyKey);
        if (previous.name !== customerName || previous.response.submittedAmount !== amount) throw new Error('API 409: 재사용된 키의 요청이 다릅니다.');
        return { ...previous.response };
      }
      const accepted = amount > highestAmount;
      if (accepted) { highestAmount = amount; highestBidderName = customerName; }
      const response = {
        bidId: bids.length + 1, status: accepted ? 'ACCEPTED' : 'REJECTED',
        reason: accepted ? 'NEW_HIGHEST_BID' : 'AMOUNT_NOT_HIGH_ENOUGH',
        submittedAmount: amount, highestAmount, highestBidderName,
      };
      const row = participants.get(customerName) ?? { participantId: participants.size + 1, customerName, highestAcceptedAmount: null, bidCount: 0 };
      row.bidCount++;
      if (accepted) row.highestAcceptedAmount = amount;
      row.lastBidAt = new Date(response.bidId).toISOString();
      participants.set(customerName, row);
      bids.push(response);
      keys.set(idempotencyKey, { name: customerName, response });
      return { ...response };
    },
  };
}
