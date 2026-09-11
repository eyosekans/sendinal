# Architecture

## System Overview

```
[Browser / User]
      │  SSR + API calls
      ▼
[Nuxt 4 App — Railway web service]
      │                        │
      │ read/write             │ queue job
      ▼                        ▼
[Supabase DB]         [Redis — Railway add-on]
[Supabase Auth]               │
[Supabase Storage]            │ dequeue
                              ▼
                     [BullMQ Worker — Railway worker service]
                              │
                              │ send via SDK
                              ▼
                       [Amazon SES]
                              │
                              │ delivers to
                              ▼
                        [Recipient]
                              │
                  opens/clicks (pixel + redirect)
                              │
                              ▼
                  [Nuxt tracking routes]
                              │
                              ▼
                     [Supabase DB — email_events]

[SES] → bounce/complaint → [AWS SNS] → [AWS SQS]
      ← webhook ← [Nuxt /api/webhooks/ses]
```

---

## Components

### Nuxt 4 App (Railway: web)
- **Pages**: Campaign builder, contact lists, analytics dashboard, settings.
- **Server routes** (`server/api/`): REST endpoints consumed by the frontend.
- **Tracking routes**:
  - `GET /t/o/[token]` — open pixel (returns 1×1 transparent GIF, writes open event)
  - `GET /t/c/[token]` — click redirect (resolves destination URL, writes click event, redirects)
- **Webhook route**: `POST /api/webhooks/ses` — receives SQS-forwarded bounce/complaint events.
- **Auth middleware**: All routes except `/login` and tracking routes require a valid Supabase session.

### BullMQ Worker (Railway: worker)
- Standalone Node.js process, not part of the Nuxt app.
- Connects to the same Redis instance.
- **Queues**:
  - `email.send` — individual email send jobs (one job per recipient)
  - `campaign.dispatch` — fan-out job that reads a campaign's recipients and enqueues individual send jobs
- **Retry strategy**: exponential backoff, max 3 attempts. Failed jobs written to `sends` table with `status = 'failed'`.
- **Rate limiting**: BullMQ limiter configured to respect SES per-second sending quota.

### Supabase
- **DB**: PostgreSQL 15, schema below.
- **Auth**: Email+password login for internal team. JWT issued by Supabase, verified by Nuxt middleware via `@nuxtjs/supabase`.
- **Storage**: `template-assets` bucket for Unlayer-uploaded images. Public CDN URL used in email HTML.
- **RLS**: Enabled on all tables. All policies require `auth.uid() IS NOT NULL` (any authenticated user can access all data — no per-user isolation needed for an internal tool).

---

## Database Schema

### `contacts`
```sql
CREATE TABLE contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  first_name  TEXT,
  last_name   TEXT,
  attributes  JSONB DEFAULT '{}',   -- custom fields (e.g. {"company": "Acme"})
  status      TEXT NOT NULL DEFAULT 'active',
                -- active | unsubscribed | bounced | complained
  email_unverified BOOLEAN NOT NULL DEFAULT false,
                -- excluded from dispatch until reviewed
  email_validation_verdict TEXT,        -- HIGH | MEDIUM | LOW (SES IsValid)
  email_validation_checks  JSONB NOT NULL DEFAULT '{}',
  email_validated_at       TIMESTAMPTZ, -- also the validation cache timestamp
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `lists`
```sql
CREATE TABLE lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `list_contacts` (junction)
```sql
CREATE TABLE list_contacts (
  list_id     UUID REFERENCES lists(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (list_id, contact_id)
);
```

