# Amazon SES Setup (Task 1.4)

This runbook covers the AWS-side setup for sending and for bounce/complaint
notifications. The **code** side is already done — `@aws-sdk/client-ses` is
installed and `worker/lib/ses.ts` wraps `SendEmail` with a dry-run fallback.
Until the steps below are complete the worker stays in **dry-run** (it logs
instead of sending), so the app is fully usable in development.

Substitute placeholders throughout:
`<REGION>` (e.g. `eu-central-1`), `<DOMAIN>` (e.g. `mail.sendinal.com`),
`<ACCOUNT_ID>`, `<TOPIC_ARN>`, `<QUEUE_URL>`, `<QUEUE_ARN>`.

The CLI commands assume the AWS CLI v2 is installed and configured
(`aws configure`) with an admin (or sufficiently-privileged) profile. Console
alternatives are noted where a step can't be scripted.

---

## 1. IAM credentials for the app

The app runs as a dedicated programmatic IAM user (`sendinal-ses`). This is the
policy currently attached — it covers one-time setup (steps 2–6), day-to-day
sending, bounce-queue consumption, and import-time address validation (step 9):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "SesSetupAndSend",
            "Effect": "Allow",
            "Action": [
                "ses:CreateEmailIdentity",
                "ses:GetEmailIdentity",
                "ses:PutEmailIdentityMailFromAttributes",
                "ses:VerifyDomainDkim",
                "ses:VerifyDomainIdentity",
                "ses:SetIdentityNotificationTopic",
                "ses:SetIdentityFeedbackForwardingEnabled",
                "ses:GetIdentityVerificationAttributes",
                "ses:GetIdentityDkimAttributes",
                "ses:GetSendQuota",
                "ses:GetAccount",
                "ses:GetEmailAddressInsights",
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        },
        {
            "Sid": "EmailValidationMetricsRole",
            "Effect": "Allow",
            "Action": "iam:CreateServiceLinkedRole",
            "Resource": "arn:aws:iam::*:role/aws-service-role/ses.amazonaws.com/AWSServiceRoleForAmazonSES*",
            "Condition": {
                "StringEquals": {
                    "iam:AWSServiceName": "ses.amazonaws.com"
                }
            }
        },
        {
            "Sid": "SnsSetup",
            "Effect": "Allow",
            "Action": [
                "sns:CreateTopic",
                "sns:Subscribe",
                "sns:GetTopicAttributes",
                "sns:ListTopics"
            ],
            "Resource": "*"
        },
        {
            "Sid": "SqsSetupAndConsume",
            "Effect": "Allow",
            "Action": [
                "sqs:CreateQueue",
                "sqs:GetQueueAttributes",
                "sqs:SetQueueAttributes",
                "sqs:GetQueueUrl",
                "sqs:ListQueues",
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage"
            ],
            "Resource": "*"
        }
    ]
}
```

Notes on two entries that aren't obvious:

- **`ses:GetEmailAddressInsights`** backs the Email Validation API (step 9).
  Without it the wizard's validation option returns "unavailable" and imports
  proceed unvalidated — it degrades, it doesn't break.
- **`iam:CreateServiceLinkedRole`** lets SES create
  [`AWSServiceRoleForAmazonSES`](https://docs.aws.amazon.com/ses/latest/dg/using-service-linked-roles.html),
  which publishes SES's CloudWatch metrics. AWS documents this with
  `"Resource": "*"`, which would let this user create a service-linked role for
  *any* AWS service; it is scoped to the SES role here instead. The role is
  created automatically on first use and almost certainly already exists on this
  account, so the permission is rarely exercised.

**Tightening option:** the `Create*`/`Set*`/`Verify*` actions are only needed for
the one-time setup in steps 2–6. A long-lived application credential doesn't
need them afterwards — the running app only uses `ses:SendEmail`,
`ses:GetAccount`, `ses:GetSendQuota`, `ses:GetEmailAddressInsights`,
`sqs:GetQueueUrl`, `sqs:ReceiveMessage` and `sqs:DeleteMessage`. Consider doing
setup with an admin profile and trimming this policy to that shorter list.

Put the access key into `.env` (see step 7).

---

## 2. Verify the sending domain (DKIM + SPF)

Console → **SES → Identities → Create identity → Domain**. Enter `<DOMAIN>`,
enable **Easy DKIM** (RSA 2048). SES gives you **3 CNAME records** — add them at
your DNS provider. Verification flips to "Verified" once DNS propagates.

⚠️ If your DNS is behind Cloudflare, the three CNAMEs must be **DNS only**
(grey cloud, `cf-proxied:false`). Proxying them makes Cloudflare answer with its
own IPs, the CNAME chain breaks, and DKIM never verifies.

Recommended for deliverability:
- **Custom MAIL FROM** (SES → identity → Custom MAIL FROM, e.g. `bounce.<DOMAIN>`)
  → add the **MX** and **SPF (TXT)** records SES shows. This is what gets SPF
  *aligned* with your From domain: SPF authenticates the envelope sender
  (Return-Path), not the `From:` header, so it only covers you when the envelope
  domain is yours.
- Without a custom MAIL FROM, SES uses its own `*.amazonses.com` envelope, SPF is
  evaluated against **that** domain, and your domain's SPF record is never
  consulted for these messages — DKIM is then the only thing authenticating them.
  Adding `v=spf1 include:amazonses.com ~all` to the domain TXT is harmless but
  does not change that; it matters only if something else sends with your domain
  as the envelope.
- Under a DMARC policy of `p=quarantine` or `p=reject` this is load-bearing: DMARC
  needs SPF *or* DKIM to pass **with alignment**. With no custom MAIL FROM, that
  is DKIM alone — so a DKIM lapse doesn't merely leave mail unauthenticated, it
  sends every message to quarantine.

CLI to check status:

```bash
aws ses get-identity-verification-attributes --identities <DOMAIN> --region <REGION>
aws ses get-identity-dkim-attributes --identities <DOMAIN> --region <REGION>
```

Set `NUXT_SES_FROM_EMAIL` to an address on this domain (e.g. `hello@<DOMAIN>`).

### 2b. Recovering a lost verification (`DkimStatus: FAILED`)

Verification is not permanent: SES re-checks the CNAMEs, and if they disappear
(a DNS migration that drops them, say) it **revokes** the identity. Every send
then fails with:

```
MessageRejected: Email address is not verified. The following identities failed
the check in region EU-CENTRAL-1: <Name> <you@domain>
```

The tell is *which* identity the message names: the **From** address means a
revoked sender identity, whereas the sandbox error names the **recipients**.
This happened on 2026-11-24 — the records had vanished from `woomast.com`.

To recover:

1. Re-add the three CNAMEs. **The tokens survive revocation**, so read them back
   with SESv2 `GetEmailIdentity` → `DkimAttributes.Tokens` and re-add the *same*
   records. ⚠️ Do **not** delete and re-create the identity — that issues new
   tokens and you start over.
2. Wait. The zone's negative-cache TTL (SOA minimum; 30 min on this domain) can
   keep SES's resolver convinced the records don't exist. On 2026-11-24 the
   status flipped back to `SUCCESS` on its own ~18 minutes after the records went
   in, with no console action.
3. If it stays `FAILED`, force a re-check in the **console** (SES → identity →
   DKIM → Edit → toggle DKIM signatures off, save, on, save). This keeps the
   tokens. It cannot be scripted with the app's credentials: the `sendinal-ses`
   policy above grants neither `ses:PutEmailIdentityDkimAttributes` nor
   `ses:ListEmailIdentities`, so look identities up by name with
   `GetEmailIdentity` and do the toggle as an admin.

A `MailFromDomainStatus: FAILED` on its own does **not** block sending while
`BehaviorOnMxFailure` is `USE_DEFAULT_VALUE` (SES falls back to its own envelope
domain) — but it does cost you SPF alignment, which matters under DMARC as
described above.

---

## 3. Request production access (exit the sandbox)

> **Status: done.** Production access is granted on this account —
> `ProductionAccessEnabled: true`, quota 50,000/day at 14 msg/s (which is where
> `DEFAULT_SES_RATE_PER_SECOND = 14` in `shared/sending.ts` comes from).

In the sandbox you can only send to verified addresses and have a tiny quota.
Console → **SES → Account dashboard → Request production access**. Describe the
use case (internal marketing email, list hygiene, unsubscribe handling). Approval
is usually within 24h.

Check quota and account state:

```bash
aws sesv2 get-account --region <REGION>
```

**Read `ProductionAccessEnabled`, not `Details.ReviewDetails.Status`.**
`ReviewDetails` still shows an earlier request that was **DENIED** (case
`178237775600207`); it is stale history and does not reflect the current state.

---

## 4. Create the SNS topic for bounce/complaint events

```bash
aws sns create-topic --name sendinal-ses-events --region <REGION>
# → note the returned TopicArn as <TOPIC_ARN>
```

---

## 5. Create the SQS queue and subscribe it to the topic

```bash
# create queue
aws sqs create-queue --queue-name sendinal-ses-events --region <REGION>
# → <QUEUE_URL>

