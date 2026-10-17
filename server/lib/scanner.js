import fs from 'node:fs/promises'
import path from 'node:path'

const TORRENT_RE = /\.torrent$/i
const SKIP_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git',
])

const DEFAULTS = {
  recursive: true,
  maxDepth: 15,
  maxResults: 5_000,
  maxDirectories: 80_000,
  concurrency: 10,
}

function errorCode(error) {
  return error?.code || 'UNKNOWN'
}

/**
 * Walk a directory tree and report torrent files as they are discovered.
 *
 * Events are delivered through callbacks so the HTTP layer can stream batches
 * to the browser. The scan stops as soon as `signal` is aborted and still
 * resolves with a summary of everything found so far.
 *
 * @param {string} root
 * @param {object} [options]
 * @param {object} [handlers]
 * @param {(files: object[]) => void} [handlers.onBatch]
 * @param {(stats: object) => void} [handlers.onProgress]
 * @param {AbortSignal} [handlers.signal]
 */
export async function scanDirectory(root, options = {}, handlers = {}) {
  const opts = { ...DEFAULTS, ...options }
  const signal = handlers.signal
  const startedAt = Date.now()

  const queue = [{ path: root, depth: 0 }]
  const batch = []
  const errorSamples = []

  let active = 0
  let dirsScanned = 0
  let entriesScanned = 0
  let found = 0
  let errors = 0
  let finished = false
  let resolveDone

  const done = new Promise((resolve) => {
    resolveDone = resolve
  })

  const safeCall = (handler, payload) => {
    if (typeof handler !== 'function') return
    try {
      handler(payload)
    } catch {
      // The HTTP stream may already be gone; scanning is aborted via signal.
    }
  }

  const stats = () => ({
    dirsScanned,
    entriesScanned,
    found,
    errors,
    queued: queue.length,
    durationMs: Date.now() - startedAt,
  })

  const limitsReached = () => {
    if (found >= opts.maxResults) return 'results'
    if (dirsScanned >= opts.maxDirectories) return 'directories'
    return null
  }

  const flushBatch = (force = false) => {
    if (batch.length === 0) return
    if (!force && batch.length < 40) return
    const files = batch.splice(0, batch.length)
    safeCall(handlers.onBatch, files)
  }

  const reportProgress = () => {
    if (finished) return
    flushBatch()
    safeCall(handlers.onProgress, stats())
  }

  const finish = () => {
    if (finished) return
    finished = true
    clearInterval(ticker)
    flushBatch(true)
    safeCall(handlers.onProgress, stats())

    const reached = limitsReached()
    resolveDone({
      ...stats(),
      root,
      recursive: opts.recursive,
      aborted: Boolean(signal?.aborted),
      limitsReached: reached,
      maxDepth: opts.maxDepth,
      maxResults: opts.maxResults,
      errorSamples,
    })
  }

  const recordError = (targetPath, error) => {
    errors += 1
    if (errorSamples.length < 5) {
      errorSamples.push({
        path: targetPath,
        code: errorCode(error),
        message: error?.message || '未知错误',
      })
    }
  }

  const addTorrent = async (filePath, fileName, dir) => {
    if (found >= opts.maxResults || finished || signal?.aborted) return
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return
      if (found >= opts.maxResults) return

      found += 1
      batch.push({
        path: filePath,
        fileName,
        dir,
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      })
      if (batch.length >= 40) flushBatch()
    } catch (error) {
      recordError(filePath, error)
    }
  }

  const processDirectory = async (job) => {
    if (finished || signal?.aborted || limitsReached()) return

    dirsScanned += 1
    let entries
    try {
      entries = await fs.readdir(job.path, { withFileTypes: true })
    } catch (error) {
      recordError(job.path, error)
      return
    }

    for (const entry of entries) {
      if (finished || signal?.aborted || limitsReached()) return
      entriesScanned += 1

      const fullPath = path.join(job.path, entry.name)

      if (entry.isDirectory()) {
        if (!opts.recursive || job.depth >= opts.maxDepth) continue
        if (entry.isSymbolicLink()) continue
        if (SKIP_DIRS.has(entry.name.toLowerCase())) continue
        queue.push({ path: fullPath, depth: job.depth + 1 })
        continue
      }

      if (entry.isFile() && TORRENT_RE.test(entry.name)) {
        await addTorrent(fullPath, entry.name, job.path)
        if (found >= opts.maxResults) return
      }
    }
  }

  const schedule = () => {
    if (finished) return

    if (signal?.aborted) {
      if (active === 0) finish()
      return
    }

    const reached = limitsReached()
    while (
      active < opts.concurrency &&
      queue.length > 0 &&
      found < opts.maxResults &&
      dirsScanned < opts.maxDirectories
    ) {
      const job = queue.shift()
      active += 1
      processDirectory(job)
        .catch((error) => recordError(job.path, error))
        .finally(() => {
          active -= 1
          schedule()
        })
    }

    if (
      active === 0 &&
      (queue.length === 0 || found >= opts.maxResults || dirsScanned >= opts.maxDirectories)
    ) {
      finish()
    } else if (reached) {
      finish()
    }
  }

  const ticker = setInterval(reportProgress, 250)

  try {
    schedule()
    return await done
  } finally {
    clearInterval(ticker)
  }
}
