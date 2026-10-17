<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  Home,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Search,
  X,
} from 'lucide-vue-next'
import { api } from '../lib/api.js'
import { driveTypeLabel, formatBytes } from '../lib/format.js'

const props = defineProps({
  initialPath: { type: String, default: '' },
  drives: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'select'])

const currentPath = ref('')
const parentPath = ref(null)
const breadcrumbs = ref([])
const entries = ref([])
const total = ref(0)
const truncated = ref(false)
const quickLocations = ref([])
const loading = ref(true)
const error = ref('')
const query = ref('')
const showHidden = ref(false)
const pathDraft = ref('')
const breadcrumbsEl = ref(null)
const pathInput = ref(null)
const searchInput = ref(null)

let requestSequence = 0
let alive = true

const quickIcons = {
  home: Home,
  desktop: Monitor,
  downloads: Download,
  documents: FileText,
}

const visibleEntries = computed(() =>
  showHidden.value ? entries.value : entries.value.filter((entry) => !entry.hidden),
)

const filteredEntries = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return visibleEntries.value
  return visibleEntries.value.filter((entry) => entry.name.toLowerCase().includes(keyword))
})

const isRoot = computed(() => !parentPath.value)
const canConfirm = computed(() => Boolean(currentPath.value) && !loading.value)
const hasHiddenEntries = computed(() => entries.value.some((entry) => entry.hidden))
const entryLabel = computed(() => {
  if (query.value.trim()) {
    return `${filteredEntries.value.length} / ${visibleEntries.value.length} 个文件夹`
  }
  return `${visibleEntries.value.length} 个文件夹`
})

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isInside(basePath) {
  const base = normalizePath(basePath)
  const target = normalizePath(currentPath.value)
  if (!base) return false
  return target === base || target.startsWith(`${base}/`)
}

function isQuickActive(location) {
  return normalizePath(currentPath.value) === normalizePath(location.path)
}

function isDriveActive(drive) {
  return isInside(drive.root)
}

function quickIcon(location) {
  return quickIcons[location.icon] || Folder
}

function normalizeInput(value) {
  const text = String(value || '').trim()
  return /^[a-zA-Z]:$/.test(text) ? `${text}\\` : text
}

async function navigate(target, options = {}) {
  const requestedPath = normalizeInput(target)
  if (!requestedPath) return false

  const id = ++requestSequence
  loading.value = true
  error.value = ''

  try {
    const data = await api.listDirectory(requestedPath)
    if (!alive || id !== requestSequence) return false

    currentPath.value = data.path
    parentPath.value = data.parent
    breadcrumbs.value = Array.isArray(data.breadcrumbs) ? data.breadcrumbs : []
    entries.value = Array.isArray(data.entries) ? data.entries : []
    total.value = Number(data.total) || entries.value.length
    truncated.value = Boolean(data.truncated)
    pathDraft.value = data.path
    if (options.resetQuery !== false) query.value = ''

    await nextTick()
    if (breadcrumbsEl.value) {
      breadcrumbsEl.value.scrollLeft = breadcrumbsEl.value.scrollWidth
    }
    return true
  } catch (err) {
    if (!alive || id !== requestSequence) return false
    error.value = err.message || '无法打开该文件夹'
    if (currentPath.value) pathDraft.value = currentPath.value
    return false
  } finally {
    if (id === requestSequence) loading.value = false
  }
}

function goToDraft() {
  if (!pathDraft.value.trim() || loading.value) return
  navigate(pathDraft.value)
}

function goUp() {
  if (parentPath.value) navigate(parentPath.value)
}

function refresh() {
  if (!currentPath.value || loading.value) return
  navigate(currentPath.value)
}

function choose() {
  if (!canConfirm.value) return
  emit('select', currentPath.value)
}

