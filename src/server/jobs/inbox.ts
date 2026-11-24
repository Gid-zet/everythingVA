import "server-only";
import type { JobStage, PrismaClient } from "@prisma/client";
import { classifyEmail } from "./ai";

/**
 * Mailbox status detection (the JobOps idea): find recruiter emails about
 * active applications, let AI read them, and suggest a stage change. Nothing
 * changes until the user accepts a suggestion.
 */

/** Applicant tracking systems that send mail on employers' behalf. */
const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "myworkday.com", "workday.com", "smartrecruiters.com",
  "icims.com", "jobvite.com", "bamboohr.com", "workable.com", "workablemail.com", "successfactors.com", "taleo.net", "breezy.hr", "recruitee.com",
  "teamtailor.com", "pinpointhq.com", "linkedin.com", "indeed.com", "indeedemail.com", "ziprecruiter.com", "dover.com", "rippling.com", "gusto.com",
];

const KIND_STAGE: Record<string, JobStage | null> = { received: null, assessment: "screening", interview: "interview", offer: "offer", rejection: "rejected", other: null };
const ORDER: JobStage[] = ["saved", "applied", "screening", "interview", "offer", "accepted"];

const domainOf = (a: string) => a.split("@")[1]?.toLowerCase() ?? "";
const under = (d: string, root: string) => d === root || d.endsWith(`.${root}`);

export type InboxSuggestion = {
  jobId: string;
  jobTitle: string;
  company: string;
  threadId: string;
  accountId: string;
  subject: string;
  from: string;
  sentAt: Date;
  kind: string;
  summary: string;
  eventDate: string | null;
  suggestedStage: JobStage | null;
};

export async function scanInbox(db: PrismaClient, userId: string, max = 12): Promise<{ suggestions: InboxSuggestion[]; checked: number }> {
  const jobs = await db.jobApplication.findMany({
    where: { userId, stage: { in: ["applied", "screening", "interview", "offer"] } },
    select: { id: true, title: true, company: true, companyDomain: true, contactEmail: true, description: true, location: true, stage: true, appliedAt: true, createdAt: true, threadIds: true, ignoredThreadIds: true },
  });
  if (!jobs.length) return { suggestions: [], checked: 0 };
  const earliest = Math.min(...jobs.map((j) => (j.appliedAt ?? j.createdAt).getTime()));
  const since = new Date(Math.max(earliest - 86400_000, Date.now() - 120 * 86400_000));

  const companyDomains = jobs.flatMap((j) => [j.companyDomain, j.contactEmail ? domainOf(j.contactEmail) : null]).filter((d): d is string => !!d);
  const domains = [...new Set([...companyDomains, ...ATS_DOMAINS])];
  const emails = await db.email.findMany({
    where: {
      thread: { account: { userId } },
      emailLabel: { not: "sent" },
      sentAt: { gte: since },
      OR: domains.map((d) => ({ from: { address: { endsWith: `@${d}`, mode: "insensitive" as const } } })).concat(domains.map((d) => ({ from: { address: { endsWith: `.${d}`, mode: "insensitive" as const } } }))),
    },
    orderBy: { sentAt: "desc" },
    take: 300,
    select: { threadId: true, subject: true, sentAt: true, bodySnippet: true, body: true, from: { select: { address: true, name: true } }, thread: { select: { accountId: true } } },
  });

  // Match each email to at most one job; newest email per (job, thread).
  const picks = new Map<string, { job: (typeof jobs)[number]; email: (typeof emails)[number] }>();
  for (const e of emails) {
    const d = domainOf(e.from.address);
    const text = `${e.subject} ${e.bodySnippet ?? ""} ${(e.body ?? "").slice(0, 4000)}`.toLowerCase();
    const job = jobs.find((j) => {
      if (j.threadIds.includes(e.threadId) || j.ignoredThreadIds.includes(e.threadId)) return false;
      if (j.contactEmail && e.from.address.toLowerCase() === j.contactEmail.toLowerCase()) return true;
      if (j.companyDomain && under(d, j.companyDomain)) return true;
      const viaAts = ATS_DOMAINS.some((root) => under(d, root));
      return viaAts && j.company.length >= 3 && text.includes(j.company.toLowerCase());
    });
    if (!job) continue;
    const key = `${job.id}|${e.threadId}`;
    if (!picks.has(key)) picks.set(key, { job, email: e });
  }

  const chosen = [...picks.values()].slice(0, max);
  const out: InboxSuggestion[] = [];
  await Promise.all(
    chosen.map(async ({ job, email }) => {
      try {
        const body = (email.body ?? email.bodySnippet ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const c = await classifyEmail(job, { from: `${email.from.name ?? ""} <${email.from.address}>`, subject: email.subject, body });
        if (!c.related || c.kind === "other") return;
        const target = KIND_STAGE[c.kind] ?? null;
        // Only suggest moving forward, or a rejection.
        const forward = target && (target === "rejected" || ORDER.indexOf(target) > ORDER.indexOf(job.stage));
        out.push({
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          threadId: email.threadId,
          accountId: email.thread.accountId,
          subject: email.subject.slice(0, 300),
          from: email.from.name ?? email.from.address,
          sentAt: email.sentAt,
          kind: c.kind,
          summary: c.summary.slice(0, 300),
          eventDate: c.eventDate,
          suggestedStage: forward ? target : null,
        });
      } catch {
        /* skip this email */
      }
    }),
  );
  return { suggestions: out.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()), checked: chosen.length };
}
