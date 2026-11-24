import { describe, expect, it } from "vitest";
import { contactLinks, extractEmails, extractPhones, htmlToText, isPrivateIp, isSkippedDomain, linkedinUrl, pageTitle, robotsAllows } from "../web";

describe("extraction", () => {
  const html = `<html><head><title>Northwind Traders | Logistics</title><script>var x="spam@evil.com"</script></head>
  <body><a href="mailto:Sales@Northwind.com?subject=hi">Email</a> Dana: dana.ruiz [at] northwind [dot] com
  <img src="logo@2x.png"> you@example.com <a href="tel:+1 (512) 555-0100">Call</a>
  <a href="/about-us">About</a><a href="https://northwind.com/contact">Contact us</a><a href="/team/">Our team</a><a href="/blog">Blog</a>
  <a href="https://other.com/contact">x</a><a href="https://www.linkedin.com/company/northwind-traders">in</a></body></html>`;
  it("finds published emails, including obfuscated ones, and skips junk", () => {
    expect(extractEmails(html).sort()).toEqual(["dana.ruiz@northwind.com", "sales@northwind.com"].sort());
  });
  it("reads text without scripts", () => {
    expect(htmlToText(html)).not.toContain("var x");
    expect(pageTitle(html)).toBe("Northwind Traders | Logistics");
  });
  it("finds tel links, contact pages and LinkedIn", () => {
    expect(extractPhones(html)).toEqual(["+1 (512) 555-0100"]);
    expect(contactLinks(html, "https://northwind.com/")).toEqual(["https://northwind.com/contact", "https://northwind.com/team/", "https://northwind.com/about-us"]);
    expect(linkedinUrl(html)).toBe("https://www.linkedin.com/company/northwind-traders");
  });
});

describe("guards", () => {
  it("skips social networks, directories and government sites", () => {
    expect(isSkippedDomain("uk.linkedin.com")).toBe(true);
    expect(isSkippedDomain("www.yelp.com")).toBe(true);
    expect(isSkippedDomain("agency.gov")).toBe(true);
    expect(isSkippedDomain("northwind.com")).toBe(false);
  });
  it("blocks private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "104.16.1.1", "2606:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("honours robots.txt", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/contact\n\nUser-agent: EverythingVA\nDisallow: /\n\nUser-agent: Googlebot\nDisallow:";
    expect(robotsAllows(robots, "/contact", "SomeBot/1.0")).toBe(true);
    expect(robotsAllows(robots, "/private/x", "SomeBot/1.0")).toBe(false);
    expect(robotsAllows(robots, "/private/contact", "SomeBot/1.0")).toBe(true);
    expect(robotsAllows(robots, "/contact", "EverythingVA-LeadFinder/1.0 (+https://x)")).toBe(false);
    expect(robotsAllows("", "/", "x")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "/a.pdf", "x")).toBe(false);
  });
});
