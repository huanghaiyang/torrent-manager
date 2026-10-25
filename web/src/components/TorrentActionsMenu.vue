<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ImageDown, LoaderCircle } from 'lucide-vue-next'

const props = defineProps({
  anchorRect: { type: Object, default: null },
  coverFetching: { type: Boolean, default: false },
  hasCover: { type: Boolean, default: false },
})

const emit = defineEmits(['fetch-cover', 'close'])
const menu = ref(null)
const menuStyle = ref({ top: '0px', left: '0px' })

function position() {
  const rect = props.anchorRect
  if (!rect) return
  const width = 208
  const estimatedHeight = 56
  const margin = 8

  let left = rect.right - width
  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin)

  let top = rect.bottom + 6
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - 6)
  }

  menuStyle.value = { top: `${top}px`, left: `${left}px`, width: `${width}px` }
}

function close() {
  emit('close')
}

function fetchCover() {
  if (props.coverFetching) return
  emit('fetch-cover')
  close()
}

function onDocumentPointer(event) {
  if (menu.value?.contains(event.target)) return
  close()
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(async () => {
  await nextTick()
  position()
  document.addEventListener('mousedown', onDocumentPointer, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', close, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointer, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', close, true)
})
</script>

<template>
  <Teleport to="body">
    <div ref="menu" class="row-actions-menu" :style="menuStyle" role="menu" aria-label="种子操作">
      <button
        class="menu-item"
        type="button"
        role="menuitem"
        :disabled="coverFetching"
        @click="fetchCover"
      >
        <LoaderCircle v-if="coverFetching" :size="14" class="spin" />
        <ImageDown v-else :size="14" />
        <span>{{ coverFetching ? '正在拉取…' : hasCover ? '重新拉取封面评分' : '拉取封面评分' }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.row-actions-menu {
  position: fixed;
  z-index: 850;
  padding: 6px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(15, 21, 32, 0.98);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(18px);
  animation: menu-in 120ms ease both;
}

.menu-item {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  gap: 9px;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-soft);
  font-size: 12.5px;
  font-weight: 550;
  text-align: left;
}

.menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.menu-item:disabled {
  opacity: 0.6;
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
