<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ChevronRight,
  ImagePlus,
  Layers3,
  LayoutGrid,
  List,
  ListChecks,
  LoaderCircle,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next'
import AppSidebar from './components/AppSidebar.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DetailsDrawer from './components/DetailsDrawer.vue'
import FolderPickerDialog from './components/FolderPickerDialog.vue'
import ScanProgress from './components/ScanProgress.vue'
import SortControl from './components/SortControl.vue'
import ToastHost from './components/ToastHost.vue'
import ToolsDialog from './components/ToolsDialog.vue'
import TorrentList from './components/TorrentList.vue'
import { api, streamScan } from './lib/api.js'
import {
  formatBytes,
  formatDate,
  formatNumber,
  sourceLabel,
  splitFilePath,
} from './lib/format.js'

const LIBRARY_KEY = 'torrent-vault.library.v1'
const LAST_PATH_KEY = 'torrent-vault.last-path'
const RECURSIVE_KEY = 'torrent-vault.recursive'
const COVERS_KEY = 'torrent-vault.covers.v1'
const VIEW_MODE_KEY = 'torrent-vault.view-mode'
const COVER_WORKERS = 3

const scanPath = ref('')
const recursive = ref(true)
const drives = ref([])
const sources = ref([])
const torrents = ref([])
const tools = ref([])
const defaultToolId = ref('system')
const toolsOpen = ref(false)
const folderPickerOpen = ref(false)
const mobileSidebarOpen = ref(false)
const selectedPath = ref(null)
const searchInput = ref(null)

const parseCache = reactive(new Map())
const parseStates = reactive(new Map())
const parsedSummaries = reactive(new Map())
const covers = reactive(new Map())

const filters = reactive({
  query: '',
  source: 'all',
  sort: 'mtime',
  order: 'desc',
})

const scanning = reactive({
  active: false,
  root: '',
  stats: {},
  startedAt: 0,
  recursive: true,
})

const coversBusy = ref(false)
const coverProgress = reactive({ done: 0, total: 0 })
const PARSE_WORKERS = 3
const parseAllBusy = ref(false)
const parseAllProgress = reactive({ done: 0, total: 0 })
const viewMode = ref('list')
const coverPreview = ref(null)

let scanController = null
let scanSession = null
let saveTimer = null
let coverSaveTimer = null
let libraryReady = false

const toasts = ref([])
let toastSequence = 0

const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
})
let confirmResolver = null

const sortOptions = [
  { value: 'mtime', label: '修改时间', defaultOrder: 'desc' },
  { value: 'rating', label: '评分', defaultOrder: 'desc' },
  { value: 'size', label: '文件大小', defaultOrder: 'desc' },
  { value: 'name', label: '名称', defaultOrder: 'asc' },
  { value: 'added', label: '发现时间', defaultOrder: 'desc' },
]

function coverRating(torrent) {
  const rating = covers.get(torrent.path)?.rating
  return typeof rating === 'number' ? rating : -1
}

function parsedName(torrent) {
  return parseCache.get(torrent.path)?.name || parsedSummaries.get(torrent.path)?.name || ''
}

function changeSortField(value) {
  filters.sort = value
  const option = sortOptions.find((item) => item.value === value)
  if (option?.defaultOrder) filters.order = option.defaultOrder
}

function toggleSortOrder() {
  filters.order = filters.order === 'asc' ? 'desc' : 'asc'
}

const visibleTorrents = computed(() => {
  let list = torrents.value

  if (filters.source !== 'all') {
    list = list.filter((torrent) => torrent.source === filters.source)
  }

  const query = filters.query.trim().toLowerCase()
  if (query) {
    list = list.filter(
      (torrent) =>
        torrent.fileName.toLowerCase().includes(query) ||
        torrent.path.toLowerCase().includes(query) ||
        parsedName(torrent).toLowerCase().includes(query),
    )
  }

  const direction = filters.order === 'asc' ? 1 : -1
  const sorted = [...list]
  switch (filters.sort) {
    case 'rating':
      sorted.sort((a, b) => (coverRating(a) - coverRating(b)) * direction)
      break
    case 'size':
      sorted.sort((a, b) => ((a.size || 0) - (b.size || 0)) * direction)
      break
    case 'name':
      sorted.sort(
        (a, b) =>
          a.fileName.localeCompare(b.fileName, 'zh-CN', { numeric: true, sensitivity: 'base' }) *
          direction,
      )
      break
    case 'added':
      sorted.sort((a, b) => ((a.addedAt || 0) - (b.addedAt || 0)) * direction)
      break
    case 'mtime':
    default:
      sorted.sort((a, b) => ((a.mtimeMs || 0) - (b.mtimeMs || 0)) * direction)
      break
  }

  return sorted
})

const selectedTorrent = computed(
  () => torrents.value.find((torrent) => torrent.path === selectedPath.value) || null,
)
const selectedParsed = computed(() =>
  selectedTorrent.value ? parseCache.get(selectedTorrent.value.path) || null : null,
)
const selectedParseState = computed(() =>
  selectedTorrent.value ? parseStates.get(selectedTorrent.value.path) || null : null,
)
const selectedCover = computed(() =>
  selectedTorrent.value ? covers.get(selectedTorrent.value.path) || null : null,
)

const activeSourceMeta = computed(() =>
  filters.source === 'all'
    ? null
    : sources.value.find((source) => source.id === filters.source) || null,
)

const currentTitle = computed(() =>
  filters.source === 'all' ? '全部种子' : sourceLabel(activeSourceMeta.value?.root || filters.source),
)

