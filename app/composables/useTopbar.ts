/**
 * Shared app-topbar state.
 *
 * The authenticated layout (`layouts/default.vue`) renders a single topbar
 * (search field + global actions) the same way it owns the sidebar — so the
 * bar isn't duplicated per page. Pages register their search placeholder and
 * read/write the live query through this composable instead of rendering their
 * own bar:
 *
 *   const { search, placeholder } = useTopbar()
 *   placeholder.value = 'Search campaigns…'   // shown in the layout input
 *   // `search` is the v-model the layout binds; pages filter off it.
 *
 * `useState` keeps the values SSR-safe and shared across the layout + page.
 */
export function useTopbar() {
  const search = useState<string>('topbar:search', () => '')
  const placeholder = useState<string>('topbar:placeholder', () => 'Search…')
  return { search, placeholder }
}
