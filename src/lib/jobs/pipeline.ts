/** Job pipeline stages and stats (pure; tested). */

export type JobStage = "saved" | "applied" | "screening" | "interview" | "offer" | "accepted" | "rejected" | "withdrawn";

export const ACTIVE: JobStage[] = ["applied", "screening", "interview", "offer"];
/** Stages that mean the employer responded. */
const RESPONDED: JobStage[] = ["screening", "interview", "offer", "accepted", "rejected"];
const INTERVIEWED: JobStage[] = ["interview", "offer", "accepted"];

type J = { stage: JobStage; appliedAt: Date | string | null; updatedAt: Date | string; nextActionAt?: Date | string | null };

export function pipelineStats(jobs: J[]) {
  const applied = jobs.filter((j) => j.stage !== "saved" && j.appliedAt).length;
  const responded = jobs.filter((j) => RESPONDED.includes(j.stage) && j.appliedAt).length;
  const interviews = jobs.filter((j) => INTERVIEWED.includes(j.stage)).length;
  const offers = jobs.filter((j) => j.stage === "offer" || j.stage === "accepted").length;
  return {
    applied,
    responseRate: applied ? Math.round((responded / applied) * 100) : 0,
    interviewRate: applied ? Math.round((interviews / applied) * 100) : 0,
    interviews,
    offers,
  };
}

/** Applied a while ago with no movement: time to follow up. */
export function needsFollowUp(j: J, now: Date, days = 7) {
  if (j.stage !== "applied" || !j.appliedAt) return false;
  if (j.nextActionAt && new Date(j.nextActionAt) > now) return false;
  const since = Math.max(new Date(j.appliedAt).getTime(), new Date(j.updatedAt).getTime());
  return now.getTime() - since >= days * 86400_000;
}

/** Applications sent per ISO week, oldest first (for a small activity chart). */
export function weeklyApplications(jobs: J[], now: Date, weeks = 8) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
  const out = Array.from({ length: weeks }, (_, i) => ({ week: new Date(start.getTime() + i * 7 * 86400_000).toISOString().slice(0, 10), count: 0 }));
  for (const j of jobs) {
    if (!j.appliedAt) continue;
    const i = Math.floor((new Date(j.appliedAt).getTime() - start.getTime()) / (7 * 86400_000));
    if (i >= 0 && i < weeks) out[i]!.count++;
  }
  return out;
}
