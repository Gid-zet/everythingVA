import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import Account from "@/lib/account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { getEmailDetails } from "@/lib/aurinko";
import type { Prisma } from "@prisma/client";
import { emailAddressSchema } from "@/lib/types";
import { FREE_CREDITS_PER_DAY } from "@/app/constants";
import { EmailOrganizer } from "@/lib/email-organizer";
import { checkAccountAuthStatus } from "@/lib/account-utils";
import { syncEmailOrganizationToProvider } from "@/lib/provider-email-actions";
import { getValidToken } from "@/lib/token-refresh";
import { TRPCError } from "@trpc/server";
import {
  setMessagesArchived,
  setMessagesTrashed,
  type ProviderResult,
} from "@/lib/provider-thread-actions";
import { oneClickUnsubscribe, parseListUnsubscribe } from "@/lib/unsubscribe";

export const authoriseAccountAccess = async (
  accountId: string,
  userId: string,
) => {
  try {
    const account = await db.account.findFirst({
      where: {
        id: accountId,
        userId: userId,
      },
      select: {
        id: true,
        emailAddress: true,
        name: true,
        token: true,
      },
    });
    if (!account) {
      console.log(
        `No account found for accountId: ${accountId}, userId: ${userId}`,
      );
      throw new Error(
        "Account not found. Please connect your email account first.",
      );
    }
    return account;
  } catch (error) {
    console.error("Error in authoriseAccountAccess:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error("Failed to access account");
  }
};

/** Not trashed, and not snoozed into the future. */
const visibleFilter = (): Prisma.ThreadWhereInput => ({
  trashedAt: null,
  OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
});

const inboxFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  inboxStatus: true,
  ...visibleFilter(),
});

const sentFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  sentStatus: true,
  ...visibleFilter(),
});

const draftFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  draftStatus: true,
  ...visibleFilter(),
});

const snoozedFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  trashedAt: null,
  snoozedUntil: { gt: new Date() },
});

const trashFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  trashedAt: { not: null },
});

const threadIdsInput = z.object({
  accountId: z.string(),
  threadIds: z.array(z.string()).min(1).max(500),
});

/** Provider message ids for threads, scoped to the account. */
async function messageIdsFor(accountId: string, threadIds: string[]) {
  const emails = await db.email.findMany({
    where: { threadId: { in: threadIds }, thread: { accountId } },
    select: { id: true, threadId: true },
  });
  return {
    messageIds: emails.map((e) => e.id),
    threadIds: [...new Set(emails.map((e) => e.threadId))],
  };
}

/**
 * Apply a provider action, then the local update. All-failed → throw so the
 * client rolls back; partial failure still commits locally and is reported.
 */
async function applyProviderAction(
  action: () => Promise<ProviderResult>,
  local: () => Promise<unknown>,
) {
  let result: ProviderResult;
  try {
    result = await action();
  } catch (error) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: error instanceof Error ? error.message : "Provider request failed",
    });
  }
  if (result.ok === 0 && result.failed > 0) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `Your mail provider rejected the change${result.firstError ? `: ${result.firstError}` : ""}`,
    });
  }
  await local();
  return { synced: result.ok, failed: result.failed };
}

/**
 * Resurface threads whose snooze has expired: clear the snooze and move them
 * back into the provider inbox. Called lazily from the sidebar's count poll.
 */
async function wakeSnoozedThreads(accountId: string) {
  const due = await db.thread.findMany({
    where: { accountId, snoozedUntil: { lte: new Date() } },
    select: { id: true },
    take: 200,
  });
  if (!due.length) return 0;
  const ids = due.map((t) => t.id);
  await db.thread.updateMany({
    where: { id: { in: ids }, accountId },
    data: { snoozedUntil: null, done: false, archivedAt: null },
  });
  const { messageIds } = await messageIdsFor(accountId, ids);
  void setMessagesArchived(accountId, messageIds, false).catch((error) =>
    console.error("Failed to unarchive woken snoozes:", error),
  );
  return ids.length;
}