const totalFileSize = computed(() =>
  torrents.value.reduce((sum, torrent) => sum + (Number(torrent.size) || 0), 0),
)

const hasFilters = computed(() => filters.source !== 'all' || Boolean(filters.query.trim()))

const defaultToolName = computed(
  () => tools.value.find((tool) => tool.id === defaultToolId.value)?.name || '系统默认应用',
)

const headingSubtitle = computed(() => {
  if (scanning.active) {
    return `正在扫描 ${scanning.root} · 已发现 ${formatNumber(scanning.stats.found || 0)} 个种子`
  }

  if (filters.source !== 'all' && activeSourceMeta.value) {
    const source = activeSourceMeta.value
    const parts = [source.root, `${formatNumber(visibleTorrents.value.length)} 个种子`]
    if (source.lastScanAt) parts.push(`上次扫描 ${formatDate(source.lastScanAt)}`)
    return parts.join(' · ')
  }

  if (torrents.value.length === 0) return '选择一个磁盘或文件夹，开始建立你的本地种子索引'
  return `${formatNumber(torrents.value.length)} 个种子 · ${formatNumber(
    sources.value.length,
  )} 个来源 · 种子文件共 ${formatBytes(totalFileSize.value)}`
})

const libraryStats = computed(() => ({
  torrents: torrents.value.length,
  sources: sources.value.length,
  size: totalFileSize.value,
}))

function pathKey(value) {
  return String(value || '')
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase()
}

function fileNameFromPath(filePath) {
  return splitFilePath(filePath).name || filePath
}

function notify(message, type = 'info', options = {}) {
  const id = ++toastSequence
  const toast = { id, message, type }
  toasts.value = [...toasts.value, toast].slice(-4)
  const timeout = options.timeout ?? (type === 'error' ? 7000 : 3800)
  window.setTimeout(() => dismissToast(id), timeout)
}

function dismissToast(id) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

function askConfirm(options) {
  if (confirmResolver) confirmResolver(false)
  Object.assign(confirmState, {
    open: true,
    title: options.title || '确认操作',
    message: options.message || '',
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    danger: Boolean(options.danger),
  })

  return new Promise((resolve) => {
    confirmResolver = resolve
  })
}

function settleConfirm(value) {
  confirmState.open = false
  const resolver = confirmResolver
  confirmResolver = null
  resolver?.(value)
}

function restoreLibrary() {
  const lastPath = localStorage.getItem(LAST_PATH_KEY) || ''
  scanPath.value = lastPath
  recursive.value = localStorage.getItem(RECURSIVE_KEY) !== 'false'

  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null')
  } catch {
    raw = null
  }
  if (!raw || !Array.isArray(raw.torrents)) {
    libraryReady = true
    return
  }

  const sourceMap = new Map()
  for (const item of Array.isArray(raw.sources) ? raw.sources : []) {
    if (!item || typeof item.root !== 'string' || !item.root) continue
    const key = pathKey(item.root)
    if (sourceMap.has(key)) continue
    sourceMap.set(key, {
      id: item.root,
      root: item.root,
      count: 0,
      status: ['ready', 'partial', 'error'].includes(item.status)
        ? item.status === 'scanning'
          ? 'partial'
          : item.status
        : 'ready',
      lastScanAt: Number(item.lastScanAt) || null,
      errors: Number(item.errors) || 0,
    })
  }

  const torrentMap = new Map()
  for (const item of raw.torrents) {
    if (!item || typeof item.path !== 'string' || !item.path) continue
    const key = pathKey(item.path)
    if (torrentMap.has(key)) continue
    const source = typeof item.source === 'string' && item.source ? item.source : '未知来源'
    if (!sourceMap.has(pathKey(source))) {
      sourceMap.set(pathKey(source), {
        id: source,
        root: source,
        count: 0,
        status: 'ready',
        lastScanAt: null,
        errors: 0,
      })
    }
    torrentMap.set(key, {
      id: item.path,
      path: item.path,
      fileName:
        typeof item.fileName === 'string' && item.fileName
          ? item.fileName
          : fileNameFromPath(item.path),
      dir: typeof item.dir === 'string' ? item.dir : splitFilePath(item.path).directory,
      size: Number(item.size) || 0,
      mtimeMs: Number(item.mtimeMs) || 0,
      source,
      addedAt: Number(item.addedAt) || Date.now(),
    })
  }

  const loadedTorrents = [...torrentMap.values()]
  const loadedSources = [...sourceMap.values()].map((source) => ({
    ...source,
    count: loadedTorrents.filter((torrent) => torrent.source === source.id).length,
  }))

  sources.value = loadedSources
  torrents.value = loadedTorrents.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))
  libraryReady = true
}

function restoreCovers() {
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(COVERS_KEY) || 'null')
  } catch {
    raw = null
  }
  if (!raw || typeof raw !== 'object') return

  for (const [torrentPath, entry] of Object.entries(raw)) {
    if (!entry || typeof entry.cover !== 'string' || !entry.cover) continue
    covers.set(torrentPath, {
      cover: entry.cover,
      title: typeof entry.title === 'string' ? entry.title : '',
      pageUrl: typeof entry.pageUrl === 'string' ? entry.pageUrl : '',
      query: typeof entry.query === 'string' ? entry.query : '',
      rating:
        typeof entry.rating === 'number' ? entry.rating : entry.rating === null ? null : undefined,
      updatedAt: Number(entry.updatedAt) || 0,
    })
  }
}

