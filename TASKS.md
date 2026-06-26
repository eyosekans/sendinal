# Tasks

4-phase roadmap. Work sequentially within each phase — later tasks often depend on earlier ones.
Check off tasks as you complete them. Add notes or sub-tasks inline as needed.

---

## Phase 1 — Foundation (Weeks 1–6)

Goal: a working platform that can send a plain-HTML email to a contact list and record delivery results.

### 1.1 Project setup
- [x] Initialize Nuxt 4 project with TypeScript, Tailwind CSS, Nuxt UI
- [x] Configure `@nuxtjs/supabase` module (env vars, redirect options)
- [x] Set up `railway.toml` with `web`, `worker`, and `redis` services
- [x] Create `worker/` directory with a minimal BullMQ entry point
- [x] Configure `shared/schemas/` for Zod schemas shared between app and worker
- [x] Set up ESLint + Prettier

> **1.1 notes**
> - Worker + shared schemas are TypeScript, run via Node's native TS support
>   (`node worker/index.ts`) — Node 22+/24. `railway.toml` start command updated
>   from `worker/index.js` → `worker/index.ts` to match.
> - `@nuxtjs/supabase` v2 reads `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY`
>   (see `.env.example`). Database types file (`app/types/database.types.ts`) is
>   generated in 1.2.
> - `ioredis` pinned to `5.10.1` to match BullMQ's bundled copy (avoids a
>   duplicate install + type mismatch when sharing the connection).
> - The `shared/schemas` barrel (`index.ts`) is for the Nuxt app (extensionless,
>   bundler resolution); the worker imports concrete files with `.ts` extensions
>   (required by Node native TS). Worker `tsconfig` is scoped to `worker/`.
> - Verified: `npm run lint`, `npm run typecheck`, worker `tsc`, and `npm run build`
>   all pass clean.

### 1.2 Supabase setup
- [x] Create Supabase project and note URL + keys
- [x] Write migration: `contacts` table
- [x] Write migration: `lists` table
- [x] Write migration: `list_contacts` junction table
- [x] Write migration: `campaigns` table
- [x] Write migration: `templates` table
- [x] Write migration: `sends` table
- [x] Write migration: `email_events` table
- [x] Write migration: `tracking_tokens` table
- [x] Enable RLS on all tables; add `auth.uid() IS NOT NULL` policies
- [x] Create `template-assets` Storage bucket (public read)

> **1.2 notes (in progress)**
> - All migrations written under `supabase/migrations/` (10 files, timestamp-ordered).
>   FK order respected: contacts → lists → list_contacts → campaigns → templates →
>   sends → email_events → tracking_tokens, then RLS, then storage bucket.
> - Added CHECK constraints on all status/type enum columns (mirrors the Zod
>   enums in `shared/schemas`) and helpful indexes (`sends.campaign_id`,
>   `sends.ses_message_id`, `email_events.send_id`, `list_contacts.contact_id`,
>   partial index on scheduled campaigns) — pulls some of 4.3 forward.
> - RLS: one permissive `FOR ALL TO authenticated` policy per table (internal
>   tool, no per-user isolation). Service-role key bypasses RLS, so tracking
>   routes + SES webhook are unaffected.
> - `updated_at` auto-update trigger intentionally deferred to task 4.3.
> - APPLIED to project `sfcqhyoqxtfggtojmptt` (all 10 migrations OK). Verified:
>   8 public tables all with RLS, 8 public policies, `template-assets` bucket
>   (public=true) + 4 storage policies.
> - Generated `app/types/database.types.ts` by hand from the schema (no Supabase
>   CLI installed). `@nuxtjs/supabase` auto-loads it from the default
>   `~/types/database.types.ts` path — no nuxt.config change needed. Regenerate
>   later with `supabase gen types typescript --linked` once the CLI is wired up.
> - `npm run typecheck` and `npm run lint` pass clean.
> - NOTE: `.env` still needs the real `NUXT_PUBLIC_SUPABASE_URL` /
>   `NUXT_PUBLIC_SUPABASE_KEY` / `NUXT_SUPABASE_SECRET_KEY` values (from the
>   Supabase dashboard → Project Settings → API) before auth/data work in 1.3+.

### 1.3 Authentication
- [x] `/login` page — Supabase email + password form
- [x] Auth middleware protecting all routes except `/login`, `/t/*`, `/api/webhooks/*`
- [x] `/confirm` callback page for Supabase auth redirect
- [x] Logout button in app layout

> **1.3 notes**
> - Page protection is handled by `@nuxtjs/supabase`'s built-in redirect
>   middleware (`redirect: true` in nuxt.config), which already excludes
>   `/t/*` + `/api/webhooks/*` and auto-excludes `/login` + `/confirm`. No
>   custom global page middleware written (would be redundant/conflicting).
>   Verified: GET `/` → 302 `/login`; `/login`, `/confirm`, `/api/health` → 200.
> - Form validation uses Nuxt UI's `UForm` + Zod (native support). VeeValidate
>   (listed in PROJECT_CONTEXT) is NOT installed — Nuxt UI covers it, so skipped
>   to avoid a redundant dependency. Revisit if complex field-level forms appear.
> - `/login` + `/confirm` use `definePageMeta({ layout: false })`; authenticated
>   pages use the new `app/layouts/default.vue` (top nav + email + Sign out).
> - Added `server/utils/auth.ts → requireUser(event)` (server-side 401 guard) for
>   protected API routes built in 1.5+. Public routes must not call it.
> - HEADS-UP (env, not blocking): module warns `SUPABASE_SERVICE_KEY` →
>   `NUXT_SUPABASE_SECRET_KEY` rename. Update `.env` (+ `.env.example`) before
>   relying on the service-role client for tracking routes / SES webhook (1.8).

### 1.4 Amazon SES setup
- [x] Install and configure `@aws-sdk/client-ses` in the worker
- [x] Verify sender domain in SES console (DKIM + SPF records)  _(domain `woomast.com` verified, Easy DKIM SUCCESS)_
- [ ] Request SES production access (exit sandbox)  _(manual — AWS approval; still in sandbox: 200/day, 1/s)_
- [x] Create SNS topic for bounce/complaint notifications  _(`sendinal-ses-events`)_
- [x] Create SQS queue; subscribe it to the SNS topic  _(`sendinal-ses-events` queue + SNS→SQS sub)_
- [x] Configure SES to publish bounce + complaint events to the SNS topic  _(identity notification topics; feedback forwarding off)_
- [x] Write `worker/lib/ses.js` — wrapper around `SendEmail` with error handling _(as `worker/lib/ses.ts`, done in 1.7)_

