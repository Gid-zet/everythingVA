/**
 * Starting point for Cummings Consulting & Management's profile, taken from
 * the project brief. Everything here must be checked by an administrator:
 * credentials are created as "unverified" and agents won't rely on them
 * until someone verifies them. Codes should be confirmed against CCM's own
 * SAM.gov registration.
 */
export const CCM_TEMPLATE = {
  legalName: "Cummings Consulting & Management",
  summary:
    "Woman-owned small disadvantaged consulting firm providing leadership development, executive coaching, organizational development, training and facilitation to government agencies, corporations and institutions.",
  services: [
    "Leadership development",
    "Executive coaching",
    "Organizational development",
    "Business consulting",
    "Leadership training",
    "Facilitation",
    "Train-the-trainer programs",
    "DiSC assessments",
    "Everything DiSC certification",
    "The Five Behaviors of a Cohesive Team",
    "Employee engagement",
    "Team development",
    "Management development",
    "Professional development",
    "Organizational assessment",
    "Customized training",
  ],
  keywords: [
    "leadership development",
    "leadership training",
    "executive coaching",
    "coaching services",
    "organizational development",
    "management consulting",
    "employee training",
    "professional development",
    "leadership assessment",
    "team effectiveness",
    "team building",
    "facilitation",
    "facilitation services",
    "diversity and inclusion training",
    "training program development",
    "organizational transformation",
    "change management",
    "employee engagement",
    "DiSC assessment",
    "supervisory training",
    "management training",
    "soft skills training",
  ],
  excludedKeywords: ["construction", "janitorial", "custodial", "roofing", "paving", "hvac", "snow removal", "firearms"],
  naicsCodes: ["611430", "541611", "541612", "541618", "611710"],
  unspscCodes: ["80101500", "80111500", "86130000"],
  businessTypes: ["Woman-owned small business", "Small disadvantaged business"],
  countries: ["US", "CA"],
  serviceRegions: [],
  credentials: [
    { name: "WOSB (Women-Owned Small Business)", kind: "certification" as const, issuer: "U.S. Small Business Administration" },
    { name: "WBENC Women's Business Enterprise", kind: "certification" as const, issuer: "WBENC" },
    { name: "Everything DiSC certification", kind: "certification" as const, issuer: "Wiley" },
    { name: "SAM.gov entity registration", kind: "registration" as const, issuer: "SAM.gov" },
  ],
};
