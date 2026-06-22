import type { Job } from 'bullmq'
import { campaignDispatchJobSchema } from '../../shared/schemas/jobs.ts'

/**
 * Fan-out processor (Phase 1.7). Reads a campaign's recipients, generates
 * tracking tokens, creates `sends` rows, and enqueues one `email.send` job
 * per contact. Stubbed for the Phase 1.1 scaffold.
 */
export async function processCampaignDispatch(job: Job) {
  const data = campaignDispatchJobSchema.parse(job.data)
  console.log(`[campaign.dispatch] received campaign ${data.campaignId}`)
  // TODO(1.7): query recipients, create sends, enqueue email.send jobs.
}
