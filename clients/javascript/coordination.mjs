const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class CoordinationClientError extends Error {
  constructor(status, code, detail) {
    super(detail);
    this.name = 'CoordinationClientError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Dependency-free Node 20 client for the local coordination sandbox.
 * Participant IDs identify simulated authors, not authenticated identities.
 * Retries reuse the serialized command, including the caller's requestId.
 */
export class CoordinationClient {
  constructor(baseUrl = 'http://127.0.0.1:3000', {
    fetchImpl = globalThis.fetch, timeoutMs = 10000, attempts = 3, sleep = pause,
  } = {}) {
    const base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(base.protocol)) throw new TypeError('baseUrl must use HTTP or HTTPS.');
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new TypeError('attempts must be an integer between 1 and 10.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new TypeError('timeoutMs must be positive, finite, and at most 2147483647.');
    if (typeof fetchImpl !== 'function' || typeof sleep !== 'function') throw new TypeError('fetchImpl and sleep must be functions.');
    this.baseUrl = base;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
    this.sleep = sleep;
  }

  snapshot() { return this.request('/api/coordination'); }
  register(participant) { return this.request('/api/coordination', { operation: 'register', participant }); }
  post(message) {
    if (!message || typeof message.requestId !== 'string' || !message.requestId.trim()) {
      throw new CoordinationClientError(0, 'INVALID_REQUEST_ID', 'post requires a caller-supplied, nonempty requestId.');
    }
    return this.request('/api/coordination', { operation: 'post', message });
  }
  acknowledge(messageId, participantId) {
    return this.request('/api/coordination', { operation: 'acknowledge', messageId, participantId });
  }

  /** @param {string} participantId
   * @param {{afterSequence?: number, limit?: number, includeAcknowledged?: boolean, includeBroadcasts?: boolean, kind?: string | null}} options
   */
  inbox(participantId, options = {}) {
    const query = new URLSearchParams({
      participant: participantId,
      after: String(options.afterSequence ?? 0),
      limit: String(options.limit ?? 50),
      acknowledged: String(options.includeAcknowledged ?? false),
      broadcasts: String(options.includeBroadcasts ?? false),
    });
    if (options.kind != null) query.set('kind', options.kind);
    return this.request(`/api/coordination/inbox?${query}`);
  }

  async request(path, command) {
    // Serialize before any I/O: a caller mutation cannot change a retry.
    const body = command === undefined ? undefined : JSON.stringify(command);
    const url = new URL(path, this.baseUrl).toString();
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      try { return await this.send(url, body); }
      catch (error) {
        const retryable = error instanceof CoordinationClientError && (
          (error.status === 0 && ['NETWORK_ERROR', 'TIMEOUT'].includes(error.code)) ||
          RETRYABLE_STATUS.has(error.status)
        );
        if (!retryable || attempt + 1 === this.attempts) throw error;
        await this.sleep(Math.min(100 * (2 ** attempt), 1000));
      }
    }
  }

  async send(url, body) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CoordinationClientError(0, 'TIMEOUT', `Coordination request exceeded ${this.timeoutMs} ms.`));
      }, this.timeoutMs);
    });
    const perform = async () => {
      const response = await this.fetchImpl(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body, signal: controller.signal, redirect: 'error',
      });
      const raw = await response.text();
      let value;
      try { value = JSON.parse(raw); }
      catch { throw new CoordinationClientError(response.status, 'INVALID_RESPONSE', 'The coordination API returned malformed JSON.'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new CoordinationClientError(response.status, 'INVALID_RESPONSE', 'The coordination API must return a JSON object.');
      }
      if (!response.ok) {
        throw new CoordinationClientError(response.status,
          typeof value.error === 'string' ? value.error : `HTTP_${response.status}`,
          typeof value.detail === 'string' ? value.detail : `Coordination request failed with HTTP ${response.status}.`);
      }
      return value;
    };
    try { return await Promise.race([perform(), timeout]); }
    catch (error) {
      if (error instanceof CoordinationClientError) throw error;
      if (error instanceof TypeError || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new CoordinationClientError(0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', error.message);
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
}
