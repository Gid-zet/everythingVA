import "server-only";
import axios, { type AxiosRequestConfig } from "axios";
import { ProviderError, ReauthRequiredError } from "../types";

export const AURINKO_API = "https://api.aurinko.io/v1";

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Aurinko HTTP client bound to one account token.
 *
 * - Retries 429 and 5xx with exponential backoff, honouring Retry-After.
 * - Maps 401 to ReauthRequiredError so callers can flag the account.
 * - Never logs the token or request bodies (they can contain email content).
 */
export function aurinkoClient(token: string, onReauth?: () => Promise<void>) {
  async function request<T>(config: AxiosRequestConfig): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await axios.request<T>({
          baseURL: AURINKO_API,
          timeout: 30_000,
          ...config,
          headers: { Authorization: `Bearer ${token}`, ...(config.headers ?? {}) },
        });
        return res.data;
      } catch (error) {
        if (!axios.isAxiosError(error)) throw error;
        const status = error.response?.status;
        if (status === 401) {
          await onReauth?.();
          throw new ReauthRequiredError();
        }
        const retryable = status === 429 || (status !== undefined && status >= 500) || error.code === "ECONNRESET";
        if (retryable && attempt < MAX_RETRIES) {
          const retryAfter = Number(error.response?.headers?.["retry-after"]);
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt + Math.random() * 200;
          await sleep(Math.min(wait, 10_000));
          continue;
        }
        const data = error.response?.data as { message?: string; code?: string } | undefined;
        throw new ProviderError(
          `${config.method?.toUpperCase() ?? "GET"} ${config.url} failed: ${data?.message ?? data?.code ?? error.message}`,
          status,
        );
      }
    }
  }

  return {
    get: <T>(url: string, params?: Record<string, unknown>) => request<T>({ method: "GET", url, params }),
    post: <T>(url: string, data?: unknown, params?: Record<string, unknown>) =>
      request<T>({ method: "POST", url, data, params }),
    patch: <T>(url: string, data?: unknown, params?: Record<string, unknown>) =>
      request<T>({ method: "PATCH", url, data, params }),
    put: <T>(url: string, data?: unknown, params?: Record<string, unknown>) =>
      request<T>({ method: "PUT", url, data, params }),
    delete: <T>(url: string, params?: Record<string, unknown>) => request<T>({ method: "DELETE", url, params }),
  };
}

export type AurinkoClient = ReturnType<typeof aurinkoClient>;

/** Run `fn` over `items` with bounded concurrency and collect a summary. */
export async function forEachLimited<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency = 5,
) {
  let next = 0;
  let ok = 0;
  const errors: unknown[] = [];
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      try {
        await fn(item);
        ok++;
      } catch (e) {
        if (e instanceof ReauthRequiredError) throw e;
        errors.push(e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return {
    ok,
    failed: errors.length,
    firstError: errors[0] instanceof Error ? errors[0].message : errors[0] ? String(errors[0]) : undefined,
  };
}
