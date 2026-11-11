import "server-only";
import type { OrganizerRule, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getProviders } from "@/server/providers";
import { aiChooseRule, aiDraftReply } from "./ai";
import { evaluate } from "./match";
import { PRESET_RULES, type ExecutedAction, type RuleAction, type RuleMessage } from "./types";

/**
 * Rule runner (adapted from Inbox Zero's run-rules / execute):
 * 1. Static-only rules are matched locally, with no AI call.
 * 2. Remaining candidates with AI instructions go to one AI call that picks
 *    a single rule.
 * 3. The rule's actions run against the mailbox through the provider layer.
 * 4. A RuleRun row records the outcome; it makes runs idempotent per message
 *    and powers History and Undo.
 */

const strip = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export async function ensurePresetRules(accountId: string) {
  const existing = await db.organizerRule.count({ where: { accountId } });
  if (existing > 0) return;
  await db.organizerRule.createMany({
    data: PRESET_RULES.map((p, i) => ({
      accountId,
      name: p.name,
      instructions: p.instructions,
      systemType: p.systemType,
      actions: p.actions as unknown as Prisma.InputJsonValue,
      enabled: p.enabled,
      position: i,
    })),
    skipDuplicates: true,
  });
}

async function loadMessage(accountId: string, messageId: string) {
  const e = await db.email.findFirst({
    where: { id: messageId, thread: { accountId } },
    select: {
      id: true,
      threadId: true,
      subject: true,
      body: true,
      bodySnippet: true,
      sentAt: true,
      customLabels: true,
      internetMessageId: true,
      internetHeaders: true,
      from: { select: { name: true, address: true } },
      to: { select: { name: true, address: true } },
    },
  });
  if (!e) return null;
  const headers = (e.internetHeaders ?? []) as { name?: string }[];
  const message: RuleMessage = {
    id: e.id,
    threadId: e.threadId,
    from: e.from,
    to: e.to,
    subject: e.subject ?? "",
    text: strip(e.body ?? e.bodySnippet ?? ""),
    date: e.sentAt,
    hasListUnsubscribe: headers.some((h) => h?.name?.toLowerCase() === "list-unsubscribe"),
  };
  return { message, row: e };
}

type ChooseResult = { rule: OrganizerRule | null; reason: string };

async function chooseRule(
  rules: OrganizerRule[],
  message: RuleMessage,
  me: { name: string; email: string },
): Promise<ChooseResult> {
  const aiCandidates: OrganizerRule[] = [];
  for (const rule of rules) {
    const { matched, needsAi } = evaluate(rule, message);
    if (matched) return { rule, reason: "Matched the rule's patterns" };
    if (needsAi) aiCandidates.push(rule);
  }
  if (!aiCandidates.length) return { rule: null, reason: "No rule patterns matched" };
  const { ruleName, reasoning } = await aiChooseRule(
    message,
    aiCandidates.map((r) => ({ name: r.name, instructions: r.instructions! })),
    me,
  );
  return { rule: aiCandidates.find((r) => r.name === ruleName) ?? null, reason: reasoning };
}

