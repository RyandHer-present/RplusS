/*
 * A minimal zip writer.
 *
 * Written out rather than pulled in as a dependency because the job is small
 * and the alternative is shipping a compression library to every page load for
 * something used once. Entries are stored, not deflated: photos, video and
 * audio are already compressed, so deflate would spend CPU on a phone to save
 * almost nothing, and the JSON that would compress well is a rounding error
 * next to the media.
 *
 * Parts are handed to a Blob rather than concatenated in memory, which lets the
 * browser spill to disk instead of holding an entire backup in RAM.
 *
 * Standard zip, so the archive must stay under 4GB and each file under 4GB;
 * Zip64 is not implemented. `addFile` throws rather than writing a corrupt
 * archive if that is ever crossed.
 */

const LIMIT = 0xffffffff

const table = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface Entry {
  // Explicitly backed by ArrayBuffer, not the SharedArrayBuffer a bare
  // Uint8Array also allows — BlobPart accepts only the former.
  nameBytes: Uint8Array<ArrayBuffer>
  crc: number
  size: number
  offset: number
  dosTime: number
  dosDate: number
}

/** MS-DOS packed date and time, which is what zip stores. */
function dosStamp(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    dosTime:
      (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export class ZipWriter {
  private parts: BlobPart[] = []
  private entries: Entry[] = []
  private offset = 0

  /** Bytes written so far, so a caller can show progress or stop early. */
  get bytes(): number {
    return this.offset
  }

  async addFile(name: string, data: Blob | Uint8Array<ArrayBuffer> | string, modified = new Date()) {
    const bytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data instanceof Blob
          ? new Uint8Array(await data.arrayBuffer())
          : data

    if (bytes.length > LIMIT || this.offset + bytes.length > LIMIT) {
      throw new Error('Backup is too large for a standard zip (4GB limit).')
    }

    const nameBytes = new TextEncoder().encode(name)
    const { dosTime, dosDate } = dosStamp(modified)
    const crc = crc32(bytes)

    const header = new DataView(new ArrayBuffer(30))
    header.setUint32(0, 0x04034b50, true) // local file header
    header.setUint16(4, 20, true) // version needed
    header.setUint16(6, 0x0800, true) // UTF-8 names
    header.setUint16(8, 0, true) // stored
    header.setUint16(10, dosTime, true)
    header.setUint16(12, dosDate, true)
    header.setUint32(14, crc, true)
    header.setUint32(18, bytes.length, true)
    header.setUint32(22, bytes.length, true)
    header.setUint16(26, nameBytes.length, true)
    header.setUint16(28, 0, true) // no extra field

    this.entries.push({
      nameBytes,
      crc,
      size: bytes.length,
      offset: this.offset,
      dosTime,
      dosDate,
    })

    this.parts.push(header.buffer, nameBytes, bytes)
    this.offset += 30 + nameBytes.length + bytes.length
  }

  /** Writes the central directory and hands back the finished archive. */
  finish(): Blob {
    const start = this.offset
    const directory: BlobPart[] = []

    for (const entry of this.entries) {
      const record = new DataView(new ArrayBuffer(46))
      record.setUint32(0, 0x02014b50, true) // central directory header
      record.setUint16(4, 20, true) // version made by
      record.setUint16(6, 20, true) // version needed
      record.setUint16(8, 0x0800, true) // UTF-8 names
      record.setUint16(10, 0, true) // stored
      record.setUint16(12, entry.dosTime, true)
      record.setUint16(14, entry.dosDate, true)
      record.setUint32(16, entry.crc, true)
      record.setUint32(20, entry.size, true)
      record.setUint32(24, entry.size, true)
      record.setUint16(28, entry.nameBytes.length, true)
      record.setUint16(30, 0, true) // extra
      record.setUint16(32, 0, true) // comment
      record.setUint16(34, 0, true) // disk number
      record.setUint16(36, 0, true) // internal attrs
      record.setUint32(38, 0, true) // external attrs
      record.setUint32(42, entry.offset, true)

      directory.push(record.buffer, entry.nameBytes)
      this.offset += 46 + entry.nameBytes.length
    }

    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true) // end of central directory
    end.setUint16(4, 0, true)
    end.setUint16(6, 0, true)
    end.setUint16(8, this.entries.length, true)
    end.setUint16(10, this.entries.length, true)
    end.setUint32(12, this.offset - start, true)
    end.setUint32(16, start, true)
    end.setUint16(20, 0, true) // no comment

    return new Blob([...this.parts, ...directory, end.buffer], { type: 'application/zip' })
  }
}
