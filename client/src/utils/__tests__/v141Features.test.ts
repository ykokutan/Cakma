import { describe, it, expect } from 'vitest';
import {
  normalizeGameExeName,
  addCustomGameRule,
  removeCustomGameRule,
  formatElapsedPlaytime,
} from '../gameDetectionRules';
import {
  DEFAULT_CUSTOM_THEME,
  encodeShareableTheme,
  decodeShareableTheme,
} from '../themeBuilder';
import {
  createServerFolder,
  moveServerToFolder,
  mergeServersIntoNewFolder,
} from '../serverFolders';
import { summarizeConversationLocally, formatDigestAsMarkdown } from '../clientSummarizer';
import { parseZipDirectory } from '../zipInspector';
import { parseCsvPreview, parseJsonPreview } from '../tabularPreviewParser';
import { isClientCosmeticUnlocked, getNameGradientClass } from '../cosmeticsCatalog';

function buildMinimalZip(entries: Array<{ name: string; size: number }>): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let cdSize = 0;

  for (const e of entries) {
    const nameBytes = encoder.encode(e.name);
    const rec = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint32(20, e.size, true);
    dv.setUint32(24, e.size, true);
    dv.setUint16(28, nameBytes.length, true);
    rec.set(nameBytes, 46);
    chunks.push(rec);
    cdSize += rec.length;
  }

  const eocd = new Uint8Array(22);
  const eocdDv = new DataView(eocd.buffer);
  eocdDv.setUint32(0, 0x06054b50, true);
  eocdDv.setUint16(10, entries.length, true);
  eocdDv.setUint32(12, cdSize, true);
  eocdDv.setUint32(16, 0, true);
  chunks.push(eocd);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}

describe('v1.4.1 client utilities', () => {
  it('normalizes custom game .exe rules and formats elapsed playtime', () => {
    expect(normalizeGameExeName('  "C:\\Games\\CS2.EXE" ')).toBe('cs2.exe');
    const added = addCustomGameRule([], 'Valorant-Win64-Shipping', 'VALORANT');
    expect(added).toEqual([{ exe: 'valorant-win64-shipping.exe', name: 'VALORANT' }]);
    expect(removeCustomGameRule(added, 'valorant-win64-shipping.exe')).toEqual([]);
    expect(formatElapsedPlaytime(1000, 126000)).toBe('2 dk');
    expect(formatElapsedPlaytime(0, 5400000)).toBe('');
    expect(formatElapsedPlaytime(1000, 5401000)).toBe('1 sa 30 dk');
  });

  it('encodes and decodes shareable theme tokens safely', () => {
    const token = encodeShareableTheme('Gece Neon', DEFAULT_CUSTOM_THEME);
    expect(token.startsWith('[[CAKMA_THEME:v1:')).toBe(true);
    const decoded = decodeShareableTheme(token);
    expect(decoded?.name).toBe('Gece Neon');
    expect(decoded?.config.accentColor).toBe(DEFAULT_CUSTOM_THEME.accentColor);
    expect(decodeShareableTheme('[[CAKMA_THEME:v1:not-valid-base64!]]')).toBeNull();
  });

  it('organizes server folders cleanly via create, move, and merge helpers', () => {
    const folders1 = createServerFolder([], 'Oyunlar', 'srv-1', '#3b82f6');
    const moved = moveServerToFolder(folders1, 'srv-2', folders1[0].id);
    expect(moved[0].serverIds).toEqual(['srv-1', 'srv-2']);
    const merged = mergeServersIntoNewFolder([], 'srv-a', 'srv-b', 'Ekip');
    expect(merged[0].serverIds).toEqual(['srv-b', 'srv-a']);
  });

  it('summarizes E2EE messages completely locally and formats markdown', () => {
    const digest = summarizeConversationLocally(
      [
        { author: 'Ali', content: 'Sürüm yarın 21:00 için karar verildi.' },
        { author: 'Veli', content: 'Notları ekliyor muyuz?' },
      ],
      { channelName: 'Özel E2EE Sohbet' }
    );
    expect(digest.participants.length).toBe(2);
    const md = formatDigestAsMarkdown(digest, 'Özel E2EE Sohbet');
    expect(md).toContain('Özel E2EE Sohbet');
    expect(md).toContain('Ali');
  });

  it('parses ZIP central directory and CSV/JSON tabular previews', () => {
    const zipBuf = buildMinimalZip([
      { name: 'src/', size: 0 },
      { name: 'src/index.ts', size: 1234 },
    ]);
    const zipEntries = parseZipDirectory(zipBuf);
    expect(zipEntries).toHaveLength(2);
    expect(zipEntries[0].isDirectory).toBe(true);
    expect(zipEntries[1]).toMatchObject({ name: 'src/index.ts', uncompressedSize: 1234 });

    const csv = parseCsvPreview('ad;puan;rol\nAli;95;admin\nVeli;88;member');
    expect(csv.columns).toEqual(['ad', 'puan', 'rol']);
    expect(csv.rows).toHaveLength(2);

    const json = parseJsonPreview('[{"id":1,"name":"Test"},{"id":2,"name":"Demo"}]');
    expect(json.columns).toEqual(['id', 'name']);
    expect(json.rows[1]).toEqual(['2', 'Demo']);
  });

  it('validates client cosmetics unlock logic and name gradient lookup', () => {
    expect(isClientCosmeticUnlocked('frame:none', 1, [])).toBe(true);
    expect(isClientCosmeticUnlocked('grad:royal', 1, [])).toBe(false);
    expect(isClientCosmeticUnlocked('grad:royal', 1, ['grad:royal'])).toBe(true);
    expect(getNameGradientClass('ocean')).toContain('bg-gradient-to-r');
  });
});