> **1.4 notes (AWS wiring done — 2026-06-25)**
> - Region `eu-central-1`, AWS account `365642143560`, IAM user `sendinal-ses`
>   (inline policy: ses send+setup, sns create/subscribe, sqs create/consume).
>   AWS CLI v2 configured locally under profile `sendinal`.
> - Identity `woomast.com`: VerificationStatus SUCCESS, Easy DKIM SUCCESS (RSA-2048,
>   3 CNAMEs already live in Cloudflare). Custom MAIL FROM `mail.woomast.com`
>   **status SUCCESS** (MX `10 feedback-smtp.eu-central-1.amazonses.com` + SPF TXT
>   `v=spf1 include:amazonses.com ~all` live in Cloudflare; verified 2026-06-25).
> - Bounce/complaint pipe: SNS topic
>   `arn:aws:sns:eu-central-1:365642143560:sendinal-ses-events` ← SES Bounce +
>   Complaint notifications; SQS queue
>   `https://sqs.eu-central-1.amazonaws.com/365642143560/sendinal-ses-events`
>   subscribed (RawMessageDelivery off, SNS envelope kept). Feedback email
>   forwarding disabled. Verified end-to-end: SES simulator sends (success +
>   bounce) delivered SNS notifications to the SQS queue.
> - `.env` filled: `NUXT_AWS_REGION`, `NUXT_AWS_ACCESS_KEY_ID`,
>   `NUXT_AWS_SECRET_ACCESS_KEY`, `NUXT_SES_FROM_EMAIL=info@woomast.com`,
>   `NUXT_SES_FROM_NAME=Woomast`, `NUXT_SQS_QUEUE_URL`. Worker now sends live
>   (no `NUXT_SES_DRY_RUN`).
> - REMAINING (manual): SES production access request submitted 2026-06-25 —
>   awaiting AWS approval to exit the sandbox (currently 200/day, 1/s).
>   Bounce/complaint *consumption* (webhook + SQS poller) is task **1.8**; the
>   queue currently holds the harmless simulator test messages for it to drain.

> **1.4 notes**
> - Code side is complete: `@aws-sdk/client-ses` installed + configured;
>   `worker/lib/ses.ts` wraps `SendEmail` with error handling + a **dry-run**
>   fallback (auto when no AWS creds). The worker reads `NUXT_AWS_REGION`,
>   `NUXT_AWS_ACCESS_KEY_ID`, `NUXT_AWS_SECRET_ACCESS_KEY`, and sends with the
>   campaign's from_name/email (defaulting to `NUXT_SES_FROM_*`).
> - The remaining items are AWS-account + DNS work that can't be done from this
>   repo. Full copy-paste runbook (IAM policy, DKIM/SPF, production-access
>   request, SNS topic, SQS queue + subscription + policy, SES→SNS publishing,
>   `.env` values, SES-simulator verification) is in **`docs/SES_SETUP.md`**.
> - No AWS CLI / credentials are configured in this environment, so the
>   scriptable steps (SNS/SQS/SES wiring) are left for you to run per the runbook.
>   Once `.env` has the AWS keys (and `NUXT_SES_DRY_RUN` is unset), the worker
>   sends for real with no code change. Bounce/complaint consumption is task 1.8.

### 1.5 Contact management
- [x] `GET /api/contacts` — list with pagination, search by email, filter by status
- [x] `POST /api/contacts` — create single contact (Zod validation)
- [x] `PATCH /api/contacts/:id` — update contact
- [x] `DELETE /api/contacts/:id` — soft-delete (set `deleted_at`, not status)
- [x] Contacts list page (`/contacts`) — table with search + pagination
- [x] Contact detail/edit modal

> **1.5 UI notes (built from Claude Design handoff in `docs/design-sistemi-olu-tur`)**
> - Adopted the design's **left-sidebar app shell** app-wide: rewrote
>   `app/layouts/default.vue` (Sendinal brand, real nav routes, Log Out wired).
> - Design tokens (warm-gray + slate-teal palette, fonts, radii, shadows) live as
>   CSS variables in `app/assets/css/main.css`; DM Sans / Inter / JetBrains Mono +
>   Phosphor icons loaded via `nuxt.config` `app.head`. Built pixel-faithful with
>   plain CSS (NOT Nuxt UI components) to match the palette exactly.
> - `app/pages/contacts/index.vue`: top search bar (debounced), 5 status tabs
>   (incl. Complained) with live counts from new `GET /api/contacts/stats`,
>   row selection + bulk delete, single delete, add/edit, server pagination,
>   empty state. All wired to the 1.5 API.
> - Components: `app/components/contacts/{ContactStatusBadge,ContactFormModal,
>   DeleteConfirmModal}.vue`. Add/Edit modal was NOT in the design file — built
>   per the design system's modal/input/button specs.
> - Per scope decision (“table + CRUD only”): the middle **Lists & Segments
>   panel** and the **Filter / Import CSV / Add-to-list / Export** actions were
>   intentionally NOT drawn (they belong to 1.6+).
> - “Last Opened” column shows “—” (needs email_events, Phase 2.3).
> - `docs/**` added to ESLint ignores (vendored prototype bundle).
> - Verified: `typecheck`, `lint`, `npm run build` all clean; `/contacts` →
>   302 `/login` when unauthenticated; `/api/contacts/stats` → 401 without auth.
>   NOTE: full visual/interaction check needs a logged-in session (no test
>   credentials on hand) — recommend `npm run dev` + sign in to eyeball it.

> **1.5 notes (API done; UI pages provided separately by the user)**
> - Soft-delete uses a new `deleted_at TIMESTAMPTZ` column (migration
>   `20260623000011`), NOT a `status='deleted'` value — keeps `status` meaning
>   "send eligibility" and preserves history. APPLIED + verified (column +
>   `contacts_active_created_idx` partial index present).
> - Routes: `server/api/contacts/{index.get,index.post,[id].patch,[id].delete}.ts`.
>   All call `requireUser(event)` first — verified each returns 401 without a
>   session. Use `serverSupabaseClient<Database>` (RLS applies; any authenticated
>   user allowed).
> - `GET`: pagination (`page`/`limit`≤100), `search` (ilike on email), `status`
>   filter, `includeDeleted` (default false). Returns `{ data, total, page, limit }`.
> - `POST`: emails normalised to lowercase (shared schema). If a soft-deleted
>   contact with the same email exists, it is RESTORED + updated; an active
>   duplicate → 409. New insert → 201.
> - `PATCH`: partial update, camelCase→snake_case mapping, only non-deleted rows,
>   sets `updated_at` manually (trigger deferred to 4.3); unique collision → 409,
>   missing → 404.
> - Added `listContactsQuerySchema` to `shared/schemas/contact.ts`; types file
>   gained `contacts.deleted_at` + per-table `Relationships` (required by
>   supabase-js or write payloads type as `never`).
> - For UI: server type `Database['public']['Tables']['contacts']['Row']` is the
>   contact shape; list endpoint response is `{ data, total, page, limit }`.

