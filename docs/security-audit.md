# Security, scalability and performance audit

Date: 17 November 2026. Scope: the whole everythingVA repository (mail,
calendar, organizer, chat, procurement), its dependencies, and the production
database configuration (read-only checks).

## Fixed in this change

### Security

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **Critical** | `mail.checkAccountAuth` returned the mail account's **OAuth access token** to the browser, for **any account id**, with no ownership check. | Scoped to the signed-in user's accounts; the token never leaves the server (`src/lib/account-utils.ts`). |
| 2 | **Critical** (mitigated) | Next.js 14 has unpatched remote-code-execution advisories in the Image Optimization API (`/_next/image`, SVG/AVIF). Fixed only in Next 15.5.28+. | Image optimisation turned off (`images.unoptimized`), so the endpoint isn't served. The Next upgrade is still needed (below). |
| 3 | High | Nylas OAuth callback trusted a `userId` **cookie** (settable by the client) to decide whose account to write. It also referenced a table that no longer exists. | Route, `src/lib/nylas.ts` and the `nylas` package removed (unused). |
| 4 | High | Debug and test endpoints live in production: `/api/debug-accounts`, `/api/test-user` (returned internal error details), `/test-user`. | Removed. |
| 5 | High | Stripe return URL (`/api/stripe/checkout`) wrote subscriptions from the `session_id` query string (replayable; also always failed because `currentPeriodEnd` wasn't set). | It now only redirects; the **signed** Stripe webhook is the single source of truth. |
| 6 | Medium | Aurinko webhook verified the signature but not the timestamp, so a captured request could be replayed. | Requests older than 10 minutes are rejected. |
| 7 | Medium | Kinde webhook `jwt.verify` didn't pin the algorithm or issuer, and logged the start of each token. | `algorithms: ["RS256"]` and issuer check; token logging removed. |
| 8 | Medium | No security headers. | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a CSP limited to `frame-ancestors`, `object-src`, `base-uri` and `form-action`; `X-Powered-By` removed. |
| 9 | Medium | Manual discovery could be clicked repeatedly, burning the SAM.gov daily quota (10 requests without a role). | 15-minute cooldown per source for manual runs. |
| 10 | — | Dependencies: **101 known vulnerabilities (3 critical, 43 high)**. | Unused packages removed (`@xenova/transformers`, `openai-edge`, `three-globe`, `react-quill`, `@prisma/extension-accelerate`, `nylas`), non-breaking `npm audit fix` applied: **64 left (1 critical, 15 high)**, all needing major upgrades (below). |
| 11 | Low | Dead code: unused tRPC `post` router, `playground.ts` with real-looking email addresses. | Removed. |

### Performance and scalability

| # | Issue | Fix | Effect |
|---|---|---|---|
| 12 | Every tRPC request ran a `user.upsert` (a database write) before doing anything else, and logged it. | Upsert at most once per user per 10 minutes per server instance. | One write saved on nearly every API call. |
| 13 | The `/mail` page loaded the rich-text editor (TipTap) up front, although the reply box is now collapsed by default. | Composer loaded on demand (reply box, compose dialog). | `/mail` first load **481 kB → 345 kB** (−28%). |
| 14 | Folder lists filter by account and sort by date, but only single-column indexes existed; the thread view sorts emails by date. | Composite indexes `Thread(accountId, lastMessageDate DESC)` and `Email(threadId, sentAt)` (migration `20261117000000_list_indexes`). | Index-only ordering as mailboxes grow. |

## Checked and fine

- **Account ownership:** every mail, calendar, search, accounts, organizer and procurement procedure checks that the caller owns the account or workspace (except #1, now fixed).
- **Attachments:** ownership checked; dangerous types forced to download with a sandbox CSP.
- **Aurinko OAuth:** signed state bound to the user.
- **Stripe webhook:** signature verified.
- **Email HTML** rendered through `react-letter` (sanitising) and DOMPurify for search results.
- **Procurement:** role checks on writes, admin-only approvals, audit log, upload size/type limits, prompt-injection instructions in agent prompts.
- **Secrets:** none committed to the repository or its history (only placeholders in `.env.example` and the README).
- **Database:** Neon pooled connection string (good for serverless).

## Action needed by you

1. **Set `TOKEN_ENCRYPTION_KEY` in Vercel.** Production has 1 stored mail token and it is **unencrypted**, so the key isn't set. Generate 32 random bytes as base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), add it for Production, redeploy, then reconnect the mail account so its token is stored encrypted. Keep the key safe: losing it means reconnecting every account.
2. **Rotate the Neon database password.** It was shared in chat earlier in this project.
3. **Apply the index migration** (`20261117000000_list_indexes`): additive, safe to run while the app is live.

## Remaining (needs major upgrades)

| Package | Now | Fixed in | Why not done here |
|---|---|---|---|
| **next** | 14.2.35 (end of life) | 15.5.29 / 16.x | High-severity DoS, SSRF and cache-poisoning advisories remain (RCE vectors mitigated by #2). Next 15 requires React 19 and async `params`/`cookies()`/`headers()` across the app. **Recommended next task.** |
| ai / @ai-sdk/openai | 3.x / 0.0.x | 7.x / 4.x | Streaming and `generateObject` APIs changed; touches chat, organizer and procurement agents. |
| zod | 3.x | 4.6.7 | Memory exhaustion on oversized constrained collections. Inputs here are bounded with `.max()`, which limits exposure. Breaking API changes across all routers. |
| prisma | 6.x | 7.x | Advisories are in its CLI/config tooling (`@prisma/config`, `effect`, `deepmerge-ts`), not the runtime query engine. |
| @t3-oss/env-nextjs | 0.11 | 0.13 | Depends on the zod upgrade. |

## Scalability notes for later

- **Mail search index:** each account's Orama index is serialised into one JSON column and loaded in full for every Ask AI request. That's fine for a few hundred emails, but slow and memory-heavy at tens of thousands. Move vectors to **pgvector** (Neon supports it) and query in SQL.
- **Serverless limits:** Vercel's 60-second limit caps initial sync size, discovery and AI work per request. A job runner (Trigger.dev or Inngest) is needed for big mailboxes and full RFP packages.
- **Daily cron** processes workspaces one after another inside one 60-second invocation. With many workspaces it needs a queue (one job per workspace).
- **Rate limiting:** there's no general API rate limit; the chat has a daily cap for free users and discovery has a cooldown. A per-user limit at the edge (e.g. Upstash Ratelimit) would protect AI costs if the app opens to more users.
- **Content-Security-Policy:** only frame/object/base/form directives are set. A full script/style policy needs per-request nonces, because email HTML and the editor use inline styles.
