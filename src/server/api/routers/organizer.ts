import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { asTRPCError } from "@/server/providers";
import { aiPromptToRule } from "@/server/organizer/ai";
import { ensurePresetRules, processBatch, runRulesOnMessage, undoRun } from "@/server/organizer/run";
import { ruleInputSchema } from "@/server/organizer/types";

/** Every procedure is scoped to an account the caller owns. */
async function owned(accountId: string, userId: string) {
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, emailAddress: true, organizerAutoRun: true },
  });
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  return account;
}

const toData = (r: z.infer<typeof ruleInputSchema>) => ({
  name: r.name,
  enabled: r.enabled,
  instructions: r.instructions || null,
  from: r.from || null,
  to: r.to || null,
  subject: r.subject || null,
  body: r.body || null,
  conditionalOperator: r.conditionalOperator,
  actions: r.actions as unknown as Prisma.InputJsonValue,
});

const uniqueName = (e: unknown) =>
  (e as { code?: string })?.code === "P2002"
    ? new TRPCError({ code: "CONFLICT", message: "A rule with that name already exists." })
    : e;

export const organizerRouter = createTRPCRouter({
  overview: protectedProcedure.input(z.object({ accountId: z.string() })).query(async ({ ctx, input }) => {
    const account = await owned(input.accountId, ctx.auth.id);
    await ensurePresetRules(account.id);
    const since = new Date(Date.now() - 7 * 864e5);
    const [rules, counts, ruleCounts] = await Promise.all([
      db.organizerRule.findMany({ where: { accountId: account.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
      db.ruleRun.groupBy({ by: ["status"], where: { accountId: account.id, createdAt: { gte: since } }, _count: { _all: true } }),
      db.ruleRun.groupBy({
        by: ["ruleId"],
        where: { accountId: account.id, status: "APPLIED", createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
    const perRule = Object.fromEntries(ruleCounts.map((c) => [c.ruleId ?? "", c._count._all]));
    return {
      autoRun: account.organizerAutoRun,
      rules: rules.map((r) => ({ ...r, matchesThisWeek: perRule[r.id] ?? 0 })),
      week: {
        applied: byStatus.APPLIED ?? 0,
        skipped: byStatus.SKIPPED ?? 0,
        errors: byStatus.ERROR ?? 0,
      },
    };
  }),

  setAutoRun: protectedProcedure
    .input(z.object({ accountId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      await db.account.update({ where: { id: account.id }, data: { organizerAutoRun: input.enabled } });
    }),

  createRule: protectedProcedure
    .input(z.object({ accountId: z.string(), rule: ruleInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      const last = await db.organizerRule.findFirst({ where: { accountId: account.id }, orderBy: { position: "desc" } });
      try {
        return await db.organizerRule.create({
          data: { accountId: account.id, position: (last?.position ?? -1) + 1, ...toData(input.rule) },
        });
      } catch (e) {
        throw uniqueName(e);
      }
    }),

  updateRule: protectedProcedure
    .input(z.object({ accountId: z.string(), ruleId: z.string(), rule: ruleInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      try {
        const { count } = await db.organizerRule.updateMany({
          where: { id: input.ruleId, accountId: account.id },
          data: toData(input.rule),
        });
        if (!count) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      } catch (e) {
        throw uniqueName(e);
      }
    }),

  toggleRule: protectedProcedure
    .input(z.object({ accountId: z.string(), ruleId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      await db.organizerRule.updateMany({ where: { id: input.ruleId, accountId: account.id }, data: { enabled: input.enabled } });
    }),

  moveRule: protectedProcedure
    .input(z.object({ accountId: z.string(), ruleId: z.string(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      const rules = await db.organizerRule.findMany({
        where: { accountId: account.id },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const i = rules.findIndex((r) => r.id === input.ruleId);
      const j = input.direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= rules.length) return;
      [rules[i], rules[j]] = [rules[j]!, rules[i]!];
      await db.$transaction(rules.map((r, position) => db.organizerRule.update({ where: { id: r.id }, data: { position } })));
    }),

  deleteRule: protectedProcedure
    .input(z.object({ accountId: z.string(), ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      await db.organizerRule.deleteMany({ where: { id: input.ruleId, accountId: account.id } });
    }),

  /** "Describe a rule" → a rule draft for the user to review before saving. */
  ruleFromPrompt: protectedProcedure
    .input(z.object({ accountId: z.string(), prompt: z.string().trim().min(5).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await owned(input.accountId, ctx.auth.id);
      try {
        return await aiPromptToRule(input.prompt);
      } catch (error) {
        throw asTRPCError(error, "Couldn't turn that into a rule");
      }
    }),

  /** Recent received mail with its rule outcome, for testing rules. */
  recentMessages: protectedProcedure.input(z.object({ accountId: z.string() })).query(async ({ ctx, input }) => {
    const account = await owned(input.accountId, ctx.auth.id);
    const emails = await db.email.findMany({
      where: { thread: { accountId: account.id }, emailLabel: "inbox", from: { address: { not: account.emailAddress } } },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: { id: true, threadId: true, subject: true, bodySnippet: true, sentAt: true, from: { select: { name: true, address: true } } },
    });
    const runs = await db.ruleRun.findMany({
      where: { accountId: account.id, messageId: { in: emails.map((e) => e.id) } },
      select: { messageId: true, status: true, rule: { select: { name: true } } },
    });
    const byId = new Map(runs.map((r) => [r.messageId, r]));
    return emails.map((e) => ({ ...e, run: byId.get(e.id) ?? null }));
  }),

  /** Dry run: which rule would match and why. Changes nothing. */
  testMessage: protectedProcedure
    .input(z.object({ accountId: z.string(), messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      try {
        return await runRulesOnMessage(account.id, input.messageId, { test: true });
      } catch (error) {
        throw asTRPCError(error, "Couldn't test the rules");
      }
    }),

  runOnMessage: protectedProcedure
    .input(z.object({ accountId: z.string(), messageId: z.string(), force: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      try {
        const r = await runRulesOnMessage(account.id, input.messageId, { force: input.force });
        return { status: r.status };
      } catch (error) {
        throw asTRPCError(error, "Couldn't run the rules");
      }
    }),

  /** Organize recent inbox mail in small batches (call until remaining = 0). */
  processBatch: protectedProcedure
    .input(z.object({ accountId: z.string(), sinceDays: z.number().int().min(1).max(30).default(7) }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      try {
        return await processBatch(account.id, { sinceDays: input.sinceDays });
      } catch (error) {
        throw asTRPCError(error, "Couldn't organize the inbox");
      }
    }),

  history: protectedProcedure
    .input(z.object({ accountId: z.string(), cursor: z.string().nullish(), status: z.enum(["APPLIED", "SKIPPED", "ERROR", "UNDONE"]).optional() }))
    .query(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      const runs = await db.ruleRun.findMany({
        where: { accountId: account.id, ...(input.status ? { status: input.status } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 31,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { rule: { select: { name: true } } },
      });
      const emails = await db.email.findMany({
        where: { id: { in: runs.map((r) => r.messageId) } },
        select: { id: true, subject: true, from: { select: { name: true, address: true } } },
      });
      const byId = new Map(emails.map((e) => [e.id, e]));
      const nextCursor = runs.length > 30 ? runs.pop()!.id : null;
      return { runs: runs.map((r) => ({ ...r, email: byId.get(r.messageId) ?? null })), nextCursor };
    }),

  undo: protectedProcedure
    .input(z.object({ accountId: z.string(), runId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await owned(input.accountId, ctx.auth.id);
      try {
        await undoRun(account.id, input.runId);
      } catch (error) {
        throw asTRPCError(error, "Couldn't undo");
      }
    }),
});
