const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(bytes, fallback = '—') {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return fallback
  if (value === 0) return '0 B'

  let index = 0
  let size = value
  while (size >= 1024 && index < SIZE_UNITS.length - 1) {
    size /= 1024
    index += 1
  }

  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(index === 0 ? 0 : digits)} ${SIZE_UNITS[index]}`
}

export function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString('zh-CN')
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date).replace(/\//g, '-')
}

export function formatRelativeDate(value) {
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return formatDate(timestamp)
}

export function formatDuration(ms) {
  const total = Math.max(0, Number(ms) || 0)
  const seconds = Math.floor(total / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function formatHash(hash, head = 10, tail = 8) {
  if (!hash) return '—'
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function sourceLabel(root) {
  if (!root) return '未知来源'
  const normalized = String(root).replace(/[\\/]+$/, '')
  if (/^[A-Za-z]:$/.test(normalized)) return normalized.toUpperCase()
  if (normalized === '') return root
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) || normalized
}

export function sourcePathLabel(root) {
  const value = String(root || '')
  if (/^[A-Za-z]:[\\/]?$/.test(value)) return value.toUpperCase().replace(/[\\/]$/, '')
  return value
}

export function splitFilePath(filePath) {
  const value = String(filePath || '')
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  if (index < 0) return { directory: '', name: value }
  return {
    directory: value.slice(0, index),
    name: value.slice(index + 1),
  }
}

export function shortPath(filePath, max = 72) {
  const value = String(filePath || '')
  if (value.length <= max) return value
  const keep = Math.floor((max - 1) / 2)
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
}

export function driveTypeLabel(type) {
  return (
    {
      fixed: '本地磁盘',
      removable: '可移动磁盘',
      network: '网络驱动器',
      other: '磁盘',
    }[type] || '磁盘'
  )
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('复制失败')
}
