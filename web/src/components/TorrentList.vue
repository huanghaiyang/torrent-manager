<script setup>
import {
  FileArchive,
  FolderOpen,
  FolderSearch,
  LoaderCircle,
  Magnet,
  Play,
  Radar,
  SearchX,
  Star,
} from 'lucide-vue-next'
import TorrentRow from './TorrentRow.vue'
import { formatBytes, sourceLabel } from '../lib/format.js'

const props = defineProps({
  torrents: { type: Array, default: () => [] },
  parseCache: { type: Map, default: () => new Map() },
  parseStates: { type: Map, default: () => new Map() },
  covers: { type: Map, default: () => new Map() },
  tools: { type: Array, default: () => [] },
  defaultToolId: { type: String, default: 'system' },
  scanning: { type: Boolean, default: false },
  hasFilters: { type: Boolean, default: false },
  scanPath: { type: String, default: '' },
  total: { type: Number, default: 0 },
  viewMode: { type: String, default: 'list' },
})

const emit = defineEmits([
  'open-details',
  'parse',
  'open',
  'reveal',
  'preview-cover',
  'manage-tools',
  'browse',
  'scan',
  'clear-filters',
])

function coverOf(torrent) {
  return props.covers.get(torrent.path) || null
}

function titleOf(torrent) {
  return props.parseCache.get(torrent.path)?.name || torrent.fileName
}

function ratingOf(torrent) {
  const rating = coverOf(torrent)?.rating
  return typeof rating === 'number' ? rating : null
}

function ratingClass(value) {
  if (value >= 8.5) return 'is-high'
  if (value >= 7) return 'is-mid'
  return 'is-low'
}

function sizeOf(torrent) {
  const parsed = props.parseCache.get(torrent.path)
  return formatBytes(parsed?.totalSize ?? torrent.size)
}

function previewCover(torrent) {
  const cover = coverOf(torrent)
  if (!cover?.cover) return
  emit('preview-cover', {
    src: cover.cover,
    title: cover.title || titleOf(torrent),
    pageUrl: cover.pageUrl || '',
  })
}
</script>

