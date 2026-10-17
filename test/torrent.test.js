import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import { decodeBencode } from '../server/lib/bencode.js'
import { parseTorrentBuffer } from '../server/lib/torrent.js'

function encode(value) {
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([Buffer.from(`${value.length}:`), value])
  }
  if (typeof value === 'string') return encode(Buffer.from(value, 'utf8'))
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('test encoder only supports safe integers')
    return Buffer.from(`i${value}e`)
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from('l'), ...value.map(encode), Buffer.from('e')])
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    const parts = [Buffer.from('d')]
    for (const key of keys) {
      parts.push(encode(key), encode(value[key]))
    }
    parts.push(Buffer.from('e'))
    return Buffer.concat(parts)
  }
  throw new Error(`unsupported test value: ${String(value)}`)
}

function buildTorrent(info, extra = {}) {
  return encode({
    announce: 'udp://tracker.example.com:6969/announce',
    'announce-list': [
      ['udp://tracker.example.com:6969/announce'],
      ['https://backup.example.com/announce'],
    ],
    comment: 'test torrent',
    'created by': 'torrent-vault-tests',
    'creation date': 1_700_000_000,
    info,
    ...extra,
  })
}

test('decodes bencode primitives and keeps the info byte range', () => {
  const payload = Buffer.from('d4:infod4:name4:test4:sizei12eee')
  const decoded = decodeBencode(payload)
  assert.equal(decoded.value.info.name.toString(), 'test')
  assert.equal(decoded.value.info.size, 12)
  assert.ok(Buffer.isBuffer(decoded.infoRaw))
  assert.equal(decoded.infoRaw.toString(), 'd4:name4:test4:sizei12ee')
})

test('parses a single-file v1 torrent', () => {
  const pieces = crypto.randomBytes(20 * 3)
  const info = {
    name: 'ubuntu-24.04.iso',
    length: 5_242_880,
    'piece length': 1_048_576,
    pieces,
  }
  const buffer = buildTorrent(info)
  const parsed = parseTorrentBuffer(buffer, 'C:\\torrents\\ubuntu.torrent')
  const expectedHash = crypto.createHash('sha1').update(encode(info)).digest('hex')

  assert.equal(parsed.name, 'ubuntu-24.04.iso')
  assert.equal(parsed.totalSize, 5_242_880)
  assert.equal(parsed.fileCount, 1)
  assert.equal(parsed.isMultiFile, false)
  assert.equal(parsed.files[0].path, 'ubuntu-24.04.iso')
  assert.equal(parsed.pieceLength, 1_048_576)
  assert.equal(parsed.pieceCount, 3)
  assert.equal(parsed.infoHashV1, expectedHash)
  assert.equal(parsed.version, 'v1')
  assert.equal(parsed.trackers.length, 2)
  assert.equal(parsed.trackerTiers.length, 2)
  assert.match(parsed.magnet, new RegExp(`urn:btih:${expectedHash}`))
  assert.match(parsed.magnet, /dn=ubuntu-24\.04\.iso/)
  assert.equal(parsed.creationDate, new Date(1_700_000_000_000).toISOString())
  assert.equal(parsed.createdBy, 'torrent-vault-tests')
})

test('parses a multi-file torrent with nested paths', () => {
  const info = {
    name: 'sample-pack',
    'name.utf-8': '中文种子包',
    'piece length': 262_144,
    pieces: crypto.randomBytes(20 * 2),
    'path.utf-8': [],
    files: [
      { length: 100, path: ['docs', 'readme.txt'] },
      { length: 2_000, path: ['video', 'clip.mp4'] },
    ],
  }
  const parsed = parseTorrentBuffer(buildTorrent(info))

  assert.equal(parsed.name, '中文种子包')
  assert.equal(parsed.isMultiFile, true)
  assert.equal(parsed.fileCount, 2)
  assert.equal(parsed.totalSize, 2_100)
  assert.deepEqual(
    parsed.files.map((file) => file.path),
    ['docs/readme.txt', 'video/clip.mp4'],
  )
})

test('parses a BitTorrent v2 file tree without v1 fields', () => {
  const info = {
    name: 'v2-demo',
    'piece length': 16_384,
    'meta version': 2,
    'file tree': {
      docs: {
        'guide.txt': { '': { length: 42 } },
      },
      'root.bin': { '': { length: 1_000 } },
    },
    'pieces root': Buffer.alloc(32, 7),
  }
  const parsed = parseTorrentBuffer(buildTorrent(info))

  assert.equal(parsed.version, 'v2')
  assert.equal(parsed.infoHashV1, null)
  assert.equal(parsed.infoHashV2, crypto.createHash('sha256').update(encode(info)).digest('hex'))
  assert.equal(parsed.fileCount, 2)
  assert.equal(parsed.totalSize, 1_042)
  assert.deepEqual(
    parsed.files.map((file) => file.path).sort(),
    ['docs/guide.txt', 'root.bin'],
  )
  assert.match(parsed.magnet, /urn:btmh:1220/)
})

test('rejects malformed torrent data', () => {
  assert.throws(() => parseTorrentBuffer(Buffer.alloc(0)), /为空/)
  assert.throws(() => parseTorrentBuffer(Buffer.from('not bencode')), /非法 Bencode/)
  assert.throws(() => parseTorrentBuffer(Buffer.from('d3:fooi1ee')), /缺少 info/)
  assert.throws(
    () => parseTorrentBuffer(Buffer.from('d4:infod4:name4:testee')),
    /文件列表/,
  )
  assert.throws(
    () => parseTorrentBuffer(Buffer.from('d4:infod4:name4:testeextra')),
    /多余字节/,
  )
})
