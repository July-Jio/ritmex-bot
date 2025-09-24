import { logger } from "./logger";

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOnStatuses: number[]; // e.g. [408, 429, 500, 502, 503, 504]
}

export interface TimeoutOptions {
  timeoutMs: number; // overall request timeout
}

export interface SafeFetchOptions extends RequestInit {
  timeout?: TimeoutOptions;
  retry?: RetryPolicy;
  description?: string; // for logging context
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number, base: number, max: number): number {
  const jitter = Math.random() * base;
  return Math.min(max, Math.floor(base * 2 ** attempt + jitter));
}

export async function safeFetch(input: string | URL | Request, options: SafeFetchOptions = {}): Promise<Response> {
  const { timeout, retry, description, ...init } = options;
  const controller = new AbortController();
  const signal = controller.signal;
  const finalInit: RequestInit = { ...init, signal };

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeout?.timeoutMs && Number.isFinite(timeout.timeoutMs)) {
    timeoutId = setTimeout(() => controller.abort(), timeout.timeoutMs);
  }

  const maxRetries = retry?.maxRetries ?? 0;
  const baseDelay = retry?.baseDelayMs ?? 300;
  const maxDelay = retry?.maxDelayMs ?? 3000;
  const retryStatuses = new Set(retry?.retryOnStatuses ?? [408, 429, 500, 502, 503, 504]);

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await fetch(input, finalInit);
      if (!response.ok && retryStatuses.has(response.status) && attempt < maxRetries) {
        const delay = computeBackoff(attempt, baseDelay, maxDelay);
        attempt += 1;
        logger.warn(`[safeFetch] retry ${attempt}/${maxRetries} ${description ?? ""}`, { status: response.status });
        await sleep(delay);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = computeBackoff(attempt, baseDelay, maxDelay);
        attempt += 1;
        logger.warn(`[safeFetch] retry on error ${attempt}/${maxRetries} ${description ?? ""}`, { error: error instanceof Error ? error.message : String(error) });
        await sleep(delay);
        continue;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  }
}





