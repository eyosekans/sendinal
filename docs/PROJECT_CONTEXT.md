# Project Context

## Overview

An internal bulk email marketing platform — a Mailchimp-equivalent built for in-house use. Enables the team to create, schedule, and send marketing campaigns via Amazon SES, then track opens and clicks through a custom analytics dashboard.

This is an **internal tool**: no public sign-up, no multi-tenancy, no billing logic. A small, authenticated team operates the platform.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Nuxt 4 + Vue 3 + TypeScript |
| UI Components | Tailwind CSS + Nuxt UI |
| Email Editor | @unlayer/vue (drag-and-drop) |
| Form Validation | VeeValidate + Zod |
| Charts | vue-chartjs (Chart.js wrapper) |
| Server | Nuxt Nitro (server routes) |
| Auth | Supabase Auth (@nuxtjs/supabase) |
| Database | Supabase PostgreSQL |
| File Storage | Supabase Storage |
| Job Queue | BullMQ + Redis |
| Email Sending | Amazon SES |
| Bounce Handling | AWS SNS → SQS → Nitro webhook |
| Deployment | Railway (web + worker + Redis) |

---

## External Services

### Amazon SES
- Primary email sending engine.
- Requires domain verification with DKIM/SPF records.
- Sending quota: starts at sandbox mode, must request production access.
- Bounce and complaint notifications are forwarded via SNS.

### AWS SNS + SQS
- SES publishes bounce and complaint events to an SNS topic.
- SNS forwards to an SQS queue.
- The Nuxt app polls or receives webhooks from SQS to update contact statuses.

### Supabase
- Hosted PostgreSQL database — no self-managed DB needed.
- Auth: handles user sessions, JWTs, and middleware.
- Storage: stores email template images and assets (replaces S3).
- Row-Level Security (RLS) enforced on all tables.

### Railway
- Hosts three services from the same monorepo:
  1. **web** — Nuxt 4 app (SSR + API)
  2. **worker** — BullMQ worker process (Node.js script)
  3. **redis** — Railway Redis add-on

---

## MVP Feature Scope

### In scope
- Campaign creation and scheduling
- Drag-and-drop email editor (Unlayer)
- Contact list management and CSV import
- Segmentation (filter by attributes and activity)
- Open tracking (1×1 transparent pixel via Nitro route)
- Click tracking (URL redirect proxy via Nitro route)
- Analytics dashboard (open rate, click rate, bounce rate)
- Unsubscribe handling
- Bounce and complaint processing

### Out of scope (explicitly)
- Public sign-up or self-service onboarding
- Multi-tenancy or per-user billing
- SMS, push notifications, or other channels
- Advanced automation (drip sequences, triggers)
- A/B testing (Phase 3, not MVP)
- White-labeling

---

## Key Architectural Decisions

### Why Nuxt 4 over Next.js
Team already knows Vue 3. Nitro provides a full server runtime (API routes, cron, middleware) within the same framework — no separate Express/Fastify needed.

### Why Supabase over raw PostgreSQL + Prisma + S3
Collapses three separate concerns (database, auth, file storage) into one managed service with a single SDK. Eliminates Prisma migrations, NextAuth config, and S3 bucket management.

### Why BullMQ as a separate Railway service
SES sending must be rate-limited and retried reliably. BullMQ with a dedicated worker process handles concurrency, retries, and backpressure independently of the web server. The worker runs as a plain Node.js process (`node worker/index.js`).

### Why Railway over AWS ECS
Simpler deploy pipeline for an internal tool. Git push triggers deployment. Redis is a first-class add-on. No ECS task definitions, load balancers, or VPC config to manage.

---

## Repository Structure

```
/
├── app/                    # Nuxt 4 app directory
│   ├── components/         # Vue components
│   ├── composables/        # Shared logic
│   ├── layouts/
│   ├── middleware/         # Auth middleware
│   └── pages/
├── server/
│   ├── api/                # Nitro API routes
│   │   ├── campaigns/
│   │   ├── contacts/
│   │   ├── lists/
│   │   └── tracking/
│   ├── middleware/         # Server middleware
│   └── plugins/            # Supabase server client
├── worker/
│   ├── index.js            # BullMQ worker entry point
│   ├── queues/             # Queue definitions
│   └── processors/         # Job processors (email send, etc.)
├── shared/
│   └── schemas/            # Zod schemas shared between app and worker
├── supabase/
│   └── migrations/         # SQL migration files
├── nuxt.config.ts
├── package.json
└── railway.toml            # Railway multi-service config
```

---

## Environment Variables

```bash
# Supabase
SUPABASE_URL=
SUPABASE_KEY=              # anon key (client)
SUPABASE_SERVICE_KEY=      # service role key (server only)

# Amazon SES
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
SES_FROM_EMAIL=            # verified sender address
SES_FROM_NAME=

# AWS SNS / SQS
SQS_QUEUE_URL=             # bounce/complaint queue

# Redis (Railway injects this automatically)
REDIS_URL=

# App
APP_URL=                   # public URL for tracking pixel/redirect links
```
