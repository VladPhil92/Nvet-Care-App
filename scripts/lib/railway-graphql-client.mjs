const DEFAULT_TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultDelay(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

export function createRailwayGraphqlClient({
  apiUrl,
  token,
  fetchImpl = fetch,
  waitImpl = defaultWait,
  maxAttempts = 5,
  baseDelayMs = 1_000,
  maxDelayMs = 8_000,
  requestTimeoutMs = 20_000,
  transientHttpStatuses = DEFAULT_TRANSIENT_HTTP_STATUSES,
  logger = console,
} = {}) {
  if (!apiUrl) throw new Error('Railway GraphQL apiUrl is required.');
  if (!token) throw new Error('Railway GraphQL token is required.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Railway GraphQL maxAttempts must be a positive integer.');
  }

  return async function graphql(query, variables = {}) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });

        const text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          const error = new Error(
            `Railway returned non-JSON HTTP ${response.status}: ${text.slice(0, 500)}`,
          );
          if (!transientHttpStatuses.has(response.status)) throw error;
          lastError = error;
        }

        if (payload) {
          if (payload.errors?.length) {
            const errors = payload.errors.map((error) => error.message).join('; ');
            throw new Error(`Railway GraphQL failed (HTTP ${response.status}): ${errors}`);
          }
          if (!response.ok) {
            const error = new Error(
              `Railway GraphQL failed (HTTP ${response.status}): ${text.slice(0, 500)}`,
            );
            if (!transientHttpStatuses.has(response.status)) throw error;
            lastError = error;
          } else {
            return payload.data;
          }
        }
      } catch (error) {
        if (error instanceof Error && /^Railway GraphQL failed \(HTTP \d+\):/.test(error.message)) {
          throw error;
        }
        if (
          error instanceof Error &&
          /^Railway returned non-JSON HTTP \d+:/.test(error.message) &&
          !lastError
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt === maxAttempts) break;
      const delayMs = defaultDelay(attempt, baseDelayMs, maxDelayMs);
      logger.warn?.(
        `Railway GraphQL transient failure (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms: ${lastError?.message ?? 'unknown error'}`,
      );
      await waitImpl(delayMs);
    }

    throw new Error(
      `Railway GraphQL transient failure after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown error'}`,
      { cause: lastError },
    );
  };
}
