<script setup>
import { FolderOpen, LoaderCircle, Magnet, Radar, SearchX } from 'lucide-vue-next'
import TorrentRow from './TorrentRow.vue'

defineProps({
  torrents: { type: Array, default: () => [] },
  parseCache: { type: Map, default: () => new Map() },
  parseStates: { type: Map, default: () => new Map() },
  tools: { type: Array, default: () => [] },
  defaultToolId: { type: String, default: 'system' },
  scanning: { type: Boolean, default: false },
  hasFilters: { type: Boolean, default: false },
  scanPath: { type: String, default: '' },
  total: { type: Number, default: 0 },
})

const emit = defineEmits([
  'open-details',
  'parse',
  'open',
  'reveal',
  'manage-tools',
  'browse',
  'scan',
  'clear-filters',
])
</script>

<template>
  <section class="library-card">
    <div class="list-head">
      <span>种子文件</span>
      <span>大小</span>
      <span>来源</span>
      <span>修改时间</span>
      <span class="head-actions">操作</span>
    </div>

    <div v-if="torrents.length" class="list-body">
      <TorrentRow
        v-for="torrent in torrents"
        :key="torrent.path"
        :torrent="torrent"
        :parsed="parseCache.get(torrent.path) || null"
        :parse-state="parseStates.get(torrent.path) || null"
        :tools="tools"
        :default-tool-id="defaultToolId"
        @open-details="emit('open-details', $event)"
        @parse="emit('parse', $event)"
        @open="emit('open', $event)"
        @reveal="emit('reveal', $event)"
        @manage-tools="emit('manage-tools')"
      />
      <div class="list-foot">
        <span>
          显示
          <b>{{ torrents.length }}</b>
          <template v-if="total !== torrents.length"> / {{ total }}</template>
          个种子
        </span>
        <span>点击任意行查看种子详情</span>
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
  grid-template-columns: minmax(260px, 1fr) 128px 118px 142px 258px;
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
    grid-template-columns: minmax(240px, 1fr) 118px 132px 248px;
  }

  .list-head > span:nth-child(3) {
    display: none;
  }
}

@media (max-width: 900px) {
  .list-head {
    grid-template-columns: minmax(200px, 1fr) 108px 240px;
  }

  .list-head > span:nth-child(4) {
    display: none;
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