### 1.6 List management
- [x] `GET /api/lists` — list all lists
- [x] `POST /api/lists` — create list
- [x] `POST /api/lists/:id/contacts` — add contacts to list
- [x] `DELETE /api/lists/:id/contacts/:contactId` — remove contact from list
- [ ] Lists page (`/lists`) — CRUD UI  _(UI: user-provided design pending)_
- [x] CSV import: `POST /api/contacts/import` — upsert contacts, optionally add to a list
- [ ] CSV import UI — file upload + list selector + column mapping  _(UI: user-provided design pending)_

> **1.6 notes (backend done; UI pages awaiting user-provided design)**
> - Routes (all `requireUser`-guarded, `serverSupabaseClient<Database>`):
>   - `GET /api/lists` → each list + `contactCount` (one tally pass over
>     `list_contacts`).
>   - `POST /api/lists` (201) / `PATCH /api/lists/:id` (rename/desc) /
>     `DELETE /api/lists/:id` (cascade removes membership, keeps contacts).
>     PATCH+DELETE added beyond the original spec to support the CRUD UI.
>   - `POST /api/lists/:id/contacts` `{ contactIds: uuid[] }` — idempotent
>     (upsert ignoreDuplicates); unknown contact → 400 (FK 23503).
>   - `DELETE /api/lists/:id/contacts/:contactId` — removes membership; 404 if
>     not a member.
> - `GET /api/contacts` gained a **`listId`** filter (resolves member ids, then
>   `.in('id', …)`) — backs the Contacts "Lists & Segments" panel + list filter.
> - **CSV import contract for the UI**: the page parses the CSV + maps columns
>   client-side (e.g. papaparse), then POSTs JSON to `/api/contacts/import`:
>   `{ listId?: uuid, contacts: [{ email, firstName?, lastName?, attributes? }] }`
>   (max 10000). Server upserts by email (existing updated, soft-deleted
>   RESTORED), adds all to `listId` if given. Import is authoritative — a blank
>   name overwrites. Returns `{ received, imported, listId }`.
> - New schemas: `shared/schemas/list.ts` (create/update/addContacts) +
>   `importContactsSchema` in `contact.ts`; `listId` added to
>   `listContactsQuerySchema`.
> - Verified end-to-end (authenticated session, 17/17): list CRUD, add/remove
>   members, `contactCount`, `listId` filter, import upsert + list assignment,
>   plus 400/404 edge cases. `typecheck` + `lint` clean.
> - UI still TODO once you share the design: `/lists` CRUD page, the Contacts
>   Lists & Segments panel (filter by list), and the CSV import flow.

### 1.7 Basic campaign sending
- [x] `POST /api/campaigns` — create draft campaign
- [x] `PATCH /api/campaigns/:id` — update campaign
- [x] `POST /api/campaigns/:id/send` — dispatch immediately (enqueue `campaign.dispatch` job)
- [x] BullMQ `campaign.dispatch` processor — fan-out to `email.send` jobs
- [x] BullMQ `email.send` processor — send via SES, update `sends` table
- [x] Retry logic: exponential backoff, max 3 attempts, write error to `sends` table on final failure
- [x] Rate limiter on `email.send` queue matching SES per-second quota

> **1.7 notes**
> - Schemas: `createCampaignSchema` / `updateCampaignSchema` in
>   `shared/schemas/campaign.ts`. `POST /api/campaigns` creates a `draft`
>   (html/design default empty — filled by the 2.1 editor; from_name/email
>   default to runtimeConfig SES sender). `PATCH` edits content but is locked
>   (409) once a campaign leaves draft/scheduled.
> - `POST /api/campaigns/:id/send`: validates draft/scheduled + has a list,
>   atomically claims it (`status→sending`, guards double-dispatch), enqueues a
>   `campaign.dispatch` job via `server/utils/queue.ts`. Rolls back to draft +
>   503 if Redis/enqueue is unavailable.
> - Worker: `campaign.dispatch` resolves list members (active, not deleted),
>   bulk-inserts `sends` rows, and `addBulk`s one `email.send` per recipient
>   (attempts: 3, exponential backoff 5s). `email.send` calls the SES wrapper,
>   marks the send `sent` + stores `ses_message_id`, and finalizes the campaign
>   to `sent` once no sends remain `queued`. Idempotent (skips already-sent).
> - Terminal failure handled in the worker's `email.send` `failed` event (after
>   attempts exhausted): marks the send `failed` + records error, then finalizes.
> - Rate limiter on the `email.send` Worker: `{ max: NUXT_SES_RATE_LIMIT_PER_SECOND
>   (default 14), duration: 1000 }`.
> - `worker/lib/ses.ts` — SES `SendEmail` wrapper with **dry-run** mode (auto when
>   no AWS creds, or `NUXT_SES_DRY_RUN=true`) so the pipeline runs before the 1.4
>   AWS setup is done. `worker/lib/supabase.ts` — service-role client (bypasses
>   RLS). Tracking-token injection (open/click/unsubscribe) is deferred to 2.3–2.5;
>   1.7 sends the campaign HTML as-is.
> - Local dev needs Redis (`redis-server`, or `brew services start redis`);
>   run the worker with `node --env-file=.env worker/index.ts`.
> - Verified end-to-end (Redis + worker dry-run, 9/9): create draft, edit draft,
>   send → sending → worker fan-out (4 recipients) → all dry-run sent → campaign
>   finalized `sent` (recipients=4); plus guards: send-without-list 400,
>   double-send 409, edit-while-sending 409. `typecheck` + worker `tsc` + `lint`
>   clean. NOTE: the retry/terminal-failure branch is code-complete but not
>   exercised (dry-run always succeeds); it'll be hit once real SES (1.4) can error.

