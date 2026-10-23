<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  File,
  FileArchive,
  Files,
  FolderSearch,
  Hash,
  HardDrive,
  Info,
  Layers,
  Link2,
  ListTree,
  LoaderCircle,
  Lock,
  Play,
  RefreshCw,
  Search,
  Star,
  X,
} from 'lucide-vue-next'
import OpenWithMenu from './OpenWithMenu.vue'
import {
  copyToClipboard,
  formatBytes,
  formatDate,
  formatNumber,
  splitFilePath,
} from '../lib/format.js'

const props = defineProps({
  torrent: { type: Object, default: null },
  parsed: { type: Object, default: null },
  parseState: { type: Object, default: null },
  cover: { type: Object, default: null },
  tools: { type: Array, default: () => [] },
  defaultToolId: { type: String, default: 'system' },
})

const emit = defineEmits([
  'close',
  'parse',
  'open',
  'reveal',
  'preview-cover',
  'manage-tools',
  'notify',
])

const closeButton = ref(null)
const activeTab = ref('files')
const fileQuery = ref('')
const visibleCount = ref(300)
const copiedKey = ref('')
const menuOpen = ref(false)
const menuAnchor = ref(null)
let copyTimer = null

const busy = computed(() => Boolean(props.parseState?.loading))
const loading = computed(() => {
  if (props.parsed) return false
  return busy.value || !props.parseState?.error
})

const error = computed(() => (props.parsed ? null : props.parseState?.error || null))
const defaultToolName = computed(
  () => props.tools.find((tool) => tool.id === props.defaultToolId)?.name || '系统默认应用',
)

const coverRating = computed(() =>
  typeof props.cover?.rating === 'number' ? props.cover.rating : null,
)

const coverRatingClass = computed(() => {
  if (coverRating.value === null) return ''
  if (coverRating.value >= 8.5) return 'is-high'
  if (coverRating.value >= 7) return 'is-mid'
  return 'is-low'
})

function previewCover() {
  if (!props.cover?.cover) return
  emit('preview-cover', {
    src: props.cover.cover,
    title: props.cover.title || props.parsed?.name || props.torrent?.fileName || '',
    pageUrl: props.cover.pageUrl || '',
  })
}

const versionLabel = computed(() => {
  const version = props.parsed?.version
  if (version === 'hybrid') return 'v1 + v2 混合'
  if (version === 'v2') return 'BitTorrent v2'
  return 'BitTorrent v1'
})

const filteredFiles = computed(() => {
  const files = props.parsed?.files || []
  const query = fileQuery.value.trim().toLowerCase()
  if (!query) return files
  return files.filter((file) => file.path.toLowerCase().includes(query))
})

const shownFiles = computed(() => filteredFiles.value.slice(0, visibleCount.value))
const hasMoreFiles = computed(() => filteredFiles.value.length > shownFiles.value.length)

const hashItems = computed(() => {
  const items = []
  if (props.parsed?.infoHashV1) {
    items.push({ key: 'hash-v1', label: 'BTIH · v1', value: props.parsed.infoHashV1 })
  }
  if (props.parsed?.infoHashV2) {
    items.push({ key: 'hash-v2', label: 'BTMH · v2', value: props.parsed.infoHashV2 })
  }
  return items
})

const trackerTiers = computed(() => {
  const parsed = props.parsed
  if (!parsed) return []
  if (Array.isArray(parsed.trackerTiers) && parsed.trackerTiers.length) return parsed.trackerTiers
  return parsed.trackers?.length ? [parsed.trackers] : []
})

function onKeydown(event) {
  if (!props.torrent) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
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

async function copy(text, key, label) {
  try {
    await copyToClipboard(text)
    copiedKey.value = key
    emit('notify', `${label}已复制`, 'success')
    if (copyTimer) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copiedKey.value = ''
    }, 1600)
  } catch (err) {
    emit('notify', err.message || '复制失败', 'error')
  }
}

watch(
  () => props.torrent?.path,
  async (path) => {
    if (!path) return
    activeTab.value = 'files'
    fileQuery.value = ''
    visibleCount.value = 300
    copiedKey.value = ''
    menuOpen.value = false
    await nextTick()
    closeButton.value?.focus()
  },
)

