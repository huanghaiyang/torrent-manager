import { HttpError } from './errors.js'

const SEARCH_URLS = [
  'https://so.gamersky.com/all/ku',
  'https://so.gamersky.com/all/z',
]
const SEARCH_TIMEOUT_MS = 9000
const IMAGE_TIMEOUT_MS = 12000
const REQUEST_INTERVAL_MS = 1100
const REQUEST_JITTER_MS = 450
const RETRY_BASE_DELAY_MS = 3000
const RATE_LIMIT_COOLDOWN_MS = 20000
const MAX_SEARCH_ATTEMPTS = 3
const CACHE_TTL_MS = 30 * 60 * 1000
const RATING_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_LIMIT = 400
const MIN_SCORE = 0.62

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const RELEASE_TOKEN_PATTERNS = [
  /^(?:v|ver|version)?\d+(?:\.\d+){1,3}$/i,
  /^(?:19\d{2}|20[0-2]\d)$/,
  /^\d{3,4}[pi]$/i,
  /^[xh]\.?26[45]$/i,
  /^(?:aac|ac3|eac3|dts|ddp?|flac|mp3|opus|truehd|atmos)\d*$/i,
  /^(?:web|web-?dl|webrip|bluray|blu-ray|bdrip|brrip|hdrip|dvdrip|remux|hdtv|hdcam)$/i,
  /^(?:repack|proper|internal|multi\d*|readnfo|rip|iso|setup)$/i,
  /^(?:fitgirl|dodi|codex|plaza|razor1911|skidrow|reloaded|empress|tenoke|goldberg|gog|steam|epic|elamigos|rune|flt|p2p|xatab|kaos|blackbox|tinyiso)$/i,
  /^(?:update|dlc|hotfix|patch|portable|build|buildno)$/i,
  /^(?:pc|win|windows|x64|x86)$/i,
  /^(?:edition|goty|deluxe|ultimate|definitive|complete|premium|standard)$/i,
]

const CN_NOISE =
  /免安装|绿色版|破解版|汉化版|官方中文|简体中文|繁体中文|中文版|整合包|整合版|解压即玩|全DLC|赠品|修改器|高压版/gi

const cache = new Map()
const pending = new Map()
const ratingCache = new Map()
const ratingPending = new Map()

function isReleaseToken(token) {
  return RELEASE_TOKEN_PATTERNS.some((pattern) => pattern.test(token))
}

const ROMAN_NUMERALS = {
  ii: '2',
  iii: '3',
  iv: '4',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
}

function cleanToken(token) {
  const bare = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!bare || isReleaseToken(bare)) return ''

  const parts = bare.split('-').filter(Boolean)
  if (parts.length > 1) {
    const kept = parts.filter((part) => !isReleaseToken(part))
    return kept.join('-')
  }
  return bare
}

/**
 * 从种子文件名中提取用于游民星空搜索的游戏名。
 *
 * @param {string} rawName
 * @returns {string}
 */
export function buildSearchQuery(rawName) {
  let name = String(rawName || '')

  name = name.replace(/\.torrent$/i, ' ')
  name = name.replace(/\.[a-z0-9]{2,5}$/i, ' ')
  name = name.replace(/\{[^}]*\}|\[[^\]]*\]|【[^】]*】|\([^)]*\)/g, ' ')
  name = name.replace(CN_NOISE, ' ')
  name = name.replace(/\bv(?:er|ersion)?\.?\s*\d+(?:[.\s]\d+)*/gi, ' ')
  name = name.replace(/\bbuild(?:no)?\.?\s*\d+(?:[.\s]\d+)*/gi, ' ')
  name = name.replace(/\b\d+(?:\.\d+){1,3}\b/g, ' ')
  name = name.replace(/\b(?:19\d{2}|20[0-2]\d)\b/g, ' ')
  name = name.replace(/\b\d{3,4}[pi]\b/gi, ' ')
  name = name.replace(/[._+~,;:|/\\]+/g, ' ')
  name = name.replace(/[–—]/g, ' ')
  name = name.replace(/\s+/g, ' ').trim()

  const tokens = name.split(' ').filter(Boolean)
  const kept = tokens
    .map(cleanToken)
    .filter(Boolean)
    .map((token) => ROMAN_NUMERALS[token.toLowerCase()] || token)
  const query = (kept.length ? kept : tokens).join(' ').replace(/\s+/g, ' ').trim()
  return query.slice(0, 60).trim()
}

