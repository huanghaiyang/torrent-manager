import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { HttpError } from './errors.js'
import { getSettings, updateSettings } from './settings.js'

const DETECT_CACHE_MS = 30_000
let detectCache = { at: 0, tools: null }

const SYSTEM_TOOL = {
  id: 'system',
  name: '系统默认应用',
  description: '交给 Windows 关联的 BT 客户端打开',
  source: 'system',
  path: null,
  args: '',
  available: true,
}

function candidateGroups() {
  if (process.platform !== 'win32') return []

  const env = process.env
  const pf = env.ProgramFiles || 'C:\\Program Files'
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const local = env.LOCALAPPDATA || ''
  const appData = env.APPDATA || ''

  const join = (...parts) => path.join(...parts.filter(Boolean))

  return [
    {
      id: 'qbittorrent',
      name: 'qBittorrent',
      description: '开源、无广告的 BitTorrent 客户端',
      paths: [
        join(pf, 'qBittorrent', 'qbittorrent.exe'),
        join(pf86, 'qBittorrent', 'qbittorrent.exe'),
        join(local, 'Programs', 'qBittorrent', 'qbittorrent.exe'),
      ],
    },
    {
      id: 'bitcomet',
      name: 'BitComet',
      description: '老牌 BitTorrent / HTTP 下载工具',
      paths: [
        join(pf, 'BitComet', 'BitComet.exe'),
        join(pf86, 'BitComet', 'BitComet.exe'),
        join(local, 'Programs', 'BitComet', 'BitComet.exe'),
      ],
    },
    {
      id: 'utorrent',
      name: 'uTorrent',
      description: '轻量级 BitTorrent 客户端',
      paths: [
        join(appData, 'uTorrent', 'uTorrent.exe'),
        join(pf, 'uTorrent', 'uTorrent.exe'),
        join(pf86, 'uTorrent', 'uTorrent.exe'),
        join(local, 'Programs', 'uTorrent', 'uTorrent.exe'),
      ],
    },
    {
      id: 'transmission',
      name: 'Transmission',
      description: '简洁的跨平台 BT 客户端',
      paths: [
        join(pf, 'Transmission', 'transmission-qt.exe'),
        join(pf86, 'Transmission', 'transmission-qt.exe'),
      ],
    },
    {
      id: 'deluge',
      name: 'Deluge',
      description: '插件化的轻量 BT 客户端',
      paths: [
        join(pf, 'Deluge', 'deluge.exe'),
        join(pf86, 'Deluge', 'deluge.exe'),
      ],
    },
    {
      id: 'tixati',
      name: 'Tixati',
      description: '专注于高级功能的 BT 客户端',
      paths: [
        join(pf, 'Tixati', 'tixati.exe'),
        join(pf86, 'Tixati', 'tixati.exe'),
      ],
    },
  ]
}

function detectInstalledTools() {
  const now = Date.now()
  if (detectCache.tools && now - detectCache.at < DETECT_CACHE_MS) {
    return detectCache.tools
  }

  const seen = new Set()
  const tools = []

  for (const group of candidateGroups()) {
    const match = group.paths.find((candidate) => {
      if (!candidate || seen.has(candidate.toLowerCase())) return false
      try {
        return fs.statSync(candidate).isFile()
      } catch {
        return false
      }
    })
    if (!match) continue

    seen.add(match.toLowerCase())
    tools.push({
      id: group.id,
      name: group.name,
      description: group.description,
      source: 'detected',
      path: match,
      args: '',
      available: true,
    })
  }

  detectCache = { at: now, tools }
  return tools
}

function customToolRecord(record) {
  let available = false
  try {
    available = fs.statSync(record.path).isFile()
  } catch {
    available = false
  }

  return {
    id: record.id,
    name: record.name,
    description: available ? '自定义程序' : '程序文件不存在',
    source: 'custom',
    path: record.path,
    args: record.args || '',
    available,
  }
}

export async function getToolsPayload(forceDetect = false) {
  if (forceDetect) detectCache = { at: 0, tools: null }

  const settings = await getSettings()
  const tools = [
    SYSTEM_TOOL,
    ...detectInstalledTools(),
    ...settings.customTools.map(customToolRecord),
  ]

  const ids = new Set(tools.map((tool) => tool.id))
  const defaultToolId = ids.has(settings.defaultToolId) ? settings.defaultToolId : 'system'

  return { tools, defaultToolId }
}

function sanitizeName(name) {
  const value = String(name || '').trim()
  if (!value) throw new HttpError(400, '请填写程序名称')
  if (value.length > 60) throw new HttpError(400, '程序名称不能超过 60 个字符')
  return value
}

function sanitizeExecutablePath(input) {
  const value = String(input || '').trim()
  if (!value) throw new HttpError(400, '请选择程序文件')
  if (!path.isAbsolute(value)) throw new HttpError(400, '程序路径必须是绝对路径')

  let stat
  try {
    stat = fs.statSync(value)
  } catch {
    throw new HttpError(400, '程序文件不存在，请重新选择')
  }
  if (!stat.isFile()) throw new HttpError(400, '所选路径不是文件')

  if (process.platform === 'win32' && !/\.(exe|com)$/i.test(value)) {
    throw new HttpError(400, '请选择 .exe 可执行文件')
  }

  return path.normalize(value)
}

