<script setup>
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-vue-next'

defineProps({
  toasts: { type: Array, default: () => [] },
})

const emit = defineEmits(['dismiss'])

const iconMap = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item"
          :class="`is-${toast.type || 'info'}`"
          role="status"
        >
          <component :is="iconMap[toast.type] || Info" :size="17" class="toast-icon" />
          <span class="toast-text">{{ toast.message }}</span>
          <button class="toast-close" type="button" aria-label="关闭提示" @click="emit('dismiss', toast.id)">
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1000;
  display: flex;
  width: min(380px, calc(100vw - 32px));
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(15, 21, 32, 0.96);
  box-shadow: var(--shadow-lg);
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.45;
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.toast-icon {
  margin-top: 1px;
  flex: none;
}

.toast-item.is-success .toast-icon {
  color: var(--success);
}

.toast-item.is-error .toast-icon {
  color: var(--danger);
}

.toast-item.is-info .toast-icon {
  color: var(--accent);
}

.toast-text {
  flex: 1;
  padding-top: 1px;
  word-break: break-word;
}

.toast-close {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-2);
}

.toast-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.toast-move {
  transition: transform 220ms ease;
}

@media (max-width: 640px) {
  .toast-stack {
    right: 16px;
    bottom: 16px;
  }
}
</style>