watch(fileQuery, () => {
  visibleCount.value = 300
})

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (copyTimer) window.clearTimeout(copyTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="torrent" class="drawer-layer" @mousedown.self="emit('close')">
        <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
          <header class="drawer-header">
            <button
              v-if="cover"
              class="drawer-icon has-cover"
              type="button"
              title="查看封面大图"
              aria-label="查看封面大图"
              @click="previewCover"
            >
              <img
                :src="cover.cover"
                :alt="cover.title || parsed?.name || torrent.fileName"
                :title="cover.title || ''"
                referrerpolicy="no-referrer"
              />
            </button>
            <div v-else class="drawer-icon">
              <FileArchive :size="21" />
            </div>
            <div class="drawer-heading">
              <h2 id="drawer-title">{{ parsed?.name || torrent.fileName }}</h2>
              <p :title="torrent.path">{{ torrent.path }}</p>
              <span v-if="cover?.title || coverRating !== null" class="cover-meta">
                <span
                  v-if="coverRating !== null"
                  class="cover-rating"
                  :class="coverRatingClass"
                  title="游民星空玩家评分"
                >
                  <Star :size="10" fill="currentColor" />
                  {{ coverRating.toFixed(1) }}
                </span>
                <span v-if="cover?.title" class="cover-title">封面：{{ cover.title }}</span>
              </span>
            </div>
            <button ref="closeButton" class="icon-btn close-btn" type="button" aria-label="关闭详情" @click="emit('close')">
              <X :size="18" />
            </button>
          </header>

          <div class="drawer-toolbar">
            <div class="open-group">
              <button class="btn btn-primary open-main" type="button" @click="openDefault">
                <Play :size="14" fill="currentColor" />
                {{ defaultToolName }}
              </button>
              <button class="open-caret" type="button" aria-label="选择打开方式" @click.stop="toggleMenu">
                <ChevronDown :size="14" />
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

            <button class="btn" type="button" @click="emit('reveal', torrent)">
              <FolderSearch :size="15" />
              所在文件夹
            </button>

            <button
              class="icon-btn refresh-btn"
              type="button"
              title="重新解析"
              aria-label="重新解析"
              :disabled="busy"
              @click="emit('parse', torrent)"
            >
              <LoaderCircle v-if="busy" :size="16" class="spin" />
              <RefreshCw v-else :size="16" />
            </button>
          </div>

          <div class="drawer-body scroll-thin">
            <div v-if="loading" class="loading-panel">
              <div class="skeleton skeleton-grid">
                <span v-for="index in 4" :key="index"></span>
              </div>
              <div class="skeleton skeleton-lines">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div class="skeleton skeleton-list">
                <span v-for="index in 5" :key="index"></span>
              </div>
              <p class="loading-note">
                <LoaderCircle :size="14" class="spin" />
                正在解析种子内容…
              </p>
            </div>

            <div v-else-if="error" class="error-panel">
              <div class="error-icon"><AlertTriangle :size="24" /></div>
              <h3>种子解析失败</h3>
              <p>{{ error }}</p>
              <div class="error-actions">
                <button class="btn" type="button" @click="emit('parse', torrent)">
                  <RefreshCw :size="14" />
                  重试
                </button>
                <button class="btn btn-ghost" type="button" @click="emit('reveal', torrent)">
                  检查文件位置
                </button>
              </div>
            </div>

            <template v-else-if="parsed">
              <section class="summary-grid">
                <div class="summary-card">
                  <span class="summary-label"><HardDrive :size="12" /> 内容大小</span>
                  <strong>{{ formatBytes(parsed.totalSize) }}</strong>
                </div>
                <div class="summary-card">
                  <span class="summary-label"><Files :size="12" /> 文件数量</span>
                  <strong>{{ formatNumber(parsed.fileCount) }}</strong>
                </div>
                <div class="summary-card">
                  <span class="summary-label"><Layers :size="12" /> 分片大小</span>
                  <strong>{{ formatBytes(parsed.pieceLength) }}</strong>
                </div>
                <div class="summary-card">
                  <span class="summary-label"><ListTree :size="12" /> 分片数量</span>
                  <strong>{{ parsed.pieceCount ? formatNumber(parsed.pieceCount) : '—' }}</strong>
                </div>
              </section>

              <section class="meta-row">
                <span class="badge badge-violet">{{ versionLabel }}</span>
                <span class="badge badge-muted">{{ parsed.isMultiFile ? '多文件' : '单文件' }}</span>
                <span v-if="parsed.isPrivate" class="badge badge-muted private-badge">
                  <Lock :size="10" />
                  私有种子
                </span>
                <span class="badge badge-muted">
                  {{ formatNumber(parsed.trackers?.length || 0) }} 个 Tracker
                </span>
              </section>

              <section v-if="hashItems.length" class="hash-block">
                <div class="block-heading">
                  <Hash :size="13" />
                  Info Hash
                </div>
                <div
                  v-for="item in hashItems"
                  :key="item.key"
                  class="hash-row"
                >
                  <span class="hash-label">{{ item.label }}</span>
                  <code class="hash-value">{{ item.value }}</code>
                  <button
                    class="copy-btn"
                    type="button"
                    :aria-label="`复制 ${item.label}`"
                    @click="copy(item.value, item.key, item.label)"
                  >
                    <Check v-if="copiedKey === item.key" :size="14" />
                    <Copy v-else :size="14" />
                  </button>
                </div>
              </section>

              <div class="tabs" role="tablist">
                <button
                  class="tab"
                  :class="{ active: activeTab === 'files' }"
                  type="button"
                  role="tab"
                  :aria-selected="activeTab === 'files'"
                  @click="activeTab = 'files'"
                >
                  <Files :size="14" />
                  文件
                  <span class="tab-count">{{ formatNumber(parsed.fileCount) }}</span>
                </button>
                <button
                  class="tab"
                  :class="{ active: activeTab === 'info' }"
                  type="button"
                  role="tab"
                  :aria-selected="activeTab === 'info'"
                  @click="activeTab = 'info'"
                >
                  <Info :size="14" />
                  种子信息
                </button>
              </div>

              <section v-if="activeTab === 'files'" class="files-panel">
                <div class="files-toolbar">
                  <div class="field file-search">
                    <Search :size="14" />
                    <input v-model="fileQuery" type="text" placeholder="搜索文件路径…" spellcheck="false" />
                    <button
                      v-if="fileQuery"
                      class="clear-search"
                      type="button"
                      aria-label="清空搜索"
                      @click="fileQuery = ''"
                    >
                      <X :size="13" />
                    </button>
                  </div>
                  <span class="files-count">
                    {{ formatNumber(filteredFiles.length) }} / {{ formatNumber(parsed.fileCount) }}
                  </span>
                </div>

                <p v-if="parsed.filesTruncated" class="truncate-note">
                  <AlertTriangle :size="13" />
                  文件数量过多，服务端仅返回前 {{ formatNumber(parsed.files.length) }} 个条目。
                </p>

                <div class="file-list">
                  <div
                    v-for="(file, index) in shownFiles"
                    :key="`${file.path}-${index}`"
                    class="file-row"
                  >
                    <span class="file-glyph"><File :size="13" /></span>
                    <span class="file-path">
                      <span v-if="splitFilePath(file.path).directory" class="file-dir">
                        {{ splitFilePath(file.path).directory }}/
                      </span>
                      <span class="file-name">{{ splitFilePath(file.path).name }}</span>
                    </span>
                    <span class="file-size">{{ formatBytes(file.size) }}</span>
                  </div>

                  <div v-if="shownFiles.length === 0" class="file-empty">
                    没有匹配的文件
                  </div>
                </div>

                <button
                  v-if="hasMoreFiles"
                  class="btn load-more"
                  type="button"
                  @click="visibleCount += 300"
                >
                  加载更多（剩余 {{ formatNumber(filteredFiles.length - shownFiles.length) }}）
                </button>
              </section>

              <section v-else class="info-panel">
                <dl class="info-list">
                  <div>
                    <dt>种子名称</dt>
                    <dd>{{ parsed.name }}</dd>
                  </div>
                  <div>
                    <dt>种子结构</dt>
                    <dd>{{ parsed.isMultiFile ? '多文件 / 目录' : '单文件' }}</dd>
                  </div>
                  <div v-if="parsed.source">
                    <dt>内容来源</dt>
                    <dd>{{ parsed.source }}</dd>
                  </div>
                  <div v-if="parsed.createdBy">
                    <dt>创建工具</dt>
                    <dd>{{ parsed.createdBy }}</dd>
                  </div>
                  <div v-if="parsed.creationDate">
                    <dt>创建时间</dt>
                    <dd>{{ formatDate(parsed.creationDate) }}</dd>
                  </div>
                  <div v-if="parsed.comment">
                    <dt>备注</dt>
                    <dd class="pre-wrap">{{ parsed.comment }}</dd>
                  </div>
                  <div>
                    <dt>种子文件</dt>
                    <dd class="path-dd">
                      <code>{{ torrent.path }}</code>
                      <button
                        class="copy-btn inline"
                        type="button"
                        aria-label="复制种子文件路径"
                        @click="copy(torrent.path, 'path', '种子路径')"
                      >
                        <Check v-if="copiedKey === 'path'" :size="13" />
                        <Copy v-else :size="13" />
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>种子文件大小</dt>
                    <dd>{{ formatBytes(torrent.size) }}</dd>
                  </div>
                </dl>

                <div v-if="parsed.magnet" class="magnet-block">
                  <div class="block-heading">
                    <Link2 :size="13" />
                    Magnet 链接
                  </div>
                  <div class="magnet-box">
                    <code>{{ parsed.magnet }}</code>
                    <button
                      class="copy-btn"
                      type="button"
                      aria-label="复制 Magnet 链接"
                      @click="copy(parsed.magnet, 'magnet', 'Magnet 链接')"
                    >
                      <Check v-if="copiedKey === 'magnet'" :size="14" />
                      <Copy v-else :size="14" />
                    </button>
                  </div>
                </div>

                <div v-if="trackerTiers.length" class="tracker-block">
                  <div class="block-heading">
                    <Link2 :size="13" />
                    Tracker（{{ formatNumber(parsed.trackers?.length || 0) }}）
                  </div>
                  <div class="tracker-tiers">
                    <div v-for="(tier, tierIndex) in trackerTiers" :key="tierIndex" class="tracker-tier">
                      <span class="tier-index">Tier {{ tierIndex + 1 }}</span>
                      <div class="tier-urls">
                        <code v-for="tracker in tier" :key="tracker">{{ tracker }}</code>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="parsed.webSeeds?.length" class="tracker-block">
                  <div class="block-heading">Web Seeds</div>
                  <div class="tracker-tiers">
                    <div class="tracker-tier">
                      <div class="tier-urls">
                        <code v-for="seed in parsed.webSeeds" :key="seed">{{ seed }}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </template>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 700;
  display: flex;
  justify-content: flex-end;
  background: rgba(3, 6, 10, 0.58);
  backdrop-filter: blur(4px);
}