function sanitizeArgs(input) {
  const value = String(input || '').trim()
  if (value.length > 500) throw new HttpError(400, '启动参数不能超过 500 个字符')
  return value
}

function makeCustomId() {
  return `custom_${crypto.randomBytes(5).toString('hex')}`
}

export async function addCustomTool({ name, path: executablePath, args }) {
  const record = {
    id: makeCustomId(),
    name: sanitizeName(name),
    path: sanitizeExecutablePath(executablePath),
    args: sanitizeArgs(args),
    createdAt: new Date().toISOString(),
  }

  await updateSettings((settings) => ({
    ...settings,
    customTools: [...settings.customTools, record],
  }))

  return getToolsPayload()
}

export async function updateCustomTool(id, { name, path: executablePath, args }) {
  const settings = await getSettings()
  const existing = settings.customTools.find((tool) => tool.id === id)
  if (!existing) throw new HttpError(404, '自定义工具不存在')

  const updated = {
    ...existing,
    name: sanitizeName(name),
    path: sanitizeExecutablePath(executablePath),
    args: sanitizeArgs(args),
  }

  await updateSettings((current) => ({
    ...current,
    customTools: current.customTools.map((tool) => (tool.id === id ? updated : tool)),
  }))

  return getToolsPayload()
}

export async function deleteCustomTool(id) {
  const settings = await getSettings()
  if (!settings.customTools.some((tool) => tool.id === id)) {
    throw new HttpError(404, '自定义工具不存在')
  }

  await updateSettings((current) => ({
    ...current,
    customTools: current.customTools.filter((tool) => tool.id !== id),
    defaultToolId: current.defaultToolId === id ? 'system' : current.defaultToolId,
  }))

  return getToolsPayload()
}

export async function setDefaultTool(toolId) {
  const { tools } = await getToolsPayload()
  const tool = tools.find((entry) => entry.id === toolId)
  if (!tool) throw new HttpError(400, '未知的打开方式')
  if (!tool.available) throw new HttpError(409, '该程序当前不可用，无法设为默认')

  await updateSettings((settings) => ({ ...settings, defaultToolId: toolId }))
  return getToolsPayload()
}

function splitArgs(input) {
  const tokens = []
  let current = ''
  let quote = null
  let started = false

  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }

    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
      continue
    }

    current += char
    started = true
  }

  if (quote) throw new HttpError(400, '启动参数中的引号不匹配')
  if (started) tokens.push(current)
  return tokens
}

function buildLaunchArgs(template, filePath) {
  if (!template || !template.trim()) return [filePath]

  const variables = {
    file: filePath,
    dir: path.dirname(filePath),
    name: path.basename(filePath),
    stem: path.basename(filePath, path.extname(filePath)),
  }

  let usedPlaceholder = false
  const args = splitArgs(template).map((token) =>
    token.replace(/\{(file|dir|name|stem)\}/g, (_, key) => {
      usedPlaceholder = true
      return variables[key]
    }),
  )

  if (!usedPlaceholder) args.push(filePath)
  return args
}

export function spawnDetached(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })

    let settled = false
    child.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve()
    })
  })
}

async function openWithSystem(filePath) {
  const command =
    process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  await spawnDetached(command, [filePath], { cwd: path.dirname(filePath) })
}

export async function openTorrentWithTool(filePath, toolId) {
  const payload = await getToolsPayload()
  const tool = toolId
    ? payload.tools.find((entry) => entry.id === toolId)
    : payload.tools.find((entry) => entry.id === payload.defaultToolId)

  if (!tool) throw new HttpError(400, '未找到指定的打开方式')
  if (!tool.available) throw new HttpError(409, `「${tool.name}」当前不可用，请重新配置`)

  try {
    if (tool.source === 'system') {
      await openWithSystem(filePath)
    } else {
      const args = buildLaunchArgs(tool.args, filePath)
      await spawnDetached(tool.path, args, { cwd: path.dirname(filePath) })
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(500, `启动「${tool.name}」失败：${error.message}`, error.code)
  }

  return tool
}

export async function revealTorrent(filePath) {
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw new HttpError(404, '文件不存在，可能已被移动或删除')
  }
  if (!stat.isFile()) throw new HttpError(400, '目标不是文件')

  try {
    if (process.platform === 'win32') {
      await spawnDetached('explorer.exe', [`/select,${filePath}`], {
        cwd: path.dirname(filePath),
      })
    } else if (process.platform === 'darwin') {
      await spawnDetached('open', ['-R', filePath], { cwd: path.dirname(filePath) })
    } else {
      await spawnDetached('xdg-open', [path.dirname(filePath)], {
        cwd: path.dirname(filePath),
      })
    }
  } catch (error) {
    throw new HttpError(500, `无法打开文件所在位置：${error.message}`)
  }

  return { directory: path.dirname(filePath) }
}
