import { describe, expect, it } from "vitest";
import { companyFromDomain, isBulkSender, mapImportRows, rankMailboxContacts } from "../candidates";

const now = new Date("2026-11-23T12:00:00Z");
const d = (days: number) => new Date(now.getTime() - days * 86400_000);

describe("helpers", () => {
  it("spots automated and role mailboxes", () => {
    expect(isBulkSender("no-reply@acme.com")).toBe(true);
    expect(isBulkSender("newsletter+weekly@acme.com")).toBe(true);
    expect(isBulkSender("dana@mail.hubspot.com")).toBe(true);
    expect(isBulkSender("dana.ruiz@acme.com")).toBe(false);
  });
  it("guesses a company from a domain", () => {
    expect(companyFromDomain("northwind-traders.com")).toBe("Northwind Traders");
    expect(companyFromDomain("acme.co.uk")).toBe("Acme");
    expect(companyFromDomain("ibm.com")).toBe("IBM");
  });
});

describe("rankMailboxContacts", () => {
  const opts = { ownAddresses: ["theresa@ccm.com"], excludedDomains: ["partner.org"], existing: new Set(["known@lead.com"]), now };
  const rows = [
    { email: "Dana@Northwind.com", name: "Dana Ruiz", emailsIn: 4, emailsOut: 3, lastContactAt: d(3) },
    { email: "dana@northwind.com", name: null, emailsIn: 1, emailsOut: 0, lastContactAt: d(40) },
    { email: "once@acme.com", name: "One Shot", emailsIn: 1, emailsOut: 0, lastContactAt: d(2) },
    { email: "noreply@acme.com", name: "Acme", emailsIn: 30, emailsOut: 0, lastContactAt: d(1) },
    { email: "colleague@ccm.com", name: "Colleague", emailsIn: 9, emailsOut: 9, lastContactAt: d(1) },
    { email: "bob@partner.org", name: "Bob", emailsIn: 5, emailsOut: 5, lastContactAt: d(1) },
    { email: "known@lead.com", name: "Known", emailsIn: 5, emailsOut: 5, lastContactAt: d(1) },
    { email: "sam@gmail.com", name: "Sam Lee", emailsIn: 2, emailsOut: 1, lastContactAt: d(200) },
  ];
  const out = rankMailboxContacts(rows, opts);
  it("merges duplicates, drops bulk, own domain, excluded, existing and one-offs", () => {
    expect(out.map((c) => c.email)).toEqual(["dana@northwind.com", "sam@gmail.com"]);
    expect(out[0]).toMatchObject({ name: "Dana Ruiz", company: "Northwind", emailsIn: 5, emailsOut: 3 });
    expect(out[0]!.why).toMatch(/Two-way conversation/);
  });
  it("leaves the company blank for personal mailboxes", () => {
    expect(out[1]).toMatchObject({ company: null, domain: null });
  });
});

describe("mapImportRows", () => {
  it("maps common headers and drops unusable rows", () => {
    const rows = mapImportRows([
      { "Full Name": "Ana Lima", "E-mail": "ANA@acme.com", Organization: "Acme", "Job Title": "HR Director" },
      { Name: "No Email", Company: "" },
      { Email: "not-an-email" },
      { Name: "Kim", Company: "Globex" },
    ]);
    expect(rows).toEqual([
      { name: "Ana Lima", email: "ana@acme.com", company: "Acme", title: "HR Director" },
      { name: "Kim", company: "Globex" },
    ]);
  });
});
