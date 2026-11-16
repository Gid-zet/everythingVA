# Procurement platform: open-source research

Research for the CCM procurement assistant (RFP discovery, qualification,
analysis, proposals, supplier registration), done 16 November 2026.

**How this was checked.** For every repository below, stars, last push date,
archive status and license were read from the GitHub API on 16 Nov 2026.
Licenses marked "custom" or "NOASSERTION" by GitHub were checked by reading the
LICENSE file itself. Architecture notes come from each project's documentation
and published package structure. Source code was not audited line by line;
anything we adopt should get a dependency review (pinned version, `npm audit`,
licence scan) when it is added.

## Summary

- **There is no mature open-source RFP platform to build on.** The closest
  matches on GitHub are small personal projects (SAM.gov search plus an AI
  compliance matrix, 0–2 stars). The value is in assembling proven building
  blocks around CCM's own profile, which is what we recommend.
- **The existing everythingVA stack is a good base.** Next.js, tRPC, Prisma on
  Neon Postgres, Kinde sign-in and the provider-neutral AI layer (Vercel AI SDK)
  cover the application and agent core. Mail and calendar sync can be reused
  for procurement notification emails and deadlines.
- **Two pieces cannot run inside Vercel functions** (60-second limit, no
  persistent browser): long agent jobs and browser automation. They need a job
  runner and a separate browser worker in later phases.
- **Avoid AGPL code inside the app** (Firecrawl, Skyvern, Twenty). Use their
  hosted APIs or Apache/MIT alternatives instead.

## Comparison