function saveCovers() {
  if (coverSaveTimer) {
    window.clearTimeout(coverSaveTimer)
    coverSaveTimer = null
  }

  const payload = {}
  for (const [torrentPath, entry] of covers) payload[torrentPath] = entry

  try {
    localStorage.setItem(COVERS_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('[covers] 保存封面索引失败', error)
  }
}

function queueCoverSave() {
  if (coverSaveTimer) window.clearTimeout(coverSaveTimer)
  coverSaveTimer = window.setTimeout(() => {
    coverSaveTimer = null
    saveCovers()
  }, 800)
}

function restoreViewMode() {
  viewMode.value = localStorage.getItem(VIEW_MODE_KEY) === 'grid' ? 'grid' : 'list'
}

function setViewMode(mode) {
  viewMode.value = mode === 'grid' ? 'grid' : 'list'
  try {
    localStorage.setItem(VIEW_MODE_KEY, viewMode.value)
  } catch {
    // 忽略存储异常
  }
}

function openCoverPreview(payload) {
  if (!payload?.src) return
  coverPreview.value = {
    src: payload.src,
    title: payload.title || '',
    pageUrl: payload.pageUrl || '',
  }
}

function closeCoverPreview() {
  coverPreview.value = null
}

function handleCoverPreviewKeydown(event) {
  if (!coverPreview.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  closeCoverPreview()
}

async function updateCovers() {
  if (coversBusy.value) return

  const queue = [...visibleTorrents.value]
  if (!queue.length) {
    notify('当前没有可更新封面的种子', 'info')
    return
  }

  coversBusy.value = true
  coverProgress.done = 0
  coverProgress.total = queue.length

  let found = 0
  let rated = 0
  let skipped = 0
  let missing = 0
  let failed = 0
  let lastError = ''

  const worker = async () => {
    while (queue.length) {
      const torrent = queue.shift()
      if (!torrent) continue

      const existing = covers.get(torrent.path)

      // 已有封面的种子直接跳过；仅当旧数据缺少评分时补抓一次评分。
      if (existing?.cover) {
        if (existing.rating !== undefined || !existing.pageUrl) {
          skipped += 1
          coverProgress.done += 1
          continue
        }

        try {
          const payload = await api.lookupRating(existing.pageUrl)
          const rating = typeof payload?.rating === 'number' ? payload.rating : null
          covers.set(torrent.path, { ...existing, rating })
          rated += 1
          queueCoverSave()
        } catch (error) {
          failed += 1
          lastError = error.message || '请求失败'
        } finally {
          coverProgress.done += 1
        }
        continue
      }

      const parsed = parseCache.get(torrent.path)
      const searchName = parsed?.name || torrent.fileName || torrent.path

      try {
        const payload = await api.searchCover(searchName)
        const match = payload?.match
        if (match?.cover) {
          covers.set(torrent.path, {
            cover: match.cover,
            title: match.title || '',
            pageUrl: match.pageUrl || '',
            query: payload.query || '',
            rating: typeof match.rating === 'number' ? match.rating : null,
            updatedAt: Date.now(),
          })
          found += 1
          queueCoverSave()
        } else {
          missing += 1
        }
      } catch (error) {
        failed += 1
        lastError = error.message || '请求失败'
      } finally {
        coverProgress.done += 1
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(COVER_WORKERS, queue.length) }, () => worker()),
  )

  saveCovers()
  coversBusy.value = false

  if (found === 0 && rated === 0 && failed > 0) {
    notify(`封面更新失败：${lastError || '请稍后重试'}`, 'error', { timeout: 8000 })
    return
  }

  if (found === 0 && rated === 0 && missing === 0) {
    notify(`${skipped} 个种子已有封面，已全部跳过`, 'info', { timeout: 5000 })
    return
  }

  const parts = []
  if (found > 0) parts.push(`更新 ${found} 个封面`)
  if (rated > 0) parts.push(`补全 ${rated} 个评分`)
  if (skipped > 0) parts.push(`跳过 ${skipped} 个已有封面`)
  if (missing > 0) parts.push(`未匹配 ${missing} 个`)
  if (failed > 0) parts.push(`失败 ${failed} 个`)
  notify(`封面更新完成：${parts.join('，')}`, failed > 0 ? 'info' : 'success', { timeout: 6000 })
}

function scheduleSave() {
  if (!libraryReady) return
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    try {
      const payload = {
        version: 1,
        savedAt: Date.now(),
        torrents: torrents.value,
        sources: sources.value.map((source) => ({
          ...source,
          status: source.status === 'scanning' ? 'partial' : source.status,
        })),
      }
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn('[library] 保存本地索引失败', error)
    }
  }, 400)
}

watch([torrents, sources], scheduleSave)
watch(recursive, (value) => localStorage.setItem(RECURSIVE_KEY, String(value)))
watch(selectedTorrent, (torrent) => {
  if (!torrent) selectedPath.value = null
})

function patchSource(id, patch) {
  sources.value = sources.value.map((source) =>
    source.id === id ? { ...source, ...patch } : source,
  )
}

function removeSourceFromLibrary(id) {
  sources.value = sources.value.filter((source) => source.id !== id)
}

function beginScanSession(root) {
  const key = pathKey(root)
  torrents.value = torrents.value.filter((torrent) => pathKey(torrent.source) !== key)
  sources.value = sources.value.filter((source) => pathKey(source.root) !== key)
  sources.value = [
    ...sources.value,
    {
      id: root,
      root,
      count: 0,
      status: 'scanning',
      lastScanAt: Date.now(),
      errors: 0,
    },
  ]

  if (filters.source !== 'all' && pathKey(filters.source) === key) filters.source = root

  scanSession = {
    root,
    added: 0,
    knownPaths: new Set(torrents.value.map((torrent) => pathKey(torrent.path))),
  }
}

