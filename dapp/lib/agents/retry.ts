// Tiny retry helper for transient Azure OpenAI connection failures.
//
// The Microsoft Foundry endpoints we hit (specifically the southindia region)
// occasionally drop TLS handshakes or reset connections (ECONNRESET, EAI_AGAIN,
// ETIMEDOUT). We don't need to give up on the whole agent run for those —
// a quick retry usually clears it. Anything else (bad API key, malformed
// request, content filter trip, quota) bubbles up immediately.
//<Written by AI.>

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
]);

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // openai SDK wraps the underlying network error in `cause`.
  const cause = (err as { cause?: { code?: string } }).cause;
  if (cause?.code && RETRYABLE_ERROR_CODES.has(cause.code)) return true;
  const code = (err as { code?: string }).code;
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  // openai SDK sets a name on its connection-failure class.
  const name = (err as { name?: string }).name;
  if (name === "APIConnectionError" || name === "APITimeoutError") return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 800;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      const wait = delayMs * Math.pow(2, i); // 800ms, 1600ms, 3200ms
      console.warn(
        `[${opts.label ?? "agent"}] retryable error (attempt ${i + 1}/${attempts}), waiting ${wait}ms`,
        err,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
