import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fetchCoverImage, isCoverImageUrl } from './covers.js'
import { HttpError } from './errors.js'
import { DATA_DIR } from './settings.js'

const COVER_DIR = path.join(DATA_DIR, 'covers')
const IMAGE_DIR = path.join(COVER_DIR, 'images')
const INDEX_PATH = path.join(COVER_DIR, 'index.json')
const INDEX_VERSION = 1
const LOCAL_PREFIX = '/api/covers/local/'

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

const TYPE_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

const IMAGE_FILE_RE = /^[a-f0-9]{40}\.(?:jpg|png|webp|gif|avif)$/

let indexCache = null
let writeQueue = Promise.resolve()
let imageQueue = Promise.resolve()
const imagePending = new Map()

function keyFor(source) {
  return crypto.createHash('sha1').update(String(source)).digest('hex')
}

function sourceOf(cover) {
  if (typeof cover !== 'string' || !cover) return ''
  if (cover.startsWith(`${LOCAL_PREFIX}`)) return ''
  if (cover.startsWith('/api/covers/image?url=')) {
    try {
      const value = decodeURIComponent(cover.slice('/api/covers/image?url='.length))
      return isCoverImageUrl(value) ? value : ''
    } catch {
      return ''
    }
  }
  return isCoverImageUrl(cover) ? cover : ''
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const torrentPath = typeof raw.path === 'string' ? raw.path.trim() : ''
  const cover = typeof raw.cover === 'string' ? raw.cover.trim() : ''
  if (!torrentPath || !cover) return null

  const source =
    typeof raw.source === 'string' && isCoverImageUrl(raw.source) ? raw.source : sourceOf(cover)

  return {
    path: path.normalize(torrentPath),
    cover,
    source,
    image: typeof raw.image === 'string' ? raw.image : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    pageUrl: typeof raw.pageUrl === 'string' ? raw.pageUrl : '',
    query: typeof raw.query === 'string' ? raw.query : '',
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    updatedAt: Number(raw.updatedAt) || 0,
  }
}

function publicEntry(entry) {
  return {
    path: entry.path,
    cover: entry.cover,
    source: entry.source || '',
    title: entry.title || '',
    pageUrl: entry.pageUrl || '',
    query: entry.query || '',
    rating: entry.rating ?? null,
    updatedAt: entry.updatedAt || 0,
  }
}

