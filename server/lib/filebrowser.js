import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HttpError } from './errors.js'

const MAX_ENTRIES = 2_000

export function isHiddenDirectory(name) {
  return (
    name.startsWith('.') ||
    name.startsWith('$') ||
    name.toLowerCase() === 'system volume information'
  )
}

function buildBreadcrumbs(targetPath) {
  const parsed = path.parse(targetPath)
  const root = parsed.root || path.parse(targetPath).root
  const rootName =
    process.platform === 'win32'
      ? root.replace(/[\\/]+$/, '') || root
      : root

  const crumbs = [{ name: rootName, path: root }]
  if (targetPath === root) return crumbs

  const relative = targetPath.slice(root.length)
  const parts = relative.split(path.sep).filter(Boolean)
  let current = root

  for (const part of parts) {
    current = path.join(current, part)
    crumbs.push({ name: part, path: current })
  }

  return crumbs
}

function mapFsError(error, targetPath) {
  if (error instanceof HttpError) return error

  if (error.code === 'ENOENT') {
    return new HttpError(404, `文件夹不存在：${targetPath}`)
  }
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return new HttpError(403, `没有权限访问：${targetPath}`)
  }
  if (error.code === 'ENOTDIR') {
    return new HttpError(400, '目标路径不是文件夹')
  }
  return new HttpError(500, `无法读取文件夹：${error.message}`)
}

/**
 * List the child directories of an absolute folder path for the built-in
 * folder browser. Only directories are returned; the browser is intended for
 * choosing a scan root, not for file selection.
 */
export async function listDirectory(inputPath) {
  const targetPath = path.resolve(inputPath)
  let stat

  try {
    stat = await fs.stat(targetPath)
  } catch (error) {
    throw mapFsError(error, targetPath)
  }

  if (!stat.isDirectory()) {
    throw new HttpError(400, '目标路径不是文件夹')
  }

  let dirents
  try {
    dirents = await fs.readdir(targetPath, { withFileTypes: true })
  } catch (error) {
    throw mapFsError(error, targetPath)
  }

  const entries = dirents
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(targetPath, entry.name),
      hidden: isHiddenDirectory(entry.name),
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }),
    )

  const root = path.parse(targetPath).root
  return {
    path: targetPath,
    name: path.basename(targetPath) || targetPath,
    parent: targetPath === root ? null : path.dirname(targetPath),
    breadcrumbs: buildBreadcrumbs(targetPath),
    entries: entries.slice(0, MAX_ENTRIES),
    total: entries.length,
    truncated: entries.length > MAX_ENTRIES,
  }
}

export async function getQuickLocations() {
  const home = os.homedir()
  const candidates = [
    { id: 'home', name: '个人目录', path: home, icon: 'home' },
    {
      id: 'desktop',
      name: '桌面',
      path: path.join(home, 'Desktop'),
      icon: 'desktop',
    },
    {
      id: 'downloads',
      name: '下载',
      path: path.join(home, 'Downloads'),
      icon: 'downloads',
    },
    {
      id: 'documents',
      name: '文档',
      path: path.join(home, 'Documents'),
      icon: 'documents',
    },
  ]

  const locations = []
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate.path)
      if (stat.isDirectory()) locations.push(candidate)
    } catch {
      // Skip locations that do not exist on this machine.
    }
  }

  return locations
}
