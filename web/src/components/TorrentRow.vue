<script setup>
import { computed, ref } from 'vue'
import {
  AlertCircle,
  ChevronDown,
  FileArchive,
  FolderSearch,
  ListTree,
  LoaderCircle,
  Play,
} from 'lucide-vue-next'
import OpenWithMenu from './OpenWithMenu.vue'
import {
  formatBytes,
  formatDate,
  formatRelativeDate,
  sourceLabel,
} from '../lib/format.js'

const props = defineProps({
  torrent: { type: Object, required: true },
  parsed: { type: Object, default: null },
  parseState: { type: Object, default: null },
  tools: { type: Array, default: () => [] },
  defaultToolId: { type: String, default: 'system' },
  selected: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-details',
  'parse',
  'open',
  'reveal',
  'manage-tools',
])

const menuOpen = ref(false)
const menuAnchor = ref(null)

const loading = computed(() => Boolean(props.parseState?.loading))
const parseError = computed(() => props.parseState?.error || null)
const displayName = computed(() => props.parsed?.name || props.torrent.fileName)
const sourceName = computed(() => sourceLabel(props.torrent.source))

const defaultToolName = computed(
  () => props.tools.find((tool) => tool.id === props.defaultToolId)?.name || '系统默认应用',
)

const sizeMain = computed(() =>
  props.parsed ? formatBytes(props.parsed.totalSize) : formatBytes(props.torrent.size),
)

function openDetails() {
  emit('open-details', props.torrent)
}

function parse() {
  emit('parse', props.torrent)
}

function openDefault() {
  emit('open', { torrent: props.torrent, toolId: props.defaultToolId })
}

function toggleMenu(event) {
  menuAnchor.value = event.currentTarget.getBoundingClientRect()
  menuOpen.value = !menuOpen.value
}

function selectTool(toolId) {
  emit('open', { torrent: props.torrent, toolId })
}

function reveal() {
  emit('reveal', props.torrent)
}
</script>

<template>
  <div
    class="torrent-row"
    :class="{ selected, 'is-parsed': parsed }"
    @click="openDetails"
  >
    <button
      class="file-cell"
      type="button"
      :title="torrent.path"
      @click.stop="openDetails"
    >
      <span class="file-icon">
        <FileArchive :size="17" />
      </span>
      <span class="file-copy">
        <span class="file-title-line">
          <span class="file-name">{{ displayName }}</span>
          <span v-if="parsed" class="parsed-badge">已解析</span>
        </span>
        <span class="file-sub" :title="torrent.path">{{ torrent.path }}</span>
      </span>
    </button>

    <div class="size-cell">
      <span class="size-main">{{ sizeMain }}</span>
      <span class="size-sub">
        {{ parsed ? `种子 ${formatBytes(torrent.size)}` : '种子文件' }}
      </span>
    </div>

    <div class="source-cell">
      <span class="source-chip" :title="torrent.source">
        {{ sourceName }}
      </span>
    </div>

    <div class="date-cell">
      <span class="date-main">{{ formatDate(torrent.mtimeMs) }}</span>
      <span class="date-sub">{{ formatRelativeDate(torrent.mtimeMs) }}</span>
    </div>

    <div class="actions-cell" @click.stop>
      <button
        class="btn btn-sm parse-btn"
        :class="{ 'btn-soft': parsed }"
        type="button"
        :disabled="loading"
        :title="parseError || (parsed ? '重新解析种子内容' : '解析种子内容')"
        @click="parse"
      >
        <LoaderCircle v-if="loading" :size="13" class="spin" />
        <ListTree v-else :size="13" />
        <span>{{ loading ? '解析中' : parsed ? '重解析' : '解析' }}</span>
      </button>

      <div class="open-group">
        <button
          class="open-main"
          type="button"
          :title="`用 ${defaultToolName} 打开`"
          @click="openDefault"
        >
          <Play :size="12" fill="currentColor" />
          打开
        </button>
        <button
          class="open-caret"
          type="button"
          aria-label="选择其他打开方式"
          title="选择打开方式"
          @click.stop="toggleMenu"
        >
          <ChevronDown :size="13" />
        </button>
        <OpenWithMenu
          v-if="menuOpen"
          :tools="tools"
          :default-tool-id="defaultToolId"
          :anchor-rect="menuAnchor"
          @select="selectTool"
          @manage="emit('manage-tools')"
          @close="menuOpen = false"
        />
      </div>

      <button
        class="icon-btn folder-btn"
        type="button"
        title="在文件夹中显示"
        aria-label="在文件夹中显示"
        @click="reveal"
      >
        <FolderSearch :size="16" />
      </button>

      <span v-if="parseError" class="parse-error" :title="parseError">
        <AlertCircle :size="14" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.torrent-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 128px 118px 142px 258px;
  align-items: center;
  gap: 14px;
  min-height: 68px;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
  cursor: pointer;
  transition:
    background 140ms ease,
    box-shadow 140ms ease;
}