function handleScanBatch(event) {
  if (!scanSession) return
  const root = event.root || scanSession.root
  const additions = []

  for (const file of Array.isArray(event.files) ? event.files : []) {
    if (!file || typeof file.path !== 'string' || !file.path) continue
    const key = pathKey(file.path)
    if (scanSession.knownPaths.has(key)) continue
    scanSession.knownPaths.add(key)
    additions.push({
      id: file.path,
      path: file.path,
      fileName:
        typeof file.fileName === 'string' && file.fileName
          ? file.fileName
          : fileNameFromPath(file.path),
      dir: typeof file.dir === 'string' ? file.dir : splitFilePath(file.path).directory,
      size: Number(file.size) || 0,
      mtimeMs: Number(file.mtimeMs) || 0,
      source: root,
      addedAt: Date.now(),
    })
  }

  if (additions.length > 0) {
    torrents.value = [...torrents.value, ...additions]
    scanSession.added += additions.length
    patchSource(root, { count: scanSession.added, status: 'scanning' })
  }
}

function applyScanSummary(summary) {
  if (!scanSession) return
  const root = summary.root || scanSession.root
  patchSource(root, {
    count: scanSession.added,
    status: summary.aborted ? 'partial' : 'ready',
    lastScanAt: Date.now(),
    errors: Number(summary.errors) || 0,
    durationMs: Number(summary.durationMs) || 0,
  })
}

async function startScan(pathOverride) {
  if (scanning.active) return
  const root = String(pathOverride ?? scanPath.value).trim()
  if (!root) {
    notify('请先选择或输入要扫描的文件夹路径', 'info')
    return
  }

  scanning.active = true
  scanning.root = root
  scanning.stats = {}
  scanning.startedAt = Date.now()
  scanning.recursive = recursive.value
  scanPath.value = root
  mobileSidebarOpen.value = false
  localStorage.setItem(LAST_PATH_KEY, root)

  const controller = new AbortController()
  scanController = controller
  let summary = null

  try {
    summary = await streamScan(
      { path: root, recursive: recursive.value },
      {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'start') {
            scanning.root = event.root || root
            beginScanSession(event.root || root)
          } else if (event.type === 'batch') {
            handleScanBatch(event)
          } else if (event.type === 'progress') {
            scanning.stats = { ...scanning.stats, ...(event.stats || {}) }
          } else if (event.type === 'done') {
            applyScanSummary(event.summary || {})
          }
        },
      },
    )

    if (summary) {
      applyScanSummary(summary)
      if (summary.limitsReached === 'results') {
        notify(
          `扫描完成，已达到结果上限（${formatNumber(summary.maxResults || 0)} 个种子）。可缩小扫描范围后重试。`,
          'info',
          { timeout: 7000 },
        )
      } else if (summary.aborted) {
        notify(`扫描已停止，已保留 ${formatNumber(scanSession?.added || 0)} 个种子`, 'info')
      } else {
        notify(
          `扫描完成：在「${sourceLabel(summary.root || root)}」发现 ${formatNumber(
            scanSession?.added || 0,
          )} 个种子`,
          'success',
        )
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      if (scanSession) {
        patchSource(scanSession.root, {
          count: scanSession.added,
          status: 'partial',
          lastScanAt: Date.now(),
        })
      }
      notify(`扫描已停止，已保留 ${formatNumber(scanSession?.added || 0)} 个种子`, 'info')
    } else {
      if (scanSession) {
        patchSource(scanSession.root, {
          count: scanSession.added,
          status: 'error',
          lastScanAt: Date.now(),
        })
      }
      notify(error.message || '扫描失败', 'error', { timeout: 8000 })
    }
  } finally {
    scanning.active = false
    scanning.root = ''
    scanning.stats = {}
    scanController = null
    scanSession = null
  }
}

function stopScan() {
  scanController?.abort()
}

function chooseFolder() {
  if (scanning.active) return
  mobileSidebarOpen.value = false
  folderPickerOpen.value = true
}

function handleFolderSelected(folderPath) {
  folderPickerOpen.value = false
  if (!folderPath) return
  scanPath.value = folderPath
  notify('已选择文件夹，点击「扫描」开始', 'info', { timeout: 2600 })
}

async function loadDrives(refresh = false) {
  try {
    const payload = await api.getDrives(refresh)
    drives.value = Array.isArray(payload.drives) ? payload.drives : []
  } catch (error) {
    notify(error.message || '无法读取磁盘列表', 'error')
  }
}

async function refreshDrives() {
  await loadDrives(true)
}

async function loadTools(refresh = false, silent = false) {
  try {
    const payload = await api.getTools(refresh)
    handleToolsPayload(payload)
  } catch (error) {
    if (!silent) notify(error.message || '无法读取打开方式列表', 'error')
  }
}

function handleToolsPayload(payload) {
  if (!payload) return
  tools.value = Array.isArray(payload.tools) ? payload.tools : []
  defaultToolId.value = payload.defaultToolId || 'system'
}

function openTools() {
  mobileSidebarOpen.value = false
  toolsOpen.value = true
}