.drawer {
  display: flex;
  width: min(600px, 100vw);
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid var(--line-strong);
  background:
    radial-gradient(500px 280px at 100% 0%, rgba(45, 212, 191, 0.06), transparent 70%),
    linear-gradient(180deg, #101620, #0b1017);
  box-shadow: -40px 0 80px -40px rgba(0, 0, 0, 0.9);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: none;
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--line);
}

.drawer-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.22);
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}

.drawer-icon.has-cover {
  width: 60px;
  height: 80px;
  overflow: hidden;
  border-color: rgba(167, 139, 250, 0.24);
  border-radius: 10px;
  background: rgba(9, 13, 20, 0.9);
  cursor: zoom-in;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.drawer-icon.has-cover:hover {
  border-color: rgba(94, 234, 212, 0.45);
  box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.12);
}

.drawer-icon.has-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.cover-rating {
  display: inline-flex;
  height: 19px;
  flex: none;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
}

.cover-rating.is-high {
  border-color: rgba(52, 211, 153, 0.22);
  background: rgba(52, 211, 153, 0.1);
  color: #86efac;
}

.cover-rating.is-mid {
  border-color: rgba(167, 139, 250, 0.22);
  background: rgba(167, 139, 250, 0.1);
  color: #c4b5fd;
}

