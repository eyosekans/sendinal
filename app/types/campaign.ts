import type { CampaignStatus } from './database.types'

/** A campaign row enriched with delivery metrics (GET /api/campaigns). */
export interface CampaignListItem {
  id: string
  name: string
  subject: string
  status: CampaignStatus
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  recipients: number
  openRate: number | null
  clickRate: number | null
}
