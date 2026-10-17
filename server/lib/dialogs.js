import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpError } from './errors.js'
import { runPowerShellFile } from './powershell.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.resolve(__dirname, '..', 'scripts')

function parseSelectedPath(stdout) {
  const cleaned = String(stdout || '').replace(/\r/g, '').replace(/\n+$/, '')
  return cleaned || null
}

export async function pickExecutable() {
  if (process.platform !== 'win32') {
    throw new HttpError(501, '当前系统不支持原生文件选择，请直接输入程序路径')
  }

  try {
    const { stdout } = await runPowerShellFile(path.join(SCRIPTS_DIR, 'pick-file.ps1'), {
      sta: true,
      windowsHide: false,
      timeout: 300_000,
    })
    const selected = parseSelectedPath(stdout)
    if (!selected || !path.isAbsolute(selected)) {
      return { canceled: true, path: null }
    }
    return { canceled: false, path: path.normalize(selected) }
  } catch (error) {
    if (error.killed) throw new HttpError(408, '选择文件超时，请重试')
    throw new HttpError(500, `无法打开文件选择窗口：${error.message}`)
  }
}
