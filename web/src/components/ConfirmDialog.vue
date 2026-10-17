<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, X } from 'lucide-vue-next'

const props = defineProps({
  state: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['confirm', 'cancel'])
const confirmButton = ref(null)

function onKeydown(event) {
  if (!props.state.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('confirm')
  }
}

watch(
  () => props.state.open,
  async (open) => {
    if (!open) return
    await nextTick()
    confirmButton.value?.focus()
  },
)

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="state.open" class="modal-layer" @mousedown.self="emit('cancel')">
        <div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <button class="confirm-close" type="button" aria-label="关闭" @click="emit('cancel')">
            <X :size="16" />
          </button>

          <div class="confirm-icon" :class="{ danger: state.danger }">
            <AlertTriangle :size="21" />
          </div>
          <h2 id="confirm-title">{{ state.title }}</h2>
          <p>{{ state.message }}</p>

          <div class="confirm-actions">
            <button class="btn" type="button" @click="emit('cancel')">
              {{ state.cancelText || '取消' }}
            </button>
            <button
              ref="confirmButton"
              class="btn"
              :class="state.danger ? 'btn-danger' : 'btn-primary'"
              type="button"
              @click="emit('confirm')"
            >
              {{ state.confirmText || '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-layer {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 6, 10, 0.72);
  backdrop-filter: blur(6px);
}

.confirm-card {
  position: relative;
  width: min(420px, 100%);
  padding: 24px;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 45%),
    var(--panel-soft);
  box-shadow: var(--shadow-lg);
}

.confirm-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted-2);
}

.confirm-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.confirm-icon {
  display: grid;
  width: 42px;
  height: 42px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.22);
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}

.confirm-icon.danger {
  border-color: rgba(251, 113, 133, 0.25);
  background: var(--danger-soft);
  color: var(--danger);
}

h2 {
  padding-right: 20px;
  font-size: 17px;
  font-weight: 650;
}

p {
  margin-top: 7px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}

.modal-enter-active .confirm-card,
.modal-leave-active .confirm-card {
  transition: transform 180ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .confirm-card,
.modal-leave-to .confirm-card {
  transform: translateY(6px) scale(0.98);
}
</style>
