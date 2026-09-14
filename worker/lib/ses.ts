import { randomUUID } from 'node:crypto'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

/**
 * Thin wrapper around SESv2 `SendEmail`. Returns the SES message id on success;
 * throws on failure so the caller (BullMQ) can retry.
 *
 * SESv2 rather than v1: only v2's simple content accepts custom headers, which
 * the List-Unsubscribe pair (RFC 2369 / RFC 8058) needs. The message id,
 * identity-level bounce/complaint notifications and the IAM action
 * (`ses:SendEmail`) are the same for both APIs.
 *
 * Dry-run mode logs instead of sending and returns a fake id. It engages when
 * `NUXT_SES_DRY_RUN=true`, or automatically when no AWS credentials are
 * configured — so the send pipeline is fully testable before the SES setup in
 * task 1.4 is complete.
 */
const region = process.env.NUXT_AWS_REGION ?? process.env.AWS_REGION
const accessKeyId =
  process.env.NUXT_AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
const secretAccessKey =
  process.env.NUXT_AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY

export const SES_DRY_RUN =
  process.env.NUXT_SES_DRY_RUN === 'true' || !accessKeyId || !secretAccessKey

let client: SESv2Client | null = null
function getClient(): SESv2Client {
  if (!client) {
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS SES credentials/region are not configured.')
    }
    client = new SESv2Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  return client
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  fromName: string
  fromEmail: string
  /** When set, advertised as the one-click List-Unsubscribe target. */
  unsubscribeUrl?: string
}

/**
 * RFC 8058 one-click unsubscribe headers. Mailbox providers (Gmail, Yahoo, …)
 * show their own Unsubscribe button and, on the recipient's click, POST
 * `List-Unsubscribe=One-Click` to the URL — handled by POST /t/u/:token.
 */
export function listUnsubscribeHeaders(unsubscribeUrl: string | undefined) {
  if (!unsubscribeUrl) return []
  return [
    { Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` },
    { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
  ]
}

export async function sendEmail(params: SendEmailParams): Promise<string> {
  const from = params.fromName
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail
  const headers = listUnsubscribeHeaders(params.unsubscribeUrl)

  if (SES_DRY_RUN) {
    console.log(
      `[ses:dry-run] → ${params.to} | "${params.subject}"${headers.length ? ' | List-Unsubscribe' : ''}`,
    )
    return `dry-run-${randomUUID()}`
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [params.to] },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: params.html, Charset: 'UTF-8' } },
        ...(headers.length ? { Headers: headers } : {}),
      },
    },
  })

  const result = await getClient().send(command)
  if (!result.MessageId) {
    throw new Error('SES did not return a MessageId')
  }
  return result.MessageId
}
