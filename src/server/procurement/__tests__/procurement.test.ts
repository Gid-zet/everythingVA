import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { scoreRelevance, RELEVANCE_MIN } from "../relevance";
import { mapSamRecord } from "../sources/sam-gov";
import { mapCanadaBuysRow } from "../sources/canadabuys";
import { detectChanges } from "../changes";
import { buildAlerts } from "../alerts";
import { applyGuardRails, statusAfterQualification, type Qualification } from "../qualification-rules";
import { CCM_TEMPLATE } from "../ccm-template";

const profile = CCM_TEMPLATE;

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, line breaks in fields and a BOM", () => {
    const rows = parseCsv('﻿"a","b"\r\n"1","say ""hi""\nthere"\n2,3\n');
    expect(rows).toEqual([
      { a: "1", b: 'say "hi"\nthere' },
      { a: "2", b: "3" },
    ]);
  });
  it("skips blank lines and returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("scoreRelevance", () => {
  it("scores a leadership training notice highly", () => {
    const r = scoreRelevance(
      { title: "Leadership Development and Executive Coaching Services", description: "Facilitation of team building workshops", classificationCodes: ["611430"] },
      profile,
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.matched).toContain("leadership development");
  });
  it("drops notices with an excluded keyword in the title", () => {
    const r = scoreRelevance({ title: "Janitorial services and leadership development", classificationCodes: [] }, profile);
    expect(r.score).toBe(0);
  });
  it("matches whole phrases only", () => {
    const r = scoreRelevance({ title: "Disco ball supply", classificationCodes: [] }, profile);
    expect(r.score).toBeLessThan(RELEVANCE_MIN);
  });
  it("matches UNSPSC codes by prefix", () => {
    const r = scoreRelevance({ title: "Services", classificationCodes: ["80111504"] }, profile);
    expect(r.score).toBe(25);
  });
});

describe("mapSamRecord", () => {
  const record = {
    noticeId: "abc123",
    title: "Executive Coaching ",
    solicitationNumber: "W91-26-Q-0001",
    fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC-PICA",
    postedDate: "2026-11-10",
    type: "Combined Synopsis/Solicitation",
    active: "Yes",
    responseDeadLine: "2026-12-01T17:00:00-05:00",
    naicsCode: "611430",
    classificationCode: "U008",
    typeOfSetAsideDescription: "Women-Owned Small Business (WOSB) Program Set-Aside (FAR 19.15)",
    description: "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc123",
    uiLink: "https://sam.gov/opp/abc123/view",
    resourceLinks: ["https://sam.gov/api/prod/opps/v3/opportunities/resources/files/1/download"],
    pointOfContact: [{ fullName: "Pat Doe", email: "pat@example.gov" }],
    placeOfPerformance: { city: { name: "Picatinny" }, state: { code: "NJ" }, country: { code: "USA" } },
  };
  it("maps the fields discovery needs", () => {
    const o = mapSamRecord(record)!;
    expect(o).toMatchObject({
      source: "sam_gov",
      externalId: "abc123",
      title: "Executive Coaching",
      organization: "DEPT OF DEFENSE / W6QK ACC-PICA",
      sourceUrl: "https://sam.gov/opp/abc123/view",
      placeOfPerformance: "Picatinny, NJ, USA",
      classificationCodes: ["611430", "U008"],
      descriptionUrl: record.description,
    });
    expect(o.deadline?.toISOString()).toBe("2026-12-01T22:00:00.000Z");
    expect(o.description).toBeUndefined();
    expect(o.attachments).toHaveLength(1);
  });
  it("skips award notices and inactive notices", () => {
    expect(mapSamRecord({ ...record, type: "Award Notice" })).toBeNull();
    expect(mapSamRecord({ ...record, active: "No" })).toBeNull();
  });
});

describe("mapCanadaBuysRow", () => {
  const row = {
    "title-titre-eng": "Leadership training for managers",
    "title-titre-fra": "Formation en leadership",
    "referenceNumber-numeroReference": "PW-26-001",
    "amendmentNumber-numeroModification": "001",
    "solicitationNumber-numeroSollicitation": "EN578-26",
    "publicationDate-datePublication": "2026-11-05",
    "tenderClosingDate-appelOffresDateCloture": "2026-12-15T14:00:00",
    "unspsc": "*80111500\n*86132000",
    "gsin-nibs": "",
    "regionsOfDelivery-regionsLivraison-eng": "*Ontario (except NCR)",
    "regionsOfOpportunity-regionAppelOffres-eng": "*Canada",
    "contractingEntityName-nomEntitContractante-eng": "Public Services and Procurement Canada",
    "contactInfoName-informationsContactNom": "Sam Lee",
    "contactInfoEmail-informationsContactCourriel": "sam.lee@example.gc.ca",
    "noticeURL-URLavis-eng": "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/pw-26-001",
    "attachment-piecesJointes-eng": "https://canadabuys.canada.ca/files/SOW%20v2.pdf",
    "tenderDescription-descriptionAppelOffres-eng": "Deliver leadership development workshops.",
  };
  it("maps English columns, codes, regions and attachments", () => {
    const o = mapCanadaBuysRow(row)!;
    expect(o).toMatchObject({
      source: "canadabuys",
      externalId: "PW-26-001",
      title: "Leadership training for managers",
      organization: "Public Services and Procurement Canada",
      amendmentNumber: "001",
      country: "CA",
      currency: "CAD",
      classificationCodes: ["80111500", "86132000"],
      placeOfPerformance: "Ontario (except NCR), Canada",
    });
    expect(o.attachments[0]).toEqual({ url: row["attachment-piecesJointes-eng"], name: "SOW v2.pdf" });
    expect(o.contacts[0]).toMatchObject({ name: "Sam Lee", email: "sam.lee@example.gc.ca" });
  });
  it("skips rows without a reference or title", () => {
    expect(mapCanadaBuysRow({ ...row, "referenceNumber-numeroReference": "" })).toBeNull();
  });
});