function clearQuery() {
  query.value = ''
  searchInput.value?.focus()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    pathInput.value?.focus()
    pathInput.value?.select()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)

  try {
    const payload = await api.getQuickLocations()
    if (alive) quickLocations.value = Array.isArray(payload.locations) ? payload.locations : []
  } catch {
    // Quick locations are optional; the drives list still works.
  }

  if (!alive) return

  const preferredLocation =
    quickLocations.value.find((location) => location.id === 'downloads') ||
    quickLocations.value[0]

  const candidates = [
    props.initialPath,
    preferredLocation?.path,
    props.drives[0]?.root,
  ].filter(Boolean)

  const uniqueCandidates = [...new Set(candidates.map((item) => item.toLowerCase()))]
  let opened = false

  for (const key of uniqueCandidates) {
    const candidate = candidates.find((item) => item.toLowerCase() === key)
    if (candidate && (await navigate(candidate))) {
      opened = true
      break
    }
  }

  if (!opened) {
    loading.value = false
    error.value = '无法打开起始文件夹，请直接输入绝对路径。'
  }
})

onBeforeUnmount(() => {
  alive = false
  requestSequence += 1
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="picker">
      <div class="picker-layer" @mousedown.self="emit('close')">
        <div class="picker-card" role="dialog" aria-modal="true" aria-labelledby="folder-picker-title">
          <header class="picker-header">
            <div class="header-icon"><FolderOpen :size="21" /></div>
            <div class="header-copy">
              <h2 id="folder-picker-title">选择扫描文件夹</h2>
              <p>浏览并选择一个文件夹，扫描其中及子目录里的 .torrent 文件</p>
            </div>
            <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">
              <X :size="18" />
            </button>
          </header>

          <div class="picker-body">
            <aside class="picker-sidebar scroll-thin">
              <section v-if="quickLocations.length" class="sidebar-section">
                <div class="section-heading">快速访问</div>
                <div class="sidebar-list">
                  <button
                    v-for="location in quickLocations"
                    :key="location.id"
                    class="location-btn"
                    :class="{ active: isQuickActive(location) }"
                    type="button"
                    :title="location.path"
                    @click="navigate(location.path)"
                  >
                    <component :is="quickIcon(location)" :size="15" />
                    <span>{{ location.name }}</span>
                  </button>
                </div>
              </section>

              <section v-if="drives.length" class="sidebar-section">
                <div class="section-heading">磁盘</div>
                <div class="sidebar-list">
                  <button
                    v-for="drive in drives"
                    :key="drive.root"
                    class="location-btn drive-btn"
                    :class="{ active: isDriveActive(drive) }"
                    type="button"
                    :title="`${drive.root} · ${driveTypeLabel(drive.type)}`"
                    @click="navigate(drive.root)"
                  >
                    <HardDrive :size="15" />
                    <span class="drive-copy">
                      <span>{{ drive.name }}</span>
                      <small>{{ drive.label || driveTypeLabel(drive.type) }}</small>
                    </span>
                    <span v-if="drive.freeSpace !== null" class="drive-free">
                      {{ formatBytes(drive.freeSpace) }}
                    </span>
                  </button>
                </div>
              </section>
            </aside>

            <section class="picker-main">
              <div class="picker-toolbar">
                <button
                  class="icon-btn nav-btn"
                  type="button"
                  title="上一级"
                  aria-label="上一级"
                  :disabled="isRoot || loading"
                  @click="goUp"
                >
                  <ArrowUp :size="17" />
                </button>

                <div ref="breadcrumbsEl" class="breadcrumbs scroll-thin">
                  <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
                    <ChevronRight v-if="index > 0" :size="12" class="crumb-separator" />
                    <button
                      class="crumb"
                      :class="{ current: index === breadcrumbs.length - 1 }"
                      type="button"
                      :title="crumb.path"
                      @click="navigate(crumb.path)"
                    >
                      {{ crumb.name }}
                    </button>
                  </template>
                </div>

                <button
                  class="icon-btn nav-btn"
                  type="button"
                  title="刷新"
                  aria-label="刷新"
                  :disabled="loading || !currentPath"
                  @click="refresh"
                >
                  <RefreshCw :size="15" :class="{ spin: loading }" />
                </button>
              </div>

              <div class="path-row">
                <div class="field path-field">
                  <FolderTree :size="14" />
                  <input
                    ref="pathInput"
                    v-model="pathDraft"
                    type="text"
                    spellcheck="false"
                    autocomplete="off"
                    aria-label="文件夹路径"
                    placeholder="输入绝对路径，例如 D:\Downloads"
                    @keydown.enter.prevent="goToDraft"
                  />
                  <kbd class="kbd">Ctrl L</kbd>
                </div>
                <button class="btn btn-sm go-btn" type="button" :disabled="!pathDraft.trim() || loading" @click="goToDraft">
                  转到
                </button>
              </div>

              <div class="search-row">
                <div class="field search-field">
                  <Search :size="14" />
                  <input
                    ref="searchInput"
                    v-model="query"
                    type="text"
                    spellcheck="false"
                    placeholder="筛选当前文件夹…"
                    aria-label="筛选当前文件夹"
                  />
                  <button
                    v-if="query"
                    class="clear-search"
                    type="button"
                    aria-label="清空筛选"
                    @click="clearQuery"
                  >
                    <X :size="13" />
                  </button>
                </div>
                <button
                  class="hidden-toggle"
                  :class="{ active: showHidden }"
                  type="button"
                  :title="showHidden ? '隐藏以 . 或 $ 开头的文件夹' : '显示以 . 或 $ 开头的文件夹'"
                  @click="showHidden = !showHidden"
                >
                  <Eye v-if="showHidden" :size="13" />
                  <EyeOff v-else :size="13" />
                  <span>{{ showHidden ? '隐藏项已显示' : '显示隐藏项' }}</span>
                </button>
                <span class="entry-count">{{ entryLabel }}</span>
              </div>

              <div v-if="error" class="error-banner">
                <AlertTriangle :size="15" />
                <span>{{ error }}</span>
                <button v-if="currentPath" class="retry-btn" type="button" @click="refresh">重试</button>
              </div>

              <div class="picker-list scroll-thin" :class="{ 'is-loading': loading && entries.length > 0 }">
                <div v-if="loading && entries.length === 0" class="skeleton-list">
                  <span v-for="index in 7" :key="index"></span>
                </div>

                <template v-else>
                  <button
                    v-for="entry in filteredEntries"
                    :key="entry.path"
                    class="folder-row"
                    type="button"
                    :title="entry.path"
                    @click="navigate(entry.path)"
                  >
                    <span class="folder-icon"><Folder :size="18" /></span>
                    <span class="folder-name">{{ entry.name }}</span>
                    <ChevronRight :size="15" class="folder-chevron" />
                  </button>

                  <div v-if="filteredEntries.length === 0" class="empty-list">
                    <FolderOpen :size="24" />
                    <p v-if="query">没有匹配的文件夹</p>
                    <p v-else-if="hasHiddenEntries">当前只包含隐藏文件夹，可点击「显示隐藏项」查看。</p>
                    <p v-else>这个文件夹下没有子文件夹，可以直接选择当前文件夹。</p>
                  </div>
                </template>
              </div>

              <p v-if="truncated" class="truncated-note">
                当前目录项目较多，仅显示前 2000 个子文件夹；可直接在上方输入更深层路径。
              </p>
            </section>
          </div>

          <footer class="picker-footer">
            <div class="selection">
              <span class="selection-label">当前文件夹</span>
              <code class="selection-path" :title="currentPath">{{ currentPath || '—' }}</code>
            </div>
            <div class="footer-actions">
              <button class="btn" type="button" @click="emit('close')">取消</button>
              <button class="btn btn-primary" type="button" :disabled="!canConfirm" @click="choose">
                <LoaderCircle v-if="loading" :size="15" class="spin" />
                <Check v-else :size="15" />
                选择此文件夹
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.picker-layer {
  position: fixed;
  inset: 0;
  z-index: 890;
  display: grid;
  place-items: center;
  padding: 24px 20px;
  background: rgba(3, 6, 10, 0.72);
  backdrop-filter: blur(7px);
}

.picker-card {
  display: flex;
  width: min(880px, 100%);
  height: min(660px, 88vh);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background:
    radial-gradient(650px 280px at 100% 0%, rgba(45, 212, 191, 0.055), transparent 65%),
    var(--panel-soft);
  box-shadow: var(--shadow-lg);
}

.picker-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}

.header-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: none;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.22);
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent);
}

