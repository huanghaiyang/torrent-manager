<script setup>
import { computed } from 'vue'
import {
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Layers3,
  LoaderCircle,
  Magnet,
  Radar,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-vue-next'
import {
  driveTypeLabel,
  formatBytes,
  formatNumber,
  sourceLabel,
  sourcePathLabel,
} from '../lib/format.js'

const props = defineProps({
  drives: { type: Array, default: () => [] },
  sources: { type: Array, default: () => [] },
  activeSource: { type: String, default: 'all' },
  stats: { type: Object, default: () => ({ torrents: 0, size: 0, sources: 0 }) },
  scanning: { type: Boolean, default: false },
  defaultToolName: { type: String, default: '系统默认应用' },
})

const emit = defineEmits([
  'scan',
  'pick-folder',
  'select-source',
  'remove-source',
  'open-tools',
  'refresh-drives',
  'close',
])

const scanPath = defineModel('scanPath', { type: String, default: '' })
const recursive = defineModel('recursive', { type: Boolean, default: true })

const activeSourceMeta = computed(() =>
  props.sources.find((source) => source.id === props.activeSource),
)

function normalize(value) {
  return String(value || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function isDriveSelected(drive) {
  return normalize(scanPath.value) === normalize(drive.root)
}

function sourceStatus(source) {
  if (source.status === 'scanning') return '扫描中'
  if (source.status === 'partial') return '部分结果'
  if (source.status === 'error') return '扫描失败'
  return ''
}

function submitScan() {
  if (!scanPath.value.trim() || props.scanning) return
  emit('scan')
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">
        <Magnet :size="21" />
      </div>
      <div class="brand-copy">
        <div class="brand-name">Torrent Vault</div>
        <div class="brand-sub">本地种子管理器</div>
      </div>
      <span class="brand-version">v1</span>
      <button class="sidebar-close" type="button" aria-label="关闭扫描设置" @click="emit('close')">
        <X :size="17" />
      </button>
    </div>

    <div class="sidebar-scroll scroll-thin">
      <section class="panel-section scan-panel">
        <div class="section-title">
          <span>扫描来源</span>
          <button
            class="mini-icon"
            type="button"
            title="刷新磁盘列表"
            :disabled="scanning"
            @click="emit('refresh-drives')"
          >
            <RefreshCw :size="13" />
          </button>
        </div>

        <div class="field path-field">
          <FolderSearch :size="15" />
          <input
            v-model="scanPath"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="例如 D:\Downloads"
            aria-label="扫描路径"
            :disabled="scanning"
            @keyup.enter="submitScan"
          />
        </div>

        <div class="path-actions">
          <button class="btn" type="button" :disabled="scanning" @click="emit('pick-folder')">
            <FolderOpen :size="15" />
            选择文件夹
          </button>
          <button
            class="btn btn-primary scan-btn"
            type="button"
            :disabled="scanning || !scanPath.trim()"
            @click="submitScan"
          >
            <LoaderCircle v-if="scanning" :size="15" class="spin" />
            <Radar v-else :size="15" />
            {{ scanning ? '扫描中' : '扫描' }}
          </button>
        </div>

        <label class="toggle-row">
          <span class="toggle-copy">
            <span>包含子文件夹</span>
            <small>递归发现更多种子</small>
          </span>
          <button
            class="switch"
            :class="{ on: recursive }"
            type="button"
            role="switch"
            :aria-checked="recursive"
            :disabled="scanning"
            @click="recursive = !recursive"
          >
            <span></span>
          </button>
        </label>

        <div class="sub-label">
          <span>磁盘</span>
          <span class="drive-count">{{ drives.length }}</span>
        </div>

        <div v-if="drives.length" class="drives">
          <button
            v-for="drive in drives"
            :key="drive.root"
            class="drive"
            :class="{ selected: isDriveSelected(drive) }"
            type="button"
            :disabled="scanning"
            :title="`${drive.root} · ${driveTypeLabel(drive.type)}${
              drive.label ? ' · ' + drive.label : ''
            }`"
            @click="scanPath = drive.root"
          >
            <HardDrive :size="15" class="drive-icon" />
            <span class="drive-copy">
              <span class="drive-name">{{ drive.name }}</span>
              <span class="drive-label">{{ drive.label || driveTypeLabel(drive.type) }}</span>
            </span>
            <span v-if="drive.freeSpace !== null" class="drive-free">
              {{ formatBytes(drive.freeSpace) }}
            </span>
          </button>
        </div>
        <div v-else class="drive-empty">未检测到磁盘</div>
      </section>

      <section class="panel-section library-panel">
        <div class="section-title">
          <span>种子库</span>
          <span class="library-total">{{ formatNumber(stats.torrents) }}</span>
        </div>

        <button
          class="source-row all-sources"
          :class="{ active: activeSource === 'all' }"
          type="button"
          @click="emit('select-source', 'all')"
        >
          <span class="source-icon"><Layers3 :size="15" /></span>
          <span class="source-copy">
            <span class="source-name">全部种子</span>
            <span class="source-path">所有扫描来源</span>
          </span>
          <span class="source-count">{{ formatNumber(stats.torrents) }}</span>
        </button>

        <div class="source-list">
          <div
            v-for="source in sources"
            :key="source.id"
            class="source-row"
            :class="{ active: activeSource === source.id }"
          >
            <button class="source-main" type="button" @click="emit('select-source', source.id)">
              <span class="source-icon">
                <LoaderCircle v-if="source.status === 'scanning'" :size="15" class="spin" />
                <FolderClosed v-else :size="15" />
              </span>
              <span class="source-copy">
                <span class="source-name">
                  {{ sourceLabel(source.root) }}
                  <span v-if="sourceStatus(source)" class="source-status" :class="`is-${source.status}`">
                    {{ sourceStatus(source) }}
                  </span>
                </span>
                <span class="source-path" :title="sourcePathLabel(source.root)">
                  {{ sourcePathLabel(source.root) }}
                </span>
              </span>
              <span class="source-count">{{ formatNumber(source.count || 0) }}</span>
            </button>
            <button
              class="source-remove"
              type="button"
              title="移除来源"
              aria-label="移除来源"
              @click="emit('remove-source', source)"
            >
              <X :size="13" />
            </button>
          </div>
        </div>

        <p v-if="sources.length === 0" class="source-empty">
          扫描完成后，文件夹会出现在这里。
        </p>

        <div v-if="activeSourceMeta" class="source-summary">
          <span>当前来源</span>
          <strong>{{ sourceLabel(activeSourceMeta.root) }}</strong>
          <span>{{ formatNumber(activeSourceMeta.count || 0) }} 个种子</span>
        </div>

        <div class="library-stats">
          <div>
            <span>种子文件</span>
            <strong>{{ formatNumber(stats.torrents) }}</strong>
          </div>
          <div>
            <span>占用空间</span>
            <strong>{{ formatBytes(stats.size) }}</strong>
          </div>
        </div>
      </section>
    </div>

    <div class="sidebar-footer">
      <button class="tool-settings" type="button" @click="emit('open-tools')">
        <span class="tool-settings-icon"><Settings2 :size="16" /></span>
        <span class="tool-settings-copy">
          <span>打开方式</span>
          <small>{{ defaultToolName }}</small>
        </span>
        <ChevronRight :size="15" class="tool-settings-arrow" />
      </button>
      <div class="local-note">
        <ShieldCheck :size="13" />
        <span>仅在本机运行 · 文件不会被上传</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--line);
  background:
    radial-gradient(500px 260px at 15% -10%, rgba(45, 212, 191, 0.05), transparent 70%),
    linear-gradient(180deg, rgba(12, 17, 26, 0.96), rgba(8, 12, 19, 0.98));
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 78px;
  flex: none;
  padding: 0 18px;
  border-bottom: 1px solid var(--line);
}

.brand-mark {
  position: relative;
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.28);
  border-radius: 12px;
  background:
    linear-gradient(145deg, rgba(94, 234, 212, 0.17), rgba(139, 92, 246, 0.11)),
    var(--panel);
  color: var(--accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 22px -14px rgba(45, 212, 191, 0.7);
}

.brand-copy {
  min-width: 0;
  flex: 1;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.035em;
}

.brand-sub {
  margin-top: 1px;
  color: var(--muted-2);
  font-size: 10.5px;
  letter-spacing: 0.06em;
}

.brand-version {
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9.5px;
}

.sidebar-close {
  display: none;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}

.sidebar-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

@media (max-width: 960px) {
  .sidebar-close {
    display: grid;
  }
}

.sidebar-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.panel-section {
  padding: 18px 16px;
}

.panel-section + .panel-section {
  border-top: 1px solid var(--line);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.mini-icon {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-2);
}

.mini-icon:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.path-field {
  height: 39px;
}

.path-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.path-actions .btn {
  height: 36px;
  padding: 0 11px;
  font-size: 12px;
}

.path-actions .btn:first-child {
  flex: 1;
}

.scan-btn {
  min-width: 82px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  cursor: pointer;
  user-select: none;
}

.toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12.5px;
  color: var(--text-soft);
}

.toggle-copy small {
  color: var(--muted-2);
  font-size: 10.5px;
}

.switch {
  position: relative;
  width: 35px;
  height: 20px;
  flex: none;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  transition:
    background 160ms ease,
    border-color 160ms ease;
}

.switch span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--muted);
  transition:
    transform 160ms ease,
    background 160ms ease;
}

.switch.on {
  border-color: rgba(94, 234, 212, 0.4);
  background: rgba(45, 212, 191, 0.22);
}

.switch.on span {
  transform: translateX(15px);
  background: var(--accent);
}

.sub-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 1px 8px;
  color: var(--muted-2);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.drive-count {
  font-family: var(--mono);
  letter-spacing: 0;
}

.drives {
  display: grid;
  gap: 5px;
}

.drive {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  text-align: left;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

.drive:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--line);
}

.drive.selected {
  border-color: rgba(94, 234, 212, 0.2);
  background: rgba(45, 212, 191, 0.055);
}

.drive-icon {
  flex: none;
  color: var(--muted-2);
}

.drive.selected .drive-icon {
  color: var(--accent);
}

.drive-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: baseline;
  gap: 7px;
}

.drive-name {
  flex: none;
  color: var(--text-soft);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
}

.drive-label {
  overflow: hidden;
  color: var(--muted-2);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drive-free {
  flex: none;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9.5px;
}

.drive-empty {
  padding: 10px;
  border: 1px dashed var(--line);
  border-radius: 9px;
  color: var(--muted-2);
  font-size: 11px;
  text-align: center;
}

.library-total {
  color: var(--muted-2);
  font-family: var(--mono);
  letter-spacing: 0;
}

.source-row {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  text-align: left;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

button.source-row {
  padding: 8px 9px;
}

.source-row:hover {
  background: rgba(255, 255, 255, 0.035);
}

.source-row.active {
  border-color: var(--line);
  background: linear-gradient(90deg, rgba(45, 212, 191, 0.09), rgba(45, 212, 191, 0.02));
}

.source-row.active::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -1px;
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
  content: "";
}

.all-sources {
  margin-bottom: 4px;
  padding: 9px !important;
}

.source-icon {
  display: grid;
  width: 27px;
  height: 27px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--muted);
}

.source-row.active .source-icon {
  border-color: rgba(94, 234, 212, 0.2);
  background: var(--accent-soft);
  color: var(--accent);
}

.source-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.source-name {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  color: var(--text-soft);
  font-size: 12.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-path {
  overflow: hidden;
  color: var(--muted-2);
  font-size: 9.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-count {
  flex: none;
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 10px;
}

.source-status {
  flex: none;
  font-size: 9px;
  font-weight: 600;
}

.source-status.is-scanning {
  color: var(--accent);
}

.source-status.is-partial,
.source-status.is-error {
  color: var(--warning);
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 9px;
  padding: 8px 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.source-remove {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  margin-right: 5px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-2);
  opacity: 0;
  transition:
    opacity 140ms ease,
    background 140ms ease;
}

.source-row:hover .source-remove,
.source-remove:focus-visible {
  opacity: 1;
}

.source-remove:hover {
  background: rgba(251, 113, 133, 0.12);
  color: var(--danger);
}

.source-empty {
  padding: 12px 8px;
  color: var(--muted-2);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

.source-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  margin-top: 10px;
  padding: 9px 10px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted-2);
  font-size: 10.5px;
}

.source-summary strong {
  color: var(--text-soft);
  font-weight: 600;
}

.library-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 12px;
}

.library-stats > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.018);
}

.library-stats span {
  color: var(--muted-2);
  font-size: 9.5px;
  letter-spacing: 0.02em;
}

.library-stats strong {
  color: var(--text-soft);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
}

.sidebar-footer {
  flex: none;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--line);
  background: rgba(8, 12, 19, 0.75);
}

.tool-settings {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--text-soft);
  text-align: left;
}

.tool-settings:hover {
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.05);
}

.tool-settings-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  background: var(--violet-soft);
  color: var(--violet);
}

.tool-settings-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.tool-settings-copy span {
  font-size: 12px;
  font-weight: 600;
}

.tool-settings-copy small {
  overflow: hidden;
  color: var(--muted-2);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-settings-arrow {
  flex: none;
  color: var(--muted-2);
}

.local-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 10px;
  color: var(--muted-2);
  font-size: 9.5px;
}

.local-note svg {
  color: rgba(52, 211, 153, 0.65);
}
</style>
