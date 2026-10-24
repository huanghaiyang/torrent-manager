<script setup>
import * as THREE from 'three'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  torrents: { type: Array, default: () => [] },
  covers: { type: Map, default: () => new Map() },
})

const emit = defineEmits(['open-details'])

const MAX_ITEMS = 72
const COVER_WIDTH = 3.2
const COVER_HEIGHT = 4.27
const COVER_GAP = 1.3

const hostRef = ref(null)
const displayCount = computed(() => Math.min(props.torrents.length, MAX_ITEMS))

let renderer = null
let scene = null
let camera = null
let group = null
let stars = null
let planeGeometry = null
let textureLoader = null
let raycaster = null
let animationId = 0
let resizeObserver = null
let items = []
let hovered = null
let dragging = false
let pointerInside = false
let pointerDown = false
let lastPointerX = 0
let dragDistance = 0
let dragVelocity = 0
let viewRotation = 0
let baseCameraZ = 24
let cameraDistance = 0
let lastFrameTime = 0

const pointer = new THREE.Vector2(-10, -10)
const textureCache = new Map()
const placeholderCache = new Map()

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function createPlaceholderTexture(torrent) {
  if (placeholderCache.has(torrent.path)) return placeholderCache.get(torrent.path)

  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#111a2b')
  gradient.addColorStop(0.55, '#0b1422')
  gradient.addColorStop(1, '#0a1119')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(94, 234, 212, 0.22)'
  ctx.lineWidth = 3
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)

  const name = String(torrent.fileName || '').replace(/\.torrent$/i, '') || '未命名种子'
  ctx.fillStyle = 'rgba(226, 240, 255, 0.86)'
  ctx.font = '600 26px "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lines = []
  let current = ''
  for (const char of name.slice(0, 42)) {
    current += char
    if (ctx.measureText(current).width > canvas.width - 70) {
      lines.push(current)
      current = ''
    }
  }
  if (current) lines.push(current)
  lines.slice(0, 3).forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 30 + index * 34)
  })

  ctx.fillStyle = 'rgba(148, 175, 200, 0.55)'
  ctx.font = '500 20px "Segoe UI", sans-serif'
  ctx.fillText('暂无封面', canvas.width / 2, canvas.height / 2 + 86)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  placeholderCache.set(torrent.path, texture)
  return texture
}

function resolveCoverTexture(torrent) {
  const url = props.covers.get(torrent.path)?.cover
  if (!url) return { texture: createPlaceholderTexture(torrent), url: '' }
  if (textureCache.has(url)) return { texture: textureCache.get(url), url }

  const texture = textureLoader.load(url, (loaded) => {
    loaded.colorSpace = THREE.SRGBColorSpace
  })
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer?.capabilities.getMaxAnisotropy?.() || 1
  textureCache.set(url, texture)
  return { texture, url }
}

function disposeItems() {
  for (const item of items) {
    group?.remove(item.mesh)
    item.mesh.material.dispose()
  }
  items = []
  hovered = null
}

function createStars() {
  const count = 900
  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    const radius = 24 + Math.random() * 60
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(Math.random() * 2 - 1)
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius
    positions[index * 3 + 1] = Math.cos(phi) * radius * 0.6
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0x9fd6ff,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  stars = new THREE.Points(geometry, material)
  scene.add(stars)
}

function layout() {
  if (!group) return
  disposeItems()

  const list = props.torrents.slice(0, MAX_ITEMS)
  if (!list.length) return

  const rows = list.length > 20 ? 2 : 1
  const perRow = Math.ceil(list.length / rows)
  const spacing = Math.min(0.42, (Math.PI * 2) / perRow)
  const radius = Math.max(12, (COVER_WIDTH * 1.26) / (2 * Math.sin(spacing / 2)))

  baseCameraZ = radius + 9
  cameraDistance = baseCameraZ
  camera.position.z = cameraDistance
  camera.lookAt(0, 0, 0)

  list.forEach((torrent, index) => {
    const row = index % rows
    const column = Math.floor(index / rows)
    const rowCount = Math.ceil((list.length - row) / rows)
    const angle = (column - (rowCount - 1) / 2) * spacing
    const { texture } = resolveCoverTexture(torrent)

    const material = new THREE.MeshBasicMaterial({ map: texture })
    const mesh = new THREE.Mesh(planeGeometry, material)
    mesh.position.set(Math.sin(angle) * radius, (row - (rows - 1) / 2) * (COVER_HEIGHT + COVER_GAP), Math.cos(angle) * radius)
    mesh.rotation.y = angle
    mesh.userData.torrent = torrent
    mesh.userData.targetScale = 1

    group.add(mesh)
    items.push({ mesh, torrent })
  })

  group.rotation.y = viewRotation
}

