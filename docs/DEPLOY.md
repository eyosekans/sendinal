# Deployment — Vercel (web) + Railway (worker + Redis)

Sendinal runs as three pieces:

| Piece | Host | What it is |
|---|---|---|
| **web** | **Vercel** | The Nuxt 4 app — SSR pages, API routes, tracking routes (`/t/*`), SES webhook. Serverless. |
| **worker** | **Railway** | `node worker/index.ts` — BullMQ consumers (`email.send`, `campaign.dispatch`) **plus** the scheduler and SQS bounce/complaint poller. Always-on. |
| **redis** | **Railway** | Redis add-on. The job queue between web (producer) and worker (consumer). |
| db / auth / storage | **Supabase** | Already hosted — nothing to deploy. |

> **Why the worker hosts the scheduler + SQS poller:** on Vercel the web app is
> serverless (no persistent process), so the old Nitro plugins that ran every 60s
> / long-polled SQS can't run there. That logic now lives in the always-on worker
> (`worker/lib/scheduler.ts`, `worker/lib/sqs-poller.ts`). The web app only
> *enqueues* jobs (`server/utils/queue.ts`).

---

## 0. Prerequisites

- **Supabase** project is live with all migrations applied (through
  `20260627000003_campaigns_add_template_id.sql`).
- **AWS** is wired per `docs/SES_SETUP.md`: domain verified, SNS topic + SQS queue
  subscribed, SES publishing bounce/complaint to SNS. ⚠️ **SES is still in the
  sandbox** (200/day, 1/s, only verified recipients) until AWS approves production
  access — the deploy works, but real sending is limited until then.
- GitHub repo connected to both Railway and Vercel.

---

## 1. Railway — Redis + worker

1. **New Project → Deploy from GitHub repo** (this repo). This creates the
   **worker** service; it reads the root `railway.toml` (single-service config:
   start command `node worker/index.ts`, build skipped). Railway config-as-code
   does **not** create Redis — add it next. If you set a Custom Start/Build
   Command in the dashboard, clear it so `railway.toml` is the single source.
2. **Add Redis**: in the project, **New → Database → Add Redis**. It injects
   `REDIS_URL` into the worker automatically (internal host
   `redis.railway.internal`).
3. **Enable Redis public networking** (Redis service → Settings → Networking →
   *Public Networking* / TCP proxy). Copy the **public** connection URL
   (`redis://default:<pass>@<proxy-host>:<port>`) — Vercel needs this (it can't
   reach the Railway-internal host).
4. **worker service env vars** (Settings → Variables):

   ```
   NUXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NUXT_SUPABASE_SECRET_KEY=<service-role key>
   NUXT_AWS_REGION=eu-central-1
   NUXT_AWS_ACCESS_KEY_ID=<...>
   NUXT_AWS_SECRET_ACCESS_KEY=<...>
   NUXT_SES_FROM_EMAIL=info@woomast.com
   NUXT_SES_FROM_NAME=Woomast
   NUXT_SQS_QUEUE_URL=https://sqs.eu-central-1.amazonaws.com/<acct>/sendinal-ses-events
   NUXT_PUBLIC_APP_URL=https://<your-vercel-domain>   # tracking links point at the web app
   NUXT_SES_RATE_LIMIT_PER_SECOND=14                  # optional; match your SES quota
   # REDIS_URL is injected by the Redis plugin — do NOT set it manually here.
   ```

   - `NUXT_PUBLIC_APP_URL` **must** be the Vercel domain: the worker injects open/
     click/unsubscribe links into the email HTML, and those routes (`/t/*`) live on
     the web app. Without it, emails are sent with no tracking.
   - Node ≥ 22 is required (native TS for `node worker/index.ts`); set it via a
     `NIXPACKS_NODE_VERSION=22` (or 24) variable if Railway picks an older default.

---

## 2. Vercel — the Nuxt web app

1. **Add New → Project → import this GitHub repo.** Vercel auto-detects Nuxt;
   Nitro builds with its `vercel` preset automatically (no config needed).
   - Build command: `nuxt build` (default). Install: `pnpm install`. Output: auto.
   - Node version: 22.x (Project → Settings → Node.js Version).
2. **Environment variables** (Project → Settings → Environment Variables):

   ```
   NUXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NUXT_PUBLIC_SUPABASE_KEY=<anon key>
   NUXT_SUPABASE_SECRET_KEY=<service-role key>      # used by SES webhook + tracking writes
   NUXT_PUBLIC_APP_URL=https://<your-vercel-domain> # same value as the worker
   NUXT_SES_FROM_EMAIL=info@woomast.com             # default campaign sender (REQUIRED)
   NUXT_SES_FROM_NAME=Woomast                       # default campaign sender name
   REDIS_URL=redis://default:<pass>@<proxy-host>:<port>   # Railway Redis PUBLIC proxy URL
   ```

   - `NUXT_SES_FROM_EMAIL` / `NUXT_SES_FROM_NAME` are **required on the web**:
     `POST /api/campaigns` stamps `from_email`/`from_name` from these when the
     builder doesn't specify a sender. If unset, campaigns are created with an
     empty `from_email` and every send fails worker-side validation
     ("fromEmail: Invalid email address").
   - The web still doesn't need the AWS **keys** (the worker sends + polls SQS),
     unless you switch bounce handling to the HTTPS webhook — see §4.
   - `REDIS_URL` here is the **public** Railway proxy URL from step 1.3, not the
     internal one.
