<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import {
  AppWindow,
  Check,
  FolderOpen,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  X,
} from 'lucide-vue-next'
import { api } from '../lib/api.js'

const props = defineProps({
  tools: { type: Array, default: () => [] },
  defaultToolId: { type: String, default: 'system' },
})

const emit = defineEmits(['close', 'updated', 'notify'])

const form = reactive({
  visible: false,
  id: null,
  name: '',
  path: '',
  args: '',
})
const saving = ref(false)
const refreshing = ref(false)
const settingDefaultId = ref('')
const pendingDeleteId = ref('')
let deleteTimer = null

const systemTool = computed(() => props.tools.find((tool) => tool.source === 'system'))
const detectedTools = computed(() => props.tools.filter((tool) => tool.source === 'detected'))
const customTools = computed(() => props.tools.filter((tool) => tool.source === 'custom'))

const formTitle = computed(() => (form.id ? '编辑自定义程序' : '添加自定义程序'))

function resetDeleteState() {
  pendingDeleteId.value = ''
  if (deleteTimer) {
    window.clearTimeout(deleteTimer)
    deleteTimer = null
  }
}

function openAdd() {
  Object.assign(form, { visible: true, id: null, name: '', path: '', args: '' })
  resetDeleteState()
}

function openEdit(tool) {
  Object.assign(form, {
    visible: true,
    id: tool.id,
    name: tool.name,
    path: tool.path || '',
    args: tool.args || '',
  })
  resetDeleteState()
}

function closeForm() {
  form.visible = false
  form.id = null
}

function guessName(filePath) {
  const base = String(filePath).split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '')
}

async function browseExecutable() {
  try {
    const result = await api.pickExecutable()
    if (result.canceled || !result.path) return
    form.path = result.path
    if (!form.name.trim()) form.name = guessName(result.path)
  } catch (error) {
    emit('notify', error.message, 'error')
  }
}

async function saveForm() {
  if (saving.value) return
  if (!form.name.trim()) {
    emit('notify', '请填写程序名称', 'error')
    return
  }
  if (!form.path.trim()) {
    emit('notify', '请选择程序文件', 'error')
    return
  }

  saving.value = true
  try {
    const payload = form.id
      ? await api.updateCustomTool(form.id, {
          name: form.name,
          path: form.path,
          args: form.args,
        })
      : await api.addCustomTool({
          name: form.name,
          path: form.path,
          args: form.args,
        })
    emit('updated', payload)
    emit('notify', form.id ? '自定义程序已更新' : '自定义程序已添加', 'success')
    closeForm()
  } catch (error) {
    emit('notify', error.message, 'error')
  } finally {
    saving.value = false
  }
}

async function setDefault(tool) {
  if (settingDefaultId.value || tool.id === props.defaultToolId || !tool.available) return
  settingDefaultId.value = tool.id
  try {
    const payload = await api.setDefaultTool(tool.id)
    emit('updated', payload)
    emit('notify', `已将「${tool.name}」设为默认打开方式`, 'success')
  } catch (error) {
    emit('notify', error.message, 'error')
  } finally {
    settingDefaultId.value = ''
  }
}

async function removeCustom(tool) {
  if (pendingDeleteId.value !== tool.id) {
    resetDeleteState()
    pendingDeleteId.value = tool.id
    deleteTimer = window.setTimeout(resetDeleteState, 3500)
    return
  }

  resetDeleteState()
  try {
    const payload = await api.deleteCustomTool(tool.id)
    emit('updated', payload)
    emit('notify', '自定义程序已删除', 'success')
    if (form.id === tool.id) closeForm()
  } catch (error) {
    emit('notify', error.message, 'error')
  }
}

async function refreshDetection() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const payload = await api.getTools(true)
    emit('updated', payload)
    const detectedCount = Array.isArray(payload.tools)
      ? payload.tools.filter((tool) => tool.source === 'detected').length
      : 0
    emit('notify', `已重新检测，共找到 ${detectedCount} 个可用程序`, 'info')
  } catch (error) {
    emit('notify', error.message, 'error')
  } finally {
    refreshing.value = false
  }
}

