import express from 'express'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchCoverImage, findGameCover, isGamerskyPageUrl, lookupGameRating } from './lib/covers.js'
import { pickExecutable } from './lib/dialogs.js'
import { listDrives } from './lib/drives.js'
import { HttpError } from './lib/errors.js'
import { listParsedSummaries, readParsedTorrent, saveParsedTorrent } from './lib/parseStore.js'
import { getQuickLocations, listDirectory } from './lib/filebrowser.js'
import { scanDirectory } from './lib/scanner.js'
import { MAX_TORRENT_BYTES, parseTorrentBuffer } from './lib/torrent.js'
import {
  addCustomTool,
  deleteCustomTool,
  getToolsPayload,
  openTorrentWithTool,
  revealTorrent,
  setDefaultTool,
  updateCustomTool,
} from './lib/tools.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const PORT = Number(process.env.PORT || 4000)
const HOST = process.env.HOST || '127.0.0.1'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
  next()
})

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

function requireAbsolutePath(value, label = '路径') {
  const input = typeof value === 'string' ? value.trim() : ''
  if (!input) throw new HttpError(400, `请提供${label}`)
  if (!path.isAbsolute(input)) throw new HttpError(400, `${label}必须是绝对路径`)
  return path.normalize(input)
}

async function statPath(target, label = '路径') {
  try {
    return await fsp.stat(target)
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, `${label}不存在`)
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new HttpError(403, `没有权限访问${label}`)
    }
    throw new HttpError(500, `无法读取${label}：${error.message}`)
  }
}

async function requireTorrentFile(filePath) {
  if (!/\.torrent$/i.test(filePath)) {
    throw new HttpError(400, '目标文件不是 .torrent 种子')
  }
  const stat = await statPath(filePath, '种子文件')
  if (!stat.isFile()) throw new HttpError(400, '目标路径不是文件')
  return stat
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'Torrent Vault',
    platform: process.platform,
    node: process.version,
    uptime: Math.round(process.uptime()),
  })
})

app.get(
  '/api/drives',
  asyncRoute(async (req, res) => {
    const refresh = req.query.refresh === '1'
    const drives = await listDrives(refresh)
    res.json({ drives })
  }),
)

app.post(
  '/api/scan',
  asyncRoute(async (req, res) => {
    const root = requireAbsolutePath(req.body?.path, '扫描路径')
    const recursive = req.body?.recursive !== false
    const rootStat = await statPath(root, '扫描路径')

    const write = (event) => {
      if (res.writableEnded || res.destroyed) return
      try {
        res.write(`${JSON.stringify(event)}\n`)
      } catch {
        // Connection closed; the abort handler stops the scanner.
      }
    }

    if (rootStat.isFile()) {
      if (!/\.torrent$/i.test(root)) throw new HttpError(400, '目标文件不是 .torrent 种子')
      res.status(200)
      res.set({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders?.()

      write({ type: 'start', root, options: { recursive } })
      write({
        type: 'batch',
        root,
        files: [
          {
            path: root,
            fileName: path.basename(root),
            dir: path.dirname(root),
            size: rootStat.size,
            mtimeMs: rootStat.mtimeMs,
          },
        ],
      })
      write({ type: 'progress', stats: { dirsScanned: 0, entriesScanned: 0, found: 1, errors: 0 } })
      write({
        type: 'done',
        summary: {
          root,
          recursive,
          dirsScanned: 0,
          entriesScanned: 0,
          found: 1,
          errors: 0,
          durationMs: 0,
          aborted: false,
          limitsReached: null,
        },
      })
      res.end()
      return
    }

    if (!rootStat.isDirectory()) throw new HttpError(400, '扫描路径必须是文件夹')

    res.status(200)
    res.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders?.()

    const controller = new AbortController()
    let ended = false
    res.on('close', () => {
      if (!ended) controller.abort()
    })

    write({ type: 'start', root, options: { recursive } })

    try {
      const summary = await scanDirectory(
        root,
        { recursive },
        {
          signal: controller.signal,
          onBatch: (files) => write({ type: 'batch', root, files }),
          onProgress: (stats) => write({ type: 'progress', stats }),
        },
      )

      ended = true
      write({ type: 'done', summary })
      res.end()
    } catch (error) {
      ended = true
      write({ type: 'error', message: `扫描中断：${error.message}` })
      res.end()
    }
  }),
)

app.get(
  '/api/torrents/parsed',
  asyncRoute(async (req, res) => {
    res.json({ entries: await listParsedSummaries() })
  }),
)

app.post(
  '/api/torrent/parse',
  asyncRoute(async (req, res) => {
    const filePath = requireAbsolutePath(req.body?.path, '种子路径')
    const force = Boolean(req.body?.force)
    const stat = await requireTorrentFile(filePath)
    if (stat.size > MAX_TORRENT_BYTES) {
      throw new HttpError(413, '种子文件超过 64 MB，暂不支持解析')
    }

    if (!force) {
      const cached = await readParsedTorrent(filePath, stat)
      if (cached) {
        res.json({
          torrent: {
            ...cached.torrent,
            path: filePath,
            fileName: path.basename(filePath),
            fileSize: stat.size,
            fileMtimeMs: stat.mtimeMs,
          },
          parsedAt: cached.parsedAt,
          cached: true,
        })
        return
      }
    }

    const buffer = await fsp.readFile(filePath)
    let parsed
    try {
      parsed = parseTorrentBuffer(buffer, filePath)
    } catch (error) {
      throw new HttpError(422, `种子解析失败：${error.message}`)
    }

    const { parsedAt } = await saveParsedTorrent(filePath, stat, parsed)

    res.json({
      torrent: {
        ...parsed,
        path: filePath,
        fileName: path.basename(filePath),
        fileSize: stat.size,
        fileMtimeMs: stat.mtimeMs,
      },
      parsedAt,
      cached: false,
    })
  }),
)

app.get(
  '/api/tools',
  asyncRoute(async (req, res) => {
    res.json(await getToolsPayload(req.query.refresh === '1'))
  }),
)

app.post(
  '/api/tools/custom',
  asyncRoute(async (req, res) => {
    const body = req.body || {}
    res.json(await addCustomTool({ name: body.name, path: body.path, args: body.args }))
  }),
)

app.put(
  '/api/tools/custom/:id',
  asyncRoute(async (req, res) => {
    const body = req.body || {}
    res.json(
      await updateCustomTool(req.params.id, {
        name: body.name,
        path: body.path,
        args: body.args,
      }),
    )
  }),
)

app.delete(
  '/api/tools/custom/:id',
  asyncRoute(async (req, res) => {
    res.json(await deleteCustomTool(req.params.id))
  }),
)

app.post(
  '/api/tools/default',
  asyncRoute(async (req, res) => {
    const toolId = typeof req.body?.toolId === 'string' ? req.body.toolId : ''
    if (!toolId) throw new HttpError(400, '缺少打开方式')
    res.json(await setDefaultTool(toolId))
  }),
)

app.post(
  '/api/covers/search',
  asyncRoute(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) throw new HttpError(400, '请提供种子名称')
    if (name.length > 400) throw new HttpError(400, '种子名称过长')
    res.json(await findGameCover(name))
  }),
)

