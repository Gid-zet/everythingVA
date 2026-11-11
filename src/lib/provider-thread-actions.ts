import { getProviders, type BatchResult } from "@/server/providers";

/**
 * Thin wrappers kept for the mail router's existing call sites; the real
 * provider logic lives in src/server/providers (one place for Gmail, Outlook,
 * Exchange, iCloud and IMAP). Callers have already authorised the account.
 */
export type ProviderResult = BatchResult;

const mailFor = async (accountId: string) => (await getProviders(accountId, null)).mail;

const orUnsupported = (r: BatchResult, what: string): BatchResult =>
  r.unsupported ? { ok: 0, failed: 1, firstError: `${what} is not supported for this mailbox type` } : r;

export async function setMessagesArchived(accountId: string, ids: string[], archived: boolean) {
  return (await mailFor(accountId)).setArchived(ids, archived);
}

export async function setMessagesTrashed(accountId: string, ids: string[], trashed: boolean) {
  return orUnsupported(await (await mailFor(accountId)).setTrashed(ids, trashed), "Trash");
}

export async function setMessagesRead(accountId: string, ids: string[], read: boolean) {
  return (await mailFor(accountId)).setRead(ids, read);
}

export async function setMessagesStarred(accountId: string, ids: string[], starred: boolean) {
  return orUnsupported(await (await mailFor(accountId)).setStarred(ids, starred), "Starring");
}

export async function setMessagesSpam(accountId: string, ids: string[], spam: boolean) {
  return orUnsupported(await (await mailFor(accountId)).setSpam(ids, spam), "Spam");
}