function onKeydown(event) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (form.visible) {
    closeForm()
  } else {
    emit('close')
  }
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (deleteTimer) window.clearTimeout(deleteTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div class="modal-layer" @mousedown.self="emit('close')">
        <div class="tools-card" role="dialog" aria-modal="true" aria-labelledby="tools-title">
          <header class="tools-header">
            <div class="header-icon"><Settings2 :size="20" /></div>
            <div class="header-copy">
              <h2 id="tools-title">打开方式</h2>
              <p>管理用于打开种子的本机 BT 客户端或任意自定义程序</p>
            </div>
            <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">
              <X :size="18" />
            </button>
          </header>

          <div class="tools-body scroll-thin">
            <div class="toolbar-line">
              <span class="hint">
                <Check :size="13" />
                默认打开方式会用于列表中的「打开」按钮
              </span>
              <button class="btn btn-sm" type="button" :disabled="refreshing" @click="refreshDetection">
                <RefreshCw :size="13" :class="{ spin: refreshing }" />
                重新检测
              </button>
            </div>

            <section class="tool-group">
              <div class="group-title">系统</div>
              <div
                v-if="systemTool"
                class="tool-row"
                :class="{ 'is-default': systemTool.id === defaultToolId }"
              >
                <span class="tool-icon is-system"><Monitor :size="18" /></span>
                <div class="tool-info">
                  <div class="tool-name-line">
                    <span class="tool-name">{{ systemTool.name }}</span>
                    <span v-if="systemTool.id === defaultToolId" class="badge badge-accent">
                      <Check :size="10" />
                      默认
                    </span>
                  </div>
                  <p>{{ systemTool.description }}</p>
                </div>
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="systemTool.id === defaultToolId"
                  @click="setDefault(systemTool)"
                >
                  {{ systemTool.id === defaultToolId ? '当前默认' : '设为默认' }}
                </button>
              </div>
            </section>

            <section class="tool-group">
              <div class="group-title">
                <span>已检测到的客户端</span>
                <span class="group-count">{{ detectedTools.length }}</span>
              </div>

              <div
                v-for="tool in detectedTools"
                :key="tool.id"
                class="tool-row"
                :class="{ 'is-default': tool.id === defaultToolId }"
              >
                <span class="tool-icon is-detected"><AppWindow :size="18" /></span>
                <div class="tool-info">
                  <div class="tool-name-line">
                    <span class="tool-name">{{ tool.name }}</span>
                    <span class="badge badge-violet">已检测</span>
                    <span v-if="tool.id === defaultToolId" class="badge badge-accent">
                      <Check :size="10" />
                      默认
                    </span>
                  </div>
                  <p>{{ tool.description }}</p>
                  <code class="tool-path" :title="tool.path">{{ tool.path }}</code>
                </div>
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="tool.id === defaultToolId || settingDefaultId === tool.id"
                  @click="setDefault(tool)"
                >
                  {{ tool.id === defaultToolId ? '当前默认' : '设为默认' }}
                </button>
              </div>

              <div v-if="detectedTools.length === 0" class="group-empty">
                没有检测到常见的 BT 客户端。你仍然可以使用系统默认应用，或在下方添加自定义程序。
              </div>
            </section>

            <section class="tool-group">
              <div class="group-title">
                <span>自定义程序</span>
                <span class="group-count">{{ customTools.length }}</span>
                <button class="add-btn" type="button" @click="openAdd">
                  <Plus :size="13" />
                  添加
                </button>
              </div>

              <div
                v-for="tool in customTools"
                :key="tool.id"
                class="tool-row"
                :class="{ 'is-default': tool.id === defaultToolId, unavailable: !tool.available }"
              >
                <span class="tool-icon is-custom"><AppWindow :size="18" /></span>
                <div class="tool-info">
                  <div class="tool-name-line">
                    <span class="tool-name">{{ tool.name }}</span>
                    <span class="badge badge-violet">自定义</span>
                    <span v-if="!tool.available" class="badge badge-muted">不可用</span>
                    <span v-if="tool.id === defaultToolId" class="badge badge-accent">
                      <Check :size="10" />
                      默认
                    </span>
                  </div>
                  <code class="tool-path" :title="tool.path">{{ tool.path }}</code>
                  <code v-if="tool.args" class="tool-args">参数：{{ tool.args }}</code>
                </div>
                <div class="row-actions">
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="tool.id === defaultToolId || !tool.available || settingDefaultId === tool.id"
                    @click="setDefault(tool)"
                  >
                    {{ tool.id === defaultToolId ? '当前默认' : '设为默认' }}
                  </button>
                  <button class="icon-btn" type="button" title="编辑" aria-label="编辑" @click="openEdit(tool)">
                    <Pencil :size="14" />
                  </button>
                  <button
                    class="icon-btn delete-btn"
                    type="button"
                    :class="{ confirming: pendingDeleteId === tool.id }"
                    :title="pendingDeleteId === tool.id ? '再次点击确认删除' : '删除'"
                    aria-label="删除"
                    @click="removeCustom(tool)"
                  >
                    <span v-if="pendingDeleteId === tool.id" class="confirm-text">确认</span>
                    <Trash2 v-else :size="14" />
                  </button>
                </div>
              </div>

              <div v-if="customTools.length === 0 && !form.visible" class="group-empty">
                还没有自定义程序。可以为任意 BT 客户端或支持 .torrent 参数的工具添加启动方式。
              </div>
            </section>

            <Transition name="form">
              <form v-if="form.visible" class="tool-form" @submit.prevent="saveForm">
                <div class="form-heading">
                  <span>{{ formTitle }}</span>
                  <button class="icon-btn" type="button" aria-label="关闭表单" @click="closeForm">
                    <X :size="15" />
                  </button>
                </div>

                <div class="form-grid">
                  <label class="form-field">
                    <span>程序名称</span>
                    <input v-model="form.name" type="text" placeholder="例如：qBittorrent 便携版" maxlength="60" />
                  </label>
                  <label class="form-field span-2">
                    <span>程序路径</span>
                    <div class="path-input">
                      <input v-model="form.path" type="text" placeholder="C:\Program Files\App\app.exe" spellcheck="false" />
                      <button class="btn btn-sm" type="button" @click="browseExecutable">
                        <FolderOpen :size="13" />
                        浏览
                      </button>
                    </div>
                  </label>
                  <label class="form-field span-2">
                    <span>启动参数 <small>可选</small></span>
                    <input
                      v-model="form.args"
                      type="text"
                      placeholder="例如 --open {file}（{file} 为种子路径，{dir} 为所在文件夹）"
                      spellcheck="false"
                      maxlength="500"
                    />
                    <small class="field-hint">留空时会把种子路径直接作为参数追加。支持 {file}、{dir}、{name}、{stem} 占位符。</small>
                  </label>
                </div>

                <div class="form-actions">
                  <button class="btn" type="button" :disabled="saving" @click="closeForm">取消</button>
                  <button class="btn btn-primary" type="submit" :disabled="saving">
                    <Save v-if="!saving" :size="14" />
                    <RefreshCw v-else :size="14" class="spin" />
                    {{ saving ? '保存中…' : '保存程序' }}
                  </button>
                </div>
              </form>
            </Transition>
          </div>

          <footer class="tools-footer">
            <span>所有操作仅在本机完成。程序路径必须真实存在。</span>
            <button class="btn" type="button" @click="emit('close')">完成</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-layer {
  position: fixed;
  inset: 0;
  z-index: 880;
  display: grid;
  place-items: center;
  padding: 26px 20px;
  background: rgba(3, 6, 10, 0.72);
  backdrop-filter: blur(7px);
}

.tools-card {
  display: flex;
  width: min(820px, 100%);
  max-height: min(88vh, 900px);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background:
    radial-gradient(700px 300px at 100% 0%, rgba(139, 92, 246, 0.06), transparent 65%),
    var(--panel-soft);
  box-shadow: var(--shadow-lg);
}

.tools-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}

