import crypto from 'node:crypto'
import path from 'node:path'
import { decodeBencode } from './bencode.js'

export const MAX_TORRENT_BYTES = 64 * 1024 * 1024
const MAX_FILES_RETURNED = 20_000
const MAX_TREE_DEPTH = 64

function isDict(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Buffer.isBuffer(value) &&
    !Array.isArray(value)
  )
}

function asText(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (typeof value === 'string') return value
  return null
}

function firstText(...values) {
  for (const value of values) {
    const text = asText(value)
    if (text !== null && text !== '') return text
  }
  return null
}

function asInt(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function decodePathPart(value) {
  const text = asText(value)
  if (!text) return null
  return text.replace(/\0/g, '')
}

function collectV1Files(info) {
  if (Array.isArray(info.files)) {
    const files = []
    let invalid = 0

    for (const entry of info.files) {
      if (!isDict(entry)) {
        invalid += 1
        continue
      }
      const size = asInt(entry.length)
      const rawParts = entry['path.utf-8'] || entry.path
      if (size === null || !Array.isArray(rawParts)) {
        invalid += 1
        continue
      }
      const parts = rawParts.map(decodePathPart).filter(Boolean)
      if (parts.length === 0) {
        invalid += 1
        continue
      }
      files.push({ path: parts.join('/'), size })
    }

    return { files, invalid, multiFile: true }
  }

  const size = asInt(info.length)
  if (size !== null) {
    const name = firstText(info['name.utf-8'], info.name) || '未命名文件'
    return { files: [{ path: name, size }], invalid: 0, multiFile: false }
  }

  return null
}

function collectV2Files(info) {
  const tree = info['file tree']
  if (!isDict(tree)) return null

  const files = []
  let invalid = 0

  function walk(node, prefix, depth) {
    if (depth > MAX_TREE_DEPTH) {
      invalid += 1
      return
    }
    if (!isDict(node)) {
      invalid += 1
      return
    }

    for (const [rawName, child] of Object.entries(node)) {
      const name = rawName.replace(/\0/g, '')
      if (!name || !isDict(child)) {
        invalid += 1
        continue
      }

      const leaf = child['']
      if (isDict(leaf)) {
        const size = asInt(leaf.length)
        if (size === null) {
          invalid += 1
          continue
        }
        files.push({ path: [...prefix, name].join('/'), size })
      } else {
        walk(child, [...prefix, name], depth + 1)
      }
    }
  }

  walk(tree, [], 0)
  return { files, invalid, multiFile: true }
}

function collectTrackers(root) {
  const tiers = []
  const seen = new Set()

  function add(value) {
    const text = asText(value)?.trim()
    if (!text || seen.has(text)) return
    seen.add(text)
    return text
  }

  if (Array.isArray(root['announce-list'])) {
    for (const tier of root['announce-list']) {
      if (!Array.isArray(tier)) continue
      const urls = tier.map(add).filter(Boolean)
      if (urls.length > 0) tiers.push(urls)
    }
  }

  const announce = add(root.announce)
  if (announce && !tiers.some((tier) => tier.includes(announce))) {
    tiers.unshift([announce])
  }

  const trackers = []
  for (const tier of tiers) {
    for (const url of tier) {
      if (!trackers.includes(url)) trackers.push(url)
    }
  }

  return { trackers, tiers }
}

function collectWebSeeds(root) {
  const raw = root['url-list']
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  const seeds = []
  for (const value of values) {
    const text = asText(value)?.trim()
    if (text && !seeds.includes(text)) seeds.push(text)
  }
  return seeds
}

function buildMagnet({ name, infoHashV1, infoHashV2, trackers }) {
  if (!infoHashV1 && !infoHashV2) return null

  const params = []
  if (infoHashV1) params.push(`xt=urn:btih:${infoHashV1}`)
  if (infoHashV2) params.push(`xt=urn:btmh:1220${infoHashV2}`)
  params.push(`dn=${encodeURIComponent(name)}`)
  for (const tracker of trackers) params.push(`tr=${encodeURIComponent(tracker)}`)

  return `magnet:?${params.join('&')}`
}

function creationDateToIso(value) {
  const seconds = asInt(value)
  if (seconds === null) return null
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return null
  if (date.getUTCFullYear() < 1970 || date.getUTCFullYear() > 3000) return null
  return date.toISOString()
}

/**
 * Parse a .torrent buffer into UI-friendly metadata.
 *
 * @param {Buffer} buffer
 * @param {string} [sourcePath]
 */
export function parseTorrentBuffer(buffer, sourcePath = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('种子文件为空')
  }
  if (buffer.length > MAX_TORRENT_BYTES) {
    throw new Error('种子文件超过 64 MB，暂不支持解析')
  }

  const decoded = decodeBencode(buffer)
  const root = decoded.value
  if (!isDict(root)) throw new Error('种子根节点不是字典')
  if (!isDict(root.info)) throw new Error('种子缺少 info 字典')

  const info = root.info
  const metaVersion = asInt(info['meta version'])
  const isV2 = metaVersion === 2

  const name =
    firstText(info['name.utf-8'], info.name) ||
    (sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : '未命名种子')

  const v1 = collectV1Files(info)
  const v2 = isV2 && !v1 ? collectV2Files(info) : null
  const fileBlock = v1 || v2

  if (!fileBlock || fileBlock.files.length === 0) {
    throw new Error('种子中没有可识别的文件列表')
  }

  let totalSize = 0
  for (const file of fileBlock.files) {
    totalSize += file.size
    if (!Number.isSafeInteger(totalSize)) {
      throw new Error('种子内容大小超出安全范围')
    }
  }

  const hasV1 = Boolean(v1) && Buffer.isBuffer(info.pieces)
  const infoHashV1 = hasV1 ? crypto.createHash('sha1').update(decoded.infoRaw).digest('hex') : null
  const infoHashV2 = isV2
    ? crypto.createHash('sha256').update(decoded.infoRaw).digest('hex')
    : null

  const pieces = Buffer.isBuffer(info.pieces) ? info.pieces : null
  const pieceCount = pieces && pieces.length % 20 === 0 ? pieces.length / 20 : null
  const pieceLength = asInt(info['piece length'])
  const trackers = collectTrackers(root)
  const webSeeds = collectWebSeeds(root)

  const returnedFiles = fileBlock.files.slice(0, MAX_FILES_RETURNED).map((file) => ({
    path: file.path,
    size: file.size,
  }))

  return {
    name,
    totalSize,
    fileCount: fileBlock.files.length,
    files: returnedFiles,
    filesTruncated: fileBlock.files.length > returnedFiles.length,
    invalidFiles: fileBlock.invalid,
    isMultiFile: fileBlock.multiFile,
    pieceLength: pieceLength && pieceLength > 0 ? pieceLength : null,
    pieceCount,
    infoHashV1,
    infoHashV2,
    version: isV2 ? (hasV1 ? 'hybrid' : 'v2') : 'v1',
    isPrivate: info.private === 1,
    source: firstText(info.source),
    comment: firstText(root['comment.utf-8'], root.comment),
    createdBy: firstText(root['created by.utf-8'], root['created by']),
    creationDate: creationDateToIso(root['creation date']),
    trackers: trackers.trackers,
    trackerTiers: trackers.tiers,
    webSeeds,
    magnet: buildMagnet({
      name,
      infoHashV1,
      infoHashV2,
      trackers: trackers.trackers,
    }),
  }
}
