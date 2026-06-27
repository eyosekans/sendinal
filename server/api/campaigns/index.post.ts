import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { createCampaignSchema } from '#shared/schemas'

/**
 * POST /api/campaigns
 * Create a draft campaign. html/design are typically filled in later by the
 * Unlayer editor (Phase 2.1); from_name/from_email default to the configured
 * SES sender when omitted.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = createCampaignSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid campaign payload',
      data: parsed.error.flatten(),
    })
  }
  const body = parsed.data
  const config = useRuntimeConfig()

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: body.name,
      subject: body.subject,
      from_name: body.fromName ?? config.sesFromName ?? '',
      from_email: body.fromEmail ?? config.sesFromEmail ?? '',
      html: body.html,
      design: body.design as Json,
      list_id: body.listId ?? null,
      template_id: body.templateId ?? null,
      segment_rules: body.segmentRules as Json,
      ab_variants: body.abVariants as Json,
      status: 'draft',
    })
    .select()
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)
  return data
})
