# Procurement assistant: architecture and status

The procurement assistant is a section of everythingVA (`/procurement`) that
finds RFPs/RFQs/tenders, checks whether the business qualifies, and manages
the bid pipeline with human approval at each decision. It was built for
Cummings Consulting & Management (CCM) but works from a configurable company
profile rather than hard-coded CCM details. See [research.md](research.md) for
the open-source evaluation behind these choices.

## What's built (MVP, November 2026)

| Module (from the brief) | Status |
|---|---|
| 1. Discovery agent | **Built** for SAM.gov (API) and CanadaBuys (open data). Daily schedule + "Find now". Deduplication, amendment and deadline-change detection, keyword/code relevance ranking, source URL and discovery date on every record. |
| 2. Qualification agent | **Built.** Fit score 0–100, eligibility (4 levels), bid recommendation (3 levels), mandatory vs desirable requirements, certifications, geography, insurance, financial, contract vehicle, teaming, missing information, reasoning. Deterministic guard rails on top of the AI. |
| 3. RFP analysis agent | Not yet. Attachments are linked, not read. |
| 4. Proposal generation | Not yet. |
| 5. Supplier registration agent | Not yet. |
| 6. Knowledge base | **Partly built:** upload PDF/DOCX/text with text extraction, categories, expiry dates, verification status, admin-only access, version history, expiry/missing-document alerts. No OCR, no vector search over documents yet. |
| 7. Pipeline management | **Built:** all 14 statuses from the brief plus "Declined", owner, follow-up date, value, notes, tasks, submission reference, per-opportunity history, dashboard with real counts and 14-day deadlines. Calendar sync and email notifications not yet. |
| 8. Procurement assistant chat | Not yet (the mail app's Ask AI is the base). |
| Security | Kinde sign-in, workspace roles (owner/admin/editor/viewer), approval-gated statuses, audit log of every human, AI and scheduler action, prompt-injection instructions in agent prompts. |

## Components

```
src/server/procurement/
  types.ts                 shared types and labels (no server imports; testable)
  csv.ts                   RFC 4180 CSV parser (CanadaBuys feed)
  relevance.ts             keyword/code relevance score used to filter and rank
  changes.ts               amendment / deadline change detection
  alerts.ts                expiring credentials, unverified items, missing documents
  qualification-rules.ts   qualification output schema + guard rails
  ccm-template.ts          CCM starting profile (all credentials unverified)
  sources/sam-gov.ts       SAM.gov Get Opportunities v2 client + mapping
  sources/canadabuys.ts    CanadaBuys open tender CSV client + mapping
  discovery.ts             runs sources, scores, stores, logs   (DB)
  qualify.ts               qualification agent                  (DB + AI)
  extract.ts               PDF (unpdf) / DOCX (mammoth) / text extraction
  access.ts, audit.ts      workspace membership, roles, audit log
src/server/api/routers/procurement.ts     tRPC API (role checks on every write)
src/app/api/procurement/documents/route.ts  document upload (multipart)
src/app/api/cron/procurement/route.ts       daily discovery + qualification
src/app/procurement/**                       UI
vercel.json                                  cron schedule (11:00 UTC daily)
```

### Agents

| Agent | Input | Output | Human checkpoint |
|---|---|---|---|
| Discovery | Profile keywords, services, NAICS, UNSPSC | New/updated `Opportunity` rows, `DiscoveryRun`, audit entries | None needed (read-only research) |
| Qualification | One opportunity + profile + credentials (verified flag) + up to 4 capability/past-performance documents | Score, eligibility, recommendation, requirement table, reasoning | Moving to "Approved to pursue" or "Declined" needs an admin |
| (Later) RFP analysis, proposal, compliance, registration | See roadmap | | Approval before submission; registration pauses (below) |

Guard rails applied after the model answers (`applyGuardRails`):
an unmet mandatory requirement means **Not qualified**; an unknown mandatory
requirement caps eligibility at **Requires clarification**; "Strongly
recommend" only when **Qualified**; passed deadline means **Do not pursue**;
not qualified with no teaming route means **Do not pursue**. Each adjustment is
shown to the user.

Credentials are only "held" when **verified and unexpired**. Editing a
verified credential's name, number or expiry puts it back to unverified.

### Workflow

1. Daily at 11:00 UTC, `/api/cron/procurement` runs discovery for every
   workspace with a profile, then qualifies the 5 most relevant new
   opportunities while time allows (Vercel's 60-second limit). The rest are
   qualified on demand ("Assess fit", "Qualify top 10").
2. New opportunities arrive as **Discovered**; qualification moves them to
   **Qualified** or **Under review**.
3. An admin approves (**Approved to pursue**) or **Declines**. Editors can't.
4. The team works the bid through the remaining statuses; **Ready for
   submission** and **Submitted** also need an admin. The submission
   reference is recorded on the opportunity.
5. Every step is in the opportunity's history and the workspace activity log.

## Database

New tables (migration `20261116000000_procurement`, additive only):

- `ProcurementWorkspace`, `WorkspaceMember` (role enum `owner/admin/editor/viewer`)
- `CompanyProfile`: services, keywords, excluded keywords, NAICS, UNSPSC, business types, countries, regions, experience
- `Credential`: kind, issuer, number, issue/expiry dates, verification status/by/at, evidence document
- `KnowledgeDocument`: category, file metadata, extracted text, expiry, verification, access level, version chain (`previousVersionId`, `isLatest`)
- `Opportunity`: source + external id (unique per workspace for dedupe), issuer, reference/solicitation numbers, notice type, source URL, posted/deadline/discovered dates, value, location, set-aside, codes, description, attachments, contacts, amendment, relevance, status, fit/eligibility/recommendation, qualification JSON, owner, follow-up, submission
- `ProcurementTask`, `DiscoveryRun`, `AuditLog` (actor `user/ai/system`)

## Setup

1. Apply the migration: `npm run db:migrate` (or `prisma migrate deploy`).
2. Environment (see `.env.example`):
   - `SAM_GOV_API_KEY`: from SAM.gov → Account Details → Public API Key. Without a SAM.gov role a key allows **10 requests/day**; with a role, 1,000. Each run uses one request per NAICS code, capped by `SAM_GOV_MAX_REQUESTS` (default 5).
   - `CRON_SECRET`: random string of 16+ characters; Vercel Cron sends it automatically when set in the project.
   - An AI provider (`AI_PROVIDER` + key) for qualification. Already used by the mail app.
3. Open `/procurement` → **Company profile** → "Start from the CCM brief", correct it, then verify each credential against the real certificate.
4. Upload the capability statement, certificates and insurance certificate to the **Knowledge base**, and verify them.
5. Press **Find opportunities now** or wait for the daily run.

Tests: `npm test` (unit tests for parsing, scoring, mapping, change detection,
alerts and guard rails). `LIVE_SOURCES=1 npx vitest run src/server/procurement/__tests__/live-sources.test.ts`
checks the real CanadaBuys feed.

## Limitations

- **Sources:** SAM.gov and CanadaBuys (federal) only. No state, provincial, municipal, university or corporate portals yet. CanadaBuys closing times have no time zone in the feed and are stored as published.
- **SAM.gov quota:** an account without a role gets 10 requests/day. That covers one daily run of 5 NAICS codes plus a few description fetches. Fetching a description during qualification also uses a request.
- **Attachments aren't read.** The qualification agent sees the notice text only and says so ("Review attachments").
- **Knowledge base stores extracted text, not the original file** (there's no file storage yet). Re-upload to replace. Scanned PDFs (no text layer) are rejected until OCR exists. Excel isn't supported.
- **One AI call per qualification** within the 60-second function limit; long solicitation packages need the job runner in phase 3.
- **Members are added by email** and must have signed in once. A person in several workspaces sees the one with a company profile (then the oldest).
- **No email/calendar notifications yet.** Deadlines show on the dashboard.

## Roadmap

**Phase 3: RFP analysis and proposals**
- File storage (Vercel Blob or S3) for originals and downloaded solicitation packages.
- Docling extraction service (scans, tables, OCR) and pgvector search over the knowledge base.
- Trigger.dev for long jobs: download attachments, analyse the full package (all 12 analysis sections), build the compliance matrix (requirement, mandatory/optional, ability, evidence, proposal section, status).
- Proposal agent: sections drafted from verified documents only, every claim cited to a knowledge-base document, gaps flagged, no pricing or commitments invented. Word output via `docx`, PDF via Gotenberg. Compliance review before admin approval.
- Calendar sync for deadlines (reusing the calendar module) and email reminders.

**Phase 4: Supplier registration and more sources**
- Registration opportunity catalogue (supplier diversity programs, approved vendor lists, institutional portals) discovered by search and USAspending buyer data.
- Browser worker (Playwright + Stagehand on a separate server or Browserbase): opens a portal, maps fields to the verified profile, fills supported forms, uploads approved documents, saves progress. It **stops and hands over** at CAPTCHA, MFA, legal or tax attestations, signatures, fees and final submission. Submission only after explicit admin approval. No CAPTCHA solving.
- More portals via Crawlee, one at a time, within each site's terms.
- Procurement chat assistant answering from stored data (opportunities, deadlines, documents).