# get its ARN
aws sqs get-queue-attributes --queue-url <QUEUE_URL> \
  --attribute-names QueueArn --region <REGION>
# → <QUEUE_ARN>
```

Allow the SNS topic to deliver to the queue (save as `sqs-policy.json`, then
apply):

```json
{
  "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"<QUEUE_ARN>\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"<TOPIC_ARN>\"}}}]}"
}
```

```bash
aws sqs set-queue-attributes --queue-url <QUEUE_URL> \
  --attributes file://sqs-policy.json --region <REGION>

# subscribe (RawMessageDelivery=false keeps the SNS envelope; the 1.8
# webhook/poller verifies the SNS signature and unwraps the SES message)
aws sns subscribe --topic-arn <TOPIC_ARN> --protocol sqs \
  --notification-endpoint <QUEUE_ARN> --region <REGION>
```

Set `NUXT_SQS_QUEUE_URL` to `<QUEUE_URL>`.

---

## 6. Tell SES to publish bounces + complaints to the topic

Simplest path — identity notification topics (classic SES API):

```bash
aws ses set-identity-notification-topic --identity <DOMAIN> \
  --notification-type Bounce --sns-topic <TOPIC_ARN> --region <REGION>
aws ses set-identity-notification-topic --identity <DOMAIN> \
  --notification-type Complaint --sns-topic <TOPIC_ARN> --region <REGION>

