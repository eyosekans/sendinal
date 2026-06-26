import type { Job } from 'bullmq'
import { Queue } from 'bullmq'
import {
  campaignDispatchJobSchema,
  QUEUE_NAMES,
} from '../../shared/schemas/jobs.ts'
import type { EmailSendJob } from '../../shared/schemas/jobs.ts'
import { segmentRulesSchema } from '../../shared/schemas/segment.ts'
import { matchesSegmentRules } from '../../shared/segments.ts'
import { connection } from '../queues/connection.ts'
import { supabase } from '../lib/supabase.ts'
import { finalizeCampaignIfComplete } from '../lib/sends.ts'
import {
  generateToken,
  injectOpenPixel,
  injectUnsubscribe,
  rewriteClickLinks,
} from '../lib/tracking.ts'

const MAX_ATTEMPTS = 3

/**
 * Fan-out processor: reads a campaign's recipients (list members that are
 * active and not deleted), creates one `sends` row per recipient, and enqueues
 * an `email.send` job for each.
 *
 * Per-send tracking: click links are rewritten to `/t/c/{token}` (2.4) and a
 * 1×1 open pixel `/t/o/{token}` is injected (2.3), with every token stored in
 * `tracking_tokens`. Unsubscribe (2.5) will extend this same injection.
 */
export async function processCampaignDispatch(job: Job) {
  const { campaignId } = campaignDispatchJobSchema.parse(job.data)
  console.log(`[campaign.dispatch] campaign ${campaignId}`)

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select(
      'id, subject, html, from_name, from_email, list_id, status, segment_rules',
    )
    .eq('id', campaignId)
    .single()
  if (cErr || !campaign) throw new Error(`campaign ${campaignId} not found`)
  if (!campaign.list_id) throw new Error(`campaign ${campaignId} has no list`)

  // Resolve recipients: list members that are still sendable.
  const { data: members, error: mErr } = await supabase
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', campaign.list_id)
  if (mErr) throw mErr

  const memberIds = (members ?? []).map((m) => m.contact_id)
  if (memberIds.length === 0) {
    await finalizeCampaignIfComplete(campaignId)
    console.log(`[campaign.dispatch] campaign ${campaignId}: no members`)
    return
  }

  const { data: sendable, error: ctErr } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, status, attributes')
    .in('id', memberIds)
    .eq('status', 'active')
    .eq('email_unverified', false)
    .is('deleted_at', null)
  if (ctErr) throw ctErr

  // Apply the campaign's segment rules (task 3.2) on top of the list. An empty
  // rule set matches everyone, so unsegmented campaigns target the whole list.
  const segment = segmentRulesSchema.safeParse(campaign.segment_rules ?? {})
  const segmentRules = segment.success ? segment.data.rules : []
  const contacts = (sendable ?? []).filter((c) =>
    matchesSegmentRules(c, segmentRules),
  )

  if (contacts.length === 0) {
    await finalizeCampaignIfComplete(campaignId)
    console.log(
      `[campaign.dispatch] campaign ${campaignId}: no eligible contacts`,
    )
    return
  }

  // Create all sends in one insert, then enqueue jobs in bulk.
  const { data: inserted, error: insErr } = await supabase
    .from('sends')
    .insert(
      contacts.map((c) => ({
        campaign_id: campaignId,
        contact_id: c.id,
        status: 'queued' as const,
      })),
    )
    .select('id, contact_id')
  if (insErr) throw insErr

  const emailByContact = new Map(contacts.map((c) => [c.id, c.email]))
  const sends = inserted ?? []

  // Tracking: per send, rewrite click links and inject an open pixel into a
  // personalised copy of the HTML, collecting every token to store. Needs a
  // public APP_URL for absolute links; without it we send plain HTML.
  const appUrl = (process.env.NUXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const htmlBySend = new Map<string, string>()
  type TokenRow = {
    token: string
    send_id: string
    type: 'open' | 'click' | 'unsubscribe'
    url?: string
  }
  const tokenRows: TokenRow[] = []
  if (appUrl) {
    for (const s of sends) {
      // 2.4 — rewrite every http(s) <a href> to a tracked redirect.
      const { html: clicked, links } = rewriteClickLinks(
        campaign.html,
        appUrl,
        generateToken,
      )
      for (const l of links)
        tokenRows.push({
          token: l.token,
          send_id: s.id,
          type: 'click',
          url: l.url,
        })
      // 2.5 — unsubscribe link (after click rewrite so it isn't /t/c-wrapped).
      const unsubToken = generateToken()
      tokenRows.push({ token: unsubToken, send_id: s.id, type: 'unsubscribe' })
      const withUnsub = injectUnsubscribe(clicked, `${appUrl}/t/u/${unsubToken}`)
      // 2.3 — inject the open pixel last.
      const openToken = generateToken()
      tokenRows.push({ token: openToken, send_id: s.id, type: 'open' })
      htmlBySend.set(s.id, injectOpenPixel(withUnsub, `${appUrl}/t/o/${openToken}`))
    }
    if (tokenRows.length) {
      const { error: tErr } = await supabase
        .from('tracking_tokens')
        .insert(tokenRows)
      if (tErr) throw tErr
    }
  } else {
    console.warn('[campaign.dispatch] NUXT_PUBLIC_APP_URL unset — no tracking')
  }

  const emailQueue = new Queue(QUEUE_NAMES.emailSend, { connection })
  try {
    const jobs = sends.map((s) => {
      const html = htmlBySend.get(s.id) ?? campaign.html
      const data: EmailSendJob = {
        sendId: s.id,
        campaignId,
        contactId: s.contact_id,
        to: emailByContact.get(s.contact_id)!,
        subject: campaign.subject,
        html,
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
      }
      return {
        name: 'send',
        data,
        opts: {
          attempts: MAX_ATTEMPTS,
          backoff: { type: 'exponential' as const, delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }
    })
    await emailQueue.addBulk(jobs)
  } finally {
    await emailQueue.close()
  }

  console.log(
    `[campaign.dispatch] campaign ${campaignId}: enqueued ${inserted?.length ?? 0} sends`,
  )
}
