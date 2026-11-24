import { describe, expect, it } from "vitest";
import { ashbyParts, fromAdzuna, fromAshby, fromRemotive, fromUsajobs, isPostingUrl, normalizeJobUrl, titleRelevance } from "../sources";

describe("discovery helpers", () => {
  it("normalises job URLs", () => {
    expect(normalizeJobUrl("https://Jobs.Lever.co/acme/abc/?utm_source=x&lever-source=y#top")).toBe("https://jobs.lever.co/acme/abc");
    expect(normalizeJobUrl("https://boards.greenhouse.io/acme/jobs/1?gh_src=abc&gh_jid=1")).toBe("https://boards.greenhouse.io/acme/jobs/1?gh_jid=1");
  });
  it("scores title relevance against target roles", () => {
    expect(titleRelevance("Senior HR Business Partner", ["HR Business Partner"])).toBe(1);
    expect(titleRelevance("Software Engineer", ["HR Business Partner", "People Operations"])).toBe(0);
    expect(titleRelevance("People Operations Lead", ["HR Business Partner", "People Operations Manager"])).toBeCloseTo(2 / 3);
    expect(titleRelevance("Anything", [])).toBe(0.5);
  });
  it("recognises readable posting URLs", () => {
    expect(isPostingUrl("https://job-boards.greenhouse.io/acme/jobs/4567")).toBe(true);
    expect(isPostingUrl("https://boards.greenhouse.io/acme")).toBe(false);
    expect(isPostingUrl("https://jobs.lever.co/acme/0c2b5f8e-1a2b-4c3d-9e8f-0123456789ab")).toBe(true);
    expect(isPostingUrl("https://jobs.ashbyhq.com/Acme/0c2b5f8e-1a2b-4c3d-9e8f-0123456789ab")).toBe(true);
    expect(ashbyParts("https://jobs.ashbyhq.com/Acme%20Co/0c2b5f8e-1a2b-4c3d-9e8f-0123456789ab/application")).toEqual({ org: "Acme Co", id: "0c2b5f8e-1a2b-4c3d-9e8f-0123456789ab" });
  });
});

describe("source mappers", () => {
  it("maps Remotive", () => {
    const [j] = fromRemotive({ jobs: [{ url: "https://remotive.com/remote-jobs/hr/x-1", title: "HRBP", company_name: "Acme", candidate_required_location: "USA", salary: "$90k - $110k", description: "<p>Lead <b>HR</b></p>", publication_date: "2026-11-20T10:00:00" }] });
    expect(j).toMatchObject({ source: "Remotive", title: "HRBP", company: "Acme", location: "USA", workMode: "Remote", salary: "$90k - $110k", description: "Lead HR" });
  });
  it("maps Adzuna and ignores predicted salaries", () => {
    const out = fromAdzuna({ results: [
      { redirect_url: "https://www.adzuna.com/land/ad/1", title: "<strong>HR</strong> Manager", company: { display_name: "Globex" }, location: { display_name: "Austin, Texas" }, salary_min: 80000, salary_max: 95000, salary_is_predicted: "0", created: "2026-11-21T00:00:00Z", description: "Snippet" },
      { redirect_url: "https://www.adzuna.com/land/ad/2", title: "HR Lead", salary_min: 70000, salary_is_predicted: "1" },
    ] });
    expect(out[0]).toMatchObject({ title: "HR Manager", company: "Globex", location: "Austin, Texas", salary: "80k–95k", source: "Adzuna" });
    expect(out[1]).toMatchObject({ company: "Unknown company", salary: null });
  });
  it("maps USAJOBS", () => {
    const [j] = fromUsajobs({ SearchResult: { SearchResultItems: [{ MatchedObjectDescriptor: { PositionTitle: "HR Specialist", OrganizationName: "Dept of X", PositionLocationDisplay: "Washington, DC", PositionURI: "https://www.usajobs.gov/job/1", PositionRemuneration: [{ MinimumRange: "72553", MaximumRange: "94317", RateIntervalCode: "PA" }], QualificationSummary: "Q", PublicationStartDate: "2026-11-20", ApplicationCloseDate: "2026-12-05", UserArea: { Details: { JobSummary: "Summary", MajorDuties: ["Duty 1", "Duty 2"], TeleworkEligible: true } } } }] } });
    expect(j).toMatchObject({ title: "HR Specialist", company: "Dept of X", salary: "USD 73k–94k per year", workMode: "Hybrid", description: "Summary\n\nDuty 1\nDuty 2\n\nQ" });
    expect(j!.closesAt?.toISOString().slice(0, 10)).toBe("2026-12-05");
  });
  it("maps Ashby and skips unlisted jobs", () => {
    const out = fromAshby({ jobs: [
      { title: "People Partner", location: "NYC", workplaceType: "Hybrid", descriptionPlain: "Do things", jobUrl: "https://jobs.ashbyhq.com/acme/1", compensation: { scrapeableCompensationSalarySummary: "$120K – $140K" } },
      { title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/acme/2", isListed: false },
    ] }, "Acme");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ company: "Acme", workMode: "Hybrid", salary: "$120K – $140K" });
  });
});