# stop SES from also emailing bounces to the From address now that SNS handles them
aws ses set-identity-feedback-forwarding --identity <DOMAIN> \
  --forwarding-enabled false --region <REGION>
```

(Alternative: a SES **Configuration Set** with an SNS event destination for
`bounce` + `complaint`, then send with `ConfigurationSetName`. The identity
approach above needs no code change.)

---

## 7. Fill `.env` and leave dry-run

```bash
NUXT_AWS_REGION=<REGION>
NUXT_AWS_ACCESS_KEY_ID=<from step 1>
NUXT_AWS_SECRET_ACCESS_KEY=<from step 1>
NUXT_SES_FROM_EMAIL=hello@<DOMAIN>     # must be on the verified domain
NUXT_SES_FROM_NAME=Sendinal
NUXT_SQS_QUEUE_URL=<QUEUE_URL>
# NUXT_SES_DRY_RUN — leave unset/false for live sending
```

`worker/lib/ses.ts` auto-detects credentials: with the AWS keys present (and
`NUXT_SES_DRY_RUN` unset) it sends for real; without them it stays in dry-run.

---

## 8. Verify end-to-end

1. Restart the worker: `node --env-file=.env worker/index.ts` — the startup log
   should say `SES live` (not `DRY-RUN`).
2. Send a campaign to a small list of verified addresses (or any address, once
   in production). Confirm `sends.ses_message_id` is populated and the email
   arrives.
3. Bounce/complaint delivery is consumed in **task 1.8** (`/api/webhooks/ses` +
   the SQS poller). To pre-check the pipe, use SES simulator addresses:
   - `bounce@simulator.amazonses.com`
   - `complaint@simulator.amazonses.com`
   and confirm a message lands on the SQS queue
   (`aws sqs receive-message --queue-url <QUEUE_URL> --region <REGION>`).

---

## 9. Email Validation

SES can check an address without sending to it. Two independent features, with
very different price tags:

| | What it does | Price | State |
|---|---|---|---|
| **Email Validation API** | `GetEmailAddressInsights` — on-demand check, used by the CSV import wizard | **$0.01 per address** | opt-in per import, **off by default** |
| **Auto Validation** | Screens every outbound recipient at send time | **$0.01 per 1,000** | **enabled account-wide**, SES-managed threshold |

### API validation (import wizard)

Needs `ses:GetEmailAddressInsights` — already in the step-1 policy. Verify:

```bash
aws sesv2 get-email-address-insights \
  --email-address someone@example.com --region <REGION>