app.post(
  '/api/covers/rating',
  asyncRoute(async (req, res) => {
    const pageUrl = typeof req.body?.pageUrl === 'string' ? req.body.pageUrl.trim() : ''
    if (!pageUrl) throw new HttpError(400, '缺少游戏页面地址')
    if (!isGamerskyPageUrl(pageUrl)) throw new HttpError(400, '不支持的游戏页面地址')
    res.json({ rating: await lookupGameRating(pageUrl) })
  }),
)

app.get(
  '/api/covers/image',
  asyncRoute(async (req, res) => {
    const url = typeof req.query?.url === 'string' ? req.query.url : ''
    if (!url) throw new HttpError(400, '缺少封面地址')

    const image = await fetchCoverImage(url)
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.send(image.buffer)
  }),
)

app.get(
  '/api/fs/list',
  asyncRoute(async (req, res) => {
    const target = requireAbsolutePath(req.query?.path, '文件夹路径')
    res.json(await listDirectory(target))
  }),
)

app.get(
  '/api/fs/locations',
  asyncRoute(async (req, res) => {
    res.json({ locations: await getQuickLocations() })
  }),
)

app.post(
  '/api/dialog/file',
  asyncRoute(async (req, res) => {
    res.json(await pickExecutable())
  }),
)

app.post(
  '/api/open',
  asyncRoute(async (req, res) => {
    const filePath = requireAbsolutePath(req.body?.path, '种子路径')
    await requireTorrentFile(filePath)

    const toolId =
      typeof req.body?.toolId === 'string' && req.body.toolId.trim()
        ? req.body.toolId.trim()
        : undefined
    const tool = await openTorrentWithTool(filePath, toolId)
    res.json({ ok: true, tool: { id: tool.id, name: tool.name } })
  }),
)

app.post(
  '/api/reveal',
  asyncRoute(async (req, res) => {
    const filePath = requireAbsolutePath(req.body?.path, '种子路径')
    await requireTorrentFile(filePath)
    res.json({ ok: true, ...(await revealTorrent(filePath)) })
  }),
)

app.use('/api', (req, res) => {
  res.status(404).json({ error: `接口不存在：${req.method} ${req.originalUrl}` })
})

const INDEX_FILE = path.join(DIST_DIR, 'index.html')
if (fs.existsSync(INDEX_FILE)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }))
  app.get('*', (req, res) => {
    res.sendFile(INDEX_FILE)
  })
} else {
  app.get('/', (req, res) => {
    res.json({
      ok: true,
      message: 'Torrent Vault API 已启动。开发模式请访问 http://localhost:5173，生产模式请先执行 npm run build。',
    })
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)

  let status = error instanceof HttpError ? error.status : 500
  let message = error.message || '服务器内部错误'

  if (!(error instanceof HttpError) && Number.isInteger(error.status)) {
    if (error.status >= 400 && error.status < 500) status = error.status
    if (error.type === 'entity.parse.failed') message = '请求体不是合法的 JSON'
    if (error.type === 'entity.too.large') message = '请求体过大'
  }

  if (status >= 500) console.error('[api]', error)
  res.status(status).json({
    error: message,
    ...(error.code && typeof error.code === 'string' ? { code: error.code } : {}),
  })
})

const server = app.listen(PORT, HOST, () => {
  const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`
  console.log(`[torrent-vault] API  ${base}`)
  if (fs.existsSync(INDEX_FILE)) {
    console.log(`[torrent-vault] UI   ${base}`)
  } else {
    console.log('[torrent-vault] UI   开发模式请运行 npm run dev（Vite: http://localhost:5173）')
  }
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[torrent-vault] 端口 ${PORT} 已被占用，请设置 PORT 环境变量后重试`)
  } else {
    console.error('[torrent-vault] 启动失败：', error)
  }
  process.exitCode = 1
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  })
}
