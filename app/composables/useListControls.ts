/**
 * Shared search + pagination state for listing screens.
 *
 * Owns the debounced-search / page / page-size plumbing every list screen was
 * duplicating: bind `searchInput` to a text box (by default it IS the shared
 * topbar query from `useTopbar`), build the API query off the debounced
 * `search` + `page` + `pageSize`, and render `<ListPager>` with the same refs.
 *
 * Any search or page-size change resets `page` to 1 so the query stays
 * consistent with pagination. `pageSize` persists per screen via a cookie
 * (SSR-readable, so the first render already uses the remembered size).
 */

export const PAGE_SIZES = [10, 25, 50, 100]

interface ListControlsOptions {
  /**
   * Placeholder for the shared topbar search box. When set, `searchInput` is
   * the topbar query (and it is cleared on screen entry). Omit to get a
   * screen-local search ref instead (e.g. a panel-scoped search box).
   */
  topbarPlaceholder?: string
  /** Initial page size when no cookie is stored yet (default 25). */
  defaultPageSize?: number
  /** Debounce for search input → query, in ms (default 300). */
  debounceMs?: number
}

export function useListControls(key: string, opts: ListControlsOptions = {}) {
  const defaultPageSize = opts.defaultPageSize ?? 25

  let searchInput: Ref<string>
  if (opts.topbarPlaceholder !== undefined) {
    const topbar = useTopbar()
    topbar.placeholder.value = opts.topbarPlaceholder
    topbar.search.value = ''
    searchInput = topbar.search
  } else {
    searchInput = ref('')
  }

  /** Debounced + trimmed search term — use this in the API query. */
  const search = ref('')
  const page = ref(1)

  const pageSize = useCookie<number>(`sendinal-page-size-${key}`, {
    default: () => defaultPageSize,
    maxAge: 60 * 60 * 24 * 365,
  })
  if (!PAGE_SIZES.includes(pageSize.value)) pageSize.value = defaultPageSize

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(searchInput, (v) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      search.value = v.trim()
      page.value = 1
    }, opts.debounceMs ?? 300)
  })
  watch(pageSize, () => {
    page.value = 1
  })
  onScopeDispose(() => clearTimeout(timer))

  /** Clear the search box and the applied term immediately (no debounce). */
  function resetSearch() {
    clearTimeout(timer)
    searchInput.value = ''
    search.value = ''
    page.value = 1
  }

  return { searchInput, search, page, pageSize, pageSizes: PAGE_SIZES, resetSearch }
}
