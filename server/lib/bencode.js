/**
 * Minimal, strict bencode decoder.
 *
 * Strings are returned as Buffers so binary fields such as `pieces` survive
 * untouched. Dictionary keys are returned as UTF-8 strings. The decoder keeps
 * the byte range of the top-level `info` dictionary so a torrent's v1 info hash
 * can be calculated over the exact original bytes.
 */

const MAX_DEPTH = 256

export class BencodeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BencodeError'
  }
}

class BencodeParser {
  constructor(buffer) {
    this.buf = buffer
    this.pos = 0
    this.infoRaw = null
  }

  parse() {
    const value = this.parseValue(0)
    if (this.pos !== this.buf.length) {
      throw new BencodeError(`数据末尾存在多余字节（偏移 ${this.pos}）`)
    }
    return value
  }

  parseValue(depth) {
    if (depth > MAX_DEPTH) {
      throw new BencodeError('Bencode 嵌套层级过深')
    }
    if (this.pos >= this.buf.length) {
      throw new BencodeError('意外到达数据末尾')
    }

    const prefix = this.buf[this.pos]
    if (prefix === 0x69) return this.parseInteger() // i
    if (prefix === 0x6c) return this.parseList(depth) // l
    if (prefix === 0x64) return this.parseDict(depth) // d
    if (prefix >= 0x30 && prefix <= 0x39) return this.parseString()
    throw new BencodeError(`非法 Bencode 标记 0x${prefix.toString(16)}（偏移 ${this.pos}）`)
  }

  parseString() {
    const start = this.pos
    const colon = this.buf.indexOf(0x3a, start) // :
    if (colon < 0) throw new BencodeError('字符串缺少长度分隔符')

    const lengthText = this.buf.toString('ascii', start, colon)
    if (!/^(0|[1-9]\d*)$/.test(lengthText)) {
      throw new BencodeError(`非法字符串长度 "${lengthText}"`)
    }

    const length = Number(lengthText)
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new BencodeError('字符串长度超出安全范围')
    }

    const dataStart = colon + 1
    const end = dataStart + length
    if (end > this.buf.length) {
      throw new BencodeError('字符串内容被截断')
    }

    this.pos = end
    return this.buf.subarray(dataStart, end)
  }

  parseInteger() {
    const start = this.pos
    const end = this.buf.indexOf(0x65, start + 1) // e
    if (end < 0) throw new BencodeError('整数缺少结束标记')

    const text = this.buf.toString('ascii', start + 1, end)
    if (!/^-?(0|[1-9]\d*)$/.test(text) || text === '-0') {
      throw new BencodeError(`非法整数 "${text}"`)
    }

    const value = Number(text)
    if (!Number.isSafeInteger(value)) {
      throw new BencodeError('整数超出 JavaScript 安全范围')
    }

    this.pos = end + 1
    return value
  }

  parseList(depth) {
    this.pos += 1 // l
    const list = []

    while (true) {
      if (this.pos >= this.buf.length) throw new BencodeError('列表缺少结束标记')
      if (this.buf[this.pos] === 0x65) {
        this.pos += 1 // e
        return list
      }
      list.push(this.parseValue(depth + 1))
    }
  }

  parseDict(depth) {
    this.pos += 1 // d
    const dict = Object.create(null)

    while (true) {
      if (this.pos >= this.buf.length) throw new BencodeError('字典缺少结束标记')
      if (this.buf[this.pos] === 0x65) {
        this.pos += 1 // e
        return dict
      }

      const key = this.parseString().toString('utf8')
      if (Object.prototype.hasOwnProperty.call(dict, key)) {
        throw new BencodeError(`字典包含重复键 "${key}"`)
      }

      let infoStart = null
      if (depth === 0 && key === 'info') infoStart = this.pos

      const value = this.parseValue(depth + 1)
      dict[key] = value

      if (depth === 0 && key === 'info') {
        this.infoRaw = this.buf.subarray(infoStart, this.pos)
      }
    }
  }
}

export function decodeBencode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buffer.length === 0) throw new BencodeError('文件为空')

  const parser = new BencodeParser(buffer)
  const value = parser.parse()
  return { value, infoRaw: parser.infoRaw }
}
