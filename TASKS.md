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
- [ ] Verify sender domain in SES console (DKIM + SPF records)  _(manual — DNS)_
- [ ] Request SES production access (exit sandbox)  _(manual — AWS approval)_
- [ ] Create SNS topic for bounce/complaint notifications  _(CLI — see runbook)_
- [ ] Create SQS queue; subscribe it to the SNS topic  _(CLI — see runbook)_
- [ ] Configure SES to publish bounce + complaint events to the SNS topic  _(CLI — see runbook)_
- [x] Write `worker/lib/ses.js` — wrapper around `SendEmail` with error handling _(as `worker/lib/ses.ts`, done in 1.7)_

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
- [ ] `POST /api/webhooks/ses` — verify SNS signature, parse SES notification
- [ ] Update `sends.status` on bounce/complaint
- [ ] Update `contacts.status` on bounce/complaint (prevent future sends)
- [ ] Insert row in `email_events`
- [ ] SQS polling plugin (`server/plugins/sqs-poller.ts`) as fallback to direct webhook

### 1.9 Basic stats
- [ ] `GET /api/campaigns/:id/stats` — return sent, failed, bounced, complained counts
- [ ] Campaign detail page shows basic delivery summary

---

## Phase 2 — Core Features (Weeks 7–13)

Goal: full campaign builder with drag-and-drop editor, scheduling, open/click tracking, and an analytics dashboard.

### 2.1 Drag-and-drop email editor
- [ ] Install `@unlayer/vue` and configure in Nuxt
- [ ] Campaign builder page (`/campaigns/new`, `/campaigns/:id/edit`)
- [ ] Embed Unlayer editor; export HTML + JSON design on save
- [ ] `POST /api/templates` — save design as a reusable template
- [ ] `GET /api/templates` — list templates
- [ ] Load existing template into editor when starting a new campaign
- [ ] Image upload: Unlayer upload handler → Supabase Storage → return CDN URL

### 2.2 Campaign scheduling
- [ ] `POST /api/campaigns/:id/schedule` — set `scheduled_at`, update status to `scheduled`
- [ ] Nitro cron job (or Railway cron): every minute, find scheduled campaigns where `scheduled_at <= NOW()` and dispatch them
- [ ] Campaign list shows scheduled time and countdown
- [ ] Cancel scheduled campaign: `PATCH /api/campaigns/:id` with `status = 'cancelled'`

### 2.3 Open tracking
- [ ] At dispatch time: generate a unique token per send, store in `tracking_tokens` (type = 'open')
- [ ] Inject `<img src="{APP_URL}/t/o/{token}" width="1" height="1">` into campaign HTML before sending
- [ ] `GET /t/o/:token` Nitro route:
  - Look up token → send_id
  - Insert `email_events` row (type = 'opened') — deduplicated (ignore if already opened in last 24 h)
  - Return a 1×1 transparent GIF (`image/gif`)

### 2.4 Click tracking
- [ ] At dispatch time: for every `<a href="...">` in the HTML, generate a token (type = 'click'), store original URL in `tracking_tokens`
- [ ] Replace href with `{APP_URL}/t/c/{token}`
- [ ] `GET /t/c/:token` Nitro route:
  - Look up token → send_id + destination URL
  - Insert `email_events` row (type = 'clicked')
  - `302` redirect to destination URL

### 2.5 Unsubscribe flow
- [ ] Inject unsubscribe link `{APP_URL}/t/u/{token}` into every campaign email footer
- [ ] `GET /t/u/:token` route: update `contacts.status = 'unsubscribed'`, show confirmation page
- [ ] Exclude unsubscribed/bounced/complained contacts from all future campaign dispatches

### 2.6 Analytics dashboard
- [ ] `GET /api/campaigns/:id/stats` — extend to return open_count, click_count, open_rate, click_rate, bounce_rate
- [ ] Campaign stats page: summary cards + vue-chartjs line chart (events over time)
- [ ] Overview dashboard (`/`) — aggregate stats across all campaigns (total sent, avg open rate, avg click rate)

### 2.7 Supabase Storage image management
- [ ] Unlayer upload handler: `POST /api/uploads/image` — receives file, uploads to Supabase Storage, returns CDN URL
- [ ] Restrict uploaded file types to image/* and max 5 MB

---

## Phase 3 — Segmentation & A/B Testing (Weeks 14–18)

Goal: smart targeting with custom contact attributes, dynamic segments, and basic A/B testing.

### 3.1 Custom contact attributes
- [ ] UI to define custom attribute keys per list (stored as a list-level JSON schema)
- [ ] Contact import: map CSV columns to custom attributes
- [ ] Contact edit form: render fields dynamically from attribute schema

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