| Repository | Stars | Last push | License | Language | Verdict |
|---|---|---|---|---|---|
| [vercel/ai](https://github.com/vercel/ai) | 28k | 2026-11-16 | Apache-2.0 | TS | **Use** (already in app) |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | 29.5k | 2026-11-16 | Apache-2.0, `ee/` dirs Elastic | TS | Consider for phase 3 workflows |
| [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | 3.4k | 2026-11-16 | MIT | TS | Alternative to Mastra |
| [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | 4k | 2026-11-16 | MIT | TS | Skip (leans to one provider) |
| [inngest/agent-kit](https://github.com/inngest/agent-kit) | 1k | 2026-04-29 | Apache-2.0 | TS | Skip (activity slowing) |
| [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) | 61k | 2026-11-16 | MIT | Python | Skip (wrong language for this app) |
| [docling-project/docling](https://github.com/docling-project/docling) | 70.6k | 2026-11-16 | MIT | Python | **Use** as extraction service (phase 3) |
| [Unstructured-IO/unstructured](https://github.com/Unstructured-IO/unstructured) | 15.7k | 2026-11-14 | Apache-2.0 | Python | Fallback to Docling |
| [opendatalab/MinerU](https://github.com/opendatalab/MinerU) | 83.7k | 2026-11-16 | Apache-2.0 + commercial thresholds | Python | Avoid (licence conditions) |
| [microsoft/markitdown](https://github.com/microsoft/markitdown) | 196k | 2026-11-07 | MIT | Python | Light alternative to Docling |
| [unjs/unpdf](https://github.com/unjs/unpdf) | 1.3k | 2026-11-15 | MIT | TS | **Use now** (PDF text, serverless) |
| [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | 6.3k | 2026-10-16 | BSD-2 | JS | **Use now** (DOCX text) |
| [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | 38.8k | 2026-05-17 | Apache-2.0 | JS | OCR fallback; Docling preferred |
| [dolanmiu/docx](https://github.com/dolanmiu/docx) | 6k | 2026-11-16 | MIT | TS | **Use** for Word proposals (phase 3) |
| [gotenberg/gotenberg](https://github.com/gotenberg/gotenberg) | 13.6k | 2026-11-14 | MIT | Go | **Use** for DOCX→PDF (phase 3) |
| [exceljs/exceljs](https://github.com/exceljs/exceljs) | 15.5k | 2025-01-21 | MIT | JS | Avoid (no pushes in ~22 months) |
| [pgvector/pgvector](https://github.com/pgvector/pgvector) | 23.7k | 2026-11-14 | PostgreSQL | C | **Use** (Neon supports it) |
| [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | 202k | 2026-11-16 | AGPL-3.0 | TS | Hosted API only |
| [apify/crawlee](https://github.com/apify/crawlee) | 26.5k | 2026-11-16 | Apache-2.0 | TS | **Use** for portal crawling |
| [unclecode/crawl4ai](https://github.com/unclecode/crawl4ai) | 87.4k | 2026-11-13 | Apache-2.0 | Python | Alternative if a Python worker exists |
| [microsoft/playwright](https://github.com/microsoft/playwright) | 100k | 2026-11-15 | Apache-2.0 | TS | **Use** (browser worker base) |
| [browserbase/stagehand](https://github.com/browserbase/stagehand) | 26k | 2026-11-14 | MIT | TS | **Use** for registration agent |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | 121k | 2026-11-16 | MIT | Python | Strong alternative (Python) |
| [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern) | 23.4k | 2026-11-16 | AGPL-3.0 | Python | Avoid (AGPL; CAPTCHA solving conflicts with our rules) |
| [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev) | 16.8k | 2026-11-16 | Apache-2.0 | TS | **Use** for long jobs (phase 3) |
| [inngest/inngest](https://github.com/inngest/inngest) | 6k | 2026-11-16 | SSPL server (SDK Apache) | Go | Alternative, hosted only |
| [twentyhq/twenty](https://github.com/twentyhq/twenty) | 61k | 2026-11-16 | AGPL-3.0 + enterprise files | TS | Skip; build pipeline in-app |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | 37.5k | 2026-11-16 | MIT (except `ee/`) | TS | Consider for AI tracing |
| [run-llama/llama_index](https://github.com/run-llama/llama_index) | 53k | 2026-11-14 | MIT | Python | Skip (Python; RAG is simple in Postgres) |

RFP-specific projects found (searched "rfp proposal llm", "sam.gov
opportunities api"): [JakPot42/sam-acquisition-agent](https://github.com/JakPot42/sam-acquisition-agent),
[itcustomsolution/sam-gov-mcp](https://github.com/itcustomsolution/sam-gov-mcp),
[dgsmith7/SAM-opportunity-finder-integration-agent](https://github.com/dgsmith7/SAM-opportunity-finder-integration-agent).
All have 0–2 stars and either no licence or one maintainer. Useful as
reference for SAM.gov field mapping only.

## Best in each category

**Agent frameworks.** Keep the **Vercel AI SDK** (already used, Apache-2.0,
works with OpenAI, Anthropic, Gemini and others) and write each agent as a
plain TypeScript function with a typed (Zod) output, its state stored in
Postgres. Human approval points are then ordinary database statuses, which are
easy to audit. When proposal generation needs long multi-step runs, add
**Mastra** (TypeScript, built on the AI SDK; avoid its `ee/` packages) or
**LangGraph.js** (MIT) on top of a job runner.

**Document processing.**
- In the app now: **unpdf** (PDF text, made for serverless) and **mammoth**
  (DOCX to text/HTML).
- Phase 3: **Docling** as a small Python service for scanned PDFs, tables and
  layout-heavy solicitations. It has the best extraction quality, MIT licence
  and active maintenance.
- Output: **docx** to generate editable Word proposals; **Gotenberg** to turn
  them into PDF without changing the layout.
- Search: **pgvector** in the existing Neon database. The current mail search
  index (one Orama index serialised into a single JSON column) won't scale to a
  document library.

**Web research and discovery.** Official feeds first (below). For state,
local, university and corporate portals without an API, **Crawlee**
(Apache-2.0, TypeScript) with Playwright. Firecrawl is excellent but AGPL: use
its hosted API if needed, don't embed it.

**Browser automation (supplier registration).** **Playwright** as the engine
with **Stagehand** (MIT, TypeScript) for AI-driven steps ("find the company
name field"), running on a separate worker or Browserbase. The worker must
stop and hand control to a person for CAPTCHA, MFA, legal or tax
attestations, signatures, fees and final submission. We will not use CAPTCHA
solvers.

**Workflow and CRM.** Build the pipeline, tasks and audit log in the app.
They are a few tables on top of the existing stack, while Twenty would add a
second AGPL application to run.

**Long jobs.** Vercel Cron for daily discovery now (fits the 60-second
limit). **Trigger.dev** (Apache-2.0, hosted or self-hosted) for RFP analysis
and proposal generation that run for minutes.

## Procurement data sources

| Source | Access | Notes |
|---|---|---|
| [SAM.gov Get Opportunities API](https://open.gsa.gov/api/get-opportunities-public-api/) | Free API key from a SAM.gov account | `api.sam.gov/opportunities/v2/search`; filters by NAICS (`ncode`), notice type, set-aside (`WOSB`, `EDWOSB`…), posted dates (max 1 year). **Daily limit: 10 requests for an account with no SAM.gov role, 1,000 with a role** ([limits table](https://open.gsa.gov/api/sam-entity-extracts-api)). Descriptions and attachments are separate links needing the key. |
| [CanadaBuys open data](https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv) | Public CSV, no key | All open federal tender notices (≈6 MB, refreshed daily; checked 16 Nov 2026). Includes reference number, amendment number, closing date, UNSPSC/GSIN, regions, contact, notice URL, attachments and description. Provincial and municipal tenders are not included. |
| [USAspending API](https://api.usaspending.gov/) | Public, no key | Award history: which agencies buy leadership training (NAICS 611430, 541611/541612). Good for "who buys this?" and target supplier registrations (phase 4). |
| State/provincial portals (e.g. MERX, BidNet, state eProcurement sites) | Varies, mostly no API, some paid | Add one at a time with Crawlee, respecting each site's terms. |
| Supplier diversity portals (WBENC, corporate supplier diversity pages) | Websites | Discovered by search, catalogued as registration opportunities (phase 4). |

Relevant classification codes for CCM (to confirm in the company profile):
NAICS 611430 (professional and management development training), 541611
(administrative management and general management consulting), 541612 (human
resources consulting), 541618 (other management consulting); PSC R408/R499
(support services) and U008 (training/curriculum development).

## Reuse versus build

| Reuse | Build ourselves |
|---|---|
| Vercel AI SDK, Zod (agents and structured output) | Company profile, credential verification, expiry alerts |
| unpdf, mammoth; later Docling, docx, Gotenberg | Discovery connectors (SAM.gov, CanadaBuys), dedupe and amendment detection |
| pgvector (search), Neon Postgres, Prisma | Qualification agent and its prompts, fit scoring |
| Playwright + Stagehand (browser worker) | Pipeline, tasks, approvals, audit log |
| Crawlee (portal crawling) | Compliance matrix and proposal workflow |
| Trigger.dev (long jobs), Vercel Cron (daily runs) | Supplier registration workflow and its pause points |

See [architecture.md](architecture.md) for the design and build plan.
