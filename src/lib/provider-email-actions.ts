import type { EmailStatus } from "@prisma/client";
import { getProviders } from "@/server/providers";

interface SyncEmailOrganizationOptions {
  accountId: string;
  emailProviderId: string;
  status?: EmailStatus | null;
  customLabels?: string[];
}

/**
 * Mirror organizer changes (status, labels) to the mailbox through the
 * provider layer. (Replaces a call to `PATCH /email/messages/{id}`, which the
 * Aurinko API does not have, so these changes never reached the provider.)
 */
export async function syncEmailOrganizationToProvider({
  accountId,
  emailProviderId,
  status,
  customLabels,
}: SyncEmailOrganizationOptions): Promise<void> {
  const { mail } = await getProviders(accountId, null);
  const ids = [emailProviderId];
  const results = [];

  if (status === "read" || status === "unread") results.push(await mail.setRead(ids, status === "read"));
  if (status === "archived") results.push(await mail.setArchived(ids, true));
  if (status === "flagged") results.push(await mail.setStarred(ids, true));
  if (customLabels) results.push(await mail.setLabels(ids, customLabels));

  const failed = results.find((r) => r.failed > 0);
  if (failed) throw new Error(failed.firstError ?? "The mail provider rejected the change");
}
