import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { getQuickLocations, listDirectory } from '../server/lib/filebrowser.js'

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-vault-browser-'))
  await fs.mkdir(path.join(root, 'zeta'))
  await fs.mkdir(path.join(root, 'Alpha'))
  await fs.mkdir(path.join(root, 'nested', 'deep'), { recursive: true })
  await fs.mkdir(path.join(root, '.hidden-config'))
  await fs.writeFile(path.join(root, 'notes.txt'), 'not a folder')
  return root
}

test('lists only child folders with breadcrumbs and parent', async () => {
  const root = await makeFixture()

  try {
    const result = await listDirectory(root)
    const names = result.entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b))

    assert.equal(result.path, root)
    assert.deepEqual(names, ['.hidden-config', 'Alpha', 'nested', 'zeta'])
    assert.equal(result.total, 4)
    assert.equal(result.truncated, false)
    assert.equal(result.parent, path.dirname(root))
    assert.equal(result.breadcrumbs.at(-1).path, root)
    assert.equal(result.breadcrumbs.at(-1).name, path.basename(root))
    assert.ok(result.entries.every((entry) => path.isAbsolute(entry.path)))
    assert.equal(
      result.entries.find((entry) => entry.name === '.hidden-config').hidden,
      true,
    )
    assert.equal(result.entries.find((entry) => entry.name === 'Alpha').hidden, false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('navigates into nested folders', async () => {
  const root = await makeFixture()

  try {
    const nested = await listDirectory(path.join(root, 'nested'))
    assert.deepEqual(nested.entries.map((entry) => entry.name), ['deep'])
    assert.equal(nested.parent, root)

    const deep = await listDirectory(path.join(root, 'nested', 'deep'))
    assert.equal(deep.entries.length, 0)
    assert.equal(deep.parent, path.join(root, 'nested'))
    assert.equal(deep.breadcrumbs.length, (await listDirectory(root)).breadcrumbs.length + 2)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('rejects files and missing folders with clear messages', async () => {
  const root = await makeFixture()

  try {
    await assert.rejects(() => listDirectory(path.join(root, 'notes.txt')), /不是文件夹/)
    await assert.rejects(() => listDirectory(path.join(root, 'missing-folder')), /不存在/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('quick locations only include directories that exist', async () => {
  const locations = await getQuickLocations()
  assert.ok(Array.isArray(locations))
  assert.ok(locations.some((location) => location.id === 'home'))

  for (const location of locations) {
    assert.ok(path.isAbsolute(location.path))
    const stat = await fs.stat(location.path)
    assert.equal(stat.isDirectory(), true)
  }
})
