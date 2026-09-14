/**
 * Builds a PostgREST `.or()` filter matching `term` as a case-insensitive
 * substring of any of `columns`:
 *
 *   query.or(containsAnyFilter(['email', 'first_name', 'last_name'], term))
 *
 * The term is user input, so it is escaped twice: first for LIKE, so `%` and
 * `_` match themselves instead of acting as wildcards, then as a double-quoted
 * PostgREST value, so commas, dots and parentheses can't break out of the
 * condition and splice in another filter.
 */
export function containsAnyFilter(columns: string[], term: string): string {
  const like = term.replace(/[\\%_]/g, '\\$&')
  const value = `"%${like.replace(/[\\"]/g, '\\$&')}%"`
  return columns.map((c) => `${c}.ilike.${value}`).join(',')
}

/** Columns a contact search matches, shared by the listing and its counts. */
export const CONTACT_SEARCH_COLUMNS = ['email', 'first_name', 'last_name']