### `templates`
```sql
CREATE TABLE templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,    -- Unlayer-exported HTML
  design      JSONB NOT NULL,   -- Unlayer JSON design state
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `campaigns`
```sql
CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  subject       TEXT NOT NULL,
  from_name     TEXT NOT NULL,
  from_email    TEXT NOT NULL,
  html          TEXT NOT NULL,
  design        JSONB NOT NULL,
  list_id       UUID REFERENCES lists(id),
  segment_rules JSONB DEFAULT '{}',  -- filter conditions applied at send time
  status        TEXT NOT NULL DEFAULT 'draft',
                -- draft | scheduled | sending | sent | cancelled
  scheduled_at  TIMESTAMPTZ,         -- NULL = send immediately
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `sends`
One row per recipient per campaign.
```sql
CREATE TABLE sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'queued',
                -- queued | sent | failed | bounced | complained
  ses_message_id TEXT,             -- returned by SES after successful send
  error         TEXT,              -- error message if failed
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `email_events`
Append-only event log.
```sql
CREATE TABLE email_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id     UUID REFERENCES sends(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
              -- opened | clicked | bounced | complained | unsubscribed
  url         TEXT,               -- clicked URL (for click events)
  metadata    JSONB DEFAULT '{}', -- raw SES event payload for bounces/complaints
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Token strategy for tracking
Open and click URLs embed a short token that maps to a `send_id`. Tokens are generated at campaign dispatch time and stored in a `tracking_tokens` table:

```sql
CREATE TABLE tracking_tokens (
  token      TEXT PRIMARY KEY,   -- random 16-char URL-safe string
  send_id    UUID REFERENCES sends(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,      -- 'open' | 'click'
  url        TEXT,               -- destination URL (for click tokens)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Routes

All routes require authentication unless noted.

### Campaigns
```
GET    /api/campaigns              list all campaigns
POST   /api/campaigns              create draft campaign
GET    /api/campaigns/:id          get campaign details
PATCH  /api/campaigns/:id          update draft campaign
POST   /api/campaigns/:id/send     dispatch campaign immediately
POST   /api/campaigns/:id/schedule set scheduled_at datetime
DELETE /api/campaigns/:id          delete draft campaign
GET    /api/campaigns/:id/stats    open/click/bounce stats
```

### Contacts & Lists
```
GET    /api/contacts               list contacts (with pagination + filter)
POST   /api/contacts               create single contact
POST   /api/contacts/import        CSV bulk import
POST   /api/contacts/import-check  dry-run: which candidate emails already exist
POST   /api/contacts/validate      SES address validation for one import batch
PATCH  /api/contacts/:id           update contact
DELETE /api/contacts/:id           delete contact

GET    /api/lists                  list all lists
POST   /api/lists                  create list
POST   /api/lists/:id/contacts     add contacts to list
DELETE /api/lists/:id/contacts/:contactId  remove contact
```

### Templates
```
GET    /api/templates              list templates
POST   /api/templates              save template
GET    /api/templates/:id          get template
PATCH  /api/templates/:id          update template
DELETE /api/templates/:id          delete template
```

### Tracking (no auth required)
```
GET    /t/o/:token                 open pixel — returns GIF, records open event
GET    /t/c/:token                 click redirect — records click, redirects
GET    /t/u/:token                 unsubscribe — marks contact unsubscribed, shows confirmation page
```

### Webhooks (verified by SNS signature)
```
POST   /api/webhooks/ses           SES bounce/complaint events from SQS
```

---

## Email Sending Flow

1. User clicks **Send** or a cron job fires for a scheduled campaign.
2. Nitro route `POST /api/campaigns/:id/send` sets `status = 'sending'`, then enqueues a `campaign.dispatch` job in BullMQ.
3. The worker picks up the dispatch job:
   - Queries contacts in the campaign's list, applying `segment_rules` filters.
   - Generates tracking tokens for open and click events.
   - Creates a `sends` row per contact (`status = 'queued'`).
   - Replaces `<img>` pixel and `<a href>` tags in the campaign HTML with tracked URLs.
   - Enqueues one `email.send` job per contact.
4. Individual send jobs call the AWS SES SDK (`SendEmail`).
5. On success: updates `sends.status = 'sent'`, stores `ses_message_id`.
6. On failure: updates `sends.status = 'failed'`, stores error, BullMQ retries up to 3×.
7. After all jobs complete: updates `campaigns.status = 'sent'`, sets `sent_at`.

---

## Bounce & Complaint Flow

1. SES delivers bounce/complaint notification to the configured SNS topic.
2. SNS forwards the message to the SQS queue.
3. Nuxt server polls SQS (`server/plugins/sqs-poller.ts`) every 30 seconds, or SQS triggers the webhook endpoint directly.
4. The webhook handler:
   - Parses the SES notification payload.
   - Looks up the `send` by `ses_message_id`.
   - Updates `sends.status = 'bounced'` or `'complained'`.
   - Updates `contacts.status = 'bounced'` or `'complained'` (prevents future sends).
   - Inserts a row in `email_events`.

---

## Email Validation Flow (CSV import)

Amazon SES validates an address without sending to it — SESv2
`GetEmailAddressInsights` returns a HIGH/MEDIUM/LOW confidence for an overall
`IsValid` rollup plus six checks (syntax, DNS/MX, mailbox existence, role
address, disposable domain, random-string pattern).

1. In the import wizard's **Configure** step the operator picks a policy:
   `off` (**default** — don't call SES), `flag` (import risky addresses but mark
   them `email_unverified`), or `skip` (leave them out). Off is the default
   because the API bills **$0.01 per address** while account-wide Auto Validation
   (below) already screens the send path at $0.01 per *thousand*; the wizard
   shows the running cost of the loaded file before the operator opts in.
2. Moving to **Review** first resolves duplicates via `/api/contacts/import-check`
   — so a row that `duplicateStrategy: 'skip'` is about to discard is never paid
   for — then posts the remaining addresses to `/api/contacts/validate` in
   batches of 500.
3. That route serves the batch from the DB first: a contact whose
   `email_validated_at` is younger than 90 days re-uses its stored verdict
   instead of buying a new one. Fresh verdicts are written back onto contacts
   that already exist.
4. `shared/validation.ts#validationOutcome` grades each verdict
   (`clean` | `caution` | `risky`) and applies the policy. The wizard uses it to
   colour the Review table; `/api/contacts/import` calls the same function to
   re-derive `email_unverified` server-side rather than trusting the client.
5. Validated rows are stored with their verdict, so a flagged contact carries the
   reason it was flagged.

**Failure is never fatal.** No AWS credentials, `NUXT_SES_VALIDATION_DISABLED`,
an unsupported region, or SES throttling past its retries all resolve to "no
verdict", and a row with no verdict imports exactly as it would with validation
switched off. At most 5,000 addresses are validated per import
(`VALIDATION_MAX_PER_IMPORT`); the wizard says so when a file exceeds it.

Sending runs on SES v1 (`@aws-sdk/client-ses`), which has no insights operation,
so validation uses a separate SESv2 client (`server/utils/sesValidation.ts`).
IAM needs `ses:GetEmailAddressInsights` and `iam:CreateServiceLinkedRole`.

### Auto Validation (account-level, already enabled)

Separately from the import-time API, SES **Auto Validation** is enabled
account-wide in eu-central-1 with the SES-managed threshold
(`sesv2 get-account` → `SuppressionAttributes.ValidationAttributes`; change it
with `put-account-suppression-attributes`, which confusingly takes the field as
`ValidationOptions`). It screens every outbound recipient and blocks the ones
below the threshold.

A blocked recipient comes back through the normal bounce pipeline as
`bounceType=Permanent`, `bounceSubType=EmailValidationSuppressed`. That is a
prediction, not a mailbox rejection, so both bounce handlers special-case it:

- `sends.status = 'suppressed'` (not `'bounced'`), which keeps it out of the
  rolling bounce rate — matching SES, which excludes account-suppression-list
  sends from `Reputation.BounceRate`. Without this, our own dashboard would read
  worse than the number AWS judges the account on, and the 2% auto-pause guard
  in `shared/reputation.ts` could halt campaigns over phantom bounces.
- The contact is flagged `email_unverified` rather than `status='bounced'`:
  dispatch already skips unverified contacts, but the address stays reviewable
  instead of being written off as a dead mailbox.

Suppressed sends still consume send quota and are still billed the normal
message fee.

---

## Nuxt Configuration Notes

```ts
// nuxt.config.ts — key settings
export default defineNuxtConfig({
  modules: ['@nuxtjs/supabase', '@nuxt/ui'],
  supabase: {
    redirect: true,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/t/*', '/api/webhooks/*'],  // tracking + webhook routes are public
    },
  },
  runtimeConfig: {
    supabaseServiceKey: '',
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    sesFromEmail: '',
    sesFromName: '',
    sqsQueueUrl: '',
    redisUrl: '',
    public: {
      appUrl: '',
    },
  },
})
```

---

## Railway Configuration

`railway.toml` defines three services from the same repo:

```toml
[build]
builder = "nixpacks"

[[services]]
name = "web"
startCommand = "node .output/server/index.mjs"
healthcheckPath = "/api/health"

[[services]]
name = "worker"
startCommand = "node worker/index.js"

[[services]]
name = "redis"
plugin = "redis"
```

The `web` and `worker` services share environment variables defined in the Railway dashboard. `REDIS_URL` is injected automatically by the Railway Redis plugin.
