import { describe, it, expect } from 'vitest';
import {
  formatCaptionBadge,
  shouldTranslateCaption,
  formatCaptionTranscriptMarkdown,
  type LiveCaptionEntry,
} from '../liveCaptionHelpers';

describe('liveCaptionHelpers', () => {
  it('formats distinct source badges for users vs game/stream audio', () => {
    expect(
      formatCaptionBadge({ source: 'user', author: 'ykokutan' })
    ).toBe('👤 ykokutan');

    expect(
      formatCaptionBadge({ source: 'stream', author: 'ykokutan', sourceLabel: 'Counter-Strike 2' })
    ).toBe('🎮 Uygulama · Counter-Strike 2');

    expect(
      formatCaptionBadge({ source: 'stream', author: 'ykokutan' })
    ).toBe('🎮 Yayın / Uygulama');
  });

  it('determines when caption translation should run', () => {
    expect(shouldTranslateCaption('Reloading cover me', 'en', 'tr')).toBe(true);
    expect(shouldTranslateCaption('Selam', 'tr', 'tr')).toBe(false);
    expect(shouldTranslateCaption('Hi', 'en', null)).toBe(false);
    expect(shouldTranslateCaption('a', 'en', 'tr')).toBe(false);
  });

  it('formats markdown transcript including both translated and original lines', () => {
    const entries: LiveCaptionEntry[] = [
      {
        id: '1',
        time: '05:59',
        author: 'ykokutan',
        source: 'stream',
        sourceLabel: 'Valorant',
        text: 'Spike planted at A',
        translatedText: 'Spike A bölgesine kuruldu',
        sourceLang: 'en',
        targetLang: 'tr',
      },
      {
        id: '2',
        time: '05:59',
        author: 'Furkan',
        source: 'user',
        text: 'Hemen geliyorum',
        sourceLang: 'tr',
      },
    ];
    const md = formatCaptionTranscriptMarkdown('oyun-odasi', entries);
    expect(md).toContain('Canlı Ses Altyazı Transkripti — #oyun-odasi');
    expect(md).toContain('🎮 Uygulama · Valorant');
    expect(md).toContain('Spike A bölgesine kuruldu _(Orijinal: Spike planted at A)_');
    expect(md).toContain('👤 Furkan');
  });
});
