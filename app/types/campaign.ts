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
  html: string
  design: object
  status: CampaignStatus
  list_id: string | null
  listName: string | null
  segment_rules: unknown
  ab_variants: unknown
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

/** Aggregate metrics for the overview dashboard (GET /api/dashboard/stats). */
export interface DashboardStats {
  totalSent: number
  totalSentTrend: number | null
  activeContacts: number
  activeContactsTrend: number | null
  avgOpenRate: number | null
  avgClickRate: number | null
  sentCampaigns: number
  health: {
    delivered: number
    bounced: number
    complained: number
    deliverability: number | null
  }
  sendsOverTime: { date: string; count: number }[]
}

/** Delivery + engagement summary for a campaign (GET /api/campaigns/:id/stats). */
export interface CampaignStats {
  campaignId: string
  recipients: number
  counts: {
    queued: number
    sent: number
    failed: number
    bounced: number
    complained: number
    /** Unique sends with at least one open / click / unsubscribe. */
    opened: number
    clicked: number
    unsubscribed: number
  }
  rates: {
    delivered: number | null
    open: number | null
    click: number | null
    unsubscribe: number | null
    bounce: number | null
    complaint: number | null
    failed: number | null
  }
  /** Per-variant breakdown when the campaign is an A/B test (task 3.3). */
  abTest: CampaignAbTest | null
}

/** A/B test result: per-variant engagement with a winner by open rate. */
export interface CampaignAbTest {
  metric: 'open'
  variants: {
    label: string
    subject: string
    recipients: number
    opened: number
    clicked: number
    openRate: number | null
    clickRate: number | null
    winner: boolean
  }[]
}

/** Daily engagement series (GET /api/campaigns/:id/timeseries). */
export interface CampaignTimeseries {
  points: { date: string; opens: number; clicks: number }[]
}

/** Top clicked links (GET /api/campaigns/:id/links). */
export interface CampaignLink {
  url: string
  total: number
  unique: number
}

/** A row of individual send results (GET /api/campaigns/:id/activity). */
export interface CampaignActivityRow {
  sendId: string
  email: string
  status: string
  at: string | null
}
