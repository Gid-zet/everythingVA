/** Shared procurement types (no server-only imports, so they're testable). */

export type DiscoverySource = "sam_gov" | "canadabuys";

/** An opportunity as a connector returns it, before it's stored. */
export type NormalizedOpportunity = {
  source: DiscoverySource;
  externalId: string;
  title: string;
  organization?: string;
  referenceNumber?: string;
  solicitationNumber?: string;
  noticeType?: string;
  sourceUrl: string;
  postedAt?: Date;
  deadline?: Date;
  estimatedValue?: number;
  currency?: string;
  country?: string;
  placeOfPerformance?: string;
  setAside?: string;
  classificationCodes: string[];
  description?: string;
  descriptionUrl?: string;
  attachments: { name?: string; url: string }[];
  contacts: { name?: string; email?: string; phone?: string }[];
  amendmentNumber?: string;
};

/** The parts of a company profile that discovery and scoring use. */
export type MatchProfile = {
  keywords: string[];
  services: string[];
  excludedKeywords: string[];
  naicsCodes: string[];
  unspscCodes: string[];
};

export const STATUS_LABELS = {
  discovered: "Discovered",
  under_review: "Under review",
  qualified: "Qualified",
  awaiting_decision: "Awaiting decision",
  approved_to_pursue: "Approved to pursue",
  proposal_in_progress: "Proposal in progress",
  awaiting_information: "Awaiting information",
  awaiting_approval: "Awaiting approval",
  ready_for_submission: "Ready for submission",
  submitted: "Submitted",
  under_evaluation: "Under evaluation",
  awarded: "Awarded",
  unsuccessful: "Unsuccessful",
  withdrawn: "Withdrawn",
  declined: "Declined",
} as const;

export type OpportunityStatusId = keyof typeof STATUS_LABELS;

/** Status changes that are decisions, so only an admin or owner may make them. */
export const APPROVAL_STATUSES: OpportunityStatusId[] = [
  "approved_to_pursue",
  "declined",
  "ready_for_submission",
  "submitted",
];

/** Statuses that count as the live pipeline (for value and deadline views). */
export const ACTIVE_STATUSES: OpportunityStatusId[] = [
  "discovered",
  "under_review",
  "qualified",
  "awaiting_decision",
  "approved_to_pursue",
  "proposal_in_progress",
  "awaiting_information",
  "awaiting_approval",
  "ready_for_submission",
];

export const ELIGIBILITY_LABELS = {
  qualified: "Qualified",
  potentially_qualified: "Potentially qualified",
  requires_clarification: "Requires clarification",
  not_qualified: "Not qualified",
} as const;

export const RECOMMENDATION_LABELS = {
  strongly_recommend: "Strongly recommend",
  consider: "Consider applying",
  do_not_pursue: "Do not pursue",
} as const;

export const SOURCE_LABELS = { sam_gov: "SAM.gov", canadabuys: "CanadaBuys", manual: "Added manually" } as const;

export const CATEGORY_LABELS = {
  capability_statement: "Capability statement",
  certification: "Certification",
  business_registration: "Business registration",
  tax_supplier: "Tax / supplier information",
  insurance: "Insurance certificate",
  past_proposal: "Previous proposal",
  case_study: "Case study",
  staff_bio: "Staff biography",
  resume: "Resume",
  project_reference: "Project reference",
  pricing: "Pricing schedule",
  policy: "Company policy",
  template: "Proposal template",
  past_performance: "Past performance",
  other: "Other",
} as const;