.header-copy {
  min-width: 0;
  flex: 1;
}

.header-copy h2 {
  font-size: 16px;
  font-weight: 650;
}

.header-copy p {
  margin-top: 2px;
  overflow: hidden;
  color: var(--muted-2);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 202px minmax(0, 1fr);
}

.picker-sidebar {
  min-height: 0;
  overflow-y: auto;
  padding: 14px 10px;
  border-right: 1px solid var(--line);
  background: rgba(8, 12, 18, 0.34);
}

.sidebar-section + .sidebar-section {
  margin-top: 18px;
}

.section-heading {
  margin: 0 8px 7px;
  color: var(--muted-2);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.location-btn {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 11.5px;
  text-align: left;
  transition:
    color 140ms ease,
    background 140ms ease,
    border-color 140ms ease;
}

.location-btn > svg {
  flex: none;
  color: var(--muted-2);
}

.location-btn:hover {
  color: var(--text-soft);
  background: rgba(255, 255, 255, 0.045);
}

.location-btn.active {
  border-color: rgba(94, 234, 212, 0.16);
  background: var(--accent-soft);
  color: #c9fff7;
}

.location-btn.active > svg {
  color: var(--accent);
}

.drive-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.drive-copy > span {
  font-family: var(--mono);
  font-size: 11px;
  white-space: nowrap;
}

.drive-copy small {
  overflow: hidden;
  color: var(--muted-2);
  font-family: var(--font);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drive-free {
  flex: none;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 8.5px;
}

.picker-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: 12px 16px 0;
}

.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
}

