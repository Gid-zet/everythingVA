# Leads

Lead generation built from data you already own, modelled on the best open-source projects:

| Idea | Borrowed from |
| --- | --- |
| Describe what you sell and who buys it; AI gives every lead a verdict **with a written reason** | eracle/OpenOutreach (Apache-2.0) |
| Pipeline stages, board and list views | krayin/laravel-crm (MIT), twentyhq/twenty |
| Capture UTM / referrer on forms so you know which campaign brought a lead | medius/utm_form (MIT) |

## Sources (no scraping, no bought lists)
- **Mailbox**: people you've corresponded with in the last 12 months, ranked by warmth (two-way threads, frequency, recency). Skips no-reply and role mailboxes, bulk-sending platforms, your own domain, excluded domains, people you unsubscribed from, and one-off senders. You pick who to add.
- **Tenders**: buyer contacts named on opportunities in your procurement workspace.
- **Enquiry forms**: public link `/lead-form/<id>` (or iframe embed). Consent is required, a honeypot and rate limits stop spam, and UTM parameters, referrer and landing page are stored on the lead. You get a push notification for each submission.
- **CSV import** and **manual entry**.

## Qualification and outreach
- **Ideal customer** (offer, buyer, industries, regions, roles, excluded domains) drives the AI score (0–100), fit (strong / possible / poor), reason and next step. Lead details and emails are treated as untrusted input.
- **Write a draft** creates an email with AI and saves it to Drafts in Mail. Nothing is ever sent automatically. Leads marked *do not contact*, and addresses you unsubscribed from, are blocked.
- **Follow up in 3 days** adds a task in the "Leads" project.

## Data
Tables: `LeadProfile`, `Lead`, `LeadActivity`, `LeadForm` (migration `20261123000000_leads`). Router: `src/server/api/routers/leads.ts`.
