import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')

export const DATA_DIR = process.env.TV_DATA_DIR
  ? path.resolve(process.env.TV_DATA_DIR)
  : path.join(ROOT_DIR, 'data')

const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json')

const DEFAULT_SETTINGS = {
  customTools: [],
  defaultToolId: 'system',
}

let cache = null
let updateQueue = Promise.resolve()

function sanitizeCustomTool(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const executablePath = typeof raw.path === 'string' ? raw.path.trim() : ''
  if (!id || !name || !executablePath) return null

  return {
    id,
    name,
    path: executablePath,
    args: typeof raw.args === 'string' ? raw.args : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  }
}

function sanitizeSettings(raw) {
  const customTools = Array.isArray(raw?.customTools)
    ? raw.customTools.map(sanitizeCustomTool).filter(Boolean)
    : []
  const defaultToolId =
    typeof raw?.defaultToolId === 'string' && raw.defaultToolId
      ? raw.defaultToolId
      : 'system'

  return { customTools, defaultToolId }
}

async function readFromDisk() {
  try {
    const text = await fs.readFile(SETTINGS_PATH, 'utf8')
    return sanitizeSettings(JSON.parse(text))
  } catch (error) {
    if (error.code === 'ENOENT') return sanitizeSettings(DEFAULT_SETTINGS)
    if (error instanceof SyntaxError) {
      console.warn('[settings] settings.json 格式错误，已使用默认设置')
      return sanitizeSettings(DEFAULT_SETTINGS)
    }
    throw error
  }
}

async function writeToDisk(settings) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const tempPath = `${SETTINGS_PATH}.${process.pid}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, SETTINGS_PATH)
}

export async function getSettings() {
  if (!cache) cache = await readFromDisk()
  return structuredClone(cache)
}

/**
 * Serialize read-modify-write cycles and persist atomically.
 * @param {(settings: object) => object | Promise<object>} mutator
 */
export function updateSettings(mutator) {
  const task = updateQueue.then(async () => {
    const current = await getSettings()
    const next = sanitizeSettings(await mutator(structuredClone(current)))
    await writeToDisk(next)
    cache = next
    return structuredClone(next)
  })

  updateQueue = task.catch(() => {})
  return task
}