/**
 * 生成搜索词候选：完整名称优先，名称过长时再用前两个词重试一次。
 *
 * @param {string} rawName
 * @returns {string[]}
 */
export function buildQueryVariants(rawName) {
  const query = buildSearchQuery(rawName)
  if (!query) return []

  const variants = [query]
  const tokens = query.split(/\s+/).filter(Boolean)
  if (tokens.length > 2) variants.push(tokens.slice(0, 2).join(' '))

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))]
}

function compact(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function splitTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
}

function slugOf(pageUrl) {
  try {
    const segments = new URL(pageUrl).pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] || ''
  } catch {
    return ''
  }
}

function matchRatio(queryNorm, candidateNorm) {
  if (!queryNorm || !candidateNorm) return 0
  if (candidateNorm === queryNorm) return 1
  if (candidateNorm.startsWith(queryNorm)) return 0.9
  if (queryNorm.startsWith(candidateNorm)) return 0.86
  if (candidateNorm.includes(queryNorm)) return 0.82
  if (queryNorm.includes(candidateNorm)) return 0.8
  return 0
}

function lengthPenalty(queryNorm, candidateNorm) {
  const extra = Math.max(0, candidateNorm.length - queryNorm.length)
  return Math.min(0.2, extra * 0.02)
}

/**
 * 给候选游戏打分，优先精确匹配标题或页面 slug，其次看关键词覆盖。
 *
 * @param {string} rawQuery
 * @param {{title: string, pageUrl: string}} candidate
 * @returns {number}
 */
export function scoreCandidate(rawQuery, candidate) {
  const queryNorm = compact(rawQuery)
  const tokens = splitTokens(rawQuery)
  const titleNorm = compact(candidate.title)
  const slugNorm = compact(slugOf(candidate.pageUrl))

  const titleScore = matchRatio(queryNorm, titleNorm) - lengthPenalty(queryNorm, titleNorm)
  const slugScore = matchRatio(queryNorm, slugNorm) - lengthPenalty(queryNorm, slugNorm)
  let score = Math.max(titleScore, slugScore)

  if (tokens.length) {
    const haystack = `${titleNorm}${slugNorm}`
    const hits = tokens.filter((token) => haystack.includes(token)).length
    score = Math.max(score, (hits / tokens.length) * 0.85)
  }

  return Math.max(0, score)
}

const HTML_ENTITIES = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
}

function decodeHtml(value) {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    const lower = String(code).toLowerCase()
    try {
      if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
      if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10))
    } catch {
      return match
    }
    return HTML_ENTITIES[lower] ?? match
  })
}

function readAttribute(tag, name) {
  const doubleQuoted = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
  if (doubleQuoted) return decodeHtml(doubleQuoted[1])
  const singleQuoted = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)
  return singleQuoted ? decodeHtml(singleQuoted[1]) : ''
}

/**
 * 解析游民星空搜索结果中的游戏条目（标题 + 封面 + 详情页）。
 *
 * @param {string} html
 * @returns {{title: string, pageUrl: string, cover: string}[]}
 */
