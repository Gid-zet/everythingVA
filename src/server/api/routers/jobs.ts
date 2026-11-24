import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { isAiConfigured } from "@/server/ai/provider";
import { fetchPosting } from "@/server/jobs/fetch-posting";
import { scoreMatch, writeDocument } from "@/server/jobs/ai";
import { scanInbox } from "@/server/jobs/inbox";
import { boardOf } from "@/lib/jobs/posting";
import { discoverySources, runJobDiscovery } from "@/server/jobs/discover";

const MANUAL_RUNS_PER_DAY = 3;
const today = () => new Date().toISOString().slice(0, 10);

const stage = z.enum(["saved", "applied", "screening", "interview", "offer", "accepted", "rejected", "withdrawn"]);
const str = (n: number) => z.string().trim().max(n);
const optStr = (n: number) => str(n).nullish().transform((v) => (v ? v : null));
const list = (n: number) => z.array(z.string().trim().min(1).max(80)).max(n);
const STAGE_LABEL: Record<string, string> = { saved: "Saved", applied: "Applied", screening: "Screening", interview: "Interview", offer: "Offer", accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn" };

const jobSelect = {
  id: true,
  title: true,
  company: true,
  companyDomain: true,
  location: true,
  workMode: true,
  salary: true,
  url: true,
  source: true,
  stage: true,
  excitement: true,
  appliedAt: true,
  deadline: true,
  nextAction: true,
  nextActionAt: true,
  matchScore: true,
  matchSummary: true,
  keywordsMatched: true,
  keywordsMissing: true,
  scoredAt: true,
  notes: true,
  contactName: true,
  contactEmail: true,
  threadIds: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { documents: true } },
} satisfies Prisma.JobApplicationSelect;

async function owned(db: PrismaClient, userId: string, id: string) {
  const job = await db.jobApplication.findFirst({ where: { id, userId } });
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
  return job;
}

const log = (db: PrismaClient, jobId: string, action: string, summary: string) => db.jobActivity.create({ data: { jobId, action, summary: summary.slice(0, 500) } });

async function requireCv(db: PrismaClient, userId: string) {
  if (!isAiConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI isn't configured." });
  const profile = await db.jobProfile.findUnique({ where: { userId } });
  if (!profile || profile.resumeText.trim().length < 200) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add your CV first (My CV)." });
  return profile;
}

/** "careers.northwind.com/jobs/1" → "northwind.com" (not for job boards). */
function companyDomainFrom(url: string | null | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (boardOf(url) !== host) return null; // a known job board, not the employer
    return host.replace(/^(careers|jobs|apply|work|join|talent|hire)\./, "");
  } catch {
    return null;
  }
}

const jobFields = {
  title: str(200).min(1),
  company: str(160).min(1),
  url: z.string().trim().url().max(1000).nullish().transform((v) => v ?? null),
  companyDomain: optStr(200),
  location: optStr(200),
  workMode: optStr(40),
  salary: optStr(120),
  source: optStr(80),
  description: optStr(30_000),
};