.nav-btn {
  width: 31px;
  height: 31px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
}

.breadcrumbs {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  padding: 2px 1px;
  scrollbar-width: none;
}

.breadcrumbs::-webkit-scrollbar {
  display: none;
}

.crumb {
  flex: none;
  max-width: 180px;
  overflow: hidden;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crumb:hover {
  background: rgba(255, 255, 255, 0.055);
  color: var(--text-soft);
}

.crumb.current {
  color: var(--text);
  font-weight: 600;
}

.crumb-separator {
  flex: none;
  color: var(--muted-2);
}

.path-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  margin-top: 9px;
}

.path-field {
  height: 35px;
  flex: 1;
}

.path-field input {
  font-family: var(--mono);
  font-size: 10.5px;
}

.path-field .kbd {
  flex: none;
}

.go-btn {
  height: 35px;
  flex: none;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-top: 9px;
}

.search-field {
  height: 34px;
  flex: 1;
}

.search-field input {
  font-size: 11.5px;
}

.clear-search {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted-2);
}

.clear-search:hover {
  color: var(--text);
}

.hidden-toggle {
  display: inline-flex;
  height: 28px;
  flex: none;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-2);
  font-size: 9.5px;
  white-space: nowrap;
}

.hidden-toggle:hover {
  border-color: var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
}

.hidden-toggle.active {
  border-color: rgba(94, 234, 212, 0.18);
  background: var(--accent-soft);
  color: #a7f3d0;
}

.entry-count {
  flex: none;
  color: var(--muted-2);
  font-size: 9.5px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  margin-top: 9px;
  padding: 8px 10px;
  border: 1px solid rgba(251, 113, 133, 0.22);
  border-radius: 8px;
  background: var(--danger-soft);
  color: #fecdd3;
  font-size: 10.5px;
  line-height: 1.45;
}

.error-banner > span {
  min-width: 0;
  flex: 1;
  word-break: break-word;
}

