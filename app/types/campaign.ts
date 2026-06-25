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

/** Full campaign details (GET /api/campaigns/:id). */
export interface CampaignDetail {
  id: string
  name: string
  subject: string
  from_name: string
  from_email: string
  status: CampaignStatus
  list_id: string | null
  listName: string | null
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

/** Delivery summary for a campaign (GET /api/campaigns/:id/stats). */
export interface CampaignStats {
  campaignId: string
  recipients: number
  counts: {
    queued: number
    sent: number
    failed: number
    bounced: number
    complained: number
  }
  rates: {
    delivered: number | null
    bounce: number | null
    complaint: number | null
    failed: number | null
  }
}