describe("detectChanges", () => {
  const stored = { title: "A", deadline: new Date("2026-12-01T00:00:00Z"), amendmentNumber: "000", description: "x" };
  const base = mapCanadaBuysRow({
    "title-titre-eng": "A",
    "referenceNumber-numeroReference": "R1",
    "tenderClosingDate-appelOffresDateCloture": "2026-12-01T00:00:00Z",
    "amendmentNumber-numeroModification": "000",
    "tenderDescription-descriptionAppelOffres-eng": "x",
  })!;
  it("reports nothing when nothing changed", () => {
    expect(detectChanges(stored, base).changed).toBe(false);
  });
  it("detects an amendment and a moved deadline", () => {
    const d = detectChanges(stored, { ...base, amendmentNumber: "002", deadline: new Date("2026-12-08T00:00:00Z") });
    expect(d.amended).toBe(true);
    expect(d.deadlineChanged).toBe(true);
    expect(d.changes.join(" ")).toMatch(/Amendment 002/);
  });
});

describe("buildAlerts", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  it("flags expired, expiring and unverified credentials and missing documents", () => {
    const alerts = buildAlerts({
      now,
      hasProfile: true,
      samConfigured: true,
      credentials: [
        { name: "WOSB", status: "verified", expiresAt: new Date("2026-12-01T00:00:00Z") },
        { name: "WBENC", status: "unverified", expiresAt: new Date("2026-01-01T00:00:00Z") },
      ],
      documents: [{ name: "Capability statement", category: "capability_statement", expiresAt: null, isLatest: true }],
    });
    const text = alerts.map((a) => a.message).join("\n");
    expect(text).toMatch(/WOSB expires in 15 days/);
    expect(text).toMatch(/WBENC expired/);
    expect(text).toMatch(/WBENC hasn't been verified/);
    expect(text).toMatch(/has no insurance certificate yet/);
    expect(text).not.toMatch(/capability statement yet/);
  });
});

describe("applyGuardRails", () => {
  const base: Qualification = {
    summary: "s",
    servicesMatch: "strong",
    requirements: [],
    certificationsRelevant: "",
    geographicRestriction: null,
    governmentExperienceRequired: "no",
    insuranceRequirements: null,
    financialRequirements: null,
    contractVehicleRequired: null,
    canApplyIndependently: "yes",
    teamingSuggested: false,
    missingInformation: [],
    fitScore: 90,
    eligibility: "qualified",
    recommendation: "strongly_recommend",
    reasoning: "r",
  };
  const now = new Date("2026-11-16T00:00:00Z");
  const future = new Date("2026-12-16T00:00:00Z");

  it("keeps a clean qualified result", () => {
    const r = applyGuardRails(base, { deadline: future, now });
    expect(r.eligibility).toBe("qualified");
    expect(r.recommendation).toBe("strongly_recommend");
    expect(r.guardRailNotes).toEqual([]);
  });
  it("an unmet mandatory requirement means not qualified and do not pursue", () => {
    const r = applyGuardRails(
      { ...base, requirements: [{ requirement: "GSA MAS schedule", type: "mandatory", status: "does_not_meet", evidence: "" }] },
      { deadline: future, now },
    );
    expect(r.eligibility).toBe("not_qualified");
    expect(r.recommendation).toBe("do_not_pursue");
    expect(r.fitScore).toBeLessThanOrEqual(40);
  });
  it("keeps 'consider' when teaming is a route", () => {
    const r = applyGuardRails(
      {
        ...base,
        teamingSuggested: true,
        recommendation: "consider",
        requirements: [{ requirement: "Facility clearance", type: "mandatory", status: "does_not_meet", evidence: "" }],
      },
      { deadline: future, now },
    );
    expect(r.recommendation).toBe("consider");
  });
  it("an unknown mandatory requirement means requires clarification", () => {
    const r = applyGuardRails(
      { ...base, requirements: [{ requirement: "$2M liability insurance", type: "mandatory", status: "unknown", evidence: "" }] },
      { deadline: future, now },
    );
    expect(r.eligibility).toBe("requires_clarification");
    expect(r.recommendation).toBe("consider");
  });
  it("a desirable requirement doesn't affect eligibility", () => {
    const r = applyGuardRails(
      { ...base, requirements: [{ requirement: "Experience in Ontario preferred", type: "desirable", status: "does_not_meet", evidence: "" }] },
      { deadline: future, now },
    );
    expect(r.eligibility).toBe("qualified");
  });
  it("a passed deadline means do not pursue", () => {
    const r = applyGuardRails(base, { deadline: new Date("2026-11-01T00:00:00Z"), now });
    expect(r.recommendation).toBe("do_not_pursue");
  });
});

describe("statusAfterQualification", () => {
  it("only eligible results get the Qualified status", () => {
    expect(statusAfterQualification("discovered", "qualified")).toBe("qualified");
    expect(statusAfterQualification("discovered", "potentially_qualified")).toBe("qualified");
    expect(statusAfterQualification("discovered", "requires_clarification")).toBe("under_review");
    expect(statusAfterQualification("discovered", "not_qualified")).toBe("under_review");
  });
  it("re-assessing corrects an agent-set status", () => {
    expect(statusAfterQualification("qualified", "requires_clarification")).toBe("under_review");
  });
  it("never overrides a status a person set", () => {
    expect(statusAfterQualification("approved_to_pursue", "not_qualified")).toBeUndefined();
    expect(statusAfterQualification("submitted", "qualified")).toBeUndefined();
  });
});