<template>
  <section class="library-card">
    <div v-if="viewMode === 'list'" class="list-head">
      <span>种子文件</span>
      <span>大小</span>
      <span>来源</span>
      <span>评分</span>
      <span>修改时间</span>
      <span class="head-actions">操作</span>
    </div>

    <div v-if="torrents.length">
      <div v-if="viewMode === 'grid'" class="grid-body">
        <article
          v-for="torrent in torrents"
          :key="torrent.path"
          class="grid-card"
          @click="emit('open-details', torrent)"
        >
          <div class="grid-cover">
            <button
              v-if="coverOf(torrent)"
              class="grid-cover-btn"
              type="button"
              title="查看封面大图"
              aria-label="查看封面大图"
              @click.stop="previewCover(torrent)"
            >
              <img
                :src="coverOf(torrent).cover"
                :alt="titleOf(torrent)"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            </button>
            <div v-else class="grid-cover-empty">
              <FileArchive :size="34" />
              <span>暂无封面</span>
            </div>

            <span
              v-if="ratingOf(torrent) !== null"
              class="grid-rating"
              :class="ratingClass(ratingOf(torrent))"
              title="游民星空玩家评分"
            >
              <Star :size="10" fill="currentColor" />
              {{ ratingOf(torrent).toFixed(1) }}
            </span>
            <span v-if="parseCache.get(torrent.path)" class="grid-parsed">已解析</span>

            <div class="grid-actions" @click.stop>
              <button
                class="grid-action is-primary"
                type="button"
                title="打开种子"
                @click="emit('open', { torrent, toolId: defaultToolId })"
              >
                <Play :size="12" fill="currentColor" />
                打开
              </button>
              <button
                class="grid-action"
                type="button"
                title="在文件夹中显示"
                aria-label="在文件夹中显示"
                @click="emit('reveal', torrent)"
              >
                <FolderSearch :size="13" />
              </button>
            </div>
          </div>

          <div class="grid-info">
            <span class="grid-title" :title="titleOf(torrent)">{{ titleOf(torrent) }}</span>
            <span class="grid-meta">
              <span>{{ sizeOf(torrent) }}</span>
              <span class="grid-source">{{ sourceLabel(torrent.source) }}</span>
            </span>
          </div>
        </article>
      </div>

      <div v-else class="list-body">
        <TorrentRow
          v-for="torrent in torrents"
          :key="torrent.path"
          :torrent="torrent"
          :parsed="parseCache.get(torrent.path) || null"
          :parse-state="parseStates.get(torrent.path) || null"
          :cover="covers.get(torrent.path) || null"
          :tools="tools"
          :default-tool-id="defaultToolId"
          @open-details="emit('open-details', $event)"
          @parse="emit('parse', $event)"
          @open="emit('open', $event)"
          @reveal="emit('reveal', $event)"
          @preview-cover="emit('preview-cover', $event)"
          @manage-tools="emit('manage-tools')"
        />
      </div>

      <div class="list-foot">
        <span>
          显示
          <b>{{ torrents.length }}</b>
          <template v-if="total !== torrents.length"> / {{ total }}</template>
          个种子
        </span>
        <span>点击任意{{ viewMode === 'grid' ? '卡片' : '行' }}查看种子详情</span>
      </div>
    </div>

    <div v-else-if="scanning" class="state-panel scanning-state">
      <div class="scan-orbit">
        <span></span>
        <LoaderCircle :size="25" class="spin" />
      </div>
      <h2>正在发现种子</h2>
      <p>扫描结果会实时出现在这里，你可以在上方随时停止扫描。</p>
    </div>

    <div v-else-if="hasFilters" class="state-panel">
      <div class="state-icon">
        <SearchX :size="25" />
      </div>
      <h2>没有匹配的种子</h2>
      <p>尝试修改搜索关键词，或切换到其他扫描来源。</p>
      <button class="btn" type="button" @click="emit('clear-filters')">清除筛选条件</button>
    </div>

    <div v-else class="empty-state">
      <div class="empty-visual" aria-hidden="true">
        <span class="orbit orbit-1"></span>
        <span class="orbit orbit-2"></span>
        <span class="orbit orbit-3"></span>
        <span class="empty-glow"></span>
        <Magnet :size="40" class="empty-magnet" />
      </div>

      <div class="empty-heading">
        <span class="eyebrow">Your local torrent library</span>
        <h2>把散落的种子收进一个库</h2>
        <p>
          选择一个磁盘或文件夹，扫描其中所有 <code>.torrent</code> 文件。解析后可以查看完整文件清单，
          并交给 qBittorrent、BitComet 等客户端打开。
        </p>
      </div>

      <div class="empty-steps">
        <div class="step">
          <span class="step-index">01</span>
          <span class="step-title">选择来源</span>
          <span class="step-desc">左侧输入路径，或从磁盘列表选择。</span>
        </div>
        <div class="step">
          <span class="step-index">02</span>
          <span class="step-title">扫描发现</span>
          <span class="step-desc">递归查找 .torrent，结果实时呈现。</span>
        </div>
        <div class="step">
          <span class="step-index">03</span>
          <span class="step-title">解析打开</span>
          <span class="step-desc">查看内容，调用本机第三方工具。</span>
        </div>
      </div>

      <div class="empty-actions">
        <button class="btn btn-primary btn-lg" type="button" @click="emit('browse')">
          <FolderOpen :size="17" />
          选择文件夹
        </button>
        <button v-if="scanPath" class="btn btn-lg" type="button" @click="emit('scan')">
          <Radar :size="17" />
          扫描当前路径
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.library-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 120px),
    var(--panel);
  box-shadow: var(--shadow-panel);
}

.list-head {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 128px 118px 86px 142px 258px;
  gap: 14px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
  background: rgba(9, 13, 20, 0.45);
  color: var(--muted-2);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.head-actions {
  text-align: right;
}

.list-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid var(--line);
  color: var(--muted-2);
  font-size: 10.5px;
}

.list-foot b {
  color: var(--muted);
  font-family: var(--mono);
  font-weight: 500;
}

.grid-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
  gap: 14px;
  padding: 16px;
}

.grid-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.018);
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.grid-card:hover {
  transform: translateY(-2px);
  border-color: rgba(94, 234, 212, 0.28);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
}

.grid-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background:
    linear-gradient(160deg, rgba(167, 139, 250, 0.08), rgba(94, 234, 212, 0.04)),
    rgba(9, 13, 20, 0.9);
}

.grid-cover-btn {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.grid-cover-btn img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 220ms ease;
}

.grid-card:hover .grid-cover-btn img {
  transform: scale(1.035);
}

.grid-cover-empty {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.16);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.grid-rating {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  height: 22px;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  backdrop-filter: blur(6px);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
}

.grid-rating.is-high {
  border-color: rgba(52, 211, 153, 0.35);
  background: rgba(9, 30, 22, 0.75);
  color: #86efac;
}

.grid-rating.is-mid {
  border-color: rgba(167, 139, 250, 0.35);
  background: rgba(24, 18, 40, 0.75);
  color: #c4b5fd;
}

.grid-rating.is-low {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(12, 16, 24, 0.75);
  color: var(--muted);
}

.grid-parsed {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 6px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  border-radius: 4px;
  background: rgba(9, 30, 22, 0.72);
  color: #86efac;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.grid-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px;
  background: linear-gradient(180deg, transparent, rgba(5, 8, 13, 0.88));
  opacity: 0;
  transition: opacity 160ms ease;
}

