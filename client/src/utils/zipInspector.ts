export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
}

const EOCD_SIG = 0x06054b50;
const CD_FILE_SIG = 0x02014b50;

export function parseZipDirectory(buffer: ArrayBuffer, maxEntries = 500): ZipEntryInfo[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.byteLength < 22) {
    throw new Error('Geçerli bir ZIP arşivi değil.');
  }

  const minOffset = Math.max(0, bytes.byteLength - 65557);
  let eocdOffset = -1;
  for (let i = bytes.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('ZIP merkez dizini bulunamadı.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  if (cdOffset + cdSize > bytes.byteLength) {
    throw new Error('Bozuk veya eksik ZIP dizin başlığı.');
  }

  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntryInfo[] = [];
  let cursor = cdOffset;
  const limit = Math.min(totalEntries, maxEntries);

  for (let i = 0; i < limit && cursor + 46 <= bytes.byteLength; i++) {
    if (view.getUint32(cursor, true) !== CD_FILE_SIG) break;
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > bytes.byteLength) break;

    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith('/'),
    });

    cursor = nameEnd + extraLen + commentLen;
  }

  return entries;
}