```

A `MailboxValidation` object back means the wizard's validation option is live.
`AccessDeniedException` means the policy hasn't been applied yet.

It is off by default in the wizard because at $0.01 per address a routine 3,000-
row CSV would cost $30, while Auto Validation already guards the send path for a
thousandth of that. Results are cached on the contact for 90 days and capped at
5,000 addresses per import. `NUXT_SES_VALIDATION_DISABLED=true` switches the
feature off entirely; it also self-disables when AWS credentials are absent.

### Auto Validation (account-wide)

Already enabled with the SES-managed threshold. Inspect it under
`SuppressionAttributes.ValidationAttributes` in `aws sesv2 get-account`.

To change the threshold (`MANAGED` | `HIGH` | `MEDIUM`, or disable):

```bash
aws sesv2 put-account-suppression-attributes --region <REGION> \
  --cli-input-json file://auto-validation.json
```

```json
{
  "SuppressedReasons": ["BOUNCE", "COMPLAINT"],
  "ValidationOptions": {
    "ConditionThreshold": {
      "ConditionThresholdEnabled": "ENABLED",
      "OverallConfidenceThreshold": { "Verdict": "MANAGED" }
    }
  }
}
```

Mind the asymmetry: the **write** field is `ValidationOptions`, but `get-account`
returns it as `ValidationAttributes`. The setting is **per-region**, and a
configuration set can override it (`put-configuration-set-suppression-options`).

**How a suppression reaches the app.** A blocked recipient comes back through
the ordinary bounce pipeline as `bounceType=Permanent`,
`bounceSubType=EmailValidationSuppressed`. That is a prediction, not a mailbox
rejection, so both bounce handlers (`worker/lib/ses-events.ts` and
`server/utils/sesEvents.ts`) special-case it:

- the send is recorded as `status='suppressed'`, not `'bounced'`, keeping it out
  of the rolling bounce rate — which matches SES, since it excludes
  account-suppression-list sends from `Reputation.BounceRate`. Counting them
  would make our dashboard read worse than the number AWS judges us on, and
  could trip the 2% auto-pause guard in `shared/reputation.ts` over phantom
  bounces;
- the contact is flagged `email_unverified` instead of `status='bounced'`, so
  dispatch skips it but it stays reviewable rather than written off.

Suppressed sends still consume send quota and are still billed the normal
message fee, on top of the validation fee.

The **Email Validation Dashboard** (SES console → Email Validation) shows
validation volume broken down by confidence level.

---

## What's automated vs manual

| Step | Who |
|---|---|
| SES SDK + `worker/lib/ses.ts` wrapper | ✅ done in code (1.7) |
| Domain verification (DKIM/SPF DNS) | manual — needs DNS access |
| Production access request | ✅ granted |
| IAM policy for `ses:GetEmailAddressInsights` | manual — admin profile (step 1) |
| Auto Validation threshold | ✅ enabled, SES-managed (step 9) |
| SNS topic / SQS queue / subscription / policy | CLI (step 4–5) |
| SES → SNS bounce/complaint publishing | CLI (step 6) |
| Filling `.env` | manual (step 7) |