async function readIndex() {
  if (indexCache) return indexCache
  try {
    const raw = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'))
    indexCache = raw && typeof raw.entries === 'object' && raw.entries ? raw.entries : {}
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[cover-store] 封面索引损坏，已重建：${error.message}`)
    }
    indexCache = {}
  }
  return indexCache
}

async function writeIndex(index) {
  await fs.mkdir(COVER_DIR, { recursive: true })
  const tempPath = `${INDEX_PATH}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  await fs.writeFile(
    tempPath,
    JSON.stringify({ version: INDEX_VERSION, entries: index }),
    'utf8',
  )
  await fs.rename(tempPath, INDEX_PATH)
}

/**
 * 串行执行索引读改写，避免并发写入互相覆盖。
 *
 * @template T
 * @param {() => Promise<T>} mutator
 * @returns {Promise<T>}
 */
function enqueueWrite(mutator) {
  const task = writeQueue.then(mutator)
  writeQueue = task.catch(() => {})
  return task
}

async function findImageFile(hash) {
  for (const ext of Object.keys(TYPE_BY_EXT)) {
    const fileName = `${hash}.${ext}`
    try {
      await fs.access(path.join(IMAGE_DIR, fileName))
      return fileName
    } catch {
      // 继续尝试其他扩展名
    }
  }
  return ''
}

async function downloadCover(source, hash) {
  const existing = await findImageFile(hash)
  if (existing) return existing

  // fetchCoverImage 内部已接入全局限速队列与退避重试。
  const image = await fetchCoverImage(source)
  const baseType = String(image.contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const ext = EXT_BY_TYPE[baseType] || 'jpg'
  const fileName = `${hash}.${ext}`

  await fs.mkdir(IMAGE_DIR, { recursive: true })
  const tempPath = path.join(IMAGE_DIR, `${fileName}.${process.pid}.tmp`)
  await fs.writeFile(tempPath, image.buffer)
  await fs.rename(tempPath, path.join(IMAGE_DIR, fileName))
  return fileName
}

/**
 * 确保远程封面图片已保存到本地，同一地址并发请求只下载一次。
 *
 * @param {string} source
 * @returns {Promise<string>} 本地图片文件名
 */
export function ensureLocalCoverImage(source) {
  const url = String(source || '')
  if (!isCoverImageUrl(url)) throw new HttpError(400, '不支持的封面地址')

  const hash = keyFor(url)
  if (imagePending.has(hash)) return imagePending.get(hash)

  const task = downloadCover(url, hash).finally(() => imagePending.delete(hash))
  imagePending.set(hash, task)
  return task
}

async function assignLocalImage(entry) {
  if (!entry.source || entry.image) return entry
  try {
    const fileName = await ensureLocalCoverImage(entry.source)
    return {
      ...entry,
      image: fileName,
      cover: `${LOCAL_PREFIX}${fileName}`,
    }
  } catch (error) {
    // 下载失败时保留远程代理地址，后续浏览时会再次尝试本地化。
    console.warn(`[cover-store] 封面本地化失败（${entry.source}）：${error.message}`)
    return entry
  }
}

/**
 * 新增或更新封面记录。图片会串行下载到 data/covers/images。
 *
 * @param {object[]} rawEntries
 * @returns {Promise<object[]>}
 */
export function upsertCoverEntries(rawEntries) {
  return enqueueWrite(async () => {
    const index = await readIndex()
    const stored = []

    for (const raw of Array.isArray(rawEntries) ? rawEntries : []) {
      const entry = normalizeEntry(raw)
      if (!entry) continue

      const previous = index[entry.path]
      // 同一远程地址已下载过图片时直接复用，避免重复请求游民星空。
      if (!entry.image && previous?.image && previous.source === entry.source) {
        entry.image = previous.image
        entry.cover = `${LOCAL_PREFIX}${previous.image}`
      }

      index[entry.path] = entry
      stored.push({ path: entry.path, source: entry.source })
    }

    indexCache = index
    await writeIndex(index)

    // 图片下载放到后台串行执行，避免阻塞接口响应。
    for (const item of stored) {
      if (!item.source) continue
      imageQueue = imageQueue
        .then(() =>
          enqueueWrite(async () => {
            const current = await readIndex()
            const target = current[item.path]
            if (!target || target.image || target.source !== item.source) return
            const updated = await assignLocalImage(target)
            if (!updated.image) return
            current[item.path] = updated
            indexCache = current
            await writeIndex(current)
          }),
        )
        .catch(() => {})
    }

    return Object.values(index).map(publicEntry)
  })
}

async function pruneImages(index) {
  let files = []
  try {
    files = await fs.readdir(IMAGE_DIR)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  const used = new Set(Object.values(index).map((entry) => entry.image).filter(Boolean))
  for (const file of files) {
    if (used.has(file) || file.endsWith('.tmp')) continue
    await fs.rm(path.join(IMAGE_DIR, file), { force: true })
  }
}

/**
 * 删除封面记录，并清理不再被引用的本地图片。
 *
 * @param {string[]} rawPaths
 * @returns {Promise<number>}
 */
export function deleteCoverEntries(rawPaths) {
  return enqueueWrite(async () => {
    const index = await readIndex()
    let removed = 0

    for (const raw of Array.isArray(rawPaths) ? rawPaths : []) {
      const target = path.normalize(String(raw || '').trim())
      if (!index[target]) continue
      delete index[target]
      removed += 1
    }

    indexCache = index
    await writeIndex(index)
    if (removed) await pruneImages(index)
    return removed
  })
}

/**
 * @returns {Promise<object[]>}
 */
export async function listCoverEntries() {
  const index = await readIndex()
  return Object.values(index).map(publicEntry)
}

/**
 * 读取本地封面图片。
 *
 * @param {string} fileName
 * @returns {Promise<{contentType: string, buffer: Buffer}>}
 */
export async function readCoverImage(fileName) {
  const name = String(fileName || '')
  if (!IMAGE_FILE_RE.test(name)) throw new HttpError(400, '不支持的封面文件名')

  try {
    const buffer = await fs.readFile(path.join(IMAGE_DIR, name))
    const ext = name.split('.').pop()
    return { contentType: TYPE_BY_EXT[ext] || 'image/jpeg', buffer }
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, '本地封面不存在')
    throw new HttpError(500, `读取本地封面失败：${error.message}`)
  }
}
