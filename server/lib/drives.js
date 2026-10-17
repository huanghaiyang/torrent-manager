import fs from 'node:fs/promises'
import os from 'node:os'
import { runPowerShell } from './powershell.js'

const CACHE_MS = 15_000

let cache = { at: 0, value: null }
let pending = null

function normalizeDrive(raw) {
  const letter = String(raw.name || '').replace(':', '')
  if (!letter) return null

  return {
    name: `${letter}:`,
    root: String(raw.root || `${letter}:\\`).replace(/\\?$/, '\\'),
    label: raw.label ? String(raw.label) : '',
    type: ['fixed', 'removable', 'network'].includes(raw.type) ? raw.type : 'other',
    totalSize: Number(raw.totalSize) > 0 ? Number(raw.totalSize) : null,
    freeSpace: Number(raw.freeSpace) >= 0 ? Number(raw.freeSpace) : null,
  }
}

export function driveSortValue(drive) {
  const typeOrder = { fixed: 0, removable: 1, network: 2, other: 3 }
  return `${typeOrder[drive.type] ?? 9}:${drive.name}`
}

async function detectWithCim() {
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$vols = @(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop | Where-Object {
  $_.DriveType -eq 2 -or $_.DriveType -eq 3 -or $_.DriveType -eq 4
} | ForEach-Object {
  $size = 0
  $free = 0
  if ($null -ne $_.Size) { $size = [double]$_.Size }
  if ($null -ne $_.FreeSpace) { $free = [double]$_.FreeSpace }
  $type = switch ([int]$_.DriveType) {
    2 { 'removable' }
    3 { 'fixed' }
    4 { 'network' }
    default { 'other' }
  }
  [pscustomobject]@{
    name = $_.DeviceID
    root = ($_.DeviceID + '\\')
    label = $_.VolumeName
    type = $type
    totalSize = $size
    freeSpace = $free
  }
})
if ($vols.Count -gt 0) { $vols | ConvertTo-Json -Compress } else { '[]' }
`.trim()

  const { stdout } = await runPowerShell(script, { timeout: 12_000 })
  const text = stdout.trim()
  if (!text) return []

  const parsed = JSON.parse(text)
  const rawList = Array.isArray(parsed) ? parsed : [parsed]
  return rawList.map(normalizeDrive).filter(Boolean)
}

async function detectWithLetterProbe() {
  const drives = []
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    try {
      await fs.access(root)
      drives.push({
        name: `${letter}:`,
        root,
        label: '',
        type: 'fixed',
        totalSize: null,
        freeSpace: null,
      })
    } catch {
      // Drive letter does not exist or is inaccessible.
    }
  }
  return drives
}

function alternateDrives() {
  const drives = [
    {
      name: '/',
      root: '/',
      label: '根目录',
      type: 'fixed',
      totalSize: null,
      freeSpace: null,
    },
  ]
  if (os.homedir() !== '/') {
    drives.push({
      name: '~',
      root: os.homedir(),
      label: '个人目录',
      type: 'fixed',
      totalSize: null,
      freeSpace: null,
    })
  }
  return drives
}

async function detectDrives() {
  if (process.platform !== 'win32') return alternateDrives()

  try {
    return await detectWithCim()
  } catch {
    try {
      return await detectWithLetterProbe()
    } catch {
      return []
    }
  }
}

export async function listDrives(force = false) {
  const now = Date.now()
  if (!force && cache.value && now - cache.at < CACHE_MS) return cache.value
  if (pending) return pending

  pending = detectDrives()
    .then((drives) => {
      const sorted = drives.sort((a, b) =>
        driveSortValue(a).localeCompare(driveSortValue(b), 'en'),
      )
      cache = { at: Date.now(), value: sorted }
      return sorted
    })
    .finally(() => {
      pending = null
    })

  return pending
}