export function parseGameList(html) {
  const items = []
  const seen = new Set()
  const anchorRe = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let anchor = null

  while ((anchor = anchorRe.exec(html))) {
    const pageUrl = decodeHtml(anchor[1]).replace(/^\/\//, 'https://')
    if (!/^https?:\/\/(?:ku|www)\.gamersky\.com\//i.test(pageUrl)) continue

    const imgTag = /<img\b[^>]*>/i.exec(anchor[2])
    if (!imgTag) continue

    const cover = readAttribute(imgTag[0], 'src').replace(/^\/\//, 'https://')
    if (!/^https?:\/\//i.test(cover)) continue

    const title =
      readAttribute(imgTag[0], 'title') ||
      decodeHtml(anchor[2].replace(/<[^>]+>/g, '')).trim()

    if (!title || seen.has(pageUrl)) continue
    seen.add(pageUrl)
    items.push({ title, pageUrl, cover })
    if (items.length >= 20) break
  }

  return items
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let requestQueue = Promise.resolve()
let lastRequestAt = 0
let cooldownUntil = 0

/**
 * 串行化并限速所有游民星空请求（搜索、评分、封面图片），
 * 每次请求间隔 1.1 秒并附加随机抖动，避免触发访问频率限制。
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function scheduleRequest(task) {
  const run = requestQueue.then(async () => {
    const now = Date.now()
    const wait = Math.max(0, lastRequestAt + REQUEST_INTERVAL_MS - now, cooldownUntil - now)
    if (wait > 0) await sleep(wait + Math.floor(Math.random() * REQUEST_JITTER_MS))
    lastRequestAt = Date.now()
    return task()
  })
  requestQueue = run.catch(() => {})
  return run
}

function isRateLimitError(error) {
  const message = String(error?.message || '')
  return (
    /HTTP (?:403|429|503)/.test(message) || error?.status === 403 || error?.status === 429
  )
}

async function requestWithRetry(task, label) {
  let lastError = null

  for (let attempt = 0; attempt < MAX_SEARCH_ATTEMPTS; attempt += 1) {
    try {
      return await scheduleRequest(task)
    } catch (error) {
      lastError = error
      if (!isRateLimitError(error)) throw error
      // 触发限流时全局冷却一段时间，避免持续请求导致封禁。
      cooldownUntil = Math.max(cooldownUntil, Date.now() + RATE_LIMIT_COOLDOWN_MS)
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1))
    }
  }

  throw lastError || new HttpError(502, `${label}失败`)
}

async function requestHtml(url) {
  let response = null
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
  } catch (error) {
    throw new HttpError(502, `无法连接游民星空：${error.message}`)
  }

  if (!response.ok) {
    throw new HttpError(502, `游民星空搜索失败（HTTP ${response.status}）`)
  }
  return response.text()
}

async function fetchSearchHtml(url) {
  return requestWithRetry(() => requestHtml(url), '游民星空搜索')
}

async function searchCandidates(query) {
  let lastError = null

  for (const base of SEARCH_URLS) {
    try {
      const html = await fetchSearchHtml(`${base}?s=${encodeURIComponent(query)}`)
      lastError = null
      const items = parseGameList(html)
      if (items.length) return items
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  return []
}

export function isGamerskyPageUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    return url.hostname === 'ku.gamersky.com' || url.hostname === 'www.gamersky.com'
  } catch {
    return false
  }
}

export function parseGameId(html) {
  const direct = /class="kuGameScore"[^>]*gameid="(\d+)"/i.exec(html)
  if (direct) return direct[1]
  const reversed = /gameid="(\d+)"[^>]*class="kuGameScore"/i.exec(html)
  return reversed ? reversed[1] : ''
}

async function requestJson(url) {
  let response = null
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Referer: 'https://ku.gamersky.com/',
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
  } catch (error) {
    throw new HttpError(502, `无法连接游民星空：${error.message}`)
  }

  if (!response.ok) {
    throw new HttpError(502, `游民星空评分接口失败（HTTP ${response.status}）`)
  }
  return response.text()
}

async function fetchJson(url) {
  return requestWithRetry(() => requestJson(url), '游民星空评分接口')
}

async function loadGameRating(pageUrl) {
  const html = await fetchSearchHtml(pageUrl)
  const gameId = parseGameId(html)
  if (!gameId) return null

  const apiUrl = `https://router.gamersky.com/@/gameScoreDetailPage/scoreInfo/6.0.0/0/App_iOS?gameId=${gameId}`
  const text = await fetchJson(apiUrl)

  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  const info = data?.gameScoreInfo
  const score = Number(info?.userScore) || Number(info?.realPlayersScore) || 0
  return score > 0 ? Math.round(score * 10) / 10 : null
}

/**
 * 获取游民星空游戏页面的玩家评分（0–10，取一位小数）。
 *
 * @param {string} pageUrl
 * @returns {Promise<number | null>}
 */
export async function lookupGameRating(pageUrl) {
  const url = String(pageUrl || '').trim()
  if (!isGamerskyPageUrl(url)) throw new HttpError(400, '不支持的游戏页面地址')

  const cached = ratingCache.get(url)
  if (cached && Date.now() - cached.at < RATING_CACHE_TTL_MS) return cached.rating
  if (ratingPending.has(url)) return ratingPending.get(url)

  const request = loadGameRating(url)
    .then((rating) => {
      ratingCache.set(url, { at: Date.now(), rating })
      while (ratingCache.size > CACHE_LIMIT) {
        const oldest = ratingCache.keys().next().value
        if (!oldest) break
        ratingCache.delete(oldest)
      }
      return rating
    })
    .finally(() => ratingPending.delete(url))

  ratingPending.set(url, request)
  return request
}

function pruneCache() {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.at > CACHE_TTL_MS) cache.delete(key)
  }
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

async function getCandidates(query) {
  const key = query.toLowerCase()
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items
  if (pending.has(key)) return pending.get(key)

  const request = searchCandidates(query)
    .then((items) => {
      cache.set(key, { at: Date.now(), items })
      pruneCache()
      return items
    })
    .finally(() => pending.delete(key))

  pending.set(key, request)
  return request
}

function coverProxyUrl(source) {
  return `/api/covers/image?url=${encodeURIComponent(source)}`
}

/**
 * 根据种子名称在游民星空游戏库中查找游戏封面。
 *
 * @param {string} rawName
 * @returns {Promise<{query: string, match: {title: string, pageUrl: string, cover: string, source: string, score: number} | null}>}
 */
export async function findGameCover(rawName) {
  const variants = buildQueryVariants(rawName)
  if (!variants.length) return { query: '', match: null }

  let best = null
  let primaryScore = 0
  let usedQuery = variants[0]

  for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
    const query = variants[variantIndex]
    const candidates = await getCandidates(query)
    for (let index = 0; index < candidates.length; index += 1) {
      const score = scoreCandidate(query, candidates[index]) - index * 0.002
      if (!best || score > best.score) best = { ...candidates[index], score }
    }
    if (variantIndex === 0) primaryScore = best?.score || 0
    usedQuery = query
    if (best && best.score >= 0.9) break
  }

  // 完整名称没有命中时，只有缩短后的搜索词足够可靠才采纳，避免匹配到错误的游戏。
  const minRequired = primaryScore >= MIN_SCORE ? MIN_SCORE : 0.9
  if (!best || best.score < minRequired) return { query: usedQuery, match: null }

  let rating = null
  try {
    rating = await lookupGameRating(best.pageUrl)
  } catch {
    rating = null
  }

  return {
    query: usedQuery,
    match: {
      title: best.title,
      pageUrl: best.pageUrl,
      cover: coverProxyUrl(best.cover),
      source: best.cover,
      rating,
      score: Math.round(best.score * 100) / 100,
    },
  }
}

export function isCoverImageUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:') return false
    return url.hostname === 'gamersky.com' || url.hostname.endsWith('.gamersky.com')
  } catch {
    return false
  }
}

async function requestImage(url) {
  let response = null
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://www.gamersky.com/',
      },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
  } catch (error) {
    throw new HttpError(502, `封面图片下载失败：${error.message}`)
  }

  if (!response.ok) throw new HttpError(502, `封面图片下载失败（HTTP ${response.status}）`)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) throw new HttpError(502, '封面地址返回的不是图片')

  return {
    contentType,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

export async function fetchCoverImage(value) {
  const url = String(value || '')
  if (!isCoverImageUrl(url)) throw new HttpError(400, '不支持的封面地址')

  // 图片下载同样进入全局限速队列，避免批量抓取时请求过密。
  return requestWithRetry(() => requestImage(url), '封面图片下载')
}
