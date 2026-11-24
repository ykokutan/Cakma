import { describe, it, expect } from 'vitest';
import { parseMarkdownBlocks } from '../../components/chat/MessageTextRenderer';

describe('parseMarkdownBlocks (Markdown 2.0)', () => {
  it('parses GFM tables cleanly with headers and rows', () => {
    const md = [
      '| Komut | Açıklama |',
      '| --- | :--- |',
      '| `/zar` | Zar atar |',
      '| `/temizle` | Mesaj siler |',
    ].join('\n');

    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toEqual([
      {
        type: 'table',
        headers: ['Komut', 'Açıklama'],
        rows: [
          ['`/zar`', 'Zar atar'],
          ['`/temizle`', 'Mesaj siler'],
        ],
      },
    ]);
  });

  it('parses headings, blockquotes, bullet lists, and plain text lines', () => {
    const md = [
      '# Başlık 1',
      '## Başlık 2',
      '> Önemli alıntı ||gizli||',
      '- Birinci madde',
      '* İkinci madde',
      'Normal satır `kod()`',
    ].join('\n');

    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Başlık 1' },
      { type: 'heading', level: 2, text: 'Başlık 2' },
      { type: 'quote', text: 'Önemli alıntı ||gizli||' },
      { type: 'list', items: ['Birinci madde', 'İkinci madde'] },
      { type: 'line', text: 'Normal satır `kod()`' },
    ]);
  });
});
