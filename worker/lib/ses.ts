import { randomUUID } from 'node:crypto'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

/**
 * Thin wrapper around SES `SendEmail`. Returns the SES message id on success;
 * throws on failure so the caller (BullMQ) can retry.
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

let client: SESClient | null = null
function getClient(): SESClient {
  if (!client) {
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS SES credentials/region are not configured.')
    }
    client = new SESClient({
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
}

export async function sendEmail(params: SendEmailParams): Promise<string> {
  const source = params.fromName
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail

  if (SES_DRY_RUN) {
    console.log(`[ses:dry-run] → ${params.to} | "${params.subject}"`)
    return `dry-run-${randomUUID()}`
  }

  const command = new SendEmailCommand({
    Source: source,
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: params.subject, Charset: 'UTF-8' },
      Body: { Html: { Data: params.html, Charset: 'UTF-8' } },
    },
  })

  const result = await getClient().send(command)
  if (!result.MessageId) {
    throw new Error('SES did not return a MessageId')
  }
  return result.MessageId
}