.retry-btn {
  flex: none;
  border: 0;
  background: transparent;
  color: #fda4af;
  font-size: 10.5px;
  font-weight: 600;
}

.retry-btn:hover {
  color: #fff;
}

.picker-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  margin-top: 9px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(6, 10, 16, 0.3);
  transition: opacity 140ms ease;
}

.picker-list.is-loading {
  opacity: 0.5;
  pointer-events: none;
}

.folder-row {
  display: flex;
  width: 100%;
  min-height: 43px;
  align-items: center;
  gap: 10px;
  padding: 7px 11px;
  border: 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.06);
  background: transparent;
  color: var(--text-soft);
  text-align: left;
}

.folder-row:last-child {
  border-bottom: 0;
}

.folder-row:hover {
  background: rgba(94, 234, 212, 0.055);
}

.folder-icon {
  display: grid;
  width: 27px;
  height: 27px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--info, #7dd3fc);
}

.folder-row:hover .folder-icon {
  border-color: rgba(94, 234, 212, 0.2);
  background: var(--accent-soft);
  color: var(--accent);
}

.folder-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-chevron {
  flex: none;
  color: var(--muted-2);
  opacity: 0;
  transition: opacity 140ms ease;
}

.folder-row:hover .folder-chevron {
  opacity: 1;
}

.empty-list {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--muted-2);
  font-size: 11px;
  text-align: center;
}

.empty-list svg {
  color: var(--muted-2);
}

.skeleton-list {
  display: flex;
  flex-direction: column;
}

.skeleton-list span {
  height: 43px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025)),
    rgba(255, 255, 255, 0.012);
  background-size: 600px 100%;
  animation: shimmer 1.5s linear infinite;
}

.truncated-note {
  flex: none;
  padding: 7px 2px 0;
  color: var(--warning);
  font-size: 9.5px;
}

.picker-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  padding: 13px 20px;
  border-top: 1px solid var(--line);
  background: rgba(8, 12, 18, 0.45);
}

.selection {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.selection-label {
  color: var(--muted-2);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.selection-path {
  overflow: hidden;
  color: var(--text-soft);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.footer-actions .btn {
  height: 36px;
  font-size: 12px;
}

.picker-enter-active,
.picker-leave-active {
  transition: opacity 180ms ease;
}

.picker-enter-active .picker-card,
.picker-leave-active .picker-card {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.picker-enter-from,
.picker-leave-to {
  opacity: 0;
}

.picker-enter-from .picker-card,
.picker-leave-to .picker-card {
  transform: translateY(8px) scale(0.985);
}

@media (max-width: 760px) {
  .picker-layer {
    padding: 0;
  }

  .picker-card {
    width: 100vw;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }

  .picker-header {
    padding: 13px 14px;
  }

  .picker-body {
    display: flex;
    flex-direction: column;
  }

  .picker-sidebar {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    overflow: visible;
    padding: 8px 10px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .sidebar-section,
  .sidebar-section + .sidebar-section {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    margin-top: 0;
  }

  .section-heading {
    flex: none;
    margin: 0 3px 0 0;
  }

  .sidebar-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
  }

  .location-btn {
    width: auto;
    min-height: 30px;
    flex: none;
    padding: 5px 8px;
    white-space: nowrap;
  }

  .location-btn span {
    font-size: 10.5px;
  }

  .drive-copy small,
  .drive-free {
    display: none;
  }

  .drive-copy {
    flex: none;
  }

  .picker-main {
    padding: 10px 12px 0;
  }

  .path-field .kbd {
    display: none;
  }

  .hidden-toggle {
    width: 29px;
    padding: 0;
    justify-content: center;
  }

  .hidden-toggle span {
    display: none;
  }

  .crumb {
    max-width: 110px;
  }

  .picker-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 9px;
    padding: 10px 12px max(10px, env(safe-area-inset-bottom));
  }

  .footer-actions {
    width: 100%;
  }

  .footer-actions .btn {
    flex: 1;
  }
}
</style>
