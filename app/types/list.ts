import type { Database } from './database.types'
import type { AttributeField } from '#shared/schemas'

/**
 * A list as returned by GET /api/lists. The DB types `attribute_schema` as raw
 * `Json`, but it is always a validated array of field definitions on write, so
 * the client treats it as `AttributeField[]`.
 */
export type List = Omit<
  Database['public']['Tables']['lists']['Row'],
  'attribute_schema'
> & {
  attribute_schema: AttributeField[]
  contactCount: number
}

export type { AttributeField }
