<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: String, default: 'mtime' },
  order: { type: String, default: 'desc' },
  options: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'update:order'])

const rootRef = ref(null)
const open = ref(false)

const currentLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label || '排序方式',
)

const orderLabel = computed(() => (props.order === 'asc' ? '正序' : '倒序'))

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function select(value) {
  if (value !== props.modelValue) emit('update:modelValue', value)
  close()
}

function toggleOrder() {
  emit('update:order', props.order === 'asc' ? 'desc' : 'asc')
}

function onDocumentPointer(event) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target)) close()
}

function onKeydown(event) {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointer, true)
  document.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointer, true)
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div ref="rootRef" class="sort-control">
    <button
      class="sort-trigger"
      :class="{ open }"
      type="button"
      title="排序方式"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
    >
      <ArrowUpDown :size="14" class="sort-icon" />
      <span class="sort-label">{{ currentLabel }}</span>
      <ChevronDown :size="13" class="sort-caret" :class="{ flip: open }" />
    </button>

    <button
      class="sort-order"
      type="button"
      :title="`当前${orderLabel}排列，点击切换`"
      :aria-label="`切换为${order === 'asc' ? '倒序' : '正序'}`"
      @click="toggleOrder"
    >
      <ArrowUp v-if="order === 'asc'" :size="14" />
      <ArrowDown v-else :size="14" />
    </button>

    <Transition name="sort-menu">
      <div v-if="open" class="sort-menu" role="listbox" aria-label="排序方式">
        <button
          v-for="option in options"
          :key="option.value"
          class="sort-option"
          :class="{ active: option.value === modelValue }"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="select(option.value)"
        >
          <span>{{ option.label }}</span>
          <Check v-if="option.value === modelValue" :size="13" class="option-check" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sort-control {
  position: relative;
  display: inline-flex;
  height: 34px;
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
  transition: border-color 150ms ease;
}

.sort-control:hover {
  border-color: var(--line-strong);
}

.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 104px;
  padding: 0 9px;
  border: 0;
  border-radius: 9px 0 0 9px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: color 150ms ease;
}

.sort-trigger:hover,
.sort-trigger.open {
  color: var(--text);
  background: rgba(255, 255, 255, 0.03);
}

.sort-icon {
  flex: none;
  color: var(--muted-2);
}

.sort-label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
}

.sort-caret {
  flex: none;
  color: var(--muted-2);
  transition: transform 160ms ease;
}

.sort-caret.flip {
  transform: rotate(180deg);
}

.sort-order {
  display: grid;
  width: 30px;
  place-items: center;
  border: 0;
  border-left: 1px solid var(--line);
  border-radius: 0 9px 9px 0;
  background: transparent;
  color: var(--muted-2);
  cursor: pointer;
  transition:
    color 150ms ease,
    background 150ms ease;
}

.sort-order:hover {
  background: rgba(94, 234, 212, 0.08);
  color: var(--accent);
}

.sort-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  display: flex;
  width: 168px;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  border: 1px solid var(--line-strong);
  border-radius: 11px;
  background: var(--panel-soft);
  box-shadow: var(--shadow-panel);
}

.sort-option {
  display: flex;
  height: 31px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-soft);
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background 130ms ease,
    color 130ms ease;
}

.sort-option:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.sort-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.option-check {
  flex: none;
  color: var(--accent);
}

.sort-menu-enter-active,
.sort-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.sort-menu-enter-from,
.sort-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 720px) {
  .sort-control {
    flex: 1;
  }
}
</style>