export const jobsRouter = createTRPCRouter({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.id;
    const [jobs, profile, discoveries] = await Promise.all([
      ctx.db.jobApplication.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 1000, select: jobSelect }),
      ctx.db.jobProfile.findUnique({
        where: { userId },
        select: { resumeName: true, headline: true, targetRoles: true, locations: true, updatedAt: true, resumeText: true, discoverEnabled: true, remoteOnly: true, lastDiscoveredAt: true, discoverDay: true, discoverRuns: true },
      }),
      ctx.db.jobDiscovery.findMany({
        where: { userId, status: "new" },
        orderBy: [{ matchScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 200,
        select: { id: true, url: true, source: true, title: true, company: true, location: true, workMode: true, salary: true, postedAt: true, closesAt: true, matchScore: true, matchSummary: true, keywordsMatched: true, keywordsMissing: true, createdAt: true },
      }),
    ]);
    return {
      jobs,
      profile: profile
        ? {
            ...profile,
            resumeText: undefined,
            hasCv: profile.resumeText.trim().length >= 200,
            cvWords: profile.resumeText.split(/\s+/).filter(Boolean).length,
            runsLeft: Math.max(0, MANUAL_RUNS_PER_DAY - (profile.discoverDay === today() ? profile.discoverRuns : 0)),
          }
        : null,
      discoveries,
      sources: discoverySources(),
      aiConfigured: isAiConfigured(),
    };
  }),

  profile: protectedProcedure.query(({ ctx }) => ctx.db.jobProfile.findUnique({ where: { userId: ctx.auth.id } })),

  saveProfile: protectedProcedure
    .input(z.object({ resumeText: str(60_000), resumeName: optStr(200), headline: optStr(200), targetRoles: list(15), locations: list(15) }))
    .mutation(({ ctx, input }) => ctx.db.jobProfile.upsert({ where: { userId: ctx.auth.id }, create: { userId: ctx.auth.id, ...input }, update: input, select: { userId: true } })),

  fetchPosting: protectedProcedure.input(z.object({ url: z.string().trim().url().max(1000) })).mutation(({ input }) => fetchPosting(input.url)),

  create: protectedProcedure
    .input(z.object({ ...jobFields, stage: stage.default("saved"), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const { deadline, ...rest } = input;
      const job = await ctx.db.jobApplication.create({
        data: {
          ...rest,
          userId: ctx.auth.id,
          companyDomain: input.companyDomain ?? companyDomainFrom(input.url),
          source: input.source ?? (input.url ? boardOf(input.url) : null),
          deadline: deadline ? new Date(`${deadline}T23:59:00Z`) : null,
          appliedAt: input.stage !== "saved" ? new Date() : null,
        },
        select: jobSelect,
      });
      await log(ctx.db, job.id, "created", input.stage === "saved" ? "Saved the job" : `Added as ${STAGE_LABEL[input.stage]}`);
      return job;
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const job = await ctx.db.jobApplication.findFirst({
      where: { id: input.id, userId: ctx.auth.id },
      select: { ...jobSelect, description: true, documents: { orderBy: { updatedAt: "desc" } }, activity: { orderBy: { createdAt: "desc" }, take: 40 } },
    });
    if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
    const threads = job.threadIds.length
      ? await ctx.db.thread.findMany({ where: { id: { in: job.threadIds }, account: { userId: ctx.auth.id } }, select: { id: true, subject: true, accountId: true, lastMessageDate: true } })
      : [];
    return { ...job, threads };
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: jobFields.title.optional(),
        company: jobFields.company.optional(),
        url: jobFields.url.optional(),
        companyDomain: jobFields.companyDomain.optional(),
        location: jobFields.location.optional(),
        workMode: jobFields.workMode.optional(),
        salary: jobFields.salary.optional(),
        source: jobFields.source.optional(),
        description: jobFields.description.optional(),
        stage: stage.optional(),
        excitement: z.number().int().min(0).max(5).optional(),
        appliedAt: z.coerce.date().nullish(),
        deadline: z.coerce.date().nullish(),
        nextAction: optStr(300).optional(),
        nextActionAt: z.coerce.date().nullish(),
        notes: optStr(20_000).optional(),
        contactName: optStr(160).optional(),
        contactEmail: z.string().trim().toLowerCase().email().max(254).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const before = await owned(ctx.db, ctx.auth.id, id);
      if (data.stage && data.stage !== "saved" && !before.appliedAt && data.appliedAt === undefined) data.appliedAt = new Date();
      const job = await ctx.db.jobApplication.update({ where: { id }, data, select: jobSelect });
      if (data.stage && data.stage !== before.stage) await log(ctx.db, id, "stage", `${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[data.stage]}`);
      return job;
    }),

  remove: protectedProcedure.input(z.object({ ids: z.array(z.string()).min(1).max(200) })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.jobApplication.deleteMany({ where: { id: { in: input.ids }, userId: ctx.auth.id } });
    return { count };
  }),

  /** Match score against your CV; matched/missing keywords are checked against the CV text. */
  score: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const profile = await requireCv(ctx.db, ctx.auth.id);
    const job = await owned(ctx.db, ctx.auth.id, input.id);
    if (!job.description || job.description.length < 150) throw new TRPCError({ code: "BAD_REQUEST", message: "Add the job description first." });
    const m = await scoreMatch(profile.resumeText, job);
    const updated = await ctx.db.jobApplication.update({
      where: { id: job.id },
      data: { matchScore: m.score, matchSummary: m.summary, keywordsMatched: m.matched, keywordsMissing: m.missing, scoredAt: new Date() },
      select: jobSelect,
    });
    await log(ctx.db, job.id, "scored", `CV match ${m.score}%`);
    return updated;
  }),

  generate: protectedProcedure
    .input(z.object({ id: z.string(), kind: z.enum(["resume", "cover_letter", "prep", "follow_up"]), instructions: str(800).optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await requireCv(ctx.db, ctx.auth.id);
      const job = await owned(ctx.db, ctx.auth.id, input.id);
      if (!job.description || job.description.length < 150) throw new TRPCError({ code: "BAD_REQUEST", message: "Add the job description first." });
      const docCount = await ctx.db.jobDocument.count({ where: { jobId: job.id } });
      if (docCount >= 30) throw new TRPCError({ code: "BAD_REQUEST", message: "Delete some documents for this job first (30 max)." });
      const d = await writeDocument(input.kind, profile.resumeText, job, input.instructions);
      const doc = await ctx.db.jobDocument.create({ data: { jobId: job.id, kind: input.kind, title: d.title, content: d.content } });
      await log(ctx.db, job.id, "document", `Wrote “${d.title}”`);
      return doc;
    }),

  saveDocument: protectedProcedure.input(z.object({ id: z.string(), title: str(200).min(1), content: str(60_000) })).mutation(async ({ ctx, input }) => {
    const doc = await ctx.db.jobDocument.findFirst({ where: { id: input.id, job: { userId: ctx.auth.id } } });
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
    return ctx.db.jobDocument.update({ where: { id: doc.id }, data: { title: input.title, content: input.content } });
  }),

  deleteDocument: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.jobDocument.deleteMany({ where: { id: input.id, job: { userId: ctx.auth.id } } });
    return { ok: true };
  }),

  /** Recruiter emails about active applications, with a suggested stage (nothing changes yet). */
  scanInbox: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAiConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI isn't configured." });
    return scanInbox(ctx.db, ctx.auth.id);
  }),

  applySuggestion: protectedProcedure
    .input(z.object({ jobId: z.string(), threadId: z.string(), stage: stage.nullish(), summary: str(300).optional() }))
    .mutation(async ({ ctx, input }) => {
      const job = await owned(ctx.db, ctx.auth.id, input.jobId);
      const thread = await ctx.db.thread.findFirst({ where: { id: input.threadId, account: { userId: ctx.auth.id } }, select: { id: true } });
      if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
      const updated = await ctx.db.jobApplication.update({
        where: { id: job.id },
        data: {
          threadIds: job.threadIds.includes(thread.id) ? undefined : { push: thread.id },
          ...(input.stage && input.stage !== job.stage ? { stage: input.stage, appliedAt: job.appliedAt ?? new Date() } : {}),
        },
        select: jobSelect,
      });
      await log(ctx.db, job.id, "email", input.stage && input.stage !== job.stage ? `${STAGE_LABEL[job.stage]} → ${STAGE_LABEL[input.stage]} from email${input.summary ? `: ${input.summary}` : ""}` : `Linked an email${input.summary ? `: ${input.summary}` : ""}`);
      return updated;
    }),

  dismissSuggestion: protectedProcedure.input(z.object({ jobId: z.string(), threadId: z.string() })).mutation(async ({ ctx, input }) => {
    const job = await owned(ctx.db, ctx.auth.id, input.jobId);
    if (!job.ignoredThreadIds.includes(input.threadId))
      await ctx.db.jobApplication.update({ where: { id: job.id }, data: { ignoredThreadIds: { push: input.threadId } } });
    return { ok: true };
  }),

  // ── Discovery ──────────────────────────────────────────────────────────────
  discoverNow: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.auth.id;
    const profile = await ctx.db.jobProfile.findUnique({ where: { userId }, select: { discoverDay: true, discoverRuns: true, targetRoles: true } });
    if (!profile?.targetRoles.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add your target roles first (My CV)." });
    const used = profile.discoverDay === today() ? profile.discoverRuns : 0;
    if (used >= MANUAL_RUNS_PER_DAY) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You've searched 3 times today. New jobs also arrive automatically every day." });
    await ctx.db.jobProfile.update({ where: { userId }, data: { discoverDay: today(), discoverRuns: used + 1 } });
    // Remotive is only called from the daily run (its terms allow about 4 calls a day).
    return runJobDiscovery(ctx.db, userId, { scheduled: false, remotive: { left: 0 }, deadline: Date.now() + 50_000 });
  }),

  getDiscovery: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const d = await ctx.db.jobDiscovery.findFirst({ where: { id: input.id, userId: ctx.auth.id } });
    if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
    return d;
  }),

  scoreDiscovery: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const profile = await requireCv(ctx.db, ctx.auth.id);
    const d = await ctx.db.jobDiscovery.findFirst({ where: { id: input.id, userId: ctx.auth.id } });
    if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
    if (!d.description || d.description.length < 150) throw new TRPCError({ code: "BAD_REQUEST", message: "This listing has too little description to score. Open it to read more." });
    const m = await scoreMatch(profile.resumeText, d);
    return ctx.db.jobDiscovery.update({ where: { id: d.id }, data: { matchScore: m.score, matchSummary: m.summary, keywordsMatched: m.matched, keywordsMissing: m.missing } });
  }),

  /** Move a found job into the pipeline as Saved (keeps its match score). */
  saveDiscovery: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.auth.id;
    const d = await ctx.db.jobDiscovery.findFirst({ where: { id: input.id, userId } });
    if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
    const job = await ctx.db.jobApplication.create({
      data: {
        userId,
        title: d.title,
        company: d.company,
        url: d.url,
        companyDomain: companyDomainFrom(d.url),
        location: d.location,
        workMode: d.workMode,
        salary: d.salary,
        source: d.source,
        description: d.description,
        deadline: d.closesAt,
        matchScore: d.matchScore,
        matchSummary: d.matchSummary,
        keywordsMatched: d.keywordsMatched,
        keywordsMissing: d.keywordsMissing,
        scoredAt: d.matchScore != null ? new Date() : null,
      },
      select: jobSelect,
    });
    await ctx.db.jobDiscovery.update({ where: { id: d.id }, data: { status: "saved" } });
    await log(ctx.db, job.id, "created", `Found via ${d.source}`);
    return job;
  }),

  dismissDiscoveries: protectedProcedure.input(z.object({ ids: z.array(z.string()).min(1).max(200) })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.jobDiscovery.updateMany({ where: { id: { in: input.ids }, userId: ctx.auth.id, status: "new" }, data: { status: "dismissed" } });
    return { count };
  }),

  saveDiscoverySettings: protectedProcedure.input(z.object({ discoverEnabled: z.boolean(), remoteOnly: z.boolean() })).mutation(async ({ ctx, input }) => {
    const p = await ctx.db.jobProfile.findUnique({ where: { userId: ctx.auth.id }, select: { userId: true } });
    if (!p) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add your CV and target roles first." });
    await ctx.db.jobProfile.update({ where: { userId: ctx.auth.id }, data: input });
    return { ok: true };
  }),
});