.cover-rating.is-low {
  border-color: var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
}

.cover-title {
  display: block;
  overflow: hidden;
  color: var(--muted-2);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-heading {
  min-width: 0;
  flex: 1;
  padding-top: 1px;
}

.drawer-heading h2 {
  overflow: hidden;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-heading p {
  margin-top: 3px;
  overflow: hidden;
  color: var(--muted-2);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  flex: none;
  margin-top: -3px;
  margin-right: -4px;
}

.drawer-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(8, 12, 18, 0.35);
}

.drawer-toolbar .btn {
  height: 36px;
  font-size: 12px;
}

.open-group {
  display: flex;
  height: 36px;
  align-items: stretch;
  overflow: hidden;
  border-radius: 11px;
}

.open-main {
  max-width: 220px;
  overflow: hidden;
  border-radius: 11px 0 0 11px;
  text-overflow: ellipsis;
}

.open-caret {
  display: grid;
  width: 30px;
  border: 0;
  border-left: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 0 11px 11px 0;
  background: linear-gradient(135deg, #3ee0ca, #1cc7b4);
  color: #031713;
}

.open-caret:hover {
  filter: brightness(1.06);
}

.refresh-btn {
  margin-left: auto;
}

.drawer-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 28px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.summary-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.summary-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted-2);
  font-size: 9.5px;
  letter-spacing: 0.03em;
}

