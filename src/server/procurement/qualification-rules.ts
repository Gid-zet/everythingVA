import { z } from "zod";

export const qualificationSchema = z.object({
  summary: z.string().describe("Two or three sentences: what the buyer wants"),
  servicesMatch: z.enum(["strong", "partial", "none"]).describe("How well the requested services match the company's services"),
  requirements: z
    .array(
      z.object({
        requirement: z.string(),
        type: z.enum(["mandatory", "desirable"]).describe("mandatory only if the notice says must/shall/required or makes it a pass/fail condition"),
        status: z.enum(["meets", "does_not_meet", "unknown"]),
        evidence: z.string().describe("Which profile item or verified credential supports this, or what is missing"),
      }),
    )
    .describe("Every eligibility condition or qualification stated in the notice"),
  certificationsRelevant: z.string().describe("Whether a set-aside or preference for WOSB/WBENC/small business applies, and whether the company holds it (verified)"),
  geographicRestriction: z.string().nullable(),
  governmentExperienceRequired: z.enum(["yes", "no", "unclear"]),
  insuranceRequirements: z.string().nullable(),
  financialRequirements: z.string().nullable(),
  contractVehicleRequired: z.string().nullable().describe("e.g. a GSA schedule, or null if none"),
  canApplyIndependently: z.enum(["yes", "no", "unclear"]),
  teamingSuggested: z.boolean().describe("True if subcontracting or teaming looks more realistic than a prime bid"),
  missingInformation: z.array(z.string()).describe("Facts the company must confirm before deciding"),
  fitScore: z.number().int().min(0).max(100),
  eligibility: z.enum(["qualified", "potentially_qualified", "requires_clarification", "not_qualified"]),
  recommendation: z.enum(["strongly_recommend", "consider", "do_not_pursue"]),
  reasoning: z.string().describe("Why this eligibility and recommendation, referring to specific requirements"),
});

export type Qualification = z.infer<typeof qualificationSchema>;

/** Pipeline statuses the agent may set; anything later is a human decision. */
const AGENT_STATUSES = ["discovered", "under_review", "qualified"] as const;

/**
 * Pipeline status after an assessment. Only "Qualified" or "Potentially
 * qualified" eligibility moves an opportunity to the Qualified status; anything
 * else (needs clarification, not qualified) goes to Under review for a person.
 * Statuses a person has moved it to are never changed.
 */
export function statusAfterQualification(current: string, eligibility: Qualification["eligibility"]) {
  if (!(AGENT_STATUSES as readonly string[]).includes(current)) return undefined;
  return eligibility === "qualified" || eligibility === "potentially_qualified" ? ("qualified" as const) : ("under_review" as const);
}

/**
 * Deterministic guard rails applied after the model answers, so a confident
 * model can't over-state eligibility:
 *  - a mandatory requirement the company doesn't meet → not qualified;
 *  - a mandatory requirement that's unknown → at best "requires clarification";
 *  - "strongly recommend" only when qualified;
 *  - deadline passed → do not pursue.
 */
export function applyGuardRails(q: Qualification, ctx: { deadline: Date | null; now: Date }) {
  const notes: string[] = [];
  const out = { ...q };
  const mandatory = q.requirements.filter((r) => r.type === "mandatory");

  if (mandatory.some((r) => r.status === "does_not_meet") && out.eligibility !== "not_qualified") {
    out.eligibility = "not_qualified";
    notes.push("At least one mandatory requirement is not met.");
  } else if (mandatory.some((r) => r.status === "unknown") && (out.eligibility === "qualified" || out.eligibility === "potentially_qualified")) {
    out.eligibility = "requires_clarification";
    notes.push("Some mandatory requirements can't be confirmed from the verified profile.");
  }

  if (out.recommendation === "strongly_recommend" && out.eligibility !== "qualified") {
    out.recommendation = "consider";
    notes.push("Strong recommendation lowered: eligibility isn't confirmed.");
  }
  if (out.eligibility === "not_qualified" && !out.teamingSuggested && out.recommendation !== "do_not_pursue") {
    out.recommendation = "do_not_pursue";
    notes.push("Not qualified and no teaming route identified.");
  }
  if (ctx.deadline && ctx.deadline < ctx.now) {
    out.recommendation = "do_not_pursue";
    notes.push("The response deadline has passed.");
  }
  if (out.eligibility === "not_qualified") out.fitScore = Math.min(out.fitScore, 40);

  return { ...out, guardRailNotes: notes };
}
