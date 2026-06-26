<script setup lang="ts">
import type { List } from '~/types/list'

defineProps<{
  lists: List[]
  selectedListId: string | null
  totalCount: number
  loading?: boolean
}>()
const emit = defineEmits<{
  select: [listId: string | null]
  create: []
  edit: [list: List]
  remove: [list: List]
}>()

/** Compact count: 12400 → "12.4k". */
function fmtCount(n: number) {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
}
</script>

<template>
  <aside class="panel">
    <div class="panel__head">
      <h2 class="panel__title">Lists &amp; Segments</h2>
    </div>

    <div class="panel__scroll">
      <ul class="lists">
        <!-- All contacts -->
        <li>
          <button
            type="button"
            class="item"
            :class="{ 'item--active': selectedListId === null }"
            @click="emit('select', null)"
          >
            <span class="item__main">
              <i class="ph ph-users item__icon" />
              <span class="item__name">All Contacts</span>
            </span>
            <span class="item__count">{{ fmtCount(totalCount) }}</span>
          </button>
        </li>

        <!-- Lists -->
        <li v-for="l in lists" :key="l.id">
          <button
            type="button"
            class="item"
            :class="{ 'item--active': selectedListId === l.id }"
            @click="emit('select', l.id)"
          >
            <span class="item__main">
              <i class="ph ph-bookmark-simple item__icon" />
              <span class="item__name">{{ l.name }}</span>
            </span>
            <span class="item__right">
              <span class="item__actions">
                <span
                  class="act"
                  role="button"
                  tabindex="0"
                  aria-label="Edit list"
                  @click.stop="emit('edit', l)"
                  @keydown.enter.stop="emit('edit', l)"
                >
                  <i class="ph ph-pencil-simple" />
                </span>
                <span
                  class="act act--danger"
                  role="button"
                  tabindex="0"
                  aria-label="Delete list"
                  @click.stop="emit('remove', l)"
                  @keydown.enter.stop="emit('remove', l)"
                >
                  <i class="ph ph-trash" />
                </span>
              </span>
              <span class="item__count">{{ fmtCount(l.contactCount) }}</span>
            </span>
          </button>
        </li>

        <li v-if="!loading && lists.length === 0" class="empty">
          No lists yet. Create one to group your contacts.
        </li>
      </ul>

      <div class="panel__foot">
        <button type="button" class="create" @click="emit('create')">
          <i class="ph ph-plus" /> Create New List
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  width: 240px;
  flex: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid var(--gray-200);
}
.panel__head {
  flex: none;
  padding: 16px;
  border-bottom: 1px solid var(--gray-200);
}
.panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  color: var(--gray-800);
}
.panel__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
}
.lists {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--gray-600);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background-color 100ms ease;
}
.item:hover {
  background: var(--gray-50);
}
.item--active,
.item--active:hover {
  background: var(--primary-50);
  color: var(--primary-800);
}
.item__main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.item__icon {
  font-size: 18px;
  color: var(--gray-400);
  flex: none;
}
.item--active .item__icon {
  color: var(--primary-600);
}
.item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item--active .item__name {
  font-weight: 500;
}
.item__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.item__count {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.3px;
  color: var(--gray-400);
}
.item--active .item__count {
  color: var(--primary-600);
}
.item__actions {
  display: none;
  align-items: center;
  gap: 2px;
}
.item:hover .item__actions {
  display: flex;
}
.act {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--gray-500);
  cursor: pointer;
}
.act:hover {
  background: var(--gray-200);
  color: var(--gray-800);
}
.act--danger:hover {
  background: var(--danger-100);
  color: var(--danger-600);
}
.act .ph {
  font-size: 14px;
}
.empty {
  padding: 12px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--gray-400);
}
.panel__foot {
  margin-top: 16px;
  padding: 0 10px;
}
.create {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--gray-500);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 100ms ease;
}
.create:hover {
  color: var(--primary-600);
}
.create .ph {
  font-size: 16px;
}
</style>