.summary-card strong {
  overflow: hidden;
  color: var(--text-soft);
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 11px;
}

.private-badge {
  color: var(--warning);
}

.hash-block {
  margin-top: 16px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.018);
}

.block-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.hash-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}

.hash-label {
  width: 78px;
  flex: none;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9.5px;
}

.hash-value {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--text-soft);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--muted);
}

.copy-btn:hover {
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.copy-btn.inline {
  width: 23px;
  height: 23px;
  margin-left: 6px;
}

.tabs {
  display: flex;
  gap: 4px;
  margin: 18px 0 12px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(6, 10, 16, 0.45);
}

.tab {
  display: inline-flex;
  height: 33px;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 550;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.tab-count {
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9.5px;
}

.files-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 9px;
}

.file-search {
  height: 35px;
  flex: 1;
}

.file-search input {
  font-size: 12px;
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

.files-count {
  flex: none;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9.5px;
}

.truncate-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid rgba(251, 191, 36, 0.18);
  border-radius: 7px;
  background: rgba(251, 191, 36, 0.06);
  color: var(--warning);
  font-size: 10px;
}

.file-list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(6, 10, 16, 0.32);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.065);
}

.file-row:last-child {
  border-bottom: 0;
}

.file-row:hover {
  background: rgba(255, 255, 255, 0.025);
}

.file-glyph {
  display: grid;
  width: 20px;
  flex: none;
  place-items: center;
  color: var(--muted-2);
}

.file-path {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-dir {
  color: var(--muted-2);
}

.file-name {
  color: var(--text-soft);
}

.file-size {
  flex: none;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10px;
}

.file-empty {
  padding: 24px;
  color: var(--muted-2);
  font-size: 12px;
  text-align: center;
}

.load-more {
  width: 100%;
  margin-top: 9px;
  height: 34px;
  font-size: 11.5px;
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 17px;
}

.info-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.info-list > div {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  padding: 9px 11px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.065);
}

.info-list > div:last-child {
  border-bottom: 0;
}

.info-list dt {
  color: var(--muted-2);
  font-size: 10.5px;
}

.info-list dd {
  min-width: 0;
  margin: 0;
  color: var(--text-soft);
  font-size: 11.5px;
  line-height: 1.6;
  word-break: break-word;
}

.info-list dd.pre-wrap {
  white-space: pre-wrap;
}

.path-dd {
  display: flex;
  align-items: flex-start;
}

.path-dd code {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 10px;
}

.magnet-block,
.tracker-block {
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.018);
}

.magnet-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.magnet-box code {
  max-height: 80px;
  flex: 1;
  overflow-y: auto;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
  word-break: break-all;
}

.tracker-tiers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tracker-tier {
  display: flex;
  gap: 9px;
}

.tier-index {
  width: 44px;
  flex: none;
  padding-top: 2px;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 8.5px;
  text-transform: uppercase;
}

.tier-urls {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.tier-urls code {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.5;
}

.loading-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton {
  overflow: hidden;
}

.skeleton span {
  display: block;
  border-radius: 7px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03)),
    rgba(255, 255, 255, 0.02);
  background-size: 600px 100%;
  animation: shimmer 1.5s linear infinite;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.skeleton-grid span {
  height: 58px;
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.skeleton-lines span {
  height: 11px;
}

.skeleton-lines span:nth-child(2) {
  width: 76%;
}

.skeleton-lines span:nth-child(3) {
  width: 52%;
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.skeleton-list span {
  height: 36px;
  border-radius: 0;
}

.loading-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted-2);
  font-size: 11px;
}

.error-panel {
  display: flex;
  min-height: 360px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.error-icon {
  display: grid;
  width: 54px;
  height: 54px;
  margin-bottom: 15px;
  place-items: center;
  border: 1px solid rgba(251, 113, 133, 0.22);
  border-radius: 15px;
  background: var(--danger-soft);
  color: var(--danger);
}

.error-panel h3 {
  font-size: 16px;
  font-weight: 650;
}

.error-panel p {
  max-width: 380px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  word-break: break-word;
}

.error-actions {
  display: flex;
  gap: 9px;
  margin-top: 20px;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 220ms ease;
}

.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(32px);
}

@media (max-width: 640px) {
  .drawer {
    width: 100vw;
  }

  .drawer-toolbar {
    flex-wrap: wrap;
  }

  .refresh-btn {
    margin-left: 0;
  }

  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }

  .open-main {
    max-width: 150px;
  }
}
</style>
