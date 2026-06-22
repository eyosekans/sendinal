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
- [ ] Create Supabase project and note URL + keys
- [ ] Write migration: `contacts` table
- [ ] Write migration: `lists` table
- [ ] Write migration: `list_contacts` junction table
- [ ] Write migration: `campaigns` table
- [ ] Write migration: `templates` table
- [ ] Write migration: `sends` table
- [ ] Write migration: `email_events` table
- [ ] Write migration: `tracking_tokens` table
- [ ] Enable RLS on all tables; add `auth.uid() IS NOT NULL` policies
- [ ] Create `template-assets` Storage bucket (public read)

### 1.3 Authentication
- [ ] `/login` page — Supabase email + password form
- [ ] Auth middleware protecting all routes except `/login`, `/t/*`, `/api/webhooks/*`
- [ ] `/confirm` callback page for Supabase auth redirect
- [ ] Logout button in app layout

### 1.4 Amazon SES setup
- [ ] Install and configure `@aws-sdk/client-ses` in the worker
- [ ] Verify sender domain in SES console (DKIM + SPF records)
- [ ] Request SES production access (exit sandbox)
- [ ] Create SNS topic for bounce/complaint notifications
- [ ] Create SQS queue; subscribe it to the SNS topic
- [ ] Configure SES to publish bounce + complaint events to the SNS topic
- [ ] Write `worker/lib/ses.js` — wrapper around `SendEmail` with error handling

### 1.5 Contact management
- [ ] `GET /api/contacts` — list with pagination, search by email, filter by status
- [ ] `POST /api/contacts` — create single contact (Zod validation)
- [ ] `PATCH /api/contacts/:id` — update contact
- [ ] `DELETE /api/contacts/:id` — soft-delete (set status = 'deleted')
- [ ] Contacts list page (`/contacts`) — table with search + pagination
- [ ] Contact detail/edit modal

### 1.6 List management
- [ ] `GET /api/lists` — list all lists
- [ ] `POST /api/lists` — create list
- [ ] `POST /api/lists/:id/contacts` — add contacts to list
- [ ] `DELETE /api/lists/:id/contacts/:contactId` — remove contact from list
- [ ] Lists page (`/lists`) — CRUD UI
- [ ] CSV import: `POST /api/contacts/import` — parse CSV, upsert contacts, optionally add to a list
- [ ] CSV import UI — file upload + list selector + column mapping

### 1.7 Basic campaign sending
- [ ] `POST /api/campaigns` — create draft campaign
- [ ] `PATCH /api/campaigns/:id` — update campaign
- [ ] `POST /api/campaigns/:id/send` — dispatch immediately (enqueue `campaign.dispatch` job)
- [ ] BullMQ `campaign.dispatch` processor — fan-out to `email.send` jobs
- [ ] BullMQ `email.send` processor — send via SES, update `sends` table
- [ ] Retry logic: exponential backoff, max 3 attempts, write error to `sends` table on final failure
- [ ] Rate limiter on `email.send` queue matching SES per-second quota

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
