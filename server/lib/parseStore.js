import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from './settings.js'

const PARSE_DIR = path.join(DATA_DIR, 'parsed')
const INDEX_PATH = path.join(PARSE_DIR, 'index.json')
const INDEX_VERSION = 1

let indexCache = null
let writeQueue = Promise.resolve()

function keyFor(filePath) {
  return crypto
    .createHash('sha1')
    .update(path.resolve(filePath).toLowerCase())
    .digest('hex')
}

async function readIndex() {
  if (indexCache) return indexCache
  try {
    const raw = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'))
    indexCache = raw && typeof raw.entries === 'object' && raw.entries ? raw.entries : {}
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[parse-store] 解析索引损坏，已重建：${error.message}`)
    }
    indexCache = {}
  }
  return indexCache
}

function summarize(entry) {
  return {
    path: entry.path,
    fileName: entry.fileName,
    fileSize: entry.fileSize,
    fileMtimeMs: entry.fileMtimeMs,
    name: entry.name,
    totalSize: entry.totalSize,
    fileCount: entry.fileCount,
    version: entry.version || 'v1',
    infoHashV1: entry.infoHashV1 || '',
    infoHashV2: entry.infoHashV2 || '',
    parsedAt: entry.parsedAt,
  }
}

/**
 * 读取后端本地的解析缓存；种子的修改时间或大小变化时视为失效。
 *
 * @param {string} filePath
 * @param {{size: number, mtimeMs: number}} stat
 * @returns {Promise<{torrent: object, parsedAt: string} | null>}
 */
export async function readParsedTorrent(filePath, stat) {
  const index = await readIndex()
  const key = keyFor(filePath)
  const entry = index[key]
  if (!entry) return null
  if (entry.fileSize !== stat.size || entry.fileMtimeMs !== stat.mtimeMs) return null

  try {
    const detail = JSON.parse(await fs.readFile(path.join(PARSE_DIR, `${key}.json`), 'utf8'))
    if (!detail?.torrent) return null
    return { torrent: detail.torrent, parsedAt: detail.parsedAt || entry.parsedAt }
  } catch {
    return null
  }
}

/**
 * 将解析结果写入 data/parsed，并同步更新索引。
 *
 * @param {string} filePath
 * @param {{size: number, mtimeMs: number}} stat
 * @param {object} parsed
 * @returns {Promise<{parsedAt: string}>}
 */
export function saveParsedTorrent(filePath, stat, parsed) {
  const task = writeQueue.then(async () => {
    await fs.mkdir(PARSE_DIR, { recursive: true })

    const key = keyFor(filePath)
    const parsedAt = new Date().toISOString()
    const normalizedPath = path.normalize(filePath)
    const fileName = path.basename(filePath)

    const record = {
      version: INDEX_VERSION,
      path: normalizedPath,
      fileName,
      fileSize: stat.size,
      fileMtimeMs: stat.mtimeMs,
      parsedAt,
      torrent: parsed,
    }

    const detailPath = path.join(PARSE_DIR, `${key}.json`)
    const tempDetail = `${detailPath}.${process.pid}.tmp`
    await fs.writeFile(tempDetail, JSON.stringify(record), 'utf8')
    await fs.rename(tempDetail, detailPath)

    const index = await readIndex()
    index[key] = {
      path: normalizedPath,
      fileName,
      fileSize: stat.size,
      fileMtimeMs: stat.mtimeMs,
      parsedAt,
      name: parsed.name || fileName,
      totalSize: Number(parsed.totalSize) || 0,
      fileCount: Number(parsed.fileCount) || 0,
      version: parsed.version || 'v1',
      infoHashV1: parsed.infoHashV1 || '',
      infoHashV2: parsed.infoHashV2 || '',
    }

    const tempIndex = `${INDEX_PATH}.${process.pid}.tmp`
    await fs.writeFile(
      tempIndex,
      JSON.stringify({ version: INDEX_VERSION, entries: index }),
      'utf8',
    )
    await fs.rename(tempIndex, INDEX_PATH)

    return { parsedAt }
  })

  writeQueue = task.catch(() => {})
  return task
}

/**
 * 返回所有已缓存解析的轻量摘要，供前端列表展示。
 *
 * @returns {Promise<object[]>}
 */
export async function listParsedSummaries() {
  const index = await readIndex()
  return Object.values(index).map(summarize)
}
