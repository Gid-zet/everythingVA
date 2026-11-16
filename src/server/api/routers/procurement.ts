import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { isAiConfigured } from "@/server/ai/provider";
import { db } from "@/server/db";
import { getMembership, hasRole, requireRole } from "@/server/procurement/access";
import { audit } from "@/server/procurement/audit";
import { buildAlerts } from "@/server/procurement/alerts";
import { CCM_TEMPLATE } from "@/server/procurement/ccm-template";
import { availableSources, runDiscovery, samConfigured } from "@/server/procurement/discovery";
import { qualifyOpportunity } from "@/server/procurement/qualify";
import { ACTIVE_STATUSES, APPROVAL_STATUSES, STATUS_LABELS } from "@/server/procurement/types";

/** Every procedure runs inside the caller's workspace, with their role. */
const wsProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const m = await getMembership(ctx.auth.id);
  return next({ ctx: { ...ctx, ws: m } });
});

const statusEnum = z.enum(Object.keys(STATUS_LABELS) as [keyof typeof STATUS_LABELS, ...(keyof typeof STATUS_LABELS)[]]);
const verification = z.enum(["unverified", "verified", "expired", "rejected"]);
const category = z.enum([
  "capability_statement",
  "certification",
  "business_registration",
  "tax_supplier",
  "insurance",
  "past_proposal",
  "case_study",
  "staff_bio",
  "resume",
  "project_reference",
  "pricing",
  "policy",
  "template",
  "past_performance",
  "other",
]);
const strList = z.array(z.string().trim().min(1).max(200)).max(200);
const optDate = z.coerce.date().nullable().optional();

async function ensureOpportunity(workspaceId: string, id: string) {
  const o = await db.opportunity.findFirst({ where: { id, workspaceId } });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
  return o;
}

