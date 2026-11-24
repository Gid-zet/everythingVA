import { describe, expect, it } from "vitest";
import { apiUrlFor, boardOf, parseJobPostingJsonLd, verifyKeywords } from "../posting";
import { needsFollowUp, pipelineStats, weeklyApplications } from "../pipeline";

describe("posting", () => {
  it("names boards and finds public APIs", () => {
    expect(boardOf("https://boards.greenhouse.io/acme/jobs/123")).toBe("Greenhouse");
    expect(boardOf("https://careers.northwind.com/x")).toBe("careers.northwind.com");
    expect(apiUrlFor("https://job-boards.greenhouse.io/acme/jobs/4567?gh_src=x")).toEqual({ kind: "greenhouse", api: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/4567" });
    expect(apiUrlFor("https://jobs.lever.co/acme/0c2b5f8e-1a2b-4c3d-9e8f-0123456789ab/apply")).toEqual({ kind: "lever", api: "https://api.lever.co/v0/postings/acme/0c2b5f8e-1a2b-4c3d-9e8f-0123456789ab" });
    expect(apiUrlFor("https://example.com/jobs/1")).toBeNull();
  });
  it("reads schema.org JobPosting", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"HR Business Partner",
      "hiringOrganization":{"@type":"Organization","name":"Northwind","sameAs":"https://www.northwind.com"},
      "jobLocation":[{"@type":"Place","address":{"addressLocality":"Austin","addressRegion":"TX","addressCountry":"US"}}],
      "baseSalary":{"currency":"USD","value":{"minValue":90000,"maxValue":110000,"unitText":"YEAR"}},
      "validThrough":"2026-12-31T23:59","description":"&lt;p&gt;Lead &lt;b&gt;people&lt;/b&gt; programs.&lt;/p&gt;"}]}</script>`;
    expect(parseJobPostingJsonLd(html)).toEqual({
      title: "HR Business Partner", company: "Northwind", companyDomain: "northwind.com", location: "Austin, TX, US", workMode: null,
      salary: "USD 90,000–110,000 per year", description: "Lead people programs.", deadline: "2026-12-31", source: null,
    });
    expect(parseJobPostingJsonLd("<html></html>")).toBeNull();
  });
  it("only counts keywords that really appear in the CV", () => {
    const cv = "Led payroll for 3 states. Skilled in Workday, HRIS migrations and C++. SHRM-CP certified.";
    expect(verifyKeywords(cv, ["Workday", "payroll", "SHRM-CP", "c++", "Kubernetes", "HRIS", "workday"])).toEqual({ matched: ["Workday", "payroll", "SHRM-CP", "c++", "HRIS"], missing: ["Kubernetes"] });
  });
});

describe("pipeline", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const d = (n: number) => new Date(now.getTime() - n * 86400_000);
  const jobs = [
    { stage: "saved" as const, appliedAt: null, updatedAt: d(1) },
    { stage: "applied" as const, appliedAt: d(10), updatedAt: d(10) },
    { stage: "applied" as const, appliedAt: d(2), updatedAt: d(2) },
    { stage: "interview" as const, appliedAt: d(20), updatedAt: d(3) },
    { stage: "rejected" as const, appliedAt: d(30), updatedAt: d(5) },
  ];
  it("computes response and interview rates", () => {
    expect(pipelineStats(jobs)).toEqual({ applied: 4, responseRate: 50, interviewRate: 25, interviews: 1, offers: 0 });
  });
  it("flags stale applications for follow-up", () => {
    expect(jobs.map((j) => needsFollowUp(j, now))).toEqual([false, true, false, false, false]);
    expect(needsFollowUp({ ...jobs[1]!, nextActionAt: d(-2) }, now)).toBe(false);
  });
  it("buckets applications by week", () => {
    const w = weeklyApplications(jobs, now, 6);
    expect(w).toHaveLength(6);
    expect(w.reduce((n, x) => n + x.count, 0)).toBe(4);
    expect(w.at(-1)!.count).toBe(1);
  });
});

import { markdownToHtml } from "../markdown";
describe("markdownToHtml", () => {
  it("renders CV markdown safely", () => {
    const md = "# Ana Lima\n**HR Director** · [site](https://ana.dev) [x](javascript:alert(1))\n\n## Experience\n- Led *payroll* for 3 states\n- <script>bad</script>\n\n1. One\n2. Two\n---\nThanks";
    expect(markdownToHtml(md)).toBe(
      '<h1>Ana Lima</h1>\n<p><strong>HR Director</strong> · <a href="https://ana.dev">site</a> [x](javascript:alert(1))</p>\n<h2>Experience</h2>\n<ul>\n<li>Led <em>payroll</em> for 3 states</li>\n<li>&lt;script&gt;bad&lt;/script&gt;</li>\n</ul>\n<ol>\n<li>One</li>\n<li>Two</li>\n</ol>\n<hr>\n<p>Thanks</p>',
    );
  });
});
