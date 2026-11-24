# Leads

Lead generation built from data you already own, modelled on the best open-source projects:

| Idea | Borrowed from |
| --- | --- |
| Describe what you sell and who buys it; AI gives every lead a verdict **with a written reason** | eracle/OpenOutreach (Apache-2.0) |
| Pipeline stages, board and list views | krayin/laravel-crm (MIT), twentyhq/twenty |
| Capture UTM / referrer on forms so you know which campaign brought a lead | medius/utm_form (MIT) |

## Sources
- **Web search** (Find leads → Web): AI turns your ideal customer into search queries, a search API (Tavily, Serper or Brave) finds company websites, and a crawler reads each site's homepage plus up to two contact/about/team pages. AI extracts the company, named people and a fit verdict with reasons. Emails are kept only if they are printed on the site (or returned by the optional Hunter lookup), and the email domain is checked for MX records.
  - Crawler rules: identifies itself (`EverythingVA-LeadFinder`), honours robots.txt, public http(s) only, refuses private/internal addresses at every redirect (SSRF guard), 8 s and 1.5 MB per page, never logs in or submits forms.
  - Skipped on purpose: LinkedIn, Facebook, Instagram, X, Google Maps, Yelp, directories, job boards, news and government sites. Their terms forbid scraping or they aren't the prospect's own site.
  - Budget: `WEB_SEARCH_DAILY_LIMIT` searches per user per day (default 25).
- **Mailbox**: people you've corresponded with in the last 12 months, ranked by warmth (two-way threads, frequency, recency). Skips no-reply and role mailboxes, bulk-sending platforms, your own domain, excluded domains, people you unsubscribed from, and one-off senders. You pick who to add.
- **Tenders**: buyer contacts named on opportunities in your procurement workspace.
- **Enquiry forms**: public link `/lead-form/<id>` (or iframe embed). Consent is required, a honeypot and rate limits stop spam, and UTM parameters, referrer and landing page are stored on the lead. You get a push notification for each submission.
- **CSV import** and **manual entry**.

## Qualification and outreach
- **Ideal customer** (offer, buyer, industries, regions, roles, excluded domains) drives the AI score (0–100), fit (strong / possible / poor), reason and next step. Lead details and emails are treated as untrusted input.
- **Write a draft** creates an email with AI and saves it to Drafts in Mail. Nothing is ever sent automatically. Leads marked *do not contact*, and addresses you unsubscribed from, are blocked.
- **Follow up in 3 days** adds a task in the "Leads" project.

## Configuration
| Variable | Purpose |
| --- | --- |
| `TAVILY_API_KEY`, `SERPER_API_KEY` or `BRAVE_SEARCH_API_KEY` | Web search (one is required for the Web tab). Tavily: 1,000 free searches a month, no card |
| `HUNTER_API_KEY` | Optional: published work emails when a site lists none |
| `WEB_SEARCH_DAILY_LIMIT` | Optional: searches per user per day (default 25) |

Cold email rules still apply: include who you are and a way to opt out, and in the UK/EU have a legitimate interest for business contacts. Marking a lead *do not contact* blocks outreach.

## Data
Tables: `LeadProfile`, `Lead`, `LeadActivity`, `LeadForm` (migrations `20261123000000_leads`, `20261124000000_leads_web`). Router: `src/server/api/routers/leads.ts`.