async function removeSource(source) {
  if (source.status === 'scanning' || scanning.active) {
    notify('扫描进行中，请先停止当前扫描', 'info')
    return
  }

  const confirmed = await askConfirm({
    title: '移除扫描来源',
    message: `将从种子库移除来自「${source.root}」的 ${formatNumber(
      source.count || 0,
    )} 个种子记录。磁盘上的 .torrent 文件不会被删除。`,
    confirmText: '移除来源',
    danger: true,
  })
  if (!confirmed) return

  const removedPaths = torrents.value
    .filter((torrent) => torrent.source === source.id)
    .map((torrent) => torrent.path)

  torrents.value = torrents.value.filter((torrent) => torrent.source !== source.id)
  for (const torrentPath of removedPaths) covers.delete(torrentPath)
  saveCovers()
  removeSourceFromLibrary(source.id)
  if (filters.source === source.id) filters.source = 'all'
  if (selectedPath.value && !torrents.value.some((torrent) => torrent.path === selectedPath.value)) {
    selectedPath.value = null
  }
  notify(`已移除来源「${sourceLabel(source.root)}」`, 'success')
}

async function clearLibrary() {
  if (scanning.active) {
    notify('请先停止当前扫描', 'info')
    return
  }
  if (torrents.value.length === 0 && sources.value.length === 0) return

  const confirmed = await askConfirm({
    title: '清空种子库',
    message: '将清空浏览器中保存的所有扫描来源与种子记录。此操作不会删除磁盘上的任何文件。',
    confirmText: '清空种子库',
    danger: true,
  })
  if (!confirmed) return

  torrents.value = []
  sources.value = []
  selectedPath.value = null
  filters.source = 'all'
  filters.query = ''
  parseCache.clear()
  parseStates.clear()
  covers.clear()
  saveCovers()
  notify('种子库已清空', 'success')
}

function clearFilters() {
  filters.query = ''
  filters.source = 'all'
}

function selectSource(id) {
  filters.source = id
  mobileSidebarOpen.value = false
}

function openDetails(torrent) {
  selectedPath.value = torrent.path
  if (!parseCache.has(torrent.path) && !parseStates.get(torrent.path)?.loading) {
    parseTorrent(torrent, { force: false, notifyError: false })
  }
}

async function parseTorrent(torrent, { force = false, notifyError = true } = {}) {
  const key = torrent.path
  if (parseStates.get(key)?.loading) return null
  if (!force && parseCache.has(key)) return parseCache.get(key)

  parseStates.set(key, { loading: true, error: null })
  try {
    const payload = await api.parseTorrent(key, force)
    parseCache.set(key, payload.torrent)
    applyParsedSummary(torrent, payload)
    parseStates.delete(key)
    if (notifyError) notify(`「${payload.torrent.name}」解析完成`, 'success')
    return payload.torrent
  } catch (error) {
    parseStates.set(key, { loading: false, error: error.message || '解析失败' })
    if (notifyError) notify(error.message || '解析失败', 'error', { timeout: 8000 })
    return null
  }
}

function applyParsedSummary(torrent, payload) {
  const parsed = payload?.torrent
  if (!parsed) return
  parsedSummaries.set(torrent.path, {
    path: torrent.path,
    fileName: parsed.fileName || torrent.fileName,
    fileSize: parsed.fileSize || torrent.size,
    fileMtimeMs: parsed.fileMtimeMs || torrent.mtimeMs,
    name: parsed.name,
    totalSize: parsed.totalSize,
    fileCount: parsed.fileCount,
    version: parsed.version,
    infoHashV1: parsed.infoHashV1 || '',
    infoHashV2: parsed.infoHashV2 || '',
    parsedAt: payload.parsedAt || '',
  })
}

async function loadParsedSummaries() {
  try {
    const payload = await api.listParsed()
    for (const entry of Array.isArray(payload?.entries) ? payload.entries : []) {
      if (!entry || typeof entry.path !== 'string' || !entry.path) continue
      parsedSummaries.set(entry.path, entry)
    }
  } catch (error) {
    console.warn('[parse] 读取后端解析缓存失败', error)
  }
}

async function parseAllTorrents() {
  if (parseAllBusy.value) return

  const queue = [...torrents.value]
  if (!queue.length) {
    notify('当前没有可解析的种子', 'info')
    return
  }

  parseAllBusy.value = true
  parseAllProgress.done = 0
  parseAllProgress.total = queue.length

  let parsed = 0
  let cached = 0
  let failed = 0
  let lastError = ''

  const worker = async () => {
    while (queue.length) {
      const torrent = queue.shift()
      if (!torrent) continue

      try {
        const payload = await api.parseTorrent(torrent.path, false)
        applyParsedSummary(torrent, payload)
        // 仅保留摘要，避免把全部种子内容堆进内存；
        // 正在查看详情的种子才保留完整解析结果。
        if (selectedPath.value === torrent.path) {
          parseCache.set(torrent.path, payload.torrent)
        }
        if (payload.cached) cached += 1
        else parsed += 1
      } catch (error) {
        failed += 1
        lastError = error.message || '解析失败'
      } finally {
        parseAllProgress.done += 1
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PARSE_WORKERS, queue.length) }, () => worker()),
  )

  parseAllBusy.value = false

  if (parsed === 0 && cached === 0 && failed > 0) {
    notify(`批量解析失败：${lastError || '请稍后重试'}`, 'error', { timeout: 8000 })
    return
  }

  const parts = []
  if (parsed > 0) parts.push(`新解析 ${parsed} 个`)
  if (cached > 0) parts.push(`使用缓存 ${cached} 个`)
  if (failed > 0) parts.push(`失败 ${failed} 个`)
  notify(`批量解析完成：${parts.join('，')}`, failed > 0 ? 'info' : 'success', {
    timeout: 6000,
  })
}

function handleParse(torrent) {
  parseTorrent(torrent, { force: true, notifyError: true })
}

