/** Pure helpers for the procurement dashboard (no DB; unit-tested). */

const DAY = 86400_000;

/** UTC calendar day, YYYY-MM-DD. */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Count of dates per day for the last `days` days (oldest first, today last). */
export function countByDay(dates: Date[], days: number, now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const series = Array.from({ length: days }, (_, i) => ({ date: dayKey(new Date(today - (days - 1 - i) * DAY)), count: 0 }));
  const index = new Map(series.map((s, i) => [s.date, i]));
  for (const d of dates) {
    const i = index.get(dayKey(d));
    if (i !== undefined) series[i]!.count++;
  }
  return series;
}

/** Sum of the last `n` points and of the `n` before them (for "vs previous" deltas). */
export function periodTotals(series: { count: number }[], n: number) {
  const sum = (a: { count: number }[]) => a.reduce((t, p) => t + p.count, 0);
  return { current: sum(series.slice(-n)), previous: sum(series.slice(-2 * n, -n)) };
}

export const FIT_BUCKETS = [
  { label: "0–19", min: 0, max: 19 },
  { label: "20–39", min: 20, max: 39 },
  { label: "40–59", min: 40, max: 59 },
  { label: "60–79", min: 60, max: 79 },
  { label: "80–100", min: 80, max: 100 },
] as const;

export function fitHistogram(scores: number[]) {
  return FIT_BUCKETS.map((b) => ({ label: b.label, count: scores.filter((s) => s >= b.min && s <= b.max).length }));
}

/** Pipeline stages in order, each grouping one or more statuses. */
export const FUNNEL_STAGES = [
  { key: "discovered", label: "Discovered", statuses: ["discovered"] },
  { key: "review", label: "Under review", statuses: ["under_review", "awaiting_decision"] },
  { key: "qualified", label: "Qualified", statuses: ["qualified"] },
  {
    key: "pursuing",
    label: "Pursuing",
    statuses: ["approved_to_pursue", "proposal_in_progress", "awaiting_information", "awaiting_approval", "ready_for_submission"],
  },
  { key: "submitted", label: "Submitted", statuses: ["submitted", "under_evaluation"] },
  { key: "awarded", label: "Awarded", statuses: ["awarded"] },
] as const;

export function funnel(byStatus: { status: string; count: number }[]) {
  const of = (statuses: readonly string[]) => byStatus.filter((b) => statuses.includes(b.status)).reduce((n, b) => n + b.count, 0);
  return {
    stages: FUNNEL_STAGES.map((s) => ({ key: s.key, label: s.label, count: of(s.statuses) })),
    closed: { unsuccessful: of(["unsuccessful"]), withdrawn: of(["withdrawn"]), declined: of(["declined"]) },
  };
}

/** Share of the profile fields discovery and qualification rely on that are filled in. */
export function profileCompleteness(
  p: {
    summary: string;
    services: string[];
    keywords: string[];
    naicsCodes: string[];
    unspscCodes: string[];
    businessTypes: string[];
    countries: string[];
    yearsInBusiness: number | null;
    governmentExperience: string | null;
    website: string | null;
  } | null,
) {
  if (!p) return { filled: 0, total: 10 };
  const checks = [
    p.summary.trim().length > 20,
    p.services.length > 0,
    p.keywords.length > 0,
    p.naicsCodes.length > 0,
    p.unspscCodes.length > 0,
    p.businessTypes.length > 0,
    p.countries.length > 0,
    p.yearsInBusiness !== null,
    !!p.governmentExperience?.trim(),
    !!p.website?.trim(),
  ];
  return { filled: checks.filter(Boolean).length, total: checks.length };
}