3. Deploy. After the first deploy, set `NUXT_PUBLIC_APP_URL` (both Vercel **and**
   the Railway worker) to the real production domain, then redeploy both.

---

## 3. Wiring checklist

- [ ] Railway worker is **Active** and logs `[worker] started … [scheduler] started
      … [sqs-poller] started`.
- [ ] `NUXT_PUBLIC_APP_URL` is identical on Vercel and the worker, and is the live
      web domain.
- [ ] Vercel `REDIS_URL` = Railway Redis **public** proxy; worker `REDIS_URL` =
      Railway-injected internal URL.
- [ ] Supabase Auth → URL Configuration: add the Vercel domain to allowed redirect
      URLs so login works in production.

---

## 3b. Troubleshooting — campaign stuck in `sending`

A campaign flips to `sending` the moment the API claims it; everything after that
is the worker's job. If it never progresses, walk the chain in this order.

1. **Is the worker consuming?** Railway → worker service → Deployments → logs.
   A healthy boot prints `[worker] campaign.dispatch ready`, `[worker] email.send
   ready`, `[scheduler] started`, `[sqs-poller] started`, `[reputation] started`
   and `[recovery] started`. A dispatch logs `[campaign.dispatch] campaign <id>`.
2. **Did the job ever reach Redis?** With the Redis public proxy URL:
   `redis-cli -u "$REDIS_URL" keys 'bull:campaign.dispatch:*'`. No `:wait` /
   `:active` key and no dispatch log means the job was never enqueued — the web
   app could not reach Redis.
3. **⚠️ Does the Redis TCP proxy still exist?** Redis service → Settings →
   Networking → Public Networking. **Railway deletes the TCP proxy when a project
   is suspended (e.g. a failed payment) and does _not_ recreate it on
   reactivation.** Both services then show *Active* and the worker keeps working
   (it uses `redis.railway.internal`, unaffected), while Vercel's `REDIS_URL`
   points at a proxy host that no longer resolves. This was the root cause of the
   2026-11-24 outage. Fix: recreate public networking on the Redis service, then
   update `REDIS_URL` on Vercel to the **new** `host:port` (the port changes) and
   redeploy. The password (`REDIS_PASSWORD` on the Redis service) is unchanged.
4. **Is anything half-sent?** `sends` rows are inserted in one statement *before*
   any mail is queued, so a campaign with **zero** `sends` rows has reached no
   recipient at all and is always safe to re-send. A campaign with some
   `status='queued'` sends is mid-flight — never re-dispatch it blind, or those
   recipients get the mail twice.

**What recovers automatically** (so this failure can't wedge a campaign again):

- The web producer fails fast instead of hanging (bounded ioredis retries +
  command timeout), and an enqueue failure no longer discards the send: the
  campaign stays `sending` and the API returns `dispatch: "deferred"`.
- `worker/lib/dispatch-recovery.ts` sweeps every 60s and, from inside Railway's
  private network, re-dispatches any campaign that has been `sending` for >90s
  with zero `sends` rows — so a dead public proxy delays a send by about a
  minute instead of stalling it forever. It also finalizes campaigns whose sends
  all completed, and raises an in-app alert (rather than re-sending) when sends
  are still `queued`. Campaigns stuck for over 24h are left for a human.
- `campaign.dispatch` retries 3× with backoff; on terminal failure the campaign
  is marked `failed` with an in-app alert instead of sitting in `sending`.

---

## 4. Bounce / complaint handling

Default (no extra setup): SES → SNS → **SQS**, drained by the worker's poller
(`worker/lib/sqs-poller.ts`). The worker already has the AWS creds + queue URL.

Optional alternative: subscribe SNS **directly** to `https://<vercel-domain>/api/webhooks/ses`
(HTTPS subscription). That route verifies the SNS signature and is kept public. If
you use it, give Vercel the AWS env too and you can leave the SQS queue idle. Don't
run both for the same topic or you double-process (processing is idempotent, so it's
safe, just wasteful).

---

## 5. Post-deploy smoke test

1. Sign in on the Vercel domain.
2. Create a draft campaign, pick a small list of **SES-verified** addresses (sandbox).
3. Send → the web enqueues `campaign.dispatch` to Railway Redis → the worker logs
   the dispatch and `email.send` jobs → recipients receive mail.
4. Open the email / click a link → check the campaign analytics page for the
   open/click events (tracking routes on Vercel writing to Supabase).
5. Schedule a campaign 2 minutes out → the worker's scheduler dispatches it on time.

---

## Local development

`pnpm dev` runs the web app; `pnpm worker` runs the worker (scheduler + poller +
queues). Both need a local Redis (`brew services start redis`). The scheduler/poller
auto-disable without their env (`REDIS_URL`, AWS creds), or via
`NUXT_SCHEDULER_DISABLED=true` / `NUXT_SQS_POLLER_DISABLED=true`.