export async function runRulesOnMessage(
  accountId: string,
  messageId: string,
  opts: { test?: boolean; automated?: boolean; force?: boolean } = {},
) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, emailAddress: true },
  });
  if (!account) throw new Error("Account not found");

  if (!opts.test && !opts.force) {
    const prior = await db.ruleRun.findUnique({ where: { accountId_messageId: { accountId, messageId } } });
    if (prior && prior.status !== "UNDONE") return { status: "ALREADY_PROCESSED" as const, run: prior };
  }

  const loaded = await loadMessage(accountId, messageId);
  if (!loaded) throw new Error("Message not found");
  const { message, row } = loaded;

  await ensurePresetRules(accountId);
  const rules = await db.organizerRule.findMany({
    where: { accountId, enabled: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  const me = { name: account.name, email: account.emailAddress };
  let chosen: ChooseResult;
  try {
    chosen = await chooseRule(rules, message, me);
  } catch (error) {
    if (opts.test) throw error;
    const run = await saveRun(accountId, message, null, "ERROR", (error as Error).message, [], !!opts.automated);
    return { status: "ERROR" as const, run };
  }

  if (opts.test) {
    return {
      status: "TEST" as const,
      rule: chosen.rule ? { id: chosen.rule.id, name: chosen.rule.name, actions: chosen.rule.actions } : null,
      reason: chosen.reason,
    };
  }

  if (!chosen.rule) {
    const run = await saveRun(accountId, message, null, "SKIPPED", chosen.reason, [], !!opts.automated);
    return { status: "SKIPPED" as const, run };
  }

  const executed = await executeActions(accountId, chosen.rule.actions as unknown as RuleAction[], message, row, me);
  const failed = executed.length > 0 && executed.every((a) => a.status === "failed");
  const run = await saveRun(
    accountId,
    message,
    chosen.rule.id,
    failed ? "ERROR" : "APPLIED",
    chosen.reason,
    executed,
    !!opts.automated,
  );
  return { status: run.status, run };
}

function saveRun(
  accountId: string,
  m: RuleMessage,
  ruleId: string | null,
  status: "APPLIED" | "SKIPPED" | "ERROR",
  reason: string,
  actions: ExecutedAction[],
  automated: boolean,
) {
  const data = {
    ruleId,
    threadId: m.threadId,
    status,
    reason: reason.slice(0, 500),
    automated,
    actions: actions as unknown as Prisma.InputJsonValue,
  };
  return db.ruleRun.upsert({
    where: { accountId_messageId: { accountId, messageId: m.id } },
    create: { accountId, messageId: m.id, ...data },
    update: data,
  });
}

async function executeActions(
  accountId: string,
  actions: RuleAction[],
  m: RuleMessage,
  row: { customLabels: string[]; internetMessageId: string; subject: string },
  me: { name: string; email: string },
): Promise<ExecutedAction[]> {
  const { mail } = await getProviders(accountId, null);
  const threadMessageIds = (
    await db.email.findMany({ where: { threadId: m.threadId }, select: { id: true } })
  ).map((e) => e.id);
  const out: ExecutedAction[] = [];
  let labels = [...row.customLabels];

  for (const action of actions) {
    try {
      switch (action.type) {
        case "LABEL": {
          const label = action.label!;
          if (!labels.includes(label)) labels = [...labels, label];
          const r = await mail.setLabels([m.id], labels);
          await db.email.update({ where: { id: m.id }, data: { customLabels: labels } });
          const account = await db.account.findUnique({ where: { id: accountId }, select: { userId: true } });
          if (account) {
            const category = await db.emailCategory.upsert({
              where: { userId_name: { userId: account.userId, name: label } },
              update: {},
              create: { userId: account.userId, name: label, description: "Created by an organizer rule" },
            });
            await db.email.update({ where: { id: m.id }, data: { categoryId: category.id } });
          }
          out.push({ type: "LABEL", label, status: r.failed && !r.ok ? "failed" : "done", error: r.firstError });
          break;
        }
        case "ARCHIVE": {
          const r = await mail.setArchived(threadMessageIds, true);
          if (r.ok) await db.thread.update({ where: { id: m.threadId }, data: { done: true, archivedAt: new Date() } });
          out.push({ type: "ARCHIVE", status: r.ok ? "done" : "failed", error: r.firstError });
          break;
        }
        case "MARK_READ": {
          const r = await mail.setRead(threadMessageIds, true);
          if (r.ok) {
            await db.email.updateMany({ where: { threadId: m.threadId, status: "unread" }, data: { status: "read" } });
          }
          out.push({ type: "MARK_READ", status: r.ok ? "done" : "failed", error: r.firstError });
          break;
        }
        case "STAR": {
          const r = await mail.setStarred([m.id], true);
          if (r.unsupported) {
            out.push({ type: "STAR", status: "skipped", error: "Not supported for this mailbox" });
            break;
          }
          if (r.ok) await db.thread.update({ where: { id: m.threadId }, data: { starred: true } });
          out.push({ type: "STAR", status: r.ok ? "done" : "failed", error: r.firstError });
          break;
        }
        case "MARK_SPAM": {
          const r = await mail.setSpam(threadMessageIds, true);
          if (r.unsupported) {
            out.push({ type: "MARK_SPAM", status: "skipped", error: "Not supported for this mailbox" });
            break;
          }
          if (r.ok) await db.thread.update({ where: { id: m.threadId }, data: { spamAt: new Date() } });
          out.push({ type: "MARK_SPAM", status: r.ok ? "done" : "failed", error: r.firstError });
          break;
        }
        case "DRAFT_REPLY": {
          const text = await aiDraftReply(m, me, action.content);
          const html = text
            .split(/\n{2,}/)
            .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`)
            .join("");
          const draft = await db.draft.create({
            data: {
              accountId,
              threadId: m.threadId,
              mode: "reply",
              subject: /^re:/i.test(row.subject) ? row.subject : `Re: ${row.subject}`,
              body: html,
              to: [{ name: m.from.name ?? m.from.address, address: m.from.address }],
              inReplyTo: row.internetMessageId,
            },
          });
          out.push({ type: "DRAFT_REPLY", status: "done", draftId: draft.id });
          break;
        }
      }
    } catch (error) {
      out.push({ type: action.type, label: action.label, status: "failed", error: (error as Error).message.slice(0, 200) });
    }
  }
  return out;
}

/** Reverse what a run did, then mark it UNDONE so it can be re-run later. */
export async function undoRun(accountId: string, runId: string) {
  const run = await db.ruleRun.findFirst({ where: { id: runId, accountId } });
  if (!run) throw new Error("Run not found");
  if (run.status !== "APPLIED" && run.status !== "ERROR") return run;
  const { mail } = await getProviders(accountId, null);
  const threadMessageIds = (await db.email.findMany({ where: { threadId: run.threadId }, select: { id: true } })).map((e) => e.id);
  const email = await db.email.findUnique({ where: { id: run.messageId }, select: { customLabels: true } });

  for (const a of (run.actions as unknown as ExecutedAction[]) ?? []) {
    if (a.status !== "done") continue;
    try {
      if (a.type === "LABEL" && a.label && email) {
        const labels = email.customLabels.filter((l) => l !== a.label);
        await mail.setLabels([run.messageId], labels);
        await db.email.update({ where: { id: run.messageId }, data: { customLabels: labels, categoryId: null } });
      } else if (a.type === "ARCHIVE") {
        await mail.setArchived(threadMessageIds, false);
        await db.thread.update({ where: { id: run.threadId }, data: { done: false, archivedAt: null } });
      } else if (a.type === "MARK_READ") {
        await mail.setRead([run.messageId], false);
        await db.email.update({ where: { id: run.messageId }, data: { status: "unread" } });
      } else if (a.type === "STAR") {
        await mail.setStarred([run.messageId], false);
        await db.thread.update({ where: { id: run.threadId }, data: { starred: false } });
      } else if (a.type === "MARK_SPAM") {
        await mail.setSpam(threadMessageIds, false);
        await db.thread.update({ where: { id: run.threadId }, data: { spamAt: null } });
      } else if (a.type === "DRAFT_REPLY" && a.draftId) {
        await db.draft.deleteMany({ where: { id: a.draftId, accountId } });
      }
    } catch (error) {
      console.warn(`Undo of ${a.type} failed for run ${run.id}:`, (error as Error).message);
    }
  }
  return db.ruleRun.update({ where: { id: run.id }, data: { status: "UNDONE" } });
}

/** Received inbox mail with no rule run yet, newest first. */
function unprocessedWhere(accountId: string, me: string, sinceDays: number): Prisma.EmailWhereInput {
  return {
    thread: { accountId, inboxStatus: true, trashedAt: null },
    emailLabel: "inbox",
    sentAt: { gte: new Date(Date.now() - sinceDays * 864e5) },
    from: { address: { not: me, mode: "insensitive" } },
  };
}

/**
 * Process a small batch so each request stays well inside serverless time
 * limits; the UI calls repeatedly until `remaining` is 0.
 */
export async function processBatch(accountId: string, opts: { batch?: number; sinceDays?: number } = {}) {
  const batch = Math.min(opts.batch ?? 8, 15);
  const sinceDays = opts.sinceDays ?? 7;
  const account = await db.account.findUnique({ where: { id: accountId }, select: { emailAddress: true } });
  if (!account) throw new Error("Account not found");

  const doneIds = (await db.ruleRun.findMany({ where: { accountId }, select: { messageId: true } })).map((r) => r.messageId);
  const where: Prisma.EmailWhereInput = {
    ...unprocessedWhere(accountId, account.emailAddress, sinceDays),
    id: { notIn: doneIds },
  };
  const next = await db.email.findMany({ where, orderBy: { sentAt: "desc" }, take: batch, select: { id: true } });

  const results = { applied: 0, skipped: 0, errors: 0 };
  for (const { id } of next) {
    const r = await runRulesOnMessage(accountId, id, { automated: false });
    if (r.status === "APPLIED") results.applied++;
    else if (r.status === "SKIPPED") results.skipped++;
    else if (r.status === "ERROR") results.errors++;
  }
  const remaining = await db.email.count({ where: { ...where, id: { notIn: [...doneIds, ...next.map((n) => n.id)] } } });
  // When nothing is found, tell the user how fresh their synced mail is.
  const newest = next.length
    ? null
    : await db.email.findFirst({ where: { thread: { accountId } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
  return { ...results, processed: next.length, remaining, newestSyncedAt: newest?.sentAt ?? null };
}

/** Called after a webhook sync: run rules on newly received inbox mail. */
export async function runOnNewMail(accountId: string, messageIds: string[]) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { organizerAutoRun: true, emailAddress: true, status: true },
  });
  if (!account?.organizerAutoRun || account.status === "needs_reauth" || !messageIds.length) return;
  const candidates = await db.email.findMany({
    where: {
      id: { in: messageIds },
      ...unprocessedWhere(accountId, account.emailAddress, 2),
    },
    orderBy: { sentAt: "desc" },
    take: 20,
    select: { id: true },
  });
  for (const { id } of candidates) {
    await runRulesOnMessage(accountId, id, { automated: true }).catch((error) =>
      console.error(`Auto-organize failed for message in ${accountId}:`, (error as Error).message),
    );
  }
}
