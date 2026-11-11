# Email & calendar: architecture, research and setup

## 1. What we studied

| Source | What we took from it |
|---|---|
| **Superhuman** | Keyboard-first triage (J/K, E archive, H snooze, S star, `#` delete), instant optimistic actions with Undo, unread-only inbox badge. |
| **Shortwave / Gmail** | Search operators (`from:`, `to:`, `subject:`, `is:unread`, `is:starred`, `has:attachment`), AI thread summaries and suggested replies. |
| **Spark** | Unified inbox across accounts, with per-row account tags. |
| **Cron (Notion Calendar) / Fantastical** | Multi-account calendar list with per-calendar visibility and colour, keyboard view switching (D/W/M/A, T, J/K), event details side panel with Join and RSVP, guest availability while scheduling. |
| **Zero / Mail0** (open source, `Mail-0/Zero`) | A `MailManager` driver interface chosen per connection, cursor-paginated `useInfiniteQuery`, and optimistic actions with rollback. Our `MailProvider` interface follows the same idea. |
| **Inbox Zero** (open source, `elie222/inbox-zero`) | Bulk unsubscribe from ranked senders, AI rules and categorisation, provider-synced archive and labels. |
| **Aurinko OpenAPI spec** (`apirefs.aurinko.io/swagger.json`) | The exact endpoints and field names; the previous calendar code used paths and fields that don't exist. |

## 2. Architecture

```
UI (Next.js, tRPC hooks)
  └── tRPC routers: mail · calendar · accounts      (every query scoped to ctx.auth.id)
        └── services: accounts · calendar-sync      (src/server/services)
              └── provider registry getProviders()  (src/server/providers/index.ts)
                    ├── MailProvider / CalendarProvider interfaces (types.ts)
                    └── Aurinko adapter (aurinko/*) → Google · Microsoft 365 · Exchange · iCloud · IMAP
```

