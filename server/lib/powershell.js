import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

let cachedPowerShell = null

export function powershellPath() {
  if (cachedPowerShell) return cachedPowerShell

  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const candidate = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )

  cachedPowerShell = fs.existsSync(candidate) ? candidate : 'powershell.exe'
  return cachedPowerShell
}

export async function runPowerShell(script, options = {}) {
  const { timeout = 15_000, maxBuffer = 2 * 1024 * 1024 } = options
  return execFileAsync(
    powershellPath(),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      timeout,
      maxBuffer,
      windowsHide: true,
      encoding: 'utf8',
    },
  )
}

export async function runPowerShellFile(scriptPath, options = {}) {
  const {
    timeout = 300_000,
    maxBuffer = 256 * 1024,
    windowsHide = false,
    sta = false,
  } = options

  const args = [
    ...(sta ? ['-STA'] : []),
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
  ]

  return execFileAsync(powershellPath(), args, {
    timeout,
    maxBuffer,
    windowsHide,
    encoding: 'utf8',
  })
}