.header-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border: 1px solid rgba(167, 139, 250, 0.24);
  border-radius: 11px;
  background: var(--violet-soft);
  color: var(--violet);
}

.header-copy {
  min-width: 0;
  flex: 1;
}

.header-copy h2 {
  font-size: 16px;
  font-weight: 650;
}

.header-copy p {
  margin-top: 2px;
  color: var(--muted-2);
  font-size: 11px;
}

.tools-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 22px;
}

.toolbar-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted-2);
  font-size: 10.5px;
}

.hint svg {
  color: var(--accent);
}

.tool-group + .tool-group {
  margin-top: 18px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.group-count {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--muted-2);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.add-btn:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

.tool-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.018);
}

.tool-row + .tool-row {
  margin-top: 6px;
}

.tool-row.is-default {
  border-color: rgba(94, 234, 212, 0.18);
  background: linear-gradient(90deg, rgba(45, 212, 191, 0.055), rgba(255, 255, 255, 0.015));
}

.tool-row.unavailable {
  opacity: 0.68;
}

.tool-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.03);
}

.tool-icon.is-system {
  border-color: rgba(94, 234, 212, 0.2);
  background: var(--accent-soft);
  color: var(--accent);
}

.tool-icon.is-detected {
  color: var(--violet);
  border-color: rgba(167, 139, 250, 0.18);
  background: var(--violet-soft);
}