.grid-card:hover .grid-actions,
.grid-card:focus-within .grid-actions {
  opacity: 1;
}

.grid-action {
  display: inline-flex;
  height: 27px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: rgba(12, 17, 26, 0.82);
  color: var(--text-soft);
  font-size: 10.5px;
  font-weight: 600;
}

.grid-action:hover {
  border-color: rgba(255, 255, 255, 0.28);
  color: var(--text);
}

.grid-action.is-primary {
  border-color: rgba(94, 234, 212, 0.32);
  background: var(--accent-soft);
  color: #a7f3d0;
}

.grid-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 10px 11px 12px;
}

.grid-title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 560;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.grid-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--muted-2);
  font-size: 10px;
}

.grid-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-panel {
  display: flex;
  min-height: 320px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px;
  text-align: center;
}

.state-icon {
  display: grid;
  width: 54px;
  height: 54px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--muted);
}

.state-panel h2 {
  font-size: 17px;
  font-weight: 650;
}

.state-panel p {
  max-width: 420px;
  margin-top: 7px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.7;
}

.state-panel .btn {
  margin-top: 18px;
}

.scanning-state {
  min-height: 280px;
}

.scan-orbit {
  position: relative;
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.2);
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.scan-orbit span {
  position: absolute;
  inset: -8px;
  border: 1px dashed rgba(94, 234, 212, 0.2);
  border-radius: 50%;
  animation: spin 6s linear infinite;
}

.empty-state {
  display: flex;
  min-height: 540px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 54px 32px 46px;
  text-align: center;
}

.empty-visual {
  position: relative;
  display: grid;
  width: 128px;
  height: 128px;
  margin-bottom: 24px;
  place-items: center;
}

.orbit {
  position: absolute;
  border: 1px solid rgba(94, 234, 212, 0.1);
  border-radius: 50%;
}

.orbit-1 {
  inset: 8px;
  border-style: dashed;
  animation: spin 22s linear infinite;
}

.orbit-2 {
  inset: 23px;
  border-color: rgba(167, 139, 250, 0.13);
}

.orbit-3 {
  inset: 37px;
  border-color: rgba(255, 255, 255, 0.07);
}

.orbit-1::after,
.orbit-2::after {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  content: "";
}

.orbit-1::after {
  top: 4px;
  left: 20px;
  background: var(--accent);
  box-shadow: 0 0 12px rgba(94, 234, 212, 0.7);
}

.orbit-2::after {
  right: 4px;
  bottom: 7px;
  background: var(--violet);
  box-shadow: 0 0 12px rgba(167, 139, 250, 0.6);
}

.empty-glow {
  position: absolute;
  inset: 22px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(45, 212, 191, 0.16), transparent 68%);
  filter: blur(2px);
}

.empty-magnet {
  position: relative;
  z-index: 1;
  color: var(--accent);
  filter: drop-shadow(0 8px 22px rgba(45, 212, 191, 0.32));
}

.empty-heading .eyebrow {
  display: block;
  margin-bottom: 9px;
  color: var(--accent);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.empty-heading h2 {
  font-size: clamp(21px, 2.4vw, 27px);
  font-weight: 650;
  letter-spacing: -0.02em;
}

.empty-heading p {
  max-width: 540px;
  margin: 10px auto 0;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.8;
}

.empty-heading code {
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-soft);
  font-size: 11px;
}

.empty-steps {
  display: grid;
  width: min(640px, 100%);
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 28px;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.018);
  text-align: left;
}

.step-index {
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9px;
}

.step-title {
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 600;
}

.step-desc {
  color: var(--muted-2);
  font-size: 10px;
  line-height: 1.55;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}

@media (max-width: 1280px) {
  .list-head {
    grid-template-columns: minmax(240px, 1fr) 118px 86px 132px 248px;
  }

  .list-head > span:nth-child(3) {
    display: none;
  }
}

@media (max-width: 900px) {
  .list-head {
    grid-template-columns: minmax(200px, 1fr) 108px 78px 240px;
  }

  .list-head > span:nth-child(5) {
    display: none;
  }

  .grid-body {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 11px;
    padding: 12px;
  }
}

@media (max-width: 720px) {
  .list-head {
    display: none;
  }

  .list-foot {
    justify-content: center;
  }

  .list-foot > span:last-child {
    display: none;
  }

  .empty-state {
    min-height: 480px;
    padding: 40px 18px;
  }

  .empty-steps {
    grid-template-columns: 1fr;
  }

  .step {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }

  .step-desc {
    margin-left: auto;
    max-width: 60%;
    text-align: right;
  }
}
</style>