function updateSize() {
  const host = hostRef.value
  if (!host || !renderer || !camera) return

  const width = host.clientWidth || 1
  const height = host.clientHeight || 1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function pickMesh() {
  if (!raycaster || !camera) return null
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(
    items.map((item) => item.mesh),
    false,
  )
  return hits[0]?.object || null
}

function updatePointer(event) {
  const canvas = renderer?.domElement
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function onPointerMove(event) {
  if (!renderer?.domElement) return
  updatePointer(event)
  pointerInside = true

  if (pointerDown) {
    const deltaX = event.clientX - lastPointerX
    lastPointerX = event.clientX
    dragDistance += Math.abs(deltaX)
    viewRotation += deltaX * 0.005
    dragVelocity = deltaX * 0.005
  }
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return
  updatePointer(event)
  pointerInside = true
  pointerDown = true
  dragging = true
  dragDistance = 0
  dragVelocity = 0
  lastPointerX = event.clientX
  try {
    renderer?.domElement.setPointerCapture?.(event.pointerId)
  } catch {
    // 部分环境不支持指针捕获
  }
  hostRef.value?.classList.add('is-dragging')
}

function onPointerUp(event) {
  if (!pointerDown) return
  updatePointer(event)
  pointerDown = false
  dragging = false
  hostRef.value?.classList.remove('is-dragging')
  try {
    renderer?.domElement.releasePointerCapture?.(event.pointerId)
  } catch {
    // 忽略释放失败
  }

  if (dragDistance < 6) {
    const mesh = pickMesh()
    if (mesh?.userData?.torrent) emit('open-details', mesh.userData.torrent)
  }
}

function onPointerLeave() {
  pointerInside = false
  pointer.set(-10, -10)
}

function onWheel(event) {
  event.preventDefault()
  cameraDistance = clamp(cameraDistance + event.deltaY * 0.012, baseCameraZ * 0.55, baseCameraZ * 1.65)
}

function animate(time) {
  animationId = requestAnimationFrame(animate)

  const delta = lastFrameTime ? Math.min(time - lastFrameTime, 48) : 16
  lastFrameTime = time

  if (!dragging) {
    dragVelocity *= 0.94
    viewRotation += dragVelocity
    const idle = Math.abs(dragVelocity) < 0.0012
    if (idle) viewRotation += (pointerInside ? 0.0009 : 0.0011) * (delta / 16.7)
  }

  if (group) group.rotation.y = viewRotation

  const mesh = pointerInside ? pickMesh() : null
  hovered = mesh

  for (const item of items) {
    const target = item.mesh === hovered ? 1.12 : 1
    item.mesh.userData.targetScale = target
    const nextScale = item.mesh.scale.x + (target - item.mesh.scale.x) * 0.14
    item.mesh.scale.setScalar(nextScale)
  }

  if (renderer?.domElement) {
    renderer.domElement.style.cursor = hovered ? 'pointer' : dragging ? 'grabbing' : 'grab'
  }

  if (camera) {
    const targetZ = cameraDistance
    camera.position.z += (targetZ - camera.position.z) * 0.12
    camera.position.x += ((pointer.x > -1 && pointer.x < 1 ? pointer.x * 1.1 : 0) - camera.position.x) * 0.06
    camera.position.y += ((pointer.y > -1 && pointer.y < 1 ? -pointer.y * 0.7 : 0) + 0.4 - camera.position.y) * 0.06
    camera.lookAt(0, 0, 0)
  }

  if (stars) stars.rotation.y += 0.0004

  renderer?.render(scene, camera)
}

onMounted(() => {
  const host = hostRef.value
  if (!host) return

  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x05080e, 0.014)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400)
  camera.position.set(0, 0.4, baseCameraZ)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'
  host.appendChild(renderer.domElement)

  planeGeometry = new THREE.PlaneGeometry(COVER_WIDTH, COVER_HEIGHT)
  textureLoader = new THREE.TextureLoader()
  raycaster = new THREE.Raycaster()

  group = new THREE.Group()
  scene.add(group)

  createStars()
  updateSize()
  layout()

  const canvas = renderer.domElement
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  resizeObserver = new ResizeObserver(updateSize)
  resizeObserver.observe(host)

  animationId = requestAnimationFrame(animate)
})

watch(
  () => props.torrents.map((torrent) => `${torrent.path}|${props.covers.get(torrent.path)?.cover || ''}`).join('\n'),
  async () => {
    await nextTick()
    layout()
  },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)

  const canvas = renderer?.domElement
  if (canvas) {
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('wheel', onWheel)
  }

  resizeObserver?.disconnect()
  disposeItems()
  planeGeometry?.dispose()
  stars?.geometry.dispose()
  stars?.material.dispose()
  for (const texture of textureCache.values()) texture.dispose()
  for (const texture of placeholderCache.values()) texture.dispose()
  textureCache.clear()
  placeholderCache.clear()
  renderer?.dispose()
  if (canvas?.parentElement) canvas.parentElement.removeChild(canvas)
  renderer = null
  scene = null
  camera = null
  group = null
})
</script>

<template>
  <div ref="hostRef" class="gallery-3d">
    <div class="gallery-glow" aria-hidden="true"></div>
    <div class="gallery-hint">拖拽旋转 · 滚轮缩放 · 点击封面查看详情</div>
    <div class="gallery-meta">{{ displayCount }} / {{ torrents.length }} 个种子</div>
  </div>
</template>

<style scoped>
.gallery-3d {
  position: relative;
  height: clamp(440px, 64vh, 760px);
  margin: 10px 12px 14px;
  overflow: hidden;
  border: 1px solid rgba(94, 234, 212, 0.12);
  border-radius: 16px;
  background:
    radial-gradient(120% 90% at 50% 20%, rgba(45, 212, 191, 0.09), transparent 62%),
    radial-gradient(90% 80% at 80% 90%, rgba(139, 92, 246, 0.1), transparent 58%),
    linear-gradient(180deg, #060a12 0%, #04070c 100%);
  cursor: grab;
  user-select: none;
}

.gallery-3d.is-dragging {
  cursor: grabbing;
}

.gallery-3d canvas {
  position: absolute;
  inset: 0;
}

.gallery-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(58% 46% at 50% 44%, rgba(94, 234, 212, 0.06), transparent 72%);
}

.gallery-hint,
.gallery-meta {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  color: var(--muted-2);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.gallery-hint {
  left: 14px;
  bottom: 12px;
}

.gallery-meta {
  right: 14px;
  bottom: 12px;
  color: rgba(148, 175, 200, 0.55);
}

@media (max-width: 720px) {
  .gallery-3d {
    height: 380px;
    margin: 8px;
  }

  .gallery-hint {
    display: none;
  }
}
</style>
