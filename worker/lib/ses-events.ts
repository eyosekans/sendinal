import type { Json } from '../../app/types/database.types.ts'
import { supabase } from './supabase.ts'

/**
 * Worker-side SES bounce/complaint processor — the active path now that the SQS
 * poller runs in the worker (`worker/lib/sqs-poller.ts`).
 *
 * Mirrors `server/utils/sesEvents.ts` (the web webhook's copy for a direct SNS
 * HTTPS subscription); keep the two in sync. Each lives in its own runtime so it
 * can use that context's Supabase client without fragile cross-context imports.
 *
 * Idempotent: re-delivering the same notification is a no-op once the send is
 * already terminal. Bounce policy: only **Permanent** (hard) bounces suppress
 * the contact; Transient (soft) bounces are acked without any DB change.
 */

interface SesRecipient {
  emailAddress?: string
}

interface SesNotification {
  notificationType?: string
  eventType?: string
  mail?: { messageId?: string; destination?: string[] }
  bounce?: {
    bounceType?: string
    bounceSubType?: string
    bouncedRecipients?: SesRecipient[]
  }
  complaint?: {
    complainedRecipients?: SesRecipient[]
    complaintFeedbackType?: string
  }
}

export type SesEventResult =
  | { handled: false; reason: string }
  | {
      handled: true
      type: 'bounced' | 'complained'
      sendId: string
      deduped: boolean
    }
  | { handled: true; type: 'transient' | 'ignored'; reason: string }

/** Notification kind, tolerating both SES notification- and event-publishing shapes. */
function kindOf(n: SesNotification): string {
  return (n.notificationType ?? n.eventType ?? '').toLowerCase()
}

export async function processSesNotification(
  raw: unknown,
): Promise<SesEventResult> {
  const n = raw as SesNotification
  if (!n || typeof n !== 'object') {
    return { handled: false, reason: 'not an object' }
  }

  const kind = kindOf(n)

  // SES/SNS control + delivery-success notifications carry no action for us.
  if (kind !== 'bounce' && kind !== 'complaint') {
    return { handled: true, type: 'ignored', reason: kind || 'unknown' }
  }

  const messageId = n.mail?.messageId
  if (!messageId) {
    return { handled: false, reason: 'missing mail.messageId' }
  }

  // Soft bounces never suppress a contact — record nothing, just ack.
  if (kind === 'bounce' && n.bounce?.bounceType !== 'Permanent') {
    return {
      handled: true,
      type: 'transient',
      reason: `bounceType=${n.bounce?.bounceType ?? 'unknown'}`,
    }
  }

  const newStatus: 'bounced' | 'complained' =
    kind === 'bounce' ? 'bounced' : 'complained'

  // The SES messageId maps 1:1 to a send (one email per recipient).
  const { data: send, error: sErr } = await supabase
    .from('sends')
    .select('id, contact_id, status')
    .eq('ses_message_id', messageId)
    .maybeSingle()
  if (sErr) throw sErr
  if (!send) {
    return { handled: false, reason: `no send for messageId ${messageId}` }
  }

  // Already terminal for this reason → idempotent no-op (skip duplicate event).
  if (send.status === newStatus) {
    return { handled: true, type: newStatus, sendId: send.id, deduped: true }
  }

  const nowIso = new Date().toISOString()

  // 1) Mark the send.
  const { error: upSendErr } = await supabase
    .from('sends')
    .update({ status: newStatus })
    .eq('id', send.id)
  if (upSendErr) throw upSendErr

  // 2) Suppress the contact so future campaigns skip it.
  const { error: upContactErr } = await supabase
    .from('contacts')
    .update({ status: newStatus })
    .eq('id', send.contact_id)
  if (upContactErr) throw upContactErr

  // 3) Append the event with the raw SES payload for auditing.
  const { error: evErr } = await supabase.from('email_events').insert({
    send_id: send.id,
    type: newStatus,
    metadata: raw as Json,
    occurred_at: nowIso,
  })
  if (evErr) throw evErr

  return { handled: true, type: newStatus, sendId: send.id, deduped: false }
}

/**
 * Unwraps the SNS envelope (as delivered to SQS) and processes the inner SES
 * notification. Returns `{ handled: true, type: 'ignored' }` for control messages.
 */
export async function processSnsEnvelope(
  envelope: { Message?: string } | unknown,
): Promise<SesEventResult> {
  const env = envelope as { Message?: string }
  let inner: unknown = env
  if (env && typeof env.Message === 'string') {
    try {
      inner = JSON.parse(env.Message)
    } catch {
      return { handled: false, reason: 'SNS Message is not valid JSON' }
    }
  }
  return processSesNotification(inner)
}
