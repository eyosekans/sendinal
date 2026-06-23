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

Create an IAM user (programmatic access) with a minimal policy — the app needs
to send mail and the worker (1.8) needs to read the bounce queue:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Send", "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" },
    { "Sid": "ReadBounceQueue", "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:<REGION>:<ACCOUNT_ID>:sendinal-ses-events" }
  ]
}
```

Put the access key into `.env` (see step 7).

---

## 2. Verify the sending domain (DKIM + SPF)

Console → **SES → Identities → Create identity → Domain**. Enter `<DOMAIN>`,
enable **Easy DKIM** (RSA 2048). SES gives you **3 CNAME records** — add them at
your DNS provider. Verification flips to "Verified" once DNS propagates.

Recommended for deliverability:
- **Custom MAIL FROM** (SES → identity → Custom MAIL FROM, e.g. `bounce.<DOMAIN>`)
  → add the **MX** and **SPF (TXT)** records SES shows.
- If not using a custom MAIL FROM, add SPF to the domain TXT:
  `v=spf1 include:amazonses.com ~all`

CLI to check status:

```bash
aws ses get-identity-verification-attributes --identities <DOMAIN> --region <REGION>
aws ses get-identity-dkim-attributes --identities <DOMAIN> --region <REGION>
```

Set `NUXT_SES_FROM_EMAIL` to an address on this domain (e.g. `hello@<DOMAIN>`).

---

## 3. Request production access (exit the sandbox)

In the sandbox you can only send to verified addresses and have a tiny quota.
Console → **SES → Account dashboard → Request production access**. Describe the
use case (internal marketing email, list hygiene, unsubscribe handling). Approval
is usually within 24h.

Check quota:

```bash
aws ses get-send-quota --region <REGION>
```

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

## What's automated vs manual

| Step | Who |
|---|---|
| SES SDK + `worker/lib/ses.ts` wrapper | ✅ done in code (1.7) |
| Domain verification (DKIM/SPF DNS) | manual — needs DNS access |
| Production access request | manual — AWS approval |
| SNS topic / SQS queue / subscription / policy | CLI (step 4–5) |
| SES → SNS bounce/complaint publishing | CLI (step 6) |
| Filling `.env` | manual (step 7) |
