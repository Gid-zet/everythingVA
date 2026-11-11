import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import Account from "@/lib/account";
import { performInitialSync } from "@/lib/sync-actions";
import { SERVICE_LABELS, toServiceType } from "@/server/providers";
import { checkAccountHealth, disconnectAccount } from "@/server/services/accounts";
import { syncCalendarList } from "@/server/services/calendar-sync";
import { getSubscriptionStatus } from "@/lib/stripe-actions";
import { FREE_ACCOUNTS_PER_USER, PRO_ACCOUNTS_PER_USER } from "@/app/constants";

/** Connected mailboxes: health, sync status and management. No credentials leave the server. */
export const accountsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const [rows, subscribed] = await Promise.all([
      ctx.db.account.findMany({
        where: { userId: ctx.auth.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          emailAddress: true,
          name: true,
          serviceType: true,
          status: true,
          statusMessage: true,
          lastSyncedAt: true,
          createdAt: true,
          _count: { select: { threads: true, calendars: true } },
        },
      }),
      getSubscriptionStatus().catch(() => false),
    ]);
    return {
      limit: subscribed ? PRO_ACCOUNTS_PER_USER : FREE_ACCOUNTS_PER_USER,
      accounts: rows.map((r) => {
        const st = toServiceType(r.serviceType);
        return { ...r, providerLabel: st ? SERVICE_LABELS[st] : "Email" };
      }),
    };
  }),

  /** Pull new mail now (incremental), or redo the first sync if it failed. */
  resync: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.account.findFirst({
        where: { id: input.accountId, userId: ctx.auth.id },
        select: { id: true, status: true, nextDeltaToken: true },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      if (row.status === "needs_reauth") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reconnect this account first." });
      }
      try {
        if (!row.nextDeltaToken) {
          await performInitialSync(ctx.auth.id, row.id);
        } else {
          await (await Account.forId(row.id)).syncEmails();
          await syncCalendarList(row.id, ctx.auth.id).catch(() => undefined);
        }
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        if (message === "TOKEN_EXPIRED") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Access expired. Reconnect this account." });
        }
        await ctx.db.account.update({ where: { id: row.id }, data: { status: "error", statusMessage: message.slice(0, 300) } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  checkHealth: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.account.findFirst({ where: { id: input.accountId, userId: ctx.auth.id }, select: { id: true } });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return { status: await checkAccountHealth(row.id) };
    }),

  rename: protectedProcedure
    .input(z.object({ accountId: z.string(), name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.account.updateMany({
        where: { id: input.accountId, userId: ctx.auth.id },
        data: { name: input.name },
      });
      if (!count) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
    }),

  disconnect: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await disconnectAccount(ctx.auth.id, input.accountId);
        return { ok: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Could not disconnect the account",
        });
      }
    }),
});