- **Provider-agnostic.** UI and routers only use `MailProvider` / `CalendarProvider`. To add a direct Gmail or Graph adapter, implement the interfaces and choose it in `getProviders()`. Mailbox-specific behaviour is declared through `capabilities` (for example, IMAP has no server-side star or spam), so unsupported actions report `unsupported` instead of failing silently.
- **Credentials.** Tokens are encrypted at rest with AES-256-GCM (`src/server/security/crypto.ts`), decrypted only inside the provider layer, and never selected into client responses. OAuth `state` is HMAC-signed, bound to the user and expires after 10 minutes. The callback rejects anything else (CSRF).
- **Token lifetime.** Aurinko account tokens are long-lived, and Aurinko refreshes the underlying Google/Microsoft tokens itself. A 401 from Aurinko marks the account `needs_reauth`, and the UI shows **Reconnect**, which re-authorises the *same* Aurinko account (`accountId` parameter). The old code called a non-existent `/auth/refresh` and wiped tokens after one hour.
- **Reliability.** The HTTP client retries 429 and 5xx with exponential backoff and honours `Retry-After`. Batch actions run with bounded concurrency (5) and report partial failures. Nothing logs tokens or message bodies.
- **Data isolation.** Every procedure resolves accounts and calendars through `userId = ctx.auth.id`, including the unified inbox (`accountId = "all"` expands to the caller's own accounts only). Attachments are streamed after an ownership check. Only images, PDFs and plain text render inline; everything else is forced to download with `nosniff` and a sandbox CSP.

### Email sync
1. **Connect:** `/api/accounts/connect?service=…` → Aurinko consent → `/api/aurinko/callback` (state verified) → upsert the account (encrypted) → background initial sync (`INITIAL_SYNC_DAYS`) → register a webhook → sync the calendar list. Status moves `syncing → active` (or `error` with a message).
2. **Incremental:** Aurinko webhook (HMAC-verified) → delta sync with the stored `nextDeltaToken`. An invalid delta token falls back to a full sync. The UI also polls lightly (30s list, 60s counts) and refetches on focus.
3. **Actions:** archive / read / labels use Aurinko `POST /email/messages/{id}/status`. Trash / star / spam use the Gmail API or Microsoft Graph through Aurinko's Direct API passthrough. The DB updates only after the provider accepts. The client updates optimistically and rolls back on failure.

### Calendar sync
- Calendar **lists** are mirrored into the DB (name, colour, access role, visibility) on connect and on **Sync**.
- **Events** are read live per visible range from `GET /calendars/{id}/events/range`. The provider expands recurring series and applies exceptions and time zones, so DST and "this occurrence vs whole series" edits are correct, and there are no duplicate copies to reconcile. Calendar webhooks bump `Calendar.lastSyncAt`, which the client polls as a version number to refetch quickly.
- Writes (create / update / move / delete / RSVP) go to the provider first, with `notifyAttendees` under user control.
- **Local calendars** (for example, for IMAP-only accounts) store events in the DB. Recurrence uses RRULE text expanded by `src/lib/recurrence.ts`.

## 3. Feature map

**Mail**
- Unified inbox with an "All inboxes" option.
- Folders: Inbox, Starred, Drafts, Sent, Snoozed, Spam, Trash, plus Archived via the split view.
- Search operators.
- Read/unread, star, archive, snooze, spam and trash, all synced to the provider.
- Bulk actions: `Shift+V` selection plus any action.
- Threaded view with attachments: download, and image/PDF preview.
- Composer with Reply / Reply all / Forward (forward includes the original attachments), To/Cc/Bcc, debounced draft autosave and restore, and AI compose and autocomplete.
- AI summary, priority, action items and suggested replies, cached per thread.
- Bulk unsubscribe, organizer and rules.
- "Add to calendar" from any thread, with participants pre-filled.

**Calendar**
- Day, week, month and agenda views.
- Drag to reschedule (optimistic, with rollback).
- Create and edit with time zones, all-day events, repeat rules (daily/weekly on days/monthly/yearly, ending never/on a date/after N), guests with free/busy conflict warnings, a video-meeting toggle, location and notes.
- RSVP (Yes/Maybe/No) and guest response status.
- Join links detected for Zoom, Meet, Teams and Webex.
- Per-calendar visibility and colour.
- Search (30 days back, 90 ahead).
- Keyboard: D/W/M/A, T, J/K, C, `/`.

**Accounts**
- Connect Google, Microsoft, iCloud or IMAP.
- Status: Connected / Syncing / Needs reconnect / Sync problem, plus last synced time.
- Sync now, Reconnect, and Disconnect (revokes the Aurinko account and deletes local data; the mailbox is untouched).

## 4. Configuration needed to go live

1. **Aurinko portal:** create an app and enable the Google, Office 365, iCloud and IMAP providers. Add the return URL `${NEXT_PUBLIC_URL}/api/aurinko/callback`. Copy the Client ID, Secret and Signing secret into `AURINKO_CLIENT_ID`, `AURINKO_CLIENT_SECRET` and `AURINKO_SIGNING_SECRET`.
2. **Google:** in Aurinko, either use Aurinko's shared Google app or add your own Google Cloud OAuth client. Your own client needs the Gmail and Calendar scopes; production use of restricted Gmail scopes requires Google's OAuth verification and a security assessment.
3. **Microsoft:** use Aurinko's Azure app or register your own (Mail.ReadWrite, Mail.Send, Calendars.ReadWrite delegated permissions).
4. **Webhooks:** `AURINKO_WEBHOOK_BASE_URL` (or `NEXT_PUBLIC_URL`) must be publicly reachable. In development, use `cloudflared tunnel --url http://localhost:3001`.
5. **Secrets:** set `TOKEN_ENCRYPTION_KEY` (32 bytes, base64) and `OAUTH_STATE_SECRET`. Existing plaintext tokens keep working and are encrypted the next time the account reconnects.
6. **Database:** run `npm run db:migrate` to apply `prisma/migrations/*`, which is additive and idempotent.
7. **AI features:** set `OPENAI_API_KEY`.

## 5. Known limits and next steps

- **Untested against live accounts:** the integrations follow Aurinko's published spec but have not been exercised against real Google or Microsoft accounts in this repo (no credentials in the dev environment). Verify against live accounts before launch: connect, archive/star/trash/spam, send/reply/forward, calendar create/move/RSVP, and webhook delivery.
- **Drafts are local:** they autosave in EverythingVA's database. They are not yet mirrored to the provider's Drafts folder, because Aurinko has create/get/send for drafts but no update.
- **Event reminders:** they come from each calendar's defaults; per-event reminder editing and in-app notifications are not implemented yet.
- **Webhook renewal:** subscriptions are created on connect and calendar sync. A periodic job to renew expired subscriptions and re-run delta sync for quiet accounts would make sync more robust (for example, a Vercel cron calling `accounts.resync`).
- **Direct adapters:** a direct Gmail API / Microsoft Graph adapter would remove the Aurinko dependency. Add it behind the same interfaces if cost or latency requires.
