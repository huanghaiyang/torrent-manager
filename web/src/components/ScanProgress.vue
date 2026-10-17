<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertTriangle, FolderTree, Radar, ScanLine, Square, Files } from 'lucide-vue-next'
import { formatDuration, formatNumber } from '../lib/format.js'

const props = defineProps({
  root: { type: String, default: '' },
  stats: { type: Object, default: () => ({}) },
  recursive: { type: Boolean, default: true },
  startedAt: { type: Number, default: () => Date.now() },
})

const emit = defineEmits(['stop'])
const now = ref(Date.now())
let timer = null

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const elapsed = computed(() => {
  const fromServer = Number(props.stats?.durationMs)
  if (Number.isFinite(fromServer) && fromServer > 0) return fromServer
  return Math.max(0, now.value - (props.startedAt || now.value))
})

const found = computed(() => Number(props.stats?.found) || 0)
const dirs = computed(() => Number(props.stats?.dirsScanned) || 0)
const errors = computed(() => Number(props.stats?.errors) || 0)
</script>

<template>
  <section class="scan-progress" aria-live="polite">
    <div class="radar" aria-hidden="true">
      <span class="ring ring-1"></span>
      <span class="ring ring-2"></span>
      <span class="sweep"></span>
      <Radar :size="20" class="radar-icon" />
    </div>

    <div class="scan-main">
      <div class="scan-title-row">
        <span class="live-dot"></span>
        <span class="scan-title">正在扫描</span>
        <code class="scan-root" :title="root">{{ root }}</code>
        <span class="mode-chip">{{ recursive ? '包含子文件夹' : '仅当前目录' }}</span>
      </div>
      <div class="scan-stats">
        <span>
          <FolderTree :size="13" />
          已扫描 <b>{{ formatNumber(dirs) }}</b> 个目录
        </span>
        <span>
          <Files :size="13" />
          发现 <b class="accent">{{ formatNumber(found) }}</b> 个种子
        </span>
        <span>
          <ScanLine :size="13" />
          用时 <b>{{ formatDuration(elapsed) }}</b>
        </span>
        <span v-if="errors > 0" class="warn">
          <AlertTriangle :size="13" />
          {{ formatNumber(errors) }} 个目录无法访问
        </span>
      </div>
      <div class="progress-track">
        <span class="progress-bar"></span>
      </div>
    </div>

    <button class="btn btn-sm stop-btn" type="button" @click="emit('stop')">
      <Square :size="12" fill="currentColor" />
      停止
    </button>
  </section>
</template>

<style scoped>
.scan-progress {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  overflow: hidden;
  padding: 17px 18px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius);
  background:
    radial-gradient(500px 140px at 10% 0%, rgba(45, 212, 191, 0.1), transparent 70%),
    linear-gradient(180deg, rgba(20, 184, 166, 0.06), rgba(14, 19, 29, 0.92));
  box-shadow: 0 20px 44px -34px rgba(45, 212, 191, 0.55);
  animation: float-in 260ms ease both;
}

.radar {
  position: relative;
  display: grid;
  width: 52px;
  height: 52px;
  flex: none;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.25);
  border-radius: 50%;
  background: rgba(45, 212, 191, 0.06);
  color: var(--accent);
}

.ring {
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(94, 234, 212, 0.16);
  border-radius: 50%;
}

.ring-2 {
  inset: 14px;
  border-color: rgba(94, 234, 212, 0.22);
}

.sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0deg 250deg, rgba(94, 234, 212, 0.32) 340deg, transparent 360deg);
  animation: spin 2.4s linear infinite;
}

.radar-icon {
  position: relative;
  z-index: 1;
}

.scan-main {
  min-width: 0;
  flex: 1;
}

.scan-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.live-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px rgba(94, 234, 212, 0.8);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.scan-title {
  flex: none;
  font-size: 13px;
  font-weight: 650;
  color: #d7fff8;
}

.scan-root {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-chip {
  flex: none;
  padding: 1px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--muted-2);
  font-size: 10.5px;
}

.scan-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
}

.scan-stats span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.scan-stats b {
  color: var(--text-soft);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.scan-stats b.accent {
  color: var(--accent);
}

.scan-stats .warn {
  color: var(--warning);
}

.progress-track {
  position: relative;
  height: 3px;
  margin-top: 11px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(94, 234, 212, 0.09);
}

.progress-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 32%;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: scan-slide 1.8s ease-in-out infinite;
}

.stop-btn {
  flex: none;
  align-self: flex-start;
  margin-top: 2px;
  color: var(--text-soft);
}

@keyframes scan-slide {
  0% {
    left: -35%;
  }
  100% {
    left: 103%;
  }
}

@media (max-width: 760px) {
  .scan-progress {
    align-items: flex-start;
    padding: 14px;
  }

  .radar {
    width: 42px;
    height: 42px;
  }

  .mode-chip {
    display: none;
  }

  .stop-btn {
    height: 32px;
  }
}
</style>
