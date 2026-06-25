import { randomUUID } from 'node:crypto'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * POST /api/uploads/image
 * Multipart image upload used by the Unlayer editor's image callback. Stores
 * the file in the public `template-assets` bucket and returns its CDN URL.
 * Restricted to image/* and 5 MB (also satisfies task 2.7).
 */
const MAX_BYTES = 5 * 1024 * 1024
const BUCKET = 'template-assets'

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const form = await readMultipartFormData(event)
  const file = form?.find((p) => p.name === 'file' || !!p.filename)
  if (!file || !file.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const type = file.type ?? ''
  if (!type.startsWith('image/')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Only image files are allowed',
    })
  }
  if (file.data.length > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Image exceeds the 5 MB limit',
    })
  }

  const ext = EXT_BY_TYPE[type] ?? file.filename?.split('.').pop() ?? 'bin'
  const path = `uploads/${randomUUID()}.${ext}`

  const supabase = await serverSupabaseClient<Database>(event)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.data, { contentType: type, upsert: false })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return { url: publicUrl }
})