async function handleOpen({ torrent, toolId }) {
  try {
    const payload = await api.openTorrent(torrent.path, toolId || defaultToolId.value)
    notify(`已使用「${payload.tool?.name || '打开方式'}」打开种子`, 'success')
  } catch (error) {
    notify(error.message || '打开失败', 'error', { timeout: 8000 })
  }
}

async function handleReveal(torrent) {
  try {
    await api.revealTorrent(torrent.path)
    notify('已在文件资源管理器中定位种子', 'info', { timeout: 2600 })
  } catch (error) {
    notify(error.message || '无法打开文件位置', 'error')
  }
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function onGlobalKeydown(event) {
  if (folderPickerOpen.value || toolsOpen.value) return
  const typing = isTypingTarget(event.target)
  if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
    return
  }

  if (event.key === 'Escape') {
    if (mobileSidebarOpen.value) {
      mobileSidebarOpen.value = false
      return
    }
    if (document.activeElement === searchInput.value) {
      if (filters.query) filters.query = ''
      searchInput.value?.blur()
    }
  }
}

function onWindowResize() {
  if (window.innerWidth > 960) mobileSidebarOpen.value = false
}

onMounted(() => {
  restoreLibrary()
  restoreCovers()
  restoreViewMode()
  loadParsedSummaries()
  loadDrives(false)
  loadTools(false, true)
  window.addEventListener('keydown', handleCoverPreviewKeydown, true)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCoverPreviewKeydown, true)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('resize', onWindowResize)
  scanController?.abort()
  if (saveTimer) window.clearTimeout(saveTimer)
  if (coverSaveTimer) window.clearTimeout(coverSaveTimer)
})
</script>

