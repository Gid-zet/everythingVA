import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { LeadSource, Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { isAiConfigured } from "@/server/ai/provider";
import { parseCsv } from "@/server/procurement/csv";
import { companyFromDomain, domainOf, FREE_EMAIL_DOMAINS, mapImportRows } from "@/lib/leads/candidates";
import { existingLeadEmails, mailboxCandidates, mailboxStats, procurementCandidates, recentCorrespondence } from "@/server/leads/sources";
import { paragraphsToHtml, qualifyLead, writeOutreach } from "@/server/leads/ai";

const stage = z.enum(["new", "researching", "contacted", "replied", "meeting", "proposal", "won", "lost", "not_a_fit"]);
const source = z.enum(["inbox", "procurement", "form", "manual", "import"]);
const str = (n: number) => z.string().trim().max(n);
const optStr = (n: number) => str(n).nullish().transform((v) => (v ? v : null));
const email = z.string().trim().toLowerCase().email().max(254);
const list = (n: number) => z.array(z.string().trim().min(1).max(80)).max(n);

const leadSelect = {
  id: true,
  name: true,
  email: true,
  title: true,
  company: true,
  domain: true,
  website: true,
  phone: true,
  location: true,
  source: true,
  sourceRef: true,
  sourceDetail: true,
  stage: true,
  score: true,
  fit: true,
  fitReason: true,
  nextStep: true,
  scoredAt: true,
  notes: true,
  tags: true,
  emailsIn: true,
  emailsOut: true,
  lastContactAt: true,
  doNotContact: true,
  consent: true,
  attribution: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

async function owned(db: PrismaClient, userId: string, id: string) {
  const lead = await db.lead.findFirst({ where: { id, userId } });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
  return lead;
}

const log = (db: PrismaClient, leadId: string, action: string, summary: string) =>
  db.leadActivity.create({ data: { leadId, action, summary: summary.slice(0, 500) } });

const companyFor = (mail: string | null | undefined) => {
  if (!mail) return { domain: null, company: null };
  const d = domainOf(mail);
  return FREE_EMAIL_DOMAINS.has(d) ? { domain: null, company: null } : { domain: d, company: companyFromDomain(d) };
};

const candidateInput = z.object({
  email,
  name: optStr(160),
  company: optStr(160),
  domain: optStr(200),
  phone: optStr(60),
  source: z.enum(["inbox", "procurement"]),
  sourceRef: optStr(100),
  sourceDetail: optStr(300),
});

export const leadsRouter = createTRPCRouter({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.id;
    const [leads, profile, accounts, forms] = await Promise.all([
      ctx.db.lead.findMany({ where: { userId }, orderBy: [{ updatedAt: "desc" }], take: 1000, select: leadSelect }),
      ctx.db.leadProfile.findUnique({ where: { userId } }),
      ctx.db.account.findMany({ where: { userId }, select: { id: true, emailAddress: true, name: true } }),
      ctx.db.leadForm.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    ]);
    return { leads, profile, accounts, forms, aiConfigured: isAiConfigured() };
  }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const lead = await ctx.db.lead.findFirst({
      where: { id: input.id, userId: ctx.auth.id },
      select: { ...leadSelect, activity: { orderBy: { createdAt: "desc" }, take: 40 } },
    });
    if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
    return lead;
  }),

  saveProfile: protectedProcedure
    .input(
      z.object({
        offer: str(2000),
        idealCustomer: str(2000),
        industries: list(20),
        regions: list(20),
        roles: list(20),
        excludedDomains: z.array(z.string().trim().toLowerCase().min(3).max(120).transform((d) => d.replace(/^@/, ""))).max(100),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.leadProfile.upsert({ where: { userId: ctx.auth.id }, create: { userId: ctx.auth.id, ...input }, update: input }),
    ),

  create: protectedProcedure
    .input(
      z.object({
        name: optStr(160),
        email: email.nullish(),
        title: optStr(160),
        company: optStr(160),
        website: optStr(300),
        phone: optStr(60),
        location: optStr(160),
        notes: optStr(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.email && !input.name) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a name or an email." });
      if (input.email && (await ctx.db.lead.findUnique({ where: { userId_email: { userId: ctx.auth.id, email: input.email } } })))
        throw new TRPCError({ code: "CONFLICT", message: "You already have a lead with that email." });
      const guess = companyFor(input.email);
      const stats = input.email ? await mailboxStats(ctx.db, ctx.auth.id, input.email) : null;
      const lead = await ctx.db.lead.create({
        data: { ...input, email: input.email ?? null, userId: ctx.auth.id, source: "manual", company: input.company ?? guess.company, domain: guess.domain, ...(stats ?? {}) },
        select: leadSelect,
      });
      await log(ctx.db, lead.id, "created", "Added by hand");
      return lead;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: optStr(160).optional(),
        title: optStr(160).optional(),
        company: optStr(160).optional(),
        website: optStr(300).optional(),
        phone: optStr(60).optional(),
        location: optStr(160).optional(),
        notes: optStr(5000).optional(),
        nextStep: optStr(300).optional(),
        tags: list(20).optional(),
        stage: stage.optional(),
        doNotContact: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const before = await owned(ctx.db, ctx.auth.id, id);
      const lead = await ctx.db.lead.update({ where: { id }, data, select: leadSelect });
      if (data.stage && data.stage !== before.stage) await log(ctx.db, id, "stage", `Moved from ${before.stage.replace(/_/g, " ")} to ${data.stage.replace(/_/g, " ")}`);
      if (data.doNotContact !== undefined && data.doNotContact !== before.doNotContact)
        await log(ctx.db, id, "dnc", data.doNotContact ? "Marked do not contact" : "Cleared do not contact");
      return lead;
    }),

  remove: protectedProcedure.input(z.object({ ids: z.array(z.string()).min(1).max(200) })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.lead.deleteMany({ where: { id: { in: input.ids }, userId: ctx.auth.id } });
    return { count };
  }),

  /** Warm contacts from your own mailbox, for you to pick from (nothing is saved). */
  scanInbox: protectedProcedure.mutation(({ ctx }) => mailboxCandidates(ctx.db, ctx.auth.id)),

  /** Buyer contacts named on tenders in your procurement workspace. */
  procurementContacts: protectedProcedure.mutation(({ ctx }) => procurementCandidates(ctx.db, ctx.auth.id)),

  importCandidates: protectedProcedure.input(z.object({ candidates: z.array(candidateInput).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const userId = ctx.auth.id;
    const existing = await existingLeadEmails(ctx.db, userId);
    const fresh = input.candidates.filter((c, i, all) => !existing.has(c.email) && all.findIndex((x) => x.email === c.email) === i);
    let created = 0;
    for (const c of fresh) {
      const stats = c.source === "inbox" ? await mailboxStats(ctx.db, userId, c.email) : null;
      const lead = await ctx.db.lead.create({
        data: { userId, email: c.email, name: c.name, company: c.company, domain: c.domain, phone: c.phone, source: c.source as LeadSource, sourceRef: c.sourceRef, sourceDetail: c.sourceDetail, ...(stats ?? {}) },
        select: { id: true },
      });
      await log(ctx.db, lead.id, "created", c.source === "inbox" ? "Found in your mailbox" : "Found on a tender you track");
      created++;
    }
    return { created, skipped: input.candidates.length - created };
  }),

  importCsv: protectedProcedure.input(z.object({ csv: z.string().min(1).max(2_000_000) })).mutation(async ({ ctx, input }) => {
    const userId = ctx.auth.id;
    const rows = mapImportRows(parseCsv(input.csv)).slice(0, 2000);
    if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No usable rows. Include an Email column, or Name and Company." });
    const existing = await existingLeadEmails(ctx.db, userId);
    const seen = new Set<string>();
    const data: Prisma.LeadCreateManyInput[] = [];
    for (const r of rows) {
      if (r.email && (existing.has(r.email) || seen.has(r.email))) continue;
      if (r.email) seen.add(r.email);
      const guess = companyFor(r.email);
      data.push({ userId, source: "import", ...r, email: r.email ?? null, company: r.company ?? guess.company, domain: guess.domain });
    }
    const { count } = await ctx.db.lead.createMany({ data, skipDuplicates: true });
    return { created: count, skipped: rows.length - count };
  }),

  qualify: protectedProcedure.input(z.object({ ids: z.array(z.string()).min(1).max(10) })).mutation(async ({ ctx, input }) => {
    if (!isAiConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI isn't configured." });
    const userId = ctx.auth.id;
    const profile = await ctx.db.leadProfile.findUnique({ where: { userId } });
    if (!profile?.offer.trim() || !profile.idealCustomer.trim())
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Describe what you sell and who buys it first (Ideal customer)." });
    const leads = await ctx.db.lead.findMany({ where: { id: { in: input.ids }, userId } });
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const lead of leads) {
      try {
        const mail = lead.email ? await recentCorrespondence(ctx.db, userId, lead.email) : "";
        const q = await qualifyLead(lead, profile, mail);
        await ctx.db.lead.update({
          where: { id: lead.id },
          data: { score: q.score, fit: q.fit, fitReason: q.reason, nextStep: q.nextStep, scoredAt: new Date() },
        });
        await log(ctx.db, lead.id, "qualified", `AI verdict: ${q.fit} fit (${q.score})`);
        results.push({ id: lead.id, ok: true });
      } catch (e) {
        results.push({ id: lead.id, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Failed" });
      }
    }
    return results;
  }),

  /** Writes an email with AI and saves it to Drafts. It is never sent automatically. */
  draftOutreach: protectedProcedure
    .input(z.object({ id: z.string(), accountId: z.string(), instructions: str(800).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI isn't configured." });
      const userId = ctx.auth.id;
      const lead = await owned(ctx.db, userId, input.id);
      if (!lead.email) throw new TRPCError({ code: "BAD_REQUEST", message: "This lead has no email address." });
      if (lead.doNotContact) throw new TRPCError({ code: "FORBIDDEN", message: "This lead is marked do not contact." });
      const unsub = await ctx.db.emailAddress.findFirst({ where: { address: { equals: lead.email, mode: "insensitive" }, unsubscribedAt: { not: null }, account: { userId } } });
      if (unsub) throw new TRPCError({ code: "FORBIDDEN", message: "You unsubscribed from this address, so it's excluded from outreach." });
      const account = await ctx.db.account.findFirst({ where: { id: input.accountId, userId }, select: { id: true, name: true, emailAddress: true } });
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Mail account not found" });
      const [profile, mail] = await Promise.all([ctx.db.leadProfile.findUnique({ where: { userId } }), recentCorrespondence(ctx.db, userId, lead.email)]);
      const out = await writeOutreach(lead, profile, { name: account.name, email: account.emailAddress }, mail, input.instructions);
      const draft = await ctx.db.draft.create({
        data: { accountId: account.id, mode: "new", subject: out.subject, body: paragraphsToHtml(out.paragraphs), to: [{ name: lead.name ?? "", address: lead.email }] },
        select: { id: true },
      });
      await log(ctx.db, lead.id, "drafted", `Outreach draft saved: “${out.subject}”`);
      if (lead.stage === "new") await ctx.db.lead.update({ where: { id: lead.id }, data: { stage: "researching" } });
      return { draftId: draft.id, accountId: account.id, subject: out.subject, preview: out.paragraphs.join("\n\n") };
    }),

  refreshStats: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const lead = await owned(ctx.db, ctx.auth.id, input.id);
    if (!lead.email) return lead;
    const stats = await mailboxStats(ctx.db, ctx.auth.id, lead.email);
    if (!stats) return lead;
    // Their reply moves a contacted lead to "replied" automatically.
    const replied = lead.stage === "contacted" && lead.lastContactAt && stats.emailsIn > lead.emailsIn;
    return ctx.db.lead.update({ where: { id: lead.id }, data: { ...stats, ...(replied ? { stage: "replied" } : {}) }, select: leadSelect });
  }),

  saveForm: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: str(120).min(1),
        intro: optStr(1000),
        thankYou: optStr(300),
        askCompany: z.boolean(),
        askPhone: z.boolean(),
        askMessage: z.boolean(),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (id) {
        const f = await ctx.db.leadForm.findFirst({ where: { id, userId: ctx.auth.id } });
        if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
        return ctx.db.leadForm.update({ where: { id }, data });
      }
      const count = await ctx.db.leadForm.count({ where: { userId: ctx.auth.id } });
      if (count >= 20) throw new TRPCError({ code: "BAD_REQUEST", message: "You can have up to 20 forms." });
      return ctx.db.leadForm.create({ data: { ...data, userId: ctx.auth.id } });
    }),

  deleteForm: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.leadForm.deleteMany({ where: { id: input.id, userId: ctx.auth.id } });
    return { ok: true };
  }),
});
