# Jobs (job search tracker)

Track your own job applications from saved to offer. Modelled on the best tools in the space:

| Idea | Borrowed from |
| --- | --- |
| Kanban pipeline, excitement stars, follow-up nudges | Huntr |
| CV match score with matched / missing keywords | Teal |
| AI CV tailoring, cover letters, interview prep | JobSync, OpenApply (MIT) |
| Reading your mailbox to detect interviews, offers and rejections | JobOps |

## How it works
- **My CV**: upload a PDF / Word file or paste text. It is the only source of facts the AI uses.
- **Add job**: paste a link. Greenhouse and Lever postings come from their public APIs; other pages are read from their schema.org `JobPosting` data, then by AI from the page text. Sites whose robots.txt blocks automated tools (e.g. LinkedIn) aren't fetched: paste the description instead.
- **CV match**: AI lists the job's key requirements and scores the fit; a keyword only shows as matched if it literally appears in your CV.
- **Documents**: tailored CV, cover letter, interview prep or a follow-up email, editable, copyable, downloadable (.md) and printable to PDF. Tailoring never adds experience that isn't in your CV.
- **Check inbox**: finds mail from the employer's domain, a contact you saved, or hiring systems (Greenhouse, Lever, Workday, …) mentioning the company, and suggests a stage change. Nothing changes until you accept; "Not related" hides that email for good.
- **Follow up**: applications with no movement 7+ days after applying are flagged; "Add to Tasks" creates a task in the *Job search* project.

## Discover (automatic job search)
Set **target roles** and **locations** in My CV. Every day Discover searches, keeps openings whose title fits your roles, scores the best few against your CV, and notifies you about strong matches. Found jobs wait in **Discover** until you **Save** them to the pipeline or dismiss them. Nothing is ever applied to automatically. You can also run it by hand three times a day.

| Source | What it needs |
| --- | --- |
| Company job boards (Greenhouse, Lever, Ashby), found by web search and read via their public APIs | `TAVILY_API_KEY` (or Serper / Brave) |
| Remotive (remote jobs) | Nothing. Daily run only, at most 2 calls a run, per Remotive's terms (about 4 calls a day, credit and link back to Remotive). |
| Adzuna | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, optional `ADZUNA_COUNTRY` (default `us`) |
| USAJOBS | `USAJOBS_API_KEY` and `USAJOBS_EMAIL` (the email you registered with) |

LinkedIn and Indeed are never searched or scraped (their terms forbid it). The daily run rides on the reminders cron (`/api/cron/reminders`); each user is searched at most once every 20 hours. Unsaved finds are deleted after 45 days.

## Data
Tables `JobProfile`, `JobApplication`, `JobDocument`, `JobActivity` (migrations `20261125000000_jobs`, `20261126000000_job_discovery` adds `JobDiscovery`). Router: `src/server/api/routers/jobs.ts`.
