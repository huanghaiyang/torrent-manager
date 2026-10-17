import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { scanDirectory } from '../server/lib/scanner.js'

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-vault-scan-'))
  await fs.mkdir(path.join(root, 'nested', 'deep'), { recursive: true })
  await fs.writeFile(path.join(root, 'alpha.torrent'), 'alpha')
  await fs.writeFile(path.join(root, 'nested', 'beta.TORRENT'), 'beta')
  await fs.writeFile(path.join(root, 'nested', 'deep', 'gamma.torrent'), 'gamma')
  await fs.writeFile(path.join(root, 'notes.txt'), 'ignore me')
  return root
}

test('recursively discovers torrent files and reports progress', async () => {
  const root = await makeFixture()
  const batches = []
  const progress = []

  try {
    const summary = await scanDirectory(root, {}, {
      onBatch: (files) => batches.push(...files),
      onProgress: (stats) => progress.push(stats),
    })

    const paths = batches.map((file) => path.relative(root, file.path)).sort()
    assert.deepEqual(paths, [
      'alpha.torrent',
      path.join('nested', 'beta.TORRENT'),
      path.join('nested', 'deep', 'gamma.torrent'),
    ])
    assert.equal(summary.found, 3)
    assert.equal(summary.aborted, false)
    assert.equal(summary.errors, 0)
    assert.ok(progress.length > 0)
    assert.ok(summary.durationMs >= 0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('non-recursive scan only reports the top-level directory', async () => {
  const root = await makeFixture()
  const files = []

  try {
    const summary = await scanDirectory(
      root,
      { recursive: false },
      { onBatch: (batch) => files.push(...batch) },
    )

    assert.equal(summary.found, 1)
    assert.equal(files.length, 1)
    assert.equal(path.basename(files[0].path), 'alpha.torrent')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('respects the result limit', async () => {
  const root = await makeFixture()
  const files = []

  try {
    const summary = await scanDirectory(
      root,
      { maxResults: 2 },
      { onBatch: (batch) => files.push(...batch) },
    )

    assert.equal(summary.found, 2)
    assert.equal(files.length, 2)
    assert.equal(summary.limitsReached, 'results')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('stops promptly when aborted', async () => {
  const root = await makeFixture()
  const controller = new AbortController()

  try {
    const scanPromise = scanDirectory(root, {}, { signal: controller.signal })
    controller.abort()
    const summary = await scanPromise
    assert.equal(summary.aborted, true)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
