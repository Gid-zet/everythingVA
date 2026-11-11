import "server-only";
import type { AurinkoClient } from "./http";
import { forEachLimited } from "./http";
import type {
  Attachment,
  BatchResult,
  MailCapabilities,
  MailProvider,
  OutgoingMessage,
  ServiceType,
} from "../types";

/**
 * Aurinko mail adapter.
 *
 * Unified endpoints (from Aurinko's OpenAPI spec):
 *   POST /email/messages/{id}/status  { unread?, archived? }  read state + archive
 *   POST /email/messages               send (reply threading via inReplyTo/references)
 *   GET  /email/messages/{id}/attachments/{attId}
 *   POST /subscriptions                webhooks
 * The unified API has no trash / star / spam, so those go through Aurinko's
 * Direct API passthrough to the native Gmail API (`/direct/gmail/v1/...`) or
 * Microsoft Graph (`/direct/me/...`). Other mailbox types report
 * `unsupported` instead of pretending to succeed.
 */
export function aurinkoMail(client: AurinkoClient, serviceType: ServiceType | null): MailProvider {
  const isGoogle = serviceType === "Google";
  const isMicrosoft = serviceType === "Office365";

  const capabilities: MailCapabilities = {
    archive: true,
    readState: true,
    trash: isGoogle || isMicrosoft,
    star: isGoogle || isMicrosoft,
    spam: isGoogle || isMicrosoft,
    drafts: true,
  };

  const unsupported = (): BatchResult => ({ ok: 0, failed: 0, unsupported: true });
  const enc = encodeURIComponent;

  const status = (ids: string[], body: Record<string, unknown>) =>
    forEachLimited(ids, (id) => client.post(`/email/messages/${enc(id)}/status`, body));

  const gmailModify = (ids: string[], add: string[], remove: string[]) =>
    forEachLimited(ids, (id) =>
      client.post(`/direct/gmail/v1/users/me/messages/${enc(id)}/modify`, {
        addLabelIds: add,
        removeLabelIds: remove,
      }),
    );

  const graphMove = (ids: string[], destinationId: string) =>
    forEachLimited(ids, (id) => client.post(`/direct/me/messages/${enc(id)}/move`, { destinationId }));

  return {
    serviceType,
    capabilities,

    async setRead(ids, read) {
      return ids.length ? status(ids, { unread: !read }) : { ok: 0, failed: 0 };
    },

    async setArchived(ids, archived) {
      return ids.length ? status(ids, { archived }) : { ok: 0, failed: 0 };
    },

    async setStarred(ids, starred) {
      if (!ids.length) return { ok: 0, failed: 0 };
      if (isGoogle) return gmailModify(ids, starred ? ["STARRED"] : [], starred ? [] : ["STARRED"]);
      if (isMicrosoft)
        return forEachLimited(ids, (id) =>
          client.patch(`/direct/me/messages/${enc(id)}`, {
            flag: { flagStatus: starred ? "flagged" : "notFlagged" },
          }),
        );
      return unsupported();
    },

    async setTrashed(ids, trashed) {
      if (!ids.length) return { ok: 0, failed: 0 };
      if (isGoogle)
        return forEachLimited(ids, (id) =>
          client.post(`/direct/gmail/v1/users/me/messages/${enc(id)}/${trashed ? "trash" : "untrash"}`, {}),
        );
      if (isMicrosoft) return graphMove(ids, trashed ? "deleteditems" : "inbox");
      return unsupported();
    },

    async setSpam(ids, spam) {
      if (!ids.length) return { ok: 0, failed: 0 };
      if (isGoogle) return gmailModify(ids, spam ? ["SPAM"] : ["INBOX"], spam ? ["INBOX"] : ["SPAM"]);
      if (isMicrosoft) return graphMove(ids, spam ? "junkemail" : "inbox");
      return unsupported();
    },

    async setLabels(ids, labels) {
      return ids.length ? status(ids, { keywords: labels }) : { ok: 0, failed: 0 };
    },

    async send(message: OutgoingMessage) {
      const data = await client.post<{ id?: string }>(
        "/email/messages",
        {
          from: message.from,
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
          replyTo: message.replyTo,
          subject: message.subject,
          body: message.body,
          inReplyTo: message.inReplyTo,
          references: message.references,
          attachments: message.attachments?.map((a) => ({
            name: a.name,
            mimeType: a.mimeType || "application/octet-stream",
            content: a.content.includes(",") ? a.content.split(",")[1] : a.content,
          })),
        },
        { bodyType: "html", returnIds: true },
      );
      return { id: data?.id };
    },

    async getAttachment(messageId, attachmentId): Promise<Attachment> {
      const a = await client.get<{ name?: string; mimeType?: string; size?: number; content?: string }>(
        `/email/messages/${enc(messageId)}/attachments/${enc(attachmentId)}`,
      );
      return {
        name: a.name ?? "attachment",
        mimeType: a.mimeType ?? "application/octet-stream",
        size: a.size,
        content: a.content ?? "",
      };
    },

    async subscribe(notificationUrl) {
      await client.post("/subscriptions", { resource: "/email/messages", notificationUrl });
    },
  };
}
