import type { NotificationSeverity } from './database.types'

/** A single in-app alert row (GET /api/notifications, task 4.2). */
export interface NotificationItem {
  id: string
  type: string
  severity: NotificationSeverity
  title: string
  body: string
  campaign_id: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

/** Feed response: the user's recent notifications + their unread count. */
export interface NotificationsResponse {
  data: NotificationItem[]
  unread: number
}