.tool-icon.is-custom {
  color: var(--muted);
}

.tool-info {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.tool-name-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.tool-name {
  color: var(--text-soft);
  font-size: 12.5px;
  font-weight: 600;
}

.tool-info p {
  color: var(--muted-2);
  font-size: 10px;
  line-height: 1.5;
}

.tool-path,
.tool-args {
  overflow: hidden;
  color: var(--muted-2);
  font-size: 9px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-args {
  color: var(--muted);
}

.row-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
}

.row-actions .btn {
  margin-right: 3px;
}

.delete-btn {
  color: var(--muted-2);
}

.delete-btn.confirming {
  width: auto;
  padding: 0 7px;
  background: var(--danger-soft);
  color: var(--danger);
}

.confirm-text {
  font-size: 10px;
  font-weight: 600;
}

.group-empty {
  padding: 16px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--muted-2);
  font-size: 11px;
  line-height: 1.65;
  text-align: center;
}

.tool-form {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(45, 212, 191, 0.04), transparent),
    rgba(6, 10, 16, 0.3);
}

.form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 650;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
}

.form-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.form-field > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}

.form-field > span small {
  color: var(--muted-2);
  font-weight: 400;
}

.form-field input {
  height: 36px;
  width: 100%;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(6, 10, 16, 0.6);
  color: var(--text);
  font-size: 11.5px;
  outline: 0;
}

.form-field input:focus {
  border-color: rgba(94, 234, 212, 0.42);
  box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.07);
}

.form-field input::placeholder {
  color: var(--muted-2);
}

.span-2 {
  grid-column: 1 / -1;
}

.path-input {
  display: flex;
  gap: 7px;
}

.path-input input {
  flex: 1;
}

.field-hint {
  color: var(--muted-2);
  font-size: 9.5px;
  line-height: 1.5;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.form-actions .btn {
  height: 34px;
  font-size: 12px;
}

.tools-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
  background: rgba(8, 12, 18, 0.45);
  color: var(--muted-2);
  font-size: 10px;
}

.tools-footer .btn {
  height: 34px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}

.modal-enter-active .tools-card,
.modal-leave-active .tools-card {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .tools-card,
.modal-leave-to .tools-card {
  transform: translateY(10px) scale(0.985);
}

.form-enter-active,
.form-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.form-enter-from,
.form-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 720px) {
  .modal-layer {
    padding: 12px;
  }

  .tools-card {
    max-height: 94vh;
  }

  .tool-row {
    flex-wrap: wrap;
  }

  .row-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .tools-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .tools-footer .btn {
    width: 100%;
  }
}
</style>
