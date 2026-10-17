<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { AppWindow, Check, Monitor, Settings2 } from 'lucide-vue-next'

const props = defineProps({
  tools: { type: Array, default: () => [] },
  defaultToolId: { type: String, default: 'system' },
  anchorRect: { type: Object, default: null },
})

const emit = defineEmits(['select', 'manage', 'close'])
const menu = ref(null)
const menuStyle = ref({ top: '0px', left: '0px' })

const availableTools = computed(() => props.tools.filter(Boolean))

function position() {
  const rect = props.anchorRect
  if (!rect) return
  const width = 248
  const rowHeight = 40
  const estimatedHeight = Math.min(availableTools.value.length * rowHeight + 58, 420)
  const margin = 8

  let left = rect.right - width
  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin)

  let top = rect.bottom + 6
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - 6)
  }

  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
  }
}

function close() {
  emit('close')
}

function choose(tool) {
  if (!tool.available) return
  emit('select', tool.id)
  close()
}

function manage() {
  emit('manage')
  close()
}

function onDocumentPointer(event) {
  if (menu.value?.contains(event.target)) return
  close()
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

function onWindowChange() {
  close()
}

onMounted(async () => {
  await nextTick()
  position()
  document.addEventListener('mousedown', onDocumentPointer, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointer, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<template>
  <Teleport to="body">
    <div ref="menu" class="open-menu" :style="menuStyle" role="menu" aria-label="选择打开方式">
      <div class="menu-heading">打开方式</div>
      <button
        v-for="tool in availableTools"
        :key="tool.id"
        class="menu-item"
        :class="{ unavailable: !tool.available }"
        type="button"
        role="menuitem"
        :disabled="!tool.available"
        :title="tool.path || tool.description"
        @click="choose(tool)"
      >
        <span class="tool-icon" :class="`is-${tool.source}`">
          <Monitor v-if="tool.source === 'system'" :size="15" />
          <AppWindow v-else :size="15" />
        </span>
        <span class="tool-meta">
          <span class="tool-name">{{ tool.name }}</span>
          <span class="tool-source">
            {{ tool.source === 'detected' ? '已检测' : tool.source === 'custom' ? '自定义' : '系统' }}
          </span>
        </span>
        <Check v-if="tool.id === defaultToolId" :size="14" class="default-mark" />
      </button>

      <div class="menu-separator"></div>
      <button class="menu-item manage-item" type="button" role="menuitem" @click="manage">
        <span class="tool-icon manage-icon"><Settings2 :size="15" /></span>
        <span class="tool-name">管理打开方式…</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.open-menu {
  position: fixed;
  z-index: 850;
  max-height: 420px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(15, 21, 32, 0.98);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(18px);
  animation: menu-in 120ms ease both;
}

.menu-heading {
  padding: 5px 9px 6px;
  color: var(--muted-2);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-soft);
  text-align: left;
}

.menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.menu-item.unavailable {
  opacity: 0.45;
}

.tool-icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--muted);
}

.tool-icon.is-system {
  color: var(--accent);
  border-color: rgba(94, 234, 212, 0.2);
  background: var(--accent-soft);
}

.tool-icon.is-custom {
  color: var(--violet);
  border-color: rgba(167, 139, 250, 0.22);
  background: var(--violet-soft);
}

.tool-meta {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.tool-name {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-source {
  color: var(--muted-2);
  font-size: 10.5px;
}

.default-mark {
  flex: none;
  color: var(--accent);
}

.menu-separator {
  height: 1px;
  margin: 5px 8px;
  background: var(--line);
}

.manage-item {
  color: var(--muted);
}

.manage-icon {
  color: var(--muted-2);
}

@keyframes menu-in {
  from {
    opacity: 0;
    transform: translateY(-3px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