export const mailRouter = createTRPCRouter({
  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    try {
      console.log("getAccounts called with userId:", ctx.auth.id);
      const accounts = await ctx.db.account.findMany({
        where: {
          userId: ctx.auth.id,
        },
        select: {
          id: true,
          emailAddress: true,
          name: true,
        },
      });
      console.log("getAccounts result:", accounts);
      return accounts;
    } catch (error) {
      console.error("Error in getAccounts:", error);
      // Return empty array if there's a database error
      return [];
    }
  }),
  getNumThreads: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        tab: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      let filter: Prisma.ThreadWhereInput = {};
      if (input.tab === "inbox") {
        filter = inboxFilter(account.id);
      } else if (input.tab === "sent") {
        filter = sentFilter(account.id);
      } else if (input.tab === "drafts") {
        filter = draftFilter(account.id);
      }
      return await ctx.db.thread.count({
        where: filter,
      });
    }),
  getThreads: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        tab: z.string(),
        done: z.boolean(),
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(50).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      let filter: Prisma.ThreadWhereInput = { accountId: account.id };
      if (input.tab === "inbox") {
        filter = { ...inboxFilter(account.id), done: input.done };
      } else if (input.tab === "sent") {
        filter = { ...sentFilter(account.id), done: input.done };
      } else if (input.tab === "drafts") {
        filter = { ...draftFilter(account.id), done: input.done };
      } else if (input.tab === "snoozed") {
        filter = snoozedFilter(account.id);
      } else if (input.tab === "trash") {
        filter = trashFilter(account.id);
      }

      // List rows only need the latest message's snippet — full HTML bodies are
      // loaded per-thread by getThreadById when a thread is opened.
      const threads = await ctx.db.thread.findMany({
        where: filter,
        include: {
          emails: {
            orderBy: {
              sentAt: "desc",
            },
            take: 1,
            select: {
              from: true,
              bodySnippet: true,
              emailLabel: true,
              subject: true,
              sysLabels: true,
              status: true,
              hasAttachments: true,
              id: true,
              sentAt: true,
            },
          },
          _count: { select: { emails: true } },
        },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: [{ lastMessageDate: "desc" }, { id: "desc" }],
      });

      let nextCursor: string | null = null;
      if (threads.length > input.limit) {
        threads.pop();
        nextCursor = threads.at(-1)?.id ?? null;
      }
      return { threads, nextCursor };
    }),

  getThreadCounts: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      // The sidebar polls this every minute, which makes it a cheap place to
      // resurface expired snoozes without a separate cron.
      await wakeSnoozedThreads(account.id).catch((error) =>
        console.error("wakeSnoozedThreads failed:", error),
      );
      const [inbox, drafts, sent, snoozed] = await ctx.db.$transaction([
        ctx.db.thread.count({ where: { ...inboxFilter(account.id), done: false } }),
        ctx.db.thread.count({ where: draftFilter(account.id) }),
        ctx.db.thread.count({ where: sentFilter(account.id) }),
        ctx.db.thread.count({ where: snoozedFilter(account.id) }),
      ]);
      return { inbox, drafts, sent, snoozed };
    }),

  getThreadById: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        threadId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return await ctx.db.thread.findFirst({
        where: { id: input.threadId, accountId: account.id },
        include: {
          emails: {
            orderBy: {
              sentAt: "asc",
            },
            select: {
              from: true,
              to: true,
              cc: true,
              body: true,
              subject: true,
              bodySnippet: true,
              emailLabel: true,
              sysLabels: true,
              id: true,
              sentAt: true,
            },
          },
        },
      });
    }),

  getReplyDetails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        threadId: z.string(),
        replyType: z.enum(["reply", "replyAll"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      const thread = await ctx.db.thread.findFirst({
        where: { id: input.threadId, accountId: account.id },
        include: {
          emails: {
            orderBy: { sentAt: "asc" },
            select: {
              from: true,
              to: true,
              cc: true,
              bcc: true,
              sentAt: true,
              subject: true,
              internetMessageId: true,
            },
          },
        },
      });

      if (!thread || thread.emails.length === 0) {
        throw new Error("Thread not found or empty");
      }

      const lastExternalEmail = thread.emails
        .reverse()
        .find((email) => email.from.id !== account.id);

      if (!lastExternalEmail) {
        throw new Error("No external email found in thread");
      }

      const allRecipients = new Set([
        ...thread.emails.flatMap((e) => [e.from, ...e.to, ...e.cc]),
      ]);

      if (input.replyType === "reply") {
        return {
          to: [lastExternalEmail.from],
          cc: [],
          from: { name: account.name, address: account.emailAddress },
          subject: `${lastExternalEmail.subject}`,
          id: lastExternalEmail.internetMessageId,
        };
      } else if (input.replyType === "replyAll") {
        return {
          to: [
            lastExternalEmail.from,
            ...lastExternalEmail.to.filter((addr) => addr.id !== account.id),
          ],
          cc: lastExternalEmail.cc.filter((addr) => addr.id !== account.id),
          from: { name: account.name, address: account.emailAddress },
          subject: `${lastExternalEmail.subject}`,
          id: lastExternalEmail.internetMessageId,
        };
      }
    }),

  syncEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      if (!account) throw new Error("Invalid token");

      try {
        const acc = new Account(account.token, input.accountId);
        await acc.syncEmails();
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
          throw new Error("TOKEN_EXPIRED");
        }
        console.error("Sync emails error:", error);
        throw new Error("Failed to sync emails");
      }
    }),
  checkAccountAuth: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await checkAccountAuthStatus(input.accountId);
    }),
  setUndone: protectedProcedure
    .input(
      z.object({
        threadId: z.string().optional(),
        threadIds: z.array(z.string()).optional(),
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      if (!account) throw new Error("Invalid token");
      const ids = [
        ...(input.threadId ? [input.threadId] : []),
        ...(input.threadIds ?? []),
      ];
      await ctx.db.thread.updateMany({
        where: { id: { in: ids }, accountId: account.id },
        data: { done: false },
      });
    }),
  setDone: protectedProcedure
    .input(
      z.object({
        threadId: z.string().optional(),
        threadIds: z.array(z.string()).optional(),
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.threadId && !input.threadIds)
        throw new Error("No threadId or threadIds provided");
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      if (!account) throw new Error("Invalid token");
      const ids = [
        ...(input.threadId ? [input.threadId] : []),
        ...(input.threadIds ?? []),
      ];
      await ctx.db.thread.updateMany({
        where: { id: { in: ids }, accountId: account.id },
        data: { done: true },
      });
    }),

  // ── Provider-synced triage ────────────────────────────────────────────────
  archiveThreads: protectedProcedure
    .input(threadIdsInput)
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const { messageIds, threadIds } = await messageIdsFor(account.id, input.threadIds);
      return applyProviderAction(
        () => setMessagesArchived(account.id, messageIds, true),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { done: true, archivedAt: new Date() },
          }),
      );
    }),
  unarchiveThreads: protectedProcedure
    .input(threadIdsInput)
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const { messageIds, threadIds } = await messageIdsFor(account.id, input.threadIds);
      return applyProviderAction(
        () => setMessagesArchived(account.id, messageIds, false),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { done: false, archivedAt: null, snoozedUntil: null },
          }),
      );
    }),
  trashThreads: protectedProcedure
    .input(threadIdsInput)
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const { messageIds, threadIds } = await messageIdsFor(account.id, input.threadIds);
      return applyProviderAction(
        () => setMessagesTrashed(account.id, messageIds, true),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { trashedAt: new Date() },
          }),
      );
    }),
  restoreThreads: protectedProcedure
    .input(threadIdsInput)
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const { messageIds, threadIds } = await messageIdsFor(account.id, input.threadIds);
      return applyProviderAction(
        () => setMessagesTrashed(account.id, messageIds, false),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { trashedAt: null },
          }),
      );
    }),
  /** Snooze = archive at the provider + a local wake-up time. */
  snoozeThreads: protectedProcedure
    .input(threadIdsInput.extend({ until: z.date() }))
    .mutation(async ({ ctx, input }) => {
      if (input.until.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Snooze time must be in the future" });
      }
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const { messageIds, threadIds } = await messageIdsFor(account.id, input.threadIds);
      return applyProviderAction(
        () => setMessagesArchived(account.id, messageIds, true),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { snoozedUntil: input.until, done: false, archivedAt: new Date() },
          }),
      );
    }),
  unsnoozeThreads: protectedProcedure
    .input(threadIdsInput)
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const { messageIds, threadIds } = await messageIdsFor(account.id, input.threadIds);
      return applyProviderAction(
        () => setMessagesArchived(account.id, messageIds, false),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { snoozedUntil: null, done: false, archivedAt: null },
          }),
      );
    }),
  wakeSnoozedThreads: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      return { woken: await wakeSnoozedThreads(account.id) };
    }),

  // ── Bulk unsubscribe ──────────────────────────────────────────────────────
  /** Senders ranked by how much mail they've sent this account. */
  getSenders: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        limit: z.number().min(1).max(100).default(30),
        /** Offset into the ranking (tRPC's infinite-query cursor). */
        cursor: z.number().min(0).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const received: Prisma.EmailWhereInput = {
        thread: { accountId: account.id },
        emailLabel: { not: "sent" },
        from: { address: { not: account.emailAddress } },
      };

      const groups = await ctx.db.email.groupBy({
        by: ["fromId"],
        where: received,
        _count: { _all: true },
        _max: { sentAt: true },
        orderBy: { _count: { fromId: "desc" } },
        take: input.limit + 1,
        skip: input.cursor ?? 0,
      });
      const hasMore = groups.length > input.limit;
      if (hasMore) groups.pop();
      const fromIds = groups.map((g) => g.fromId);
      const nextCursor = hasMore ? (input.cursor ?? 0) + input.limit : null;
      if (!fromIds.length) return { senders: [], nextCursor };

      const [addresses, latest, inboxCounts] = await Promise.all([
        ctx.db.emailAddress.findMany({
          where: { id: { in: fromIds }, accountId: account.id },
          select: { id: true, name: true, address: true, unsubscribedAt: true },
        }),
        // Latest message per sender carries the current List-Unsubscribe header.
        ctx.db.email.findMany({
          where: { ...received, fromId: { in: fromIds } },
          distinct: ["fromId"],
          orderBy: { sentAt: "desc" },
          select: { fromId: true, internetHeaders: true, subject: true },
        }),
        ctx.db.email.groupBy({
          by: ["fromId"],
          where: {
            ...received,
            fromId: { in: fromIds },
            thread: { ...inboxFilter(account.id), done: false },
          },
          _count: { _all: true },
        }),
      ]);
      const byId = new Map(addresses.map((a) => [a.id, a]));
      const latestBy = new Map(latest.map((l) => [l.fromId, l]));
      const inboxBy = new Map(inboxCounts.map((c) => [c.fromId, c._count._all]));

      const senders = groups.flatMap((g) => {
        const addr = byId.get(g.fromId);
        if (!addr) return [];
        const last = latestBy.get(g.fromId);
        const unsub = parseListUnsubscribe(last?.internetHeaders);
        return [
          {
            fromId: g.fromId,
            name: addr.name,
            address: addr.address,
            unsubscribedAt: addr.unsubscribedAt,
            emailCount: g._count._all,
            inboxCount: inboxBy.get(g.fromId) ?? 0,
            lastSentAt: g._max.sentAt,
            lastSubject: last?.subject ?? null,
            unsubscribe: unsub
              ? { oneClick: unsub.oneClick, hasUrl: !!unsub.url, hasMailto: !!unsub.mailto }
              : null,
          },
        ];
      });
      return { senders, nextCursor };
    }),

  /**
   * Unsubscribe from a sender using its List-Unsubscribe header: RFC 8058
   * one-click POST, else a mailto request sent from the user's mailbox, else
   * hand the https link back for the user to open.
   */
  unsubscribeSender: protectedProcedure
    .input(z.object({ accountId: z.string(), fromId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const sender = await ctx.db.emailAddress.findFirst({
        where: { id: input.fromId, accountId: account.id },
      });
      if (!sender) throw new TRPCError({ code: "NOT_FOUND", message: "Sender not found" });

      const recent = await ctx.db.email.findMany({
        where: { fromId: sender.id, thread: { accountId: account.id } },
        orderBy: { sentAt: "desc" },
        take: 10,
        select: { internetHeaders: true },
      });
      const options = recent
        .map((e) => parseListUnsubscribe(e.internetHeaders))
        .find((o) => o !== null);
      if (!options) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This sender doesn't provide an unsubscribe link",
        });
      }

      const markUnsubscribed = () =>
        ctx.db.emailAddress.update({
          where: { id: sender.id },
          data: { unsubscribedAt: new Date() },
        });

      if (options.oneClick && options.url) {
        const ok = await oneClickUnsubscribe(options.url).catch(() => false);
        if (ok) {
          await markUnsubscribed();
          return { method: "one-click" as const };
        }
      }
      if (options.mailto) {
        const acc = new Account(account.token, account.id);
        await acc.sendEmail({
          from: { name: account.name, address: account.emailAddress },
          to: [{ address: options.mailto.to, name: "" }],
          subject: options.mailto.subject,
          body: options.mailto.body,
        });
        await markUnsubscribed();
        return { method: "mailto" as const };
      }
      if (options.url) {
        // A plain https link needs the user to confirm on the sender's page,
        // so it is not marked unsubscribed until they do (markUnsubscribed).
        return { method: "link" as const, url: options.url };
      }
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unsubscribe failed" });
    }),

  /** For link-based unsubscribes the user completes on the sender's site. */
  markSenderUnsubscribed: protectedProcedure
    .input(z.object({ accountId: z.string(), fromId: z.string(), unsubscribed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      await ctx.db.emailAddress.updateMany({
        where: { id: input.fromId, accountId: account.id },
        data: { unsubscribedAt: input.unsubscribed ? new Date() : null },
      });
    }),

  /** Archive every inbox thread from a sender; returns ids so the UI can undo. */
  archiveAllFromSender: protectedProcedure
    .input(z.object({ accountId: z.string(), fromId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const threads = await ctx.db.thread.findMany({
        where: {
          ...inboxFilter(account.id),
          done: false,
          emails: { some: { fromId: input.fromId } },
        },
        select: { id: true },
        take: 500,
      });
      const ids = threads.map((t) => t.id);
      if (!ids.length) return { threadIds: [] as string[], synced: 0, failed: 0 };
      const { messageIds } = await messageIdsFor(account.id, ids);
      const result = await applyProviderAction(
        () => setMessagesArchived(account.id, messageIds, true),
        () =>
          ctx.db.thread.updateMany({
            where: { id: { in: ids }, accountId: account.id },
            data: { done: true, archivedAt: new Date() },
          }),
      );
      return { threadIds: ids, ...result };
    }),
  getEmailDetails: protectedProcedure
    .input(
      z.object({
        emailId: z.string(),
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return await getEmailDetails(account.token, input.emailId);
    }),
  sendEmail: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        body: z.string(),
        subject: z.string(),
        from: emailAddressSchema,
        to: z.array(emailAddressSchema),
        cc: z.array(emailAddressSchema).optional(),
        bcc: z.array(emailAddressSchema).optional(),
        replyTo: emailAddressSchema,
        inReplyTo: z.string().optional(),
        threadId: z.string().optional(),
        attachments: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              size: z.number(),
              type: z.string(),
              content: z.string(), // base64 encoded content
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const acc = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const account = new Account(acc.token);
      await account.sendEmail({
        body: input.body,
        subject: input.subject,
        threadId: input.threadId,
        to: input.to,
        bcc: input.bcc,
        cc: input.cc,
        replyTo: input.replyTo,
        from: input.from,
        inReplyTo: input.inReplyTo,
        attachments: input.attachments,
      });
    }),
  getEmailSuggestions: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        query: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return await ctx.db.emailAddress.findMany({
        where: {
          accountId: input.accountId,
          OR: [
            {
              address: {
                contains: input.query,
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: input.query,
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          address: true,
          name: true,
        },
        take: 10,
      });
    }),
  getMyAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return account;
    }),
  getChatbotInteraction: protectedProcedure.query(async ({ ctx }) => {
    const chatbotInteraction = await ctx.db.chatbotInteraction.findUnique({
      where: {
        day: new Date().toDateString(),
        userId: ctx.auth.id,
      },
      select: { count: true },
    });
    const remainingCredits =
      FREE_CREDITS_PER_DAY - (chatbotInteraction?.count || 0);
    return {
      remainingCredits,
    };
  }),

  // Email Organization Endpoints
  organizeEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        autoClassify: z.boolean().optional(),
        createCategories: z.boolean().optional(),
        applyRules: z.boolean().optional(),
        reorganize: z.boolean().optional(), // If true, re-organize all emails including already classified ones
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await EmailOrganizer.organizeEmails({
        userId: ctx.auth.id,
        accountId: account.id,
        autoClassify: input.autoClassify,
        createCategories: input.createCategories,
        applyRules: input.applyRules,
        reorganize: input.reorganize,
      });
    }),

  getOrganizedEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        category: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["unread", "read", "archived", "flagged", "snoozed"])
          .optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await EmailOrganizer.getOrganizedEmails(ctx.auth.id, account.id, {
        category: input.category,
        priority: input.priority,
        status: input.status,
        search: input.search,
      });
    }),

  getEmailCategories: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await ctx.db.emailCategory.findMany({
        where: {
          userId: ctx.auth.id,
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  getEmailStats: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await EmailOrganizer.getEmailStats(ctx.auth.id, account.id);
    }),

  createEmailRule: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        conditions: z.array(
          z.object({
            field: z.string(),
            operator: z.string(),
            value: z.any(),
          }),
        ),
        actions: z.array(
          z.object({
            type: z.string(),
            value: z.any(),
          }),
        ),
        priority: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await ctx.db.emailRule.create({
        data: {
          userId: ctx.auth.id,
          name: input.name,
          description: input.description,
          conditions: input.conditions,
          actions: input.actions,
          priority: input.priority || 0,
        },
      });
    }),

  getEmailRules: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await ctx.db.emailRule.findMany({
        where: {
          userId: ctx.auth.id,
        },
        orderBy: {
          priority: "desc",
        },
      });
    }),

  updateEmailOrganization: protectedProcedure
    .input(
      z.object({
        emailId: z.string(),
        accountId: z.string(),
        categoryId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["unread", "read", "archived", "flagged", "snoozed"])
          .optional(),
        customLabels: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      // Verify the email belongs to this account
      const email = await ctx.db.email.findFirst({
        where: {
          id: input.emailId,
          thread: {
            accountId: account.id,
          },
        },
      });

      if (!email) {
        throw new Error("Email not found or access denied");
      }

      // Update the email
      const updateData: any = {};

      if (input.categoryId !== undefined) {
        updateData.categoryId = input.categoryId || null;
      }

      if (input.priority !== undefined) {
        updateData.priority = input.priority;
      }

      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      if (input.customLabels !== undefined) {
        updateData.customLabels = input.customLabels;
      }

      // Update or create email notes
      if (input.notes !== undefined) {
        // You might want to create a separate EmailNotes table for this
        // For now, we'll store it in a custom field or use the existing structure
        updateData.notes = input.notes;
      }

      const updatedEmail = await ctx.db.email.update({
        where: { id: input.emailId },
        data: updateData,
      });

      if (input.status !== undefined || input.customLabels !== undefined) {
        try {
          await syncEmailOrganizationToProvider({
            accountId: account.id,
            emailProviderId: email.id,
            status: input.status ?? null,
            customLabels: input.customLabels,
          });
        } catch (error) {
          console.error("Failed to sync provider organization:", error);
        }
      }

      return updatedEmail;
    }),

  bulkUpdateEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        emailIds: z.array(z.string()),
        categoryId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["unread", "read", "archived", "flagged", "snoozed"])
          .optional(),
        customLabels: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      // Verify all emails belong to this account
      const emails = await ctx.db.email.findMany({
        where: {
          id: { in: input.emailIds },
          thread: {
            accountId: account.id,
          },
        },
      });

      if (emails.length !== input.emailIds.length) {
        throw new Error("Some emails not found or access denied");
      }

      // Prepare update data
      const updateData: any = {};

      if (input.categoryId !== undefined) {
        updateData.categoryId = input.categoryId || null;
      }

      if (input.priority !== undefined) {
        updateData.priority = input.priority;
      }

      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      if (input.customLabels !== undefined) {
        updateData.customLabels = input.customLabels;
      }

      // Bulk update emails
      const result = await ctx.db.email.updateMany({
        where: {
          id: { in: input.emailIds },
          thread: {
            accountId: account.id,
          },
        },
        data: updateData,
      });

      if (input.status !== undefined || input.customLabels !== undefined) {
        await Promise.all(
          emails.map((email) =>
            syncEmailOrganizationToProvider({
              accountId: account.id,
              emailProviderId: email.id,
              status: input.status ?? null,
              customLabels: input.customLabels,
            }).catch((error) =>
              console.error(
                `Failed to sync provider organization for email ${email.id}:`,
                error,
              ),
            ),
          ),
        );
      }

      return { updatedCount: result.count };
    }),

  pushCategoriesToEmailProvider: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      // Check if account has a valid token before processing
      const hasValidToken = await getValidToken(account.id);
      
      if (!hasValidToken) {
        // Check if account has a refresh token at all
        const accountWithToken = await ctx.db.account.findUnique({
          where: { id: account.id },
          select: { refreshToken: true },
        });
        
        if (!accountWithToken?.refreshToken) {
          return {
            success: false,
            processedCount: 0,
            successCount: 0,
            errorCount: 0,
            errors: ["Account needs re-authorization. Please re-authorize your email account before pushing categories."],
            needsReauth: true,
            needsResync: false,
          };
        }
      }

      // Step 1: Get ALL categories for this user (not just those with emails)
      const allCategories = await ctx.db.emailCategory.findMany({
        where: {
          userId: ctx.auth.id,
        },
        orderBy: {
          name: "asc",
        },
      });

      if (allCategories.length === 0) {
        return {
          success: true,
          processedCount: 0,
          successCount: 0,
          errorCount: 0,
          errors: undefined,
          needsReauth: false,
        };
      }

      // Step 2: Get any email from this account to use for label creation
      // (Labels are created when assigned to emails, so we need at least one email)
      // Try to find a recent email that's likely to still exist in the provider
      const anyEmail = await ctx.db.email.findFirst({
        where: {
          thread: {
            accountId: account.id,
          },
        },
        orderBy: {
          receivedAt: "desc",
        },
      });
      
      // Track if we're getting too many 404s (indicates emails need re-syncing)
      let emailNotFoundCount = 0;
      const maxNotFoundBeforeWarning = 5;

      // Step 3: Get all emails with categories for this account, grouped by category
      const categorizedEmails = await ctx.db.email.findMany({
        where: {
          thread: {
            accountId: account.id,
          },
          categoryId: {
            not: null,
          },
        },
        include: {
          category: true,
        },
      });

      // Group emails by category for better organization
      const emailsByCategory = new Map<string, typeof categorizedEmails>();
      for (const email of categorizedEmails) {
        if (!email.category) continue;
        const categoryName = email.category.name;
        if (!emailsByCategory.has(categoryName)) {
          emailsByCategory.set(categoryName, []);
        }
        emailsByCategory.get(categoryName)!.push(email);
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      let hasAuthError = false;
      const createdLabels = new Set<string>();
      let labelsCreatedCount = 0;

      // Step 4: Create labels in provider for ALL categories
      // (Labels are automatically created in Gmail/Office365 when assigned to emails)
      if (anyEmail) {
        for (const category of allCategories) {
          if (createdLabels.has(category.name)) continue;

          try {
            // Use any email to create the label (labels are created when first assigned)
            const existingLabels = anyEmail.keywords || [];
            const labelsToPush = existingLabels.includes(category.name)
              ? existingLabels
              : [...existingLabels, category.name];
            
            await syncEmailOrganizationToProvider({
              accountId: account.id,
              emailProviderId: anyEmail.id,
              customLabels: labelsToPush,
            });
            
            // Update database for the email used to create the label
            await ctx.db.email.update({
              where: { id: anyEmail.id },
              data: {
                keywords: labelsToPush,
                customLabels: labelsToPush,
              },
            });
            
            createdLabels.add(category.name);
            labelsCreatedCount++;
            console.log(`Created label "${category.name}" in email provider`);
          } catch (createError: any) {
            if (createError instanceof Error && createError.message.includes("No valid provider token")) {
              hasAuthError = true;
              break; // Stop processing if auth fails
            } else if (
              createError?.response?.status === 404 ||
              (createError instanceof Error && createError.message.includes("Email not found in provider"))
            ) {
              emailNotFoundCount++;
              console.log(`Email ${anyEmail.id} not found in provider, skipping label creation for "${category.name}"`);
              
              // If we're getting too many 404s, emails likely need re-syncing
              if (emailNotFoundCount >= maxNotFoundBeforeWarning) {
                // Try to find a valid email by fetching recent emails from provider
                // For now, just skip and add a warning
                if (emailNotFoundCount === maxNotFoundBeforeWarning) {
                  errors.push(`Many emails not found in provider. This usually happens after re-authorization. Please sync your emails first to update email IDs.`);
                }
                // Skip remaining label creation attempts
                continue;
              }
              
              // Try to find another email to use for this label
              const alternativeEmail = await ctx.db.email.findFirst({
                where: {
                  thread: {
                    accountId: account.id,
                  },
                  id: {
                    not: anyEmail.id,
                  },
                },
                orderBy: {
                  receivedAt: "desc",
                },
              });
              
              if (alternativeEmail) {
                try {
                  const altLabels = alternativeEmail.keywords || [];
                  const altLabelsToPush = altLabels.includes(category.name)
                    ? altLabels
                    : [...altLabels, category.name];
                  
                  await syncEmailOrganizationToProvider({
                    accountId: account.id,
                    emailProviderId: alternativeEmail.id,
                    customLabels: altLabelsToPush,
                  });
                  
                  await ctx.db.email.update({
                    where: { id: alternativeEmail.id },
                    data: {
                      keywords: altLabelsToPush,
                      customLabels: altLabelsToPush,
                    },
                  });
                  
                  createdLabels.add(category.name);
                  labelsCreatedCount++;
                  console.log(`Created label "${category.name}" in email provider using alternative email`);
                } catch (altError: any) {
                  emailNotFoundCount++;
                  if (altError?.response?.status === 404 || 
                      (altError instanceof Error && altError.message.includes("Email not found in provider"))) {
                    // Another 404, continue to next category
                    continue;
                  }
                  const errorMessage = `Failed to create label "${category.name}": ${altError instanceof Error ? altError.message : "Unknown error"}`;
                  errors.push(errorMessage);
                  errorCount++;
                }
              } else {
                const errorMessage = `Failed to create label "${category.name}": No emails available to create label`;
                errors.push(errorMessage);
                errorCount++;
              }
            } else {
              const errorMessage = `Failed to create label "${category.name}": ${createError instanceof Error ? createError.message : "Unknown error"}`;
              errors.push(errorMessage);
              errorCount++;
            }
          }
        }
      } else {
        // No emails in account, can't create labels
        return {
          success: false,
          processedCount: 0,
          successCount: 0,
          errorCount: allCategories.length,
          errors: ["Cannot create labels: No emails found in account. Please sync emails first."],
          needsReauth: false,
          needsResync: false,
        };
      }

      // Step 5: Assign all categorized emails to their corresponding labels
      for (const category of allCategories) {
        const categoryEmails = emailsByCategory.get(category.name) || [];
        
        if (categoryEmails.length === 0) {
          // No emails in this category, but label is already created
          continue;
        }

        // Assign all emails in this category to the label
        // Process emails in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < categoryEmails.length; i += batchSize) {
          const batch = categoryEmails.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async (email) => {
              try {
                // Get existing labels and add category name if not already present
                const existingLabels = email.keywords || [];
                const categoryLabel = category.name;
                
                // Only add if not already present
                if (!existingLabels.includes(categoryLabel)) {
                  const updatedLabels = [...existingLabels, categoryLabel];
                  
                  // Update the email in database with new labels
                  await ctx.db.email.update({
                    where: { id: email.id },
                    data: {
                      keywords: updatedLabels,
                      customLabels: updatedLabels,
                    },
                  });

                  // Push to email provider
                  try {
                    await syncEmailOrganizationToProvider({
                      accountId: account.id,
                      emailProviderId: email.id,
                      customLabels: updatedLabels,
                    });
                    successCount++;
                  } catch (syncError: any) {
                    // If it's an auth error, mark it but don't log every single one
                    if (syncError instanceof Error && syncError.message.includes("No valid provider token")) {
                      hasAuthError = true;
                    } else if (
                      syncError?.response?.status === 404 ||
                      (syncError instanceof Error && syncError.message.includes("Email not found in provider"))
                    ) {
                      // Email not found in provider (might have been deleted or ID changed)
                      // This often happens after re-authorization when email IDs change
                      emailNotFoundCount++;
                      
                      // If we're getting too many 404s, add a warning
                      if (emailNotFoundCount === maxNotFoundBeforeWarning) {
                        errors.push(`Many emails not found in provider. This usually happens after re-authorization. Please sync your emails first to update email IDs.`);
                      }
                      
                      console.log(`Email ${email.id} not found in provider, skipping label push (already updated in database)`);
                      // Don't add to errors array or increment errorCount for individual emails
                    } else {
                      const errorMessage = `Failed to push label "${categoryLabel}" to email ${email.id}: ${syncError instanceof Error ? syncError.message : "Unknown error"}`;
                      errors.push(errorMessage);
                      errorCount++;
                    }
                  }
                } else {
                  // Label already exists, just verify it's in the provider
                  try {
                    await syncEmailOrganizationToProvider({
                      accountId: account.id,
                      emailProviderId: email.id,
                      customLabels: existingLabels,
                    });
                    successCount++;
                  } catch (syncError: any) {
                    if (
                      syncError?.response?.status === 404 ||
                      (syncError instanceof Error && syncError.message.includes("Email not found in provider"))
                    ) {
                      emailNotFoundCount++;
                      // If we're getting too many 404s, add a warning
                      if (emailNotFoundCount === maxNotFoundBeforeWarning) {
                        errors.push(`Many emails not found in provider. This usually happens after re-authorization. Please sync your emails first to update email IDs.`);
                      }
                      console.log(`Email ${email.id} not found in provider, skipping verification`);
                    }
                    // Don't count as error for already-labeled emails
                  }
                }
              } catch (error) {
                errorCount++;
                const errorMessage = `Failed to process email ${email.id} in category "${category.name}": ${error instanceof Error ? error.message : "Unknown error"}`;
                errors.push(errorMessage);
              }
            }),
          );
          
          // If we encountered auth errors, stop processing to avoid spam
          if (hasAuthError) {
            break;
          }
        }
        
        if (hasAuthError) {
          break;
        }
      }

      // If we had auth errors, add a summary message instead of listing all errors
      if (hasAuthError) {
        return {
          success: false,
          processedCount: categorizedEmails.length,
          successCount,
          errorCount: categorizedEmails.length - successCount,
          errors: [
            `Unable to push categories to email provider: Account needs re-authorization. Please re-authorize your email account and try again. ${labelsCreatedCount > 0 ? `${labelsCreatedCount} label${labelsCreatedCount !== 1 ? "s" : ""} created. ` : ""}${successCount > 0 ? `${successCount} email${successCount !== 1 ? "s" : ""} updated.` : ""}`.trim(),
            ...errors.slice(0, 5), // Include up to 5 non-auth errors if any
          ],
          needsReauth: true,
          needsResync: false,
        };
      }

      // If we got many 404s, suggest re-syncing emails
      if (emailNotFoundCount >= maxNotFoundBeforeWarning) {
        return {
          success: false,
          processedCount: categorizedEmails.length,
          successCount,
          errorCount: categorizedEmails.length - successCount,
          labelsCreated: labelsCreatedCount,
          errors: [
            `Unable to push categories: ${emailNotFoundCount} email${emailNotFoundCount !== 1 ? "s" : ""} not found in provider. This usually happens after re-authorization when email IDs change. Please sync your emails first to update email IDs, then try pushing categories again.`,
            ...errors.filter(e => !e.includes("Many emails not found")).slice(0, 5),
          ],
          needsReauth: false,
          needsResync: true,
        };
      }

      return {
        success: errorCount === 0,
        processedCount: categorizedEmails.length,
        successCount,
        errorCount,
        labelsCreated: labelsCreatedCount,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined, // Limit error output
        needsReauth: false,
        needsResync: false,
      };
    }),
});
