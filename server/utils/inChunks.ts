/**
 * Helper for Supabase/PostgREST `.in()` filters over a long value list.
 *
 * PostgREST serialises `.in('col', values)` into the **query string**, so a long
 * list overflows the request URL and the call fails with a bare `Bad Request`
 * (or a raw `TypeError: fetch failed`). Measured against this project: roughly
 * 350 UUIDs or 550 email addresses is the ceiling.
 *
 * Where the values are ids of rows in a related table, prefer filtering through
 * an inner join instead — only the parent id then travels in the URL:
 *
 *   .select('send_id, type, sends!inner(campaign_id)')
 *   .in('sends.campaign_id', campaignIds)
 *
 * Use this helper for the cases where there is nothing to join through — a
 * lookup keyed on a bare list of emails, say — and run the query once per chunk.
 */

/**
 * Values per `.in()` call. Well under the limit for both UUIDs and emails, and
 * small enough that a chunk is still a cheap indexed lookup.
 */
export const IN_CHUNK_SIZE = 200

/** Splits `items` into consecutive chunks of at most `size`. */
export function chunked<T>(items: T[], size = IN_CHUNK_SIZE): T[][] {
  if (items.length <= size) return items.length ? [items] : []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