<template>
  <div class="app-shell" :class="{ 'mobile-sidebar-open': mobileSidebarOpen }">
    <AppSidebar
      class="app-sidebar"
      v-model:scan-path="scanPath"
      v-model:recursive="recursive"
      :drives="drives"
      :sources="sources"
      :active-source="filters.source"
      :stats="libraryStats"
      :scanning="scanning.active"
      :default-tool-name="defaultToolName"
      @scan="startScan()"
      @pick-folder="chooseFolder"
      @select-source="selectSource"
      @remove-source="removeSource"
      @open-tools="openTools"
      @refresh-drives="refreshDrives"
      @close="mobileSidebarOpen = false"
    />

    <div class="workspace">
      <header class="topbar">
        <button
          class="mobile-menu-btn"
          type="button"
          aria-label="打开扫描设置"
          :aria-expanded="mobileSidebarOpen"
          @click="mobileSidebarOpen = !mobileSidebarOpen"
        >
          <Menu v-if="!mobileSidebarOpen" :size="18" />
          <X v-else :size="18" />
        </button>
        <div class="topbar-left">
          <div class="breadcrumb">
            <Layers3 :size="14" />
            <span>种子库</span>
            <ChevronRight :size="12" />
            <span class="breadcrumb-current">{{ currentTitle }}</span>
          </div>
        </div>

        <div class="field topbar-search">
          <Search :size="15" />
          <input
            ref="searchInput"
            v-model="filters.query"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="搜索种子名称或路径…"
            aria-label="搜索种子"
          />
          <button
            v-if="filters.query"
            class="search-clear"
            type="button"
            aria-label="清空搜索"
            @click="filters.query = ''"
          >
            <X :size="13" />
          </button>
          <kbd v-else class="kbd">/</kbd>
        </div>

        <div class="topbar-actions">
          <div class="view-switch" role="group" aria-label="切换视图">
            <button
              class="view-btn"
              :class="{ active: viewMode === 'list' }"
              type="button"
              title="列表视图"
              aria-label="列表视图"
              @click="setViewMode('list')"
            >
              <List :size="14" />
            </button>
            <button
              class="view-btn"
              :class="{ active: viewMode === 'grid' }"
              type="button"
              title="大图标视图"
              aria-label="大图标视图"
              @click="setViewMode('grid')"
            >
              <LayoutGrid :size="14" />
            </button>
          </div>
          <div class="result-pill">
            <span class="result-dot" :class="{ active: scanning.active }"></span>
            {{ formatNumber(visibleTorrents.length) }} 个结果
          </div>
          <button
            class="btn tools-btn cover-btn"
            type="button"
            :disabled="coversBusy || scanning.active || visibleTorrents.length === 0"
            :title="coversBusy ? '正在从游民星空查找游戏封面' : '从游民星空单机区查找游戏封面与评分（已有封面的种子会跳过）'"
            @click="updateCovers"
          >
            <RefreshCw v-if="coversBusy" :size="15" class="spin" />
            <ImagePlus v-else :size="15" />
            <span>{{ coversBusy ? `更新中 ${coverProgress.done}/${coverProgress.total}` : '更新封面' }}</span>
          </button>
          <button
            class="btn tools-btn"
            type="button"
            :disabled="parseAllBusy || scanning.active || torrents.length === 0"
            :title="parseAllBusy ? '正在解析种子内容，结果保存在本地' : '一键解析种子库中全部种子的内容（结果保存在后端本地）'"
            @click="parseAllTorrents"
          >
            <LoaderCircle v-if="parseAllBusy" :size="15" class="spin" />
            <ListChecks v-else :size="15" />
            <span>{{ parseAllBusy ? `解析中 ${parseAllProgress.done}/${parseAllProgress.total}` : '全部解析' }}</span>
          </button>
          <button class="btn tools-btn" type="button" @click="openTools">
            <Settings2 :size="15" />
            <span>打开方式</span>
          </button>
        </div>
      </header>

      <main class="main scroll-thin">
        <div class="main-inner">
          <ScanProgress
            v-if="scanning.active"
            :root="scanning.root"
            :stats="scanning.stats"
            :recursive="scanning.recursive"
            :started-at="scanning.startedAt"
            @stop="stopScan"
          />

          <section class="page-heading">
            <div class="heading-copy">
              <div class="eyebrow">
                <span class="eyebrow-mark"></span>
                Local Torrent Library
              </div>
              <h1>{{ currentTitle }}</h1>
              <p>{{ headingSubtitle }}</p>
            </div>

            <div class="heading-actions">
              <SortControl
                :model-value="filters.sort"
                :order="filters.order"
                :options="sortOptions"
                @update:model-value="changeSortField"
                @update:order="toggleSortOrder"
              />
              <button
                v-if="torrents.length || sources.length"
                class="btn btn-ghost clear-btn"
                type="button"
                :disabled="scanning.active"
                @click="clearLibrary"
              >
                <Trash2 :size="14" />
                清空
              </button>
            </div>
          </section>

          <div v-if="hasFilters" class="filter-bar">
            <span class="filter-label">筛选</span>
            <button
              v-if="filters.source !== 'all'"
              class="filter-tag"
              type="button"
              @click="filters.source = 'all'"
            >
              来源：{{ currentTitle }}
              <X :size="11" />
            </button>
            <button v-if="filters.query" class="filter-tag" type="button" @click="filters.query = ''">
              关键词：{{ filters.query }}
              <X :size="11" />
            </button>
            <button class="filter-clear" type="button" @click="clearFilters">清除全部</button>
          </div>

          <TorrentList
            :torrents="visibleTorrents"
            :parse-cache="parseCache"
            :parse-states="parseStates"
            :summaries="parsedSummaries"
            :covers="covers"
            :tools="tools"
            :default-tool-id="defaultToolId"
            :view-mode="viewMode"
            :scanning="scanning.active"
            :has-filters="hasFilters"
            :scan-path="scanPath"
            :total="torrents.length"
            @open-details="openDetails"
            @parse="handleParse"
            @open="handleOpen"
            @reveal="handleReveal"
            @preview-cover="openCoverPreview"
            @manage-tools="openTools"
            @browse="chooseFolder"
            @scan="startScan()"
            @clear-filters="clearFilters"
          />

          <footer class="page-footer">
            <span class="footer-note">
              <ShieldCheck :size="13" />
              解析与打开操作均在本机完成，种子文件不会被上传
            </span>
            <span class="footer-note">支持 BitTorrent v1 / v2 / 混合种子</span>
          </footer>
        </div>
      </main>
    </div>

    <Transition name="backdrop">
      <div
        v-if="mobileSidebarOpen"
        class="mobile-backdrop"
        @click="mobileSidebarOpen = false"
      ></div>
    </Transition>

    <DetailsDrawer
      :torrent="selectedTorrent"
      :parsed="selectedParsed"
      :parse-state="selectedParseState"
      :cover="selectedCover"
      :tools="tools"
      :default-tool-id="defaultToolId"
      @close="selectedPath = null"
      @parse="handleParse"
      @open="handleOpen"
      @reveal="handleReveal"
      @preview-cover="openCoverPreview"
      @manage-tools="openTools"
      @notify="notify"
    />

    <ToolsDialog
      v-if="toolsOpen"
      :tools="tools"
      :default-tool-id="defaultToolId"
      @close="toolsOpen = false"
      @updated="handleToolsPayload"
      @notify="notify"
    />

    <FolderPickerDialog
      v-if="folderPickerOpen"
      :initial-path="scanPath"
      :drives="drives"
      @close="folderPickerOpen = false"
      @select="handleFolderSelected"
    />

    <ConfirmDialog
      :state="confirmState"
      @confirm="settleConfirm(true)"
      @cancel="settleConfirm(false)"
    />

    <ToastHost :toasts="toasts" @dismiss="dismissToast" />

    <Teleport to="body">
      <Transition name="cover-preview">
        <div
          v-if="coverPreview"
          class="cover-preview-layer"
          role="dialog"
          aria-modal="true"
          aria-label="游戏封面预览"
          @click.self="closeCoverPreview"
        >
          <figure class="cover-preview-card">
            <button
              class="cover-preview-close"
              type="button"
              aria-label="关闭封面预览"
              @click="closeCoverPreview"
            >
              <X :size="18" />
            </button>
            <img
              :src="coverPreview.src"
              :alt="coverPreview.title || '游戏封面'"
              referrerpolicy="no-referrer"
            />
            <figcaption>
              <span class="cover-preview-title">{{ coverPreview.title || '游戏封面' }}</span>
              <span class="cover-preview-hint">点击背景或按 Esc 关闭</span>
            </figcaption>
          </figure>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
}

.workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.topbar {
  display: flex;
  height: 68px;
  flex: none;
  align-items: center;
  gap: 18px;
  padding: 0 26px;
  border-bottom: 1px solid var(--line);
  background: rgba(8, 12, 19, 0.6);
  backdrop-filter: blur(14px);
}

.mobile-menu-btn {
  display: none;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--muted);
}

.mobile-menu-btn:hover {
  color: var(--text);
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.055);
}

.topbar-left {
  min-width: 0;
  flex: 1;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  color: var(--muted-2);
  font-size: 11px;
  white-space: nowrap;
}

.breadcrumb-current {
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
}

.topbar-search {
  width: min(500px, 100%);
  flex: 0 1 500px;
  height: 38px;
}

.topbar-search input {
  font-size: 12.5px;
}

.search-clear {
  display: grid;
  width: 22px;
  height: 22px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted-2);
}