> **Campaigns LIST page pulled forward (from Claude Design `Campaigns.dc.html`)**
> Built ahead of 1.7 to satisfy a design handoff. Read-only for now — creation
> (POST/send/processors) is still the actual 1.7 work below; this just lists +
> deletes what exists.
> - Migration `20260623000012`: added `'failed'` to the campaigns status CHECK
>   (kept `'cancelled'`). Applied + verified. `CampaignStatus` type + new
>   `shared/schemas/campaign.ts` updated to the 6-value set.
> - `GET /api/campaigns` (paginated, search on name/subject, status filter,
>   server sort by name/status/sentDate/createdAt) enriched per-row with
>   `recipients` (count of `sends`), `openRate`, `clickRate` (unique opens|clicks
>   ÷ recipients from `email_events`; null until sent). Metrics computed in-app
>   per page — move to a cached/aggregated query at scale (4.7).
> - `DELETE /api/campaigns/:id` (cascades sends/events/tokens).
> - Page `app/pages/campaigns/index.vue`: design-system table with sortable
>   headers (derived columns sorted client-side), status filter dropdown,
>   debounced search, row selection + bulk delete, single delete, rate bars,
>   `sending` pulse badge, empty state, pagination. "New Campaign" → `/campaigns/new`
>   (404 until the 2.1 builder exists).
> - Generic `app/components/ConfirmDeleteModal.vue` (moved out of `contacts/`;
>   contacts page updated to use it) + `campaigns/CampaignStatusBadge.vue`.
> - Filters not yet wired (no backing): the design's "Last 90 days" date-range
>   and "All lists" buttons were omitted (consistent with the Contacts scope
>   call). Open/click rates stay 0/— until Phase 2 tracking lands.
> - Verified end-to-end (authenticated, 16/16): metric computation (5 recipients
>   → 60.0% open / 20.0% click), status filter, search, server sort, SSR render
>   with rate display, delete cascade, 400/404 edge cases. `typecheck`+`lint`+
>   `build` clean.

### 1.8 Bounce & complaint handling
- [x] `POST /api/webhooks/ses` — verify SNS signature, parse SES notification
- [x] Update `sends.status` on bounce/complaint
- [x] Update `contacts.status` on bounce/complaint (prevent future sends)
- [x] Insert row in `email_events`
- [x] SQS polling plugin (`server/plugins/sqs-poller.ts`) as fallback to direct webhook

