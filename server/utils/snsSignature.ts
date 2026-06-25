import { createVerify } from 'node:crypto'

/**
 * Verifies the authenticity of an Amazon SNS message (used by the HTTPS webhook
 * `POST /api/webhooks/ses`). SQS-delivered messages are trusted via the queue
 * access policy instead, so they skip this.
 *
 * Implements the documented SNS signature scheme natively (no extra dependency):
 *   1. the signing certificate URL must be an HTTPS Amazon SNS host,
 *   2. the canonical string-to-sign is rebuilt from a fixed field order,
 *   3. the RSA signature is verified against the public key in that cert.
 */

export interface SnsMessage {
  Type: string
  MessageId: string
  TopicArn?: string
  Subject?: string
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  // SubscriptionConfirmation / UnsubscribeConfirmation only:
  Token?: string
  SubscribeURL?: string
}

// Field order is part of the spec and differs by message type.
const SIGNABLE_KEYS: Record<string, string[]> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: [
    'Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type',
  ],
  UnsubscribeConfirmation: [
    'Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type',
  ],
}

const certCache = new Map<string, string>()

/** Only fetch signing certs from genuine SNS hosts over HTTPS. */
function isValidCertUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)
  )
}

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url)
  if (cached) return cached
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`failed to fetch SNS signing cert (${res.status})`)
  }
  const pem = await res.text()
  certCache.set(url, pem)
  return pem
}

function buildStringToSign(msg: SnsMessage): string {
  const keys = SIGNABLE_KEYS[msg.Type]
  if (!keys) throw new Error(`unsupported SNS message type: ${msg.Type}`)
  let out = ''
  for (const key of keys) {
    const value = (msg as unknown as Record<string, unknown>)[key]
    // Subject is optional; skip when absent (per the SNS spec).
    if (value === undefined || value === null) continue
    out += `${key}\n${value}\n`
  }
  return out
}

export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  if (!msg?.SigningCertURL || !isValidCertUrl(msg.SigningCertURL)) return false
  if (!msg.Signature) return false

  const algorithm = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1'
  const stringToSign = buildStringToSign(msg)
  const cert = await fetchCert(msg.SigningCertURL)

  try {
    return createVerify(algorithm)
      .update(stringToSign, 'utf8')
      .verify(cert, msg.Signature, 'base64')
  } catch {
    return false
  }
}