export const procurementRouter = createTRPCRouter({
  /** Everything the dashboard needs, from real data. */
  overview: wsProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const { workspaceId } = ctx.ws;
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86400_000);
    const [profile, byStatus, credentials, documents, upcoming, lastRuns, pipeline, total] = await Promise.all([
      db.companyProfile.findUnique({ where: { workspaceId } }),
      db.opportunity.groupBy({ by: ["status"], where: { workspaceId }, _count: true }),
      db.credential.findMany({ where: { workspaceId }, select: { name: true, status: true, expiresAt: true } }),
      db.knowledgeDocument.findMany({ where: { workspaceId }, select: { name: true, category: true, expiresAt: true, isLatest: true } }),
      db.opportunity.findMany({
        where: { workspaceId, status: { in: ACTIVE_STATUSES }, deadline: { gte: now, lte: in14 } },
        orderBy: { deadline: "asc" },
        take: 8,
        select: { id: true, title: true, organization: true, deadline: true, status: true, fitScore: true },
      }),
      db.discoveryRun.findMany({ where: { workspaceId }, orderBy: { startedAt: "desc" }, take: 4 }),
      db.opportunity.aggregate({
        where: { workspaceId, status: { in: ACTIVE_STATUSES }, estimatedValue: { not: null } },
        _sum: { estimatedValue: true },
        _count: true,
      }),
      db.opportunity.count({ where: { workspaceId } }),
    ]);
    const count = (...s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((n, b) => n + b._count, 0);
    const qualified = await db.opportunity.count({ where: { workspaceId, eligibility: { in: ["qualified", "potentially_qualified"] } } });
    return {
      workspace: { id: workspaceId, name: ctx.ws.workspaceName, role: ctx.ws.role },
      hasProfile: !!profile,
      aiConfigured: isAiConfigured(),
      sources: { samGov: samConfigured(), canadaBuys: true },
      stats: {
        total,
        qualified,
        awaitingReview: count("discovered", "under_review", "awaiting_decision"),
        inProposal: count("approved_to_pursue", "proposal_in_progress", "awaiting_information", "awaiting_approval", "ready_for_submission"),
        submitted: count("submitted", "under_evaluation"),
        awarded: count("awarded"),
        pipelineValue: pipeline._sum.estimatedValue ?? 0,
        pipelineValueCount: pipeline._count,
      },
      upcoming,
      lastRuns,
      alerts: buildAlerts({ now, hasProfile: !!profile, credentials, documents, samConfigured: samConfigured() }),
    };
  }),

  // ── Company profile ────────────────────────────────────────────────────
  profile: wsProcedure.query(({ ctx }) => ctx.db.companyProfile.findUnique({ where: { workspaceId: ctx.ws.workspaceId } })),

  saveProfile: wsProcedure
    .input(
      z.object({
        workspaceName: z.string().trim().min(1).max(120).optional(),
        legalName: z.string().trim().min(1).max(200),
        website: z.string().trim().max(300).nullable().optional(),
        summary: z.string().trim().max(5000),
        services: strList,
        keywords: strList,
        excludedKeywords: strList,
        naicsCodes: z.array(z.string().regex(/^\d{2,6}$/, "NAICS codes are 2-6 digits")).max(30),
        unspscCodes: z.array(z.string().regex(/^\d{2,8}$/, "UNSPSC codes are up to 8 digits")).max(50),
        businessTypes: strList,
        countries: strList,
        serviceRegions: strList,
        yearsInBusiness: z.number().int().min(0).max(300).nullable().optional(),
        governmentExperience: z.string().max(5000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "admin", "edit the company profile");
      const { workspaceName, ...data } = input;
      if (workspaceName) await ctx.db.procurementWorkspace.update({ where: { id: ctx.ws.workspaceId }, data: { name: workspaceName } });
      const saved = await ctx.db.companyProfile.upsert({
        where: { workspaceId: ctx.ws.workspaceId },
        create: { ...data, workspaceId: ctx.ws.workspaceId },
        update: data,
      });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "profile.saved", summary: "Updated the company profile" });
      return saved;
    }),

  /** Prefill from the CCM brief. Credentials are created unverified. */
  applyCcmTemplate: wsProcedure.mutation(async ({ ctx }) => {
    requireRole(ctx.ws.role, "admin", "edit the company profile");
    const { workspaceId } = ctx.ws;
    const { credentials, ...profile } = CCM_TEMPLATE;
    await ctx.db.procurementWorkspace.update({ where: { id: workspaceId }, data: { name: profile.legalName } });
    await ctx.db.companyProfile.upsert({ where: { workspaceId }, create: { ...profile, workspaceId }, update: profile });
    const existing = await ctx.db.credential.findMany({ where: { workspaceId }, select: { name: true } });
    const names = new Set(existing.map((c) => c.name));
    const toAdd = credentials.filter((c) => !names.has(c.name));
    if (toAdd.length) await ctx.db.credential.createMany({ data: toAdd.map((c) => ({ ...c, workspaceId, status: "unverified" as const })) });
    await audit({
      workspaceId,
      actor: "user",
      userId: ctx.auth.id,
      action: "profile.template",
      summary: `Filled the profile from the CCM template (${toAdd.length} unverified credentials added)`,
    });
    return { added: toAdd.length };
  }),

  // ── Credentials ────────────────────────────────────────────────────────
  credentials: wsProcedure.query(({ ctx }) =>
    ctx.db.credential.findMany({
      where: { workspaceId: ctx.ws.workspaceId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { document: { select: { id: true, name: true } } },
    }),
  ),

  saveCredential: wsProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(200),
        kind: z.enum(["certification", "registration", "insurance", "contract_vehicle", "license", "other"]),
        issuer: z.string().trim().max(200).nullable().optional(),
        identifier: z.string().trim().max(200).nullable().optional(),
        issuedAt: optDate,
        expiresAt: optDate,
        notes: z.string().max(2000).nullable().optional(),
        documentId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "editor", "edit credentials");
      const { id, ...data } = input;
      const { workspaceId } = ctx.ws;
      if (id) {
        const found = await ctx.db.credential.findFirst({ where: { id, workspaceId } });
        if (!found) throw new TRPCError({ code: "NOT_FOUND" });
        // Editing a verified credential's facts puts it back to unverified.
        const factsChanged =
          found.name !== data.name ||
          (found.identifier ?? null) !== (data.identifier ?? null) ||
          (found.expiresAt?.getTime() ?? null) !== (data.expiresAt?.getTime() ?? null);
        const c = await ctx.db.credential.update({
          where: { id },
          data: { ...data, ...(factsChanged ? { status: "unverified", verifiedAt: null, verifiedBy: null } : {}) },
        });
        await audit({ workspaceId, actor: "user", userId: ctx.auth.id, action: "credential.updated", summary: `Updated credential ${c.name}${factsChanged ? " (needs verifying again)" : ""}` });
        return c;
      }
      const c = await ctx.db.credential.create({ data: { ...data, workspaceId } });
      await audit({ workspaceId, actor: "user", userId: ctx.auth.id, action: "credential.created", summary: `Added credential ${c.name}` });
      return c;
    }),

  verifyCredential: wsProcedure
    .input(z.object({ id: z.string(), status: verification }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "admin", "verify credentials");
      const found = await ctx.db.credential.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
      if (!found) throw new TRPCError({ code: "NOT_FOUND" });
      const c = await ctx.db.credential.update({
        where: { id: input.id },
        data: { status: input.status, verifiedBy: ctx.auth.id, verifiedAt: new Date() },
      });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "credential.verified", summary: `Marked ${c.name} as ${input.status}` });
      return c;
    }),

  deleteCredential: wsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "admin", "delete credentials");
    const found = await ctx.db.credential.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    await ctx.db.credential.delete({ where: { id: input.id } });
    await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "credential.deleted", summary: `Deleted credential ${found.name}` });
  }),

  // ── Knowledge base ─────────────────────────────────────────────────────
  documents: wsProcedure.input(z.object({ includeOld: z.boolean().optional() }).optional()).query(({ ctx, input }) =>
    ctx.db.knowledgeDocument.findMany({
      where: {
        workspaceId: ctx.ws.workspaceId,
        ...(input?.includeOld ? {} : { isLatest: true }),
        ...(hasRole(ctx.ws.role, "admin") ? {} : { access: "all_members" }),
      },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        fileName: true,
        sizeBytes: true,
        uploadedAt: true,
        expiresAt: true,
        status: true,
        access: true,
        version: true,
        isLatest: true,
        previousVersionId: true,
      },
    }),
  ),

  document: wsProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const d = await ctx.db.knowledgeDocument.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
    if (!d || (d.access === "admins_only" && !hasRole(ctx.ws.role, "admin"))) throw new TRPCError({ code: "NOT_FOUND" });
    // Walk back through earlier versions.
    const versions: { id: string; version: number; uploadedAt: Date; fileName: string | null }[] = [];
    let prev = d.previousVersionId;
    while (prev && versions.length < 20) {
      const p = await ctx.db.knowledgeDocument.findUnique({
        where: { id: prev },
        select: { id: true, version: true, uploadedAt: true, fileName: true, previousVersionId: true },
      });
      if (!p) break;
      versions.push(p);
      prev = p.previousVersionId;
    }
    return { ...d, versions };
  }),

  createTextDocument: wsProcedure
    .input(z.object({ name: z.string().trim().min(1).max(200), category, text: z.string().trim().min(1).max(200_000), expiresAt: optDate }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "editor", "add documents");
      const d = await ctx.db.knowledgeDocument.create({
        data: { ...input, workspaceId: ctx.ws.workspaceId, uploadedBy: ctx.auth.id, mimeType: "text/plain" },
      });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "document.created", summary: `Added document ${d.name}` });
      return d;
    }),

  updateDocument: wsProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(200).optional(),
        category: category.optional(),
        expiresAt: optDate,
        access: z.enum(["all_members", "admins_only"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, input.access ? "admin" : "editor", "edit documents");
      const { id, ...data } = input;
      const found = await ctx.db.knowledgeDocument.findFirst({ where: { id, workspaceId: ctx.ws.workspaceId } });
      if (!found) throw new TRPCError({ code: "NOT_FOUND" });
      const d = await ctx.db.knowledgeDocument.update({ where: { id }, data });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "document.updated", summary: `Updated details of ${d.name}` });
      return d;
    }),

  verifyDocument: wsProcedure.input(z.object({ id: z.string(), status: verification })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "admin", "verify documents");
    const found = await ctx.db.knowledgeDocument.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    const d = await ctx.db.knowledgeDocument.update({
      where: { id: input.id },
      data: { status: input.status, verifiedBy: ctx.auth.id, verifiedAt: new Date() },
    });
    await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "document.verified", summary: `Marked ${d.name} as ${input.status}` });
    return d;
  }),

  deleteDocument: wsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "admin", "delete documents");
    const found = await ctx.db.knowledgeDocument.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    // Deleting the latest version makes the previous one current again.
    await ctx.db.$transaction(async (tx) => {
      await tx.knowledgeDocument.delete({ where: { id: input.id } });
      if (found.isLatest && found.previousVersionId) {
        await tx.knowledgeDocument.update({ where: { id: found.previousVersionId }, data: { isLatest: true } }).catch(() => undefined);
      }
    });
    await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "document.deleted", summary: `Deleted ${found.name} (version ${found.version})` });
  }),

  // ── Opportunities ──────────────────────────────────────────────────────
  opportunities: wsProcedure
    .input(
      z.object({
        status: z.union([statusEnum, z.literal("active"), z.literal("all")]).default("active"),
        eligibility: z.enum(["qualified", "potentially_qualified", "requires_clarification", "not_qualified", "unscored", "all"]).default("all"),
        source: z.enum(["sam_gov", "canadabuys", "manual", "all"]).default("all"),
        search: z.string().max(200).optional(),
        sort: z.enum(["relevance", "deadline", "fit", "newest"]).default("relevance"),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.OpportunityWhereInput = { workspaceId: ctx.ws.workspaceId };
      if (input.status === "active") where.status = { in: ACTIVE_STATUSES };
      else if (input.status !== "all") where.status = input.status;
      if (input.eligibility === "unscored") where.eligibility = null;
      else if (input.eligibility !== "all") where.eligibility = input.eligibility;
      if (input.source !== "all") where.source = input.source;
      if (input.search?.trim()) {
        const q = input.search.trim();
        where.OR = [
          { title: { contains: q, mode: "insensitive" } },
          { organization: { contains: q, mode: "insensitive" } },
          { referenceNumber: { contains: q, mode: "insensitive" } },
          { solicitationNumber: { contains: q, mode: "insensitive" } },
        ];
      }
      const orderBy: Prisma.OpportunityOrderByWithRelationInput[] =
        input.sort === "deadline"
          ? [{ deadline: { sort: "asc", nulls: "last" } }]
          : input.sort === "fit"
            ? [{ fitScore: { sort: "desc", nulls: "last" } }, { relevance: "desc" }]
            : input.sort === "newest"
              ? [{ discoveredAt: "desc" }]
              : [{ relevance: "desc" }, { discoveredAt: "desc" }];
      return ctx.db.opportunity.findMany({
        where,
        orderBy,
        take: input.limit,
        select: {
          id: true,
          source: true,
          title: true,
          organization: true,
          referenceNumber: true,
          deadline: true,
          discoveredAt: true,
          status: true,
          fitScore: true,
          eligibility: true,
          recommendation: true,
          relevance: true,
          matchedKeywords: true,
          setAside: true,
          country: true,
          estimatedValue: true,
          currency: true,
          amendedAt: true,
        },
      });
    }),

  opportunity: wsProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const o = await ctx.db.opportunity.findFirst({
      where: { id: input.id, workspaceId: ctx.ws.workspaceId },
      include: {
        tasks: { orderBy: [{ done: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }] },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
    const members = await ctx.db.workspaceMember.findMany({
      where: { workspaceId: ctx.ws.workspaceId },
      include: { user: { select: { id: true, firstName: true, lastName: true, emailAddress: true } } },
    });
    return { ...o, members: members.map((m) => ({ ...m.user, role: m.role })), myRole: ctx.ws.role };
  }),

  createOpportunity: wsProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(500),
        organization: z.string().trim().max(300).optional(),
        sourceUrl: z.string().url(),
        referenceNumber: z.string().trim().max(200).optional(),
        deadline: optDate,
        estimatedValue: z.number().nonnegative().nullable().optional(),
        currency: z.string().max(3).optional(),
        description: z.string().max(100_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "editor", "add opportunities");
      const o = await ctx.db.opportunity.create({
        data: { ...input, workspaceId: ctx.ws.workspaceId, source: "manual", externalId: crypto.randomUUID(), classificationCodes: [], matchedKeywords: [] },
      });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, opportunityId: o.id, action: "opportunity.created", summary: "Added manually" });
      return o;
    }),

  updateOpportunity: wsProcedure
    .input(
      z.object({
        id: z.string(),
        status: statusEnum.optional(),
        ownerId: z.string().nullable().optional(),
        followUpAt: optDate,
        notes: z.string().max(20_000).nullable().optional(),
        estimatedValue: z.number().nonnegative().nullable().optional(),
        submissionReference: z.string().max(300).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "editor", "update opportunities");
      const before = await ensureOpportunity(ctx.ws.workspaceId, input.id);
      if (input.status && input.status !== before.status && APPROVAL_STATUSES.includes(input.status)) {
        requireRole(ctx.ws.role, "admin", `set "${STATUS_LABELS[input.status]}" (it needs an authorised approver)`);
      }
      const { id, ...data } = input;
      const o = await ctx.db.opportunity.update({
        where: { id },
        data: { ...data, ...(input.status === "submitted" && before.status !== "submitted" ? { submittedAt: new Date() } : {}) },
      });
      const changes: string[] = [];
      if (input.status && input.status !== before.status) changes.push(`Status: ${STATUS_LABELS[before.status]} → ${STATUS_LABELS[input.status]}`);
      if (input.ownerId !== undefined && input.ownerId !== before.ownerId) changes.push("Owner changed");
      if (input.followUpAt !== undefined && input.followUpAt?.getTime() !== before.followUpAt?.getTime()) changes.push("Follow-up date changed");
      if (input.submissionReference !== undefined && input.submissionReference !== before.submissionReference) changes.push(`Submission reference: ${input.submissionReference ?? "cleared"}`);
      if (input.estimatedValue !== undefined && input.estimatedValue !== before.estimatedValue) changes.push("Estimated value changed");
      if (input.notes !== undefined && input.notes !== before.notes) changes.push("Notes edited");
      if (changes.length) {
        await audit({
          workspaceId: ctx.ws.workspaceId,
          actor: "user",
          userId: ctx.auth.id,
          opportunityId: id,
          action: input.status && APPROVAL_STATUSES.includes(input.status) ? "opportunity.approval" : "opportunity.updated",
          summary: changes.join("; "),
        });
      }
      return o;
    }),

  qualify: wsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "editor", "run the qualification agent");
    if (!isAiConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI isn't configured. Set an AI provider key first." });
    await ensureOpportunity(ctx.ws.workspaceId, input.id);
    try {
      return await qualifyOpportunity(input.id, { userId: ctx.auth.id, trigger: "user" });
    } catch (e) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Qualification failed: ${(e as Error).message}` });
    }
  }),

  // ── Tasks ──────────────────────────────────────────────────────────────
  addTask: wsProcedure
    .input(z.object({ opportunityId: z.string().optional(), title: z.string().trim().min(1).max(300), dueAt: optDate, assigneeId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "editor", "add tasks");
      if (input.opportunityId) await ensureOpportunity(ctx.ws.workspaceId, input.opportunityId);
      const t = await ctx.db.procurementTask.create({ data: { ...input, workspaceId: ctx.ws.workspaceId, createdBy: ctx.auth.id } });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, opportunityId: input.opportunityId, action: "task.created", summary: `Task added: ${t.title}` });
      return t;
    }),

  toggleTask: wsProcedure.input(z.object({ id: z.string(), done: z.boolean() })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "editor", "update tasks");
    const t = await ctx.db.procurementTask.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
    if (!t) throw new TRPCError({ code: "NOT_FOUND" });
    await ctx.db.procurementTask.update({ where: { id: t.id }, data: { done: input.done } });
    await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, opportunityId: t.opportunityId, action: "task.updated", summary: `${input.done ? "Completed" : "Reopened"} task: ${t.title}` });
  }),

  deleteTask: wsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "editor", "delete tasks");
    const t = await ctx.db.procurementTask.findFirst({ where: { id: input.id, workspaceId: ctx.ws.workspaceId } });
    if (!t) throw new TRPCError({ code: "NOT_FOUND" });
    await ctx.db.procurementTask.delete({ where: { id: t.id } });
    await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, opportunityId: t.opportunityId, action: "task.deleted", summary: `Deleted task: ${t.title}` });
  }),

  // ── Discovery ──────────────────────────────────────────────────────────
  runDiscovery: wsProcedure
    .input(z.object({ source: z.enum(["sam_gov", "canadabuys"]).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "editor", "run discovery");
      try {
        return await runDiscovery(ctx.ws.workspaceId, "manual", {
          sources: input?.source ? [input.source] : availableSources(),
          userId: ctx.auth.id,
        });
      } catch (e) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
      }
    }),

  discoveryRuns: wsProcedure.query(({ ctx }) =>
    ctx.db.discoveryRun.findMany({ where: { workspaceId: ctx.ws.workspaceId }, orderBy: { startedAt: "desc" }, take: 30 }),
  ),

  // ── Activity and team ──────────────────────────────────────────────────
  activity: wsProcedure.input(z.object({ limit: z.number().int().min(1).max(300).default(100) }).optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.db.auditLog.findMany({
      where: { workspaceId: ctx.ws.workspaceId },
      orderBy: { createdAt: "desc" },
      take: input?.limit ?? 100,
      include: { opportunity: { select: { id: true, title: true } } },
    });
    const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((u): u is string => !!u)));
    const users = await ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, emailAddress: true } });
    const name = new Map(users.map((u) => [u.id, u.firstName || u.emailAddress]));
    return rows.map((r) => ({ ...r, userName: r.userId ? (name.get(r.userId) ?? null) : null }));
  }),

  members: wsProcedure.query(async ({ ctx }) => {
    const members = await ctx.db.workspaceMember.findMany({
      where: { workspaceId: ctx.ws.workspaceId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, firstName: true, lastName: true, emailAddress: true } } },
    });
    return { me: ctx.auth.id, myRole: ctx.ws.role, members };
  }),

  addMember: wsProcedure
    .input(z.object({ email: z.string().email(), role: z.enum(["admin", "editor", "viewer"]) }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx.ws.role, "admin", "add team members");
      const user = await ctx.db.user.findUnique({ where: { emailAddress: input.email.toLowerCase() } });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No everythingVA account uses that email. Ask them to sign in once, then add them." });
      }
      const current = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: ctx.ws.workspaceId, userId: user.id } },
      });
      if (current?.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "The owner's role can't be changed." });
      const m = await ctx.db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.ws.workspaceId, userId: user.id } },
        create: { workspaceId: ctx.ws.workspaceId, userId: user.id, role: input.role },
        update: { role: input.role },
      });
      await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "member.added", summary: `Gave ${input.email} the ${input.role} role` });
      return m;
    }),

  removeMember: wsProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    requireRole(ctx.ws.role, "admin", "remove team members");
    const m = await ctx.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.ws.workspaceId, userId: input.userId } },
      include: { user: { select: { emailAddress: true } } },
    });
    if (!m) throw new TRPCError({ code: "NOT_FOUND" });
    if (m.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "The owner can't be removed." });
    await ctx.db.workspaceMember.delete({ where: { id: m.id } });
    await audit({ workspaceId: ctx.ws.workspaceId, actor: "user", userId: ctx.auth.id, action: "member.removed", summary: `Removed ${m.user.emailAddress}` });
  }),
});
