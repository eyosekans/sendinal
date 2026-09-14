/**
 * Reads every row of a Supabase/PostgREST select, page by page.
 *
 * A plain select stops silently at PostgREST's max-rows (1000 on this project):
 * no error, no flag, just a short result. Anything that tallies rows in-app —
 * per-campaign events, say — then under-counts as soon as the table outgrows a
 * thousand matching rows. Build the query in `page` and give it a stable
 * `.order()` (a unique column) so pages neither overlap nor skip:
 *
 *   const events = await fetchAllRows((from, to) =>
 *     supabase.from('email_events').select('send_id, type')
 *       .eq('type', 'clicked').order('id').range(from, to))
 */
export const FETCH_PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await page(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    rows.push(...(data ?? []))
    if (!data || data.length < FETCH_PAGE_SIZE) return rows
  }
}
