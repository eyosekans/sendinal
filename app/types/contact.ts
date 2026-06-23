import type { Database } from './database.types'

/** A contact row as returned by the API. */
export type Contact = Database['public']['Tables']['contacts']['Row']