> **1.8 notes (2026-06-25)**
> - Dependency: `@aws-sdk/client-sqs` pinned to `3.1074.0` (matches `client-ses`,
>   so the shared AWS core deps aren't duplicated).
> - Shared core: `server/utils/sesEvents.ts` — `processSnsEnvelope()` unwraps the
>   SNS envelope (`Message` JSON string) and `processSesNotification()` keys off
>   `mail.messageId` → `sends.ses_message_id` (1 SES send = 1 recipient), then
>   updates `sends.status`, suppresses the `contacts.status`, and appends an
>   `email_events` row (raw payload in `metadata`). **Idempotent** — re-delivery is
>   a no-op once the send is already terminal.
> - **Bounce policy**: only **Permanent** (hard) bounces suppress the contact;
>   **Transient/Undetermined** (soft) bounces are acked without any DB change (a
>   temporary failure must not permanently block a valid address). So an
>   `email_events` row of type `bounced` always means a hard bounce. Complaints
>   always suppress.
> - Two delivery paths, both → `processSnsEnvelope`:
>   - `server/plugins/sqs-poller.ts` — **primary** (our wiring is SES→SNS→SQS).
>     Nitro plugin, long-polls (WaitTimeSeconds 20), deletes handled + unhandled
>     (control/simulator) messages so the queue drains; a thrown DB error leaves
>     the message for SQS redelivery. Trusts the queue access policy, so no SNS
>     signature check. Auto-disables when AWS env/creds are absent (local dev) or
>     via `NUXT_SQS_POLLER_DISABLED=true`. Stops on Nitro `close`.
>   - `server/api/webhooks/ses.post.ts` — alternative for a direct SNS HTTPS
>     subscription. Reads the raw `text/plain` body, **verifies the SNS signature**
>     natively (`server/utils/snsSignature.ts`, no extra dep — RSA-SHA1/256 against
>     the cert from an `sns.<region>.amazonaws.com` HTTPS URL), auto-confirms
>     `SubscriptionConfirmation`, and processes `Notification`. Kept public by the
>     existing nuxt.config `exclude: ['/api/webhooks/*']`.
> - `server/utils/supabaseAdmin.ts` — lazy service-role client (RLS bypass) for
>   these session-less flows; same env chain as the worker's client.
> - **Verified end-to-end (real AWS)**: sent a live email to
>   `bounce@simulator.amazonses.com`, seeded a matching `sends` row, and the
>   running poller flipped send→`bounced`, contact→`bounced`, and wrote one
>   `email_events` `bounced` row — while also draining leftover simulator/control
>   messages (queue → 0). `typecheck` + `lint` clean.

### 1.9 Basic stats
- [x] `GET /api/campaigns/:id/stats` — return sent, failed, bounced, complained counts
- [x] Campaign detail page shows basic delivery summary

> **1.9 notes (2026-06-25)**
> - `GET /api/campaigns/:id/stats` — one indexed COUNT per send status
>   (queued/sent/failed/bounced/complained) run in parallel, plus `recipients`
>   (sum) and derived `rates` (delivered/bounce/complaint/failed % of recipients,
>   null when 0). After 1.8 a bounced/complained send leaves `sent`, so `sent` =
>   "Delivered". 404 on unknown campaign. Phase 2.6 extends with open/click rates.
> - `GET /api/campaigns/:id` — campaign details + resolved `listName` (added to
>   back the detail page; matches the ARCHITECTURE API list). Both routes
>   `requireUser`-guarded, `serverSupabaseClient<Database>` (RLS).
> - `app/pages/campaigns/[id].vue` — detail page the list already linked to
>   (the row "View stats" icon → `/campaigns/:id`). Design-system shell: header
>   (name, subject, status badge, sent date / list / from + Refresh), 5 summary
>   cards (Recipients/Delivered/Bounced/Complained/Failed with rates), and a
>   stacked **delivery breakdown** bar + legend. Not-found + no-recipients states.
> - Types: `CampaignDetail` + `CampaignStats` added to `app/types/campaign.ts`.
> - Verified end-to-end (real authenticated session via a seeded test user;
>   cookie minted with `@supabase/ssr` so `serverSupabaseUser` accepts it):
>   mixed-status seed (3 sent / 1 bounced / 1 complained / 1 failed / 2 queued)
>   → stats returned recipients 8, exact per-status counts, delivered 37.5% /
>   bounce 12.5%; plus 401 without auth and 404 for an unknown id. Detail page
>   renders via SSR with the real data (name, "Delivery breakdown", "Bounced").
>   `typecheck` + `lint` clean.

---

## Phase 2 — Core Features (Weeks 7–13)

Goal: full campaign builder with drag-and-drop editor, scheduling, open/click tracking, and an analytics dashboard.

### 2.1 Drag-and-drop email editor
- [x] Install `@unlayer/vue` and configure in Nuxt _(corrected: `vue-email-editor` — `@unlayer/vue` does not exist on npm)_
- [x] Campaign builder page (`/campaigns/new`, `/campaigns/:id/edit`)
- [x] Embed Unlayer editor; export HTML + JSON design on save
- [x] `POST /api/templates` — save design as a reusable template
- [x] `GET /api/templates` — list templates
- [x] Load existing template into editor when starting a new campaign
- [x] Image upload: Unlayer upload handler → Supabase Storage → return CDN URL

> **2.1 notes (2026-06-25 — built from Claude Design handoff `Campaign Builder.dc.html`)**
> - Package: `@unlayer/vue` (in PROJECT_CONTEXT) doesn't exist on npm — used the
>   official `vue-email-editor@2.2.0` (Unlayer's Vue 3 component) instead.
> - Editor wrapper `app/components/campaigns/CampaignEditor.client.vue` — `.client`
>   so it never SSRs (loads a remote embed script + touches `window`). Exposes
>   `exportHtml()` / `loadDesign()`, emits `ready`/`change`, and registers the
>   Unlayer image callback to POST to our upload API.
> - `app/components/campaigns/CampaignBuilder.vue` — full-screen builder per the
>   mockup (top bar + 320px settings panel + editor). **Autosaves** the draft
>   (create-then-PATCH; first save POSTs, swaps the URL to `/campaigns/:id/edit`
>   via replaceState), with the "Saving…/All changes saved" indicator. Target-list
>   dropdown (from `/api/lists`), Save-as-template + Load-template modals, HTML
>   Preview modal (iframe srcdoc), and Send (existing 1.7 endpoint). Toasts +
>   locked (read-only) state for non-draft/scheduled campaigns.
> - Pages use `layout: false` (full-screen, no app sidebar). To allow
>   `/campaigns/:id` **and** `/campaigns/:id/edit` to coexist without the
>   parent-route `<NuxtPage/>` gotcha, the detail page moved
>   `campaigns/[id].vue` → `campaigns/[id]/index.vue`; added `[id]/edit.vue` and
>   `new.vue`. Detail page gained an **Edit** button (draft/scheduled only).
> - Templates API: `GET /api/templates` (paginated, name search; list omits the
>   heavy `design`), `POST /api/templates` (201), `GET /api/templates/:id` (full,
>   incl. `design` — used to load into the editor). Schema in
>   `shared/schemas/template.ts`.
> - `POST /api/uploads/image` — multipart → `template-assets` bucket → public CDN
>   URL; `image/*` + 5 MB only. **Also satisfies task 2.7.**
> - `GET /api/campaigns/:id` extended to return `html` + `design` (builder load).
>   `createCampaignSchema.subject` relaxed to allow empty (drafts autosave before a
>   subject is typed).
> - **Deferred from the mockup** (per roadmap): A/B Test subject → **3.3** (MVP-out);
>   Schedule Delivery toggle → **2.2** (next); Preview Text → no DB column yet.
> - Verified: `nuxt build` clean (editor bundles); templates CRUD + image upload
>   (incl. public reachability, 415 on non-image) + campaign design fetch all pass
>   under a real authenticated session; `/campaigns/new`, `/campaigns/:id/edit` and
>   `/campaigns/:id` all SSR-render + route correctly. `typecheck` + `lint` clean.
>   NOTE: the live Unlayer drag-drop/export needs a browser — eyeball via
>   `pnpm dev` + sign in.

### 2.2 Campaign scheduling
- [x] `POST /api/campaigns/:id/schedule` — set `scheduled_at`, update status to `scheduled`
- [x] Nitro cron job (or Railway cron): every minute, find scheduled campaigns where `scheduled_at <= NOW()` and dispatch them
- [x] Campaign list shows scheduled time and countdown
- [x] Cancel scheduled campaign: `PATCH /api/campaigns/:id` with `status = 'cancelled'`

> **2.2 notes (2026-06-25)**
> - `POST /api/campaigns/:id/schedule` — `scheduleCampaignSchema` (`scheduledAt`
>   ISO, must be future); allowed from draft/scheduled (reschedule), requires a
>   list. Sets `status='scheduled'` + `scheduled_at` atomically.
> - `server/plugins/scheduled-dispatcher.ts` — Nitro plugin, every 60s (+ a boot
>   sweep at 5s) finds `status='scheduled' AND scheduled_at <= now()`, **atomically
>   claims** each (scheduled→sending, status-matched UPDATE so concurrent replicas
>   can't double-fire), then enqueues a `campaign.dispatch` job — same worker path
>   as an immediate send. Rolls back to `scheduled` if the enqueue fails.
>   Auto-disabled without `REDIS_URL` or via `NUXT_SCHEDULER_DISABLED=true`.
>   (Chose a plugin over Nitro scheduled-tasks: works on the Railway node preset
>   with no extra cron wiring, mirrors the existing `sqs-poller` plugin.)
> - Cancel: `updateCampaignSchema` gained `status: z.literal('cancelled')` (the
>   only status change PATCH allows); the existing draft/scheduled edit-lock
>   already permits it. Detail page shows a **Cancel** button for scheduled
>   campaigns (reuses `ConfirmDeleteModal`).
> - Campaigns list: scheduled rows show the date + a client-only **countdown**
>   pill (`in 3d`/`in 5h`/`in 12m`/`due now`), gated behind a mounted flag to
>   avoid SSR/hydration drift.
> - **Builder Schedule toggle activated** (was deferred from 2.1): the left-panel
>   "Schedule Delivery" switch + date/time inputs now drive the primary button
>   (`Send Campaign` ⇄ `Schedule Campaign`) and POST to the schedule endpoint;
>   prefilled from `scheduled_at` when editing a scheduled campaign.
> - Verified end-to-end (real Redis + auth): the scheduler dispatched a past-due
>   campaign (scheduled→sending, confirmed in logs); schedule future=200 /
>   past=400 / no-list=400; cancel→cancelled; `PATCH status:'sent'` rejected=400;
>   401 without auth; builder/detail/list UI all render the scheduling controls.
>   `nuxt build` + `typecheck` + `lint` clean. (Bug found + fixed mid-task: a
>   stale dev-server process from an earlier task was answering requests without
>   the new plugin — killed it; scheduler then dispatched correctly.)

### 2.3 Open tracking
- [x] At dispatch time: generate a unique token per send, store in `tracking_tokens` (type = 'open')
- [x] Inject `<img src="{APP_URL}/t/o/{token}" width="1" height="1">` into campaign HTML before sending
- [x] `GET /t/o/:token` Nitro route:
  - Look up token → send_id
  - Insert `email_events` row (type = 'opened') — deduplicated (ignore if already opened in last 24 h)
  - Return a 1×1 transparent GIF (`image/gif`)

> **2.3 notes (2026-06-25)**
> - `worker/lib/tracking.ts` — `generateToken()` (16-char URL-safe, `randomBytes(12)`
>   → base64url) + `injectOpenPixel(html, url)` (inserts a 1×1 `<img>` before
>   `</body>`, or appends when there's no body tag).
> - `worker/processors/campaign-dispatch.ts` now generates one `tracking_tokens`
>   (type `open`) row per send and injects that send's pixel into a **personalised
>   copy** of the campaign HTML carried by its `email.send` job. Gated on
>   `NUXT_PUBLIC_APP_URL` (needs an absolute URL for the pixel); without it, plain
>   HTML is sent and a warning is logged.
> - `server/routes/t/o/[token].get.ts` — public (no auth; covered by the
>   nuxt.config `/t/*` exclude). Resolves token → send, records an `opened`
>   `email_events` row **deduped to once per 24h per send**, and always returns a
>   43-byte transparent GIF (`image/gif`, no-store). Best-effort: any error still
>   returns the pixel. Uses the service-role `supabaseAdmin` client.
> - Verified: helper unit checks (token shape/uniqueness, injection placement);
>   full e2e with real Redis + worker (forced `NUXT_SES_DRY_RUN` so the fake test
>   addresses weren't actually emailed) — dispatch created an open token per send;
>   `GET /t/o/:token` returned a GIF and recorded exactly one `opened` event, a
>   second hit within 24h was deduped, and a bogus token still returned the pixel.
>   app `typecheck` + worker `tsc` + `lint` clean.

### 2.4 Click tracking
- [x] At dispatch time: for every `<a href="...">` in the HTML, generate a token (type = 'click'), store original URL in `tracking_tokens`
- [x] Replace href with `{APP_URL}/t/c/{token}`
- [x] `GET /t/c/:token` Nitro route:
  - Look up token → send_id + destination URL
  - Insert `email_events` row (type = 'clicked')
  - `302` redirect to destination URL

> **2.4 notes (2026-06-25)**
> - `worker/lib/tracking.ts → rewriteClickLinks(html, originUrl, makeToken)` —
>   rewrites every `<a href="http(s)://…">` to `{origin}/t/c/{token}`, returning
>   the token→original-URL pairs. Only http/https are rewritten; `mailto:`/`tel:`/
>   `#anchors`/merge tags are left as-is, and other anchor attributes are preserved.
> - `campaign-dispatch.ts` now does click-rewrite **then** open-pixel per send,
>   collecting open + click tokens into a single `tracking_tokens` bulk insert
>   (click rows carry the original `url`).
> - `server/routes/t/c/[token].get.ts` — public (no auth). Resolves token → send +
>   destination, records a `clicked` `email_events` row (with `url`, **every
>   click, no dedup**), then 302-redirects. Only redirects to a stored http(s)
>   URL (guards open-redirect); unknown/invalid token → 404. Best-effort insert.
> - Verified: helper unit (rewrites 2 http links, captures URLs, leaves
>   mailto/anchor untouched, preserves `class`/`target`); full e2e with Redis +
>   worker (dry-run) — dispatch created 2 click tokens + 1 open token, mailto
>   skipped; `GET /t/c/:token` 302'd to the original URL and recorded a `clicked`
>   event with the URL, a second click added a second event (no dedup), bogus
>   token → 404. app `typecheck` + worker `tsc` + `lint` clean.

### 2.5 Unsubscribe flow
- [x] Inject unsubscribe link `{APP_URL}/t/u/{token}` into every campaign email footer
- [x] `GET /t/u/:token` route: update `contacts.status = 'unsubscribed'`, show confirmation page
- [x] Exclude unsubscribed/bounced/complained contacts from all future campaign dispatches

> **2.5 notes (2026-06-25)**
> - Migration `20260625000001_tracking_tokens_add_unsubscribe.sql` — extends the
>   `tracking_tokens.type` CHECK to `('open','click','unsubscribe')`. **Applied by
>   the user via the Supabase SQL editor** (the connected MCP is read-only, so I
>   couldn't run it). `TrackingTokenType` updated to match.
> - `worker/lib/tracking.ts → injectUnsubscribe(html, url)` — replaces a
>   `{{unsubscribe_url}}` placeholder if present, else appends a minimal compliant
>   footer before `</body>`. Runs in dispatch **after** click-rewrite (so the link
>   isn't /t/c-wrapped) and before the open pixel; one `unsubscribe` token per send.
> - `server/routes/t/u/[token].get.ts` — public. Token → send → contact, sets
>   `contacts.status='unsubscribed'` (idempotent — the `unsubscribed` event is
>   recorded only on the first unsubscribe), renders a standalone branded
>   confirmation page (success / "link not valid"). `text/html`, no-store.
> - **Exclusion (item 3) was already satisfied**: `campaign-dispatch` resolves
>   recipients with `status='active'` + `deleted_at IS NULL`, so unsubscribed /
>   bounced / complained contacts are skipped. Verified by a second campaign to
>   the same list producing 0 sends for the unsubscribed contact.
> - Verified: helper unit (placeholder replace, footer append with/without body);
>   full e2e with Redis + worker (dry-run) — dispatch created the unsubscribe
>   token; `/t/u/:token` showed the confirmation page, set the contact
>   unsubscribed and logged one event, a second visit didn't duplicate it, a new
>   dispatch excluded the contact (0 sends), and a bogus token rendered the
>   not-valid page. app `typecheck` + worker `tsc` + `lint` clean.

### 2.6 Analytics dashboard
- [x] `GET /api/campaigns/:id/stats` — extend to return open_count, click_count, open_rate, click_rate, bounce_rate
- [x] Campaign stats page: summary cards + vue-chartjs line chart (events over time)
- [x] Overview dashboard (`/`) — aggregate stats across all campaigns (total sent, avg open rate, avg click rate)

> **2.6 notes (2026-06-25 — Dashboard built from Claude Design handoff `Marketing Hub.dc.html`)**
> - Scope confirmed with the user: **Dashboard only** (kept the existing 1.5 shell
>   + 1.7 campaigns list), brand stays **Sendinal**, charts via **vue-chartjs**.
> - **Stats endpoint extended**: `GET /api/campaigns/:id/stats` now returns
>   `counts.opened`/`counts.clicked` (unique per send) and `rates.open`/`rates.click`
>   alongside the delivery figures. Fetches sends once + dedupes open/click events
>   in-app. `CampaignStats` type updated.
> - **Overview dashboard** `app/pages/index.vue` (was a placeholder): top bar
>   (search/notifications/New Campaign), 4 metric cards (Total Sent + MoM trend,
>   Avg Open Rate, Avg Click Rate, Active Contacts + MoM trend), a Sends-Over-Time
>   bar chart + Campaign-Health deliverability donut, and a Recent Campaigns table.
>   Added a **Dashboard** nav item to `app/layouts/default.vue`.
> - **Backend** `GET /api/dashboard/stats` — aggregates across all sends/events/
>   contacts: totalSent (+ this-vs-last-month trend), activeContacts (+ trend),
>   avg open/click rate over delivered, deliverability health (delivered/bounced/
>   complained), and a 30-day daily delivered series. Rate cards show
>   "across N sent campaigns" instead of a fabricated trend. (In-app aggregation;
>   Phase 4.7 caches.)
> - Charts: `chart.js@4` + `vue-chartjs@5`. `SendsBarChart.client.vue` (Bar) and
>   `HealthDonut.client.vue` (Doughnut + center-label plugin) are `.client` so
>   they never SSR; wrapped in `<ClientOnly>` with fallbacks.
> - Verified: `nuxt build` clean (charts bundle); real-data e2e (before/after
>   deltas) — delivered +4 / bounced +1 / totalSent +5 / activeContacts +5,
>   today's series bucket +4, avgOpenRate computed, page SSR renders cards +
>   recent table + chart panels. `typecheck` + `lint` clean.
> **2.6 item 2 — campaign analytics page (built from Claude Design `EmailPro.dc.html`)**
> - Scope: **Analytics screen only** (the campaigns-list redesign in the same file
>   was skipped — 1.7's list stands). Export button deferred to 4.4 (shown disabled).
> - `app/pages/campaigns/[id]/index.vue` rebuilt to the Analytics design:
>   breadcrumb + title + meta (status/sent/recipients/list), 4 stat cards
>   (Delivered, Open rate, Click rate, Unsubscribed), an Engagement-over-time line
>   chart (Opens solid + Clicks dashed), Top clicked links, and a paginated
>   Individual send results table. Keeps Edit (draft/scheduled) + Cancel
>   (scheduled) from 1.9.
> - `GET /api/campaigns/:id/stats` gained `counts.unsubscribed` + `rates.unsubscribe`.
> - New endpoints: `…/timeseries` (daily opens/clicks, zero-filled, 30-day cap),
>   `…/links` (top clicked links by total+unique), `…/activity` (paginated send
>   results with a derived status: clicked > opened > unsubscribed > delivery status).
> - `EngagementLineChart.client.vue` (vue-chartjs Line). Types: `CampaignTimeseries`,
>   `CampaignLink`, `CampaignActivityRow`.
> - Verified end-to-end (real auth + seeded campaign): stats unsub 1/20%, opens/
>   clicks 60%, timeseries event counts (4 opens/3 clicks), top links total/unique
>   sorted, activity derived statuses + emails + pagination, and SSR render of the
>   full page. `nuxt build` + `typecheck` + `lint` clean.
>
> **Phase 2 complete.** (2.7 image upload was delivered in 2.1.)

### 2.7 Supabase Storage image management
- [x] Unlayer upload handler: `POST /api/uploads/image` — receives file, uploads to Supabase Storage, returns CDN URL  _(delivered in 2.1)_
- [x] Restrict uploaded file types to image/* and max 5 MB  _(delivered in 2.1)_

---

## Phase 3 — Segmentation & A/B Testing (Weeks 14–18)

Goal: smart targeting with custom contact attributes, dynamic segments, and basic A/B testing.

### 3.1 Custom contact attributes
- [x] UI to define custom attribute keys per list (stored as a list-level JSON schema)
- [x] Contact import: map CSV columns to custom attributes
- [x] Contact edit form: render fields dynamically from attribute schema

> **3.1 notes (2026-06-26 — Contacts page rebuilt from Stitch design handoff
> `docs/stitch_ses_email_campaign_manager/code.html`)**
> - **Scope decisions (confirmed with the user):** list/attribute management lives
>   as a **"Lists & Segments" panel inside `/contacts`** (the design handoff), the
>   **CSV import UI is built now** (also clears the 1.6-deferred import UI), and the
>   contact edit form renders the **union of attribute schemas across all the
>   contact's lists**. The design's **Filter** button was omitted — attribute-based
>   filtering belongs to 3.2's segment builder (consistent with the repo's
>   "don't draw unbacked controls" precedent).
> - **Migration** `20260626000001_lists_add_attribute_schema.sql` — adds
>   `lists.attribute_schema JSONB NOT NULL DEFAULT '[]'`. ⚠️ **NOT YET APPLIED** —
>   the connected Supabase MCP is read-only (see [[supabase-mcp-readonly]]), so
>   **apply it in the Supabase SQL editor before list create/edit/import works**
>   (POST/PATCH `/api/lists` always send `attribute_schema`).
> - **Attribute schema model** (`shared/schemas/list.ts`): an array of
>   `{ key, label, type, options? }`; `type ∈ text|number|date|boolean|select`.
>   Keys are slug-validated + unique-per-list. `createListSchema`/`updateListSchema`
>   gained `attributeSchema`; `app/types/database.types.ts` + `app/types/list.ts`
>   updated. `GET /api/lists` already `select('*')` so it surfaces the column.
> - **New endpoint** `GET /api/contacts/:id/attribute-schema` — union of field
>   defs across the contact's lists (deduped by key), drives the dynamic edit form.
> - **Components:** `contacts/ListsPanel.vue` (lists sidebar: select→`listId`
>   filter, create/edit/delete), `contacts/ListFormModal.vue` (list CRUD + the
>   attribute-schema editor = item 1), `contacts/ImportCsvModal.vue` (papaparse
>   parse + auto-guessed column→field/attribute mapping + target list = item 2),
>   and a now-dynamic `contacts/ContactFormModal.vue` (renders schema fields by
>   type, preserves existing non-schema keys, "+ Add custom field" = item 3).
> - **Dep:** `papaparse` (+ `@types/papaparse`), client-side CSV parsing.
> - **Known limitation:** the status-tab counts stay global (the `/api/contacts/stats`
>   endpoint isn't list-scoped); per-list status counts can come with 3.2.
> - Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build` all clean. ⚠️ Live
>   click-through needs the migration applied + a signed-in session (`pnpm dev`).
>
> **3.1 follow-up — CSV Import Wizard (2026-06-26, Stitch handoff
> `docs/csv-import-wizard/project/CSV Import Wizard.dc.html`)**
> Replaced the single-screen `ImportCsvModal` with a 720px, 6-state wizard
> (`ImportWizardModal.vue` + `StepBar.vue`): **Upload → Map → Configure → Review
> → Importing → Results**. Backdrop is non-dismissible (X only); sticky
> header/footer; pinned step bar.
> - **Scope (confirmed):** full real data — chunked import w/ live progress arc,
>   real New/Update split, real breakdown. Duplicate strategies wired: **Update
>   existing** (default) + **Skip duplicates** ("Fill empty only" dropped per the
>   user). Invalid-email: both **Skip invalid** + **Import anyway & flag**.
> - **Migration** `20260626000002_contacts_add_email_unverified.sql` — adds
>   `contacts.email_unverified BOOLEAN DEFAULT false` (+ partial sendable index).
>   ⚠️ **NOT YET APPLIED** (MCP read-only — apply in the Supabase SQL editor).
>   Flagged contacts are **excluded from campaign dispatch**
>   (`worker/processors/campaign-dispatch.ts` now filters `email_unverified=false`).
> - **Backend:** `import.post.ts` reworked — looks up existing emails, inserts new
>   in bulk, updates existing per `duplicateStrategy` (or skips), stores the
>   `emailUnverified` flag, returns `{received, imported, updated, skipped,
>   failed, listId}`. New `POST /api/contacts/import-check` (read-only New-vs-
>   existing split for the Review step). Schemas: `importContactSchema`
>   (conditional email validation + flag), `duplicateStrategySchema`,
>   `importCheckSchema`, shared `EMAIL_RE`.
> - **Client import** is chunked (200/batch) so the progress arc reflects real
>   throughput; emits `imported` (parent refreshes) while staying on Results.
>   "Close & run in background" closes the modal — the in-flight batch loop
>   finishes even after unmount (no true server-side job).
> - **Deviations from the mock (noted):** the Step-2 field dropdown is a styled
>   native `<select>` (not a custom popover); Step-3 "Create a new list" link
>   omitted (use the Lists panel); Review table caps at 100 rows; per-row counts
>   may differ slightly from the mock's sample copy (computed from real data).
> - Two migrations now pending: `20260626000001` (lists.attribute_schema) +
>   `20260626000002` (contacts.email_unverified).
> - Verified: `pnpm typecheck`, worker `tsc`, `pnpm lint`, `pnpm build` all clean.

### 3.2 Segment builder
- [ ] Segment rule schema: `{ field, operator, value }[]` with AND logic
  - Fields: `email`, `first_name`, `status`, `attributes.*`, `last_opened_at`, `last_clicked_at`
  - Operators: `equals`, `contains`, `greater_than`, `less_than`, `is_set`, `is_not_set`
- [ ] Segment builder UI — add/remove conditions, preview estimated recipient count
- [ ] `POST /api/segments/preview` — evaluate rules against DB, return contact count
- [ ] At dispatch time: apply `segment_rules` as SQL WHERE conditions on top of the list

### 3.3 A/B testing (2 variants)
- [ ] Schema: add `ab_variants` JSONB to `campaigns` — `[{ subject, html, design, weight }]`
- [ ] Campaign builder: toggle A/B mode, configure variant B subject/body and split ratio
- [ ] At dispatch: randomly assign contacts to variant A or B (by weight), record variant in `sends` table
- [ ] Stats page: show open/click rates separately per variant with a winner indicator

### 3.4 Template library
- [ ] Templates list page (`/templates`)
- [ ] Preview template (rendered HTML in iframe)
- [ ] Duplicate template
- [ ] Start campaign from template

### 3.5 Sending rate control
- [ ] Config: `SES_RATE_LIMIT_PER_SECOND` env var
- [ ] BullMQ limiter: enforce per-second rate limit on `email.send` queue
- [ ] Throttle warning in UI when campaign has >10,000 recipients (estimated send time shown)

---

## Phase 4 — Hardening (Weeks 19–22)

Goal: production reliability, observability, and a clean handoff to any future maintainer.

### 4.1 SES reputation monitoring
- [ ] Dashboard widget showing current bounce rate and complaint rate (last 7 days)
- [ ] Warning banner if bounce rate > 2% or complaint rate > 0.1% (SES thresholds)
- [ ] Auto-pause campaign sending if thresholds are exceeded (update campaign status to 'paused')

### 4.2 Alerts
- [ ] In-app notification when a campaign exceeds bounce/complaint thresholds
- [ ] Optional: send alert email via SES to a configured admin address

### 4.3 Supabase RLS audit
- [ ] Review all RLS policies — confirm no table is accidentally exposed
- [ ] Add `updated_at` trigger function for tables that need it
- [ ] Add DB indexes on high-traffic columns: `sends.campaign_id`, `sends.ses_message_id`, `email_events.send_id`, `contacts.email`

### 4.4 Reporting & export
- [ ] Campaign report page: full send list with per-contact status (sent, opened, clicked, bounced)
- [ ] `GET /api/campaigns/:id/export` — download CSV of send results
- [ ] Contact export: `GET /api/contacts/export` — all contacts with status and attributes

### 4.5 Audit log
- [ ] `audit_logs` table: `(id, user_id, action, entity_type, entity_id, metadata, created_at)`
- [ ] Log key actions: campaign sent, campaign cancelled, contact status changed, list created/deleted
- [ ] Audit log viewer page (read-only, paginated)

### 4.6 Error handling & resilience
- [ ] Global Nuxt error handler — consistent JSON error responses from all API routes
- [ ] Worker dead-letter handling: jobs that exhaust retries are moved to a `failed_jobs` table for manual review
- [ ] Health check route `GET /api/health` — checks Supabase connectivity and Redis ping
- [ ] Graceful worker shutdown: drain active jobs before process exit

### 4.7 Performance
- [ ] Add server-side pagination to all list endpoints (cursor-based, not offset)
- [ ] Lazy-load Unlayer editor (code-split — it is large)
- [ ] Cache campaign stats in Redis for 60 seconds (invalidate on new email_events)

### 4.8 Documentation
- [ ] `README.md` — local dev setup, env vars, Railway deploy steps
- [ ] Document SES production access request process and required DNS records
- [ ] Document SNS → SQS → webhook wiring steps
- [ ] Inline JSDoc comments on all worker processors and complex Nitro routes