.search-clear:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.topbar-actions {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}

.result-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9.5px;
  white-space: nowrap;
}

.result-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--muted-2);
}

.result-dot.active {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(94, 234, 212, 0.7);
  animation: pulse-dot 1.4s ease-in-out infinite;
}

.tools-btn {
  height: 34px;
  font-size: 12px;
}

.view-switch {
  display: flex;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.022);
}

.view-btn {
  display: grid;
  width: 30px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted-2);
  transition:
    color 140ms ease,
    background 140ms ease;
}

.view-btn:hover {
  color: var(--text);
}

.view-btn.active {
  background: rgba(94, 234, 212, 0.12);
  color: var(--accent);
}

.cover-preview-layer {
  position: fixed;
  z-index: 960;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 36px;
  background: rgba(3, 6, 10, 0.86);
  backdrop-filter: blur(10px);
  cursor: zoom-out;
}

.cover-preview-card {
  position: relative;
  display: flex;
  max-width: min(92vw, 560px);
  max-height: 90vh;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  cursor: default;
}

.cover-preview-card img {
  display: block;
  max-width: 100%;
  max-height: calc(90vh - 74px);
  border: 1px solid rgba(167, 139, 250, 0.24);
  border-radius: 14px;
  background: #0b1017;
  object-fit: contain;
  box-shadow: 0 34px 90px -24px rgba(0, 0, 0, 0.9);
}

.cover-preview-card figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.cover-preview-title {
  overflow: hidden;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-preview-hint {
  flex: none;
  color: var(--muted-2);
  font-size: 10.5px;
}

.cover-preview-close {
  position: absolute;
  z-index: 1;
  top: -14px;
  right: -14px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: rgba(12, 18, 26, 0.94);
  color: var(--text-soft);
}

.cover-preview-close:hover {
  border-color: rgba(94, 234, 212, 0.32);
  color: var(--accent);
}

.cover-preview-enter-active,
.cover-preview-leave-active {
  transition: opacity 180ms ease;
}

.cover-preview-enter-from,
.cover-preview-leave-to {
  opacity: 0;
}

.main {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.main-inner {
  display: flex;
  max-width: 1540px;
  flex-direction: column;
  gap: 18px;
  margin: 0 auto;
  padding: 26px clamp(18px, 2.6vw, 36px) 30px;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 2px 1px 0;
}

.heading-copy {
  min-width: 0;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted-2);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.eyebrow-mark {
  width: 14px;
  height: 1px;
  background: var(--accent);
}

.heading-copy h1 {
  margin-top: 5px;
  font-size: clamp(23px, 2.4vw, 29px);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.heading-copy p {
  max-width: 720px;
  margin-top: 5px;
  overflow: hidden;
  color: var(--muted-2);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heading-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 7px;
}

.clear-btn {
  height: 34px;
  font-size: 11px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: -4px;
  padding: 0 2px;
}

.filter-label {
  color: var(--muted-2);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.filter-tag {
  display: inline-flex;
  height: 24px;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid rgba(94, 234, 212, 0.18);
  border-radius: 6px;
  background: var(--accent-soft);
  color: #a7f3d0;
  font-size: 10px;
}

.filter-tag:hover {
  border-color: rgba(94, 234, 212, 0.32);
}

.filter-clear {
  border: 0;
  background: transparent;
  color: var(--muted-2);
  font-size: 10px;
}

.filter-clear:hover {
  color: var(--text);
}

.page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
  color: var(--muted-2);
  font-size: 9.5px;
}

.footer-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.footer-note svg {
  color: rgba(52, 211, 153, 0.6);
}

.mobile-backdrop {
  display: none;
}

@media (max-width: 1200px) {
  .app-shell {
    grid-template-columns: 266px minmax(0, 1fr);
  }

  .breadcrumb {
    display: none;
  }

  .topbar-left {
    display: none;
  }

  .topbar-search {
    flex: 1;
    max-width: none;
  }

  .topbar-actions {
    flex: none;
  }
}

@media (max-width: 960px) {
  .app-shell {
    display: block;
    height: 100vh;
    overflow-y: auto;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 60;
    padding: 0 14px;
  }

  .mobile-menu-btn {
    display: grid;
  }

  .main-inner {
    padding: 20px 16px 28px;
  }

  .app-shell :deep(.sidebar) {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 90;
    width: min(320px, 88vw);
    min-height: 0;
    border-right: 1px solid var(--line-strong);
    border-bottom: 0;
    box-shadow: 30px 0 80px -30px rgba(0, 0, 0, 0.9);
    transform: translateX(-104%);
    transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .app-shell.mobile-sidebar-open :deep(.sidebar) {
    transform: translateX(0);
  }

  .app-shell :deep(.sidebar-scroll) {
    overflow-y: auto;
  }

  .app-shell :deep(.drives) {
    grid-template-columns: 1fr 1fr;
  }

  .mobile-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: block;
    background: rgba(3, 6, 10, 0.64);
    backdrop-filter: blur(3px);
  }

  .backdrop-enter-active,
  .backdrop-leave-active {
    transition: opacity 220ms ease;
  }

  .backdrop-enter-from,
  .backdrop-leave-to {
    opacity: 0;
  }
}

@media (max-width: 720px) {
  .topbar {
    height: 60px;
    gap: 10px;
  }

  .result-pill {
    display: none;
  }

  .tools-btn span {
    display: none;
  }

  .tools-btn {
    width: 34px;
    padding: 0;
  }

  .page-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .heading-actions {
    width: 100%;
    justify-content: space-between;
  }

  .page-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
}
</style>