.torrent-row:hover {
  background: rgba(255, 255, 255, 0.024);
}

.torrent-row.selected {
  background: linear-gradient(90deg, rgba(45, 212, 191, 0.075), rgba(45, 212, 191, 0.015));
  box-shadow: inset 2px 0 0 var(--accent);
}

.file-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.file-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background:
    linear-gradient(145deg, rgba(167, 139, 250, 0.09), rgba(94, 234, 212, 0.05)),
    rgba(255, 255, 255, 0.02);
  color: var(--violet);
  transition:
    color 150ms ease,
    border-color 150ms ease;
}

.torrent-row:hover .file-icon {
  border-color: rgba(167, 139, 250, 0.25);
}

.torrent-row.is-parsed .file-icon {
  color: var(--accent);
  border-color: rgba(94, 234, 212, 0.2);
  background: var(--accent-soft);
}

.file-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.file-title-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.file-name {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 560;
  letter-spacing: 0.005em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parsed-badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid rgba(52, 211, 153, 0.2);
  border-radius: 4px;
  background: rgba(52, 211, 153, 0.09);
  color: #86efac;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.file-sub {
  overflow: hidden;
  color: var(--muted-2);
  font-size: 10.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size-cell,
.date-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.size-main {
  color: var(--text-soft);
  font-family: var(--mono);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}

.size-sub,
.date-sub {
  color: var(--muted-2);
  font-size: 9.5px;
  white-space: nowrap;
}

.date-main {
  color: var(--muted);
  font-size: 10.5px;
  white-space: nowrap;
}

.source-cell {
  min-width: 0;
}

.source-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  overflow: hidden;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.parse-btn {
  min-width: 74px;
  color: var(--muted);
}

.parse-btn:hover:not(:disabled) {
  color: var(--text);
}

.open-group {
  display: flex;
  height: 32px;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid rgba(94, 234, 212, 0.22);
  border-radius: 9px;
  background: var(--accent-soft);
}

.open-main {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: #a7f3d0;
  font-size: 11.5px;
  font-weight: 650;
  transition: background 140ms ease;
}

.open-main:hover {
  background: rgba(45, 212, 191, 0.13);
}

.open-caret {
  display: grid;
  width: 24px;
  place-items: center;
  border: 0;
  border-left: 1px solid rgba(94, 234, 212, 0.18);
  background: transparent;
  color: #6ee7d4;
}

.open-caret:hover {
  background: rgba(45, 212, 191, 0.13);
}

.folder-btn {
  width: 32px;
  height: 32px;
}

.parse-error {
  display: grid;
  width: 20px;
  place-items: center;
  color: var(--warning);
}

@media (max-width: 1280px) {
  .torrent-row {
    grid-template-columns: minmax(240px, 1fr) 118px 132px 248px;
  }

  .source-cell {
    display: none;
  }
}

@media (max-width: 900px) {
  .torrent-row {
    grid-template-columns: minmax(200px, 1fr) 108px 240px;
    gap: 10px;
  }

  .date-cell {
    display: none;
  }
}

@media (max-width: 720px) {
  .torrent-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 12px 13px;
  }

  .file-cell {
    grid-column: 1 / -1;
  }

  .size-cell {
    grid-column: 1;
    flex-direction: row;
    align-items: baseline;
    gap: 6px;
    padding-left: 47px;
  }

  .size-sub {
    display: none;
  }

  .source-cell,
  .date-cell {
    display: none;
  }

  .actions-cell {
    grid-column: 1 / -1;
    justify-content: flex-start;
    padding-left: 47px;
  }

  .parse-error {
    display: none;
  }
}
</style>
