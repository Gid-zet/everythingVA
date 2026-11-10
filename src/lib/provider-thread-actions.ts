import axios from "axios";
import { getValidToken } from "./token-refresh";

/**
 * Provider-side triage actions (archive / trash) through Aurinko.
 *
 * Endpoints, from Aurinko's published OpenAPI spec (apirefs.aurinko.io/swagger.json):
 *  - Archive / unarchive: `POST /v1/email/messages/{id}/status` with `{ archived }`.
 *    This is the only message-mutation endpoint in the unified API.
 *  - Trash has no unified endpoint, so it goes through Aurinko's Direct API
 *    passthrough (`/v1/direct/...`) to the native Gmail / Microsoft Graph API.
 */

const API = "https://api.aurinko.io/v1";
const CONCURRENCY = 5;

type ServiceType = "Google" | "Office365" | string;

export class ProviderActionError extends Error {}

async function tokenFor(accountId: string) {
  const token = await getValidToken(accountId);
  if (!token) throw new ProviderActionError("No valid provider token available");
  return token;
}

const serviceTypeCache = new Map<string, ServiceType>();

async function serviceTypeFor(token: string): Promise<ServiceType> {
  const cached = serviceTypeCache.get(token);
  if (cached) return cached;
  const { data } = await axios.get<{ serviceType: ServiceType }>(`${API}/account`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  serviceTypeCache.set(token, data.serviceType);
  return data.serviceType;
}

/** Run `fn` over `items` with bounded concurrency; returns per-item results. */
async function mapLimited<T>(items: T[], fn: (item: T) => Promise<unknown>) {
  const results: PromiseSettledResult<unknown>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]!) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

export interface ProviderResult {
  ok: number;
  failed: number;
  firstError?: string;
}

function summarise(results: PromiseSettledResult<unknown>[]): ProviderResult {
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  const reason = failed[0]?.reason;
  return {
    ok: results.length - failed.length,
    failed: failed.length,
    firstError: reason
      ? axios.isAxiosError(reason)
        ? `${reason.response?.status ?? ""} ${reason.response?.data?.message ?? reason.message}`.trim()
        : String(reason)
      : undefined,
  };
}

/** Archive (remove from inbox) or move back to inbox. */
export async function setMessagesArchived(
  accountId: string,
  messageIds: string[],
  archived: boolean,
): Promise<ProviderResult> {
  if (!messageIds.length) return { ok: 0, failed: 0 };
  const token = await tokenFor(accountId);
  const results = await mapLimited(messageIds, (id) =>
    axios.post(
      `${API}/email/messages/${encodeURIComponent(id)}/status`,
      { archived },
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  );
  return summarise(results);
}

/**
 * Move to trash (or restore). Gmail keeps message ids across trash/untrash.
 * Graph's `move` returns a new id, so restoring a trashed Outlook message
 * depends on the next sync picking up the new id; we try the old id and
 * report failures rather than pretending it worked.
 */
export async function setMessagesTrashed(
  accountId: string,
  messageIds: string[],
  trashed: boolean,
): Promise<ProviderResult> {
  if (!messageIds.length) return { ok: 0, failed: 0 };
  const token = await tokenFor(accountId);
  const headers = { Authorization: `Bearer ${token}` };
  const serviceType = await serviceTypeFor(token);

  const results = await mapLimited(messageIds, (id) => {
    const enc = encodeURIComponent(id);
    if (serviceType === "Google") {
      return axios.post(
        `${API}/direct/gmail/v1/users/me/messages/${enc}/${trashed ? "trash" : "untrash"}`,
        {},
        { headers },
      );
    }
    if (serviceType === "Office365" || serviceType === "Outlook") {
      return axios.post(
        `${API}/direct/me/messages/${enc}/move`,
        { destinationId: trashed ? "deleteditems" : "inbox" },
        { headers },
      );
    }
    throw new ProviderActionError(`Trash is not supported for ${serviceType} accounts`);
  });
  return summarise(results);
}
