// 最小 ZIP 读取器
//
// NovelAI 的 /ai/generate-image 返回 ZIP（内含 image_0.png ...），而本项目不引入
// zip 依赖（部署是整包热更新，多一个依赖就多一处要维护的嵌套 node_modules）。
// 这里只实现中央目录解析与两种压缩方法（store / deflate），足以覆盖该响应。

import { inflateRawSync } from 'zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_MIN_SIZE = 22
const MAX_COMMENT_SIZE = 0xffff
const COMPRESSION_STORED = 0
const COMPRESSION_DEFLATED = 8

export interface ZipEntry {
  name: string
  data: Buffer
}

/** 读出 ZIP 内的全部条目（按中央目录顺序） */
export function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let pointer = buffer.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) {
      throw new Error('NovelAI 返回的 ZIP 中央目录已损坏')
    }

    const nameLength = buffer.readUInt16LE(pointer + 28)
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    entries.push({
      name,
      data: readEntryData(
        buffer,
        buffer.readUInt32LE(pointer + 42),
        buffer.readUInt16LE(pointer + 10),
        buffer.readUInt32LE(pointer + 20),
        name
      )
    })
    pointer += 46 + nameLength + buffer.readUInt16LE(pointer + 30) + buffer.readUInt16LE(pointer + 32)
  }

  return entries
}

function readEntryData(
  buffer: Buffer,
  localOffset: number,
  method: number,
  compressedSize: number,
  name: string
): Buffer {
  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`NovelAI 返回的 ZIP 缺少条目 ${name} 的本地文件头`)
  }

  const dataStart = localOffset + 30
    + buffer.readUInt16LE(localOffset + 26)
    + buffer.readUInt16LE(localOffset + 28)
  const raw = buffer.subarray(dataStart, dataStart + compressedSize)

  if (method === COMPRESSION_STORED) return Buffer.from(raw)
  if (method === COMPRESSION_DEFLATED) return inflateRawSync(raw)
  throw new Error(`NovelAI 返回的 ZIP 条目 ${name} 使用了不支持的压缩方法 ${method}`)
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - MAX_COMMENT_SIZE - EOCD_MIN_SIZE)
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= earliest; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('NovelAI 返回的内容不是有效的 ZIP')
}
