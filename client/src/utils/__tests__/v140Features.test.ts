import { describe, it, expect } from 'vitest';
import {
  findEmojiAutocompleteMatches,
  applyEmojiAutocomplete,
} from '../customEmojiHelper';
import {
  normalizeTurkishGuess,
  isCorrectDrawGuess,
  maskDrawWord,
} from '../drawGuessHelper';

describe('v1.4.0 community features helpers', () => {
  const sampleEmojis = [
    { id: '1', name: 'pogchamp', url: '/pog.png' },
    { id: '2', name: 'sadge', url: '/sad.png' },
    { id: '3', name: 'cakma_fire', url: '/fire.png' },
    { id: '4', name: 'gg_wp', url: '/gg.png' },
  ];

  it('finds custom emoji autocomplete matches from trailing :query tokens', () => {
    expect(findEmojiAutocompleteMatches('harika :po', sampleEmojis).map((e) => e.name)).toEqual([
      'pogchamp',
    ]);
    expect(findEmojiAutocompleteMatches(':fire', sampleEmojis).map((e) => e.name)).toEqual([
      'cakma_fire',
    ]);
    expect(findEmojiAutocompleteMatches(':p', sampleEmojis)).toEqual([]);
    expect(findEmojiAutocompleteMatches('normal text', sampleEmojis)).toEqual([]);
  });

  it('replaces trailing :partial query with complete :emoji: token cleanly', () => {
    expect(applyEmojiAutocomplete(':po', 'pogchamp')).toBe(':pogchamp: ');
    expect(applyEmojiAutocomplete('oyun bitti :gg', 'gg_wp')).toBe('oyun bitti :gg_wp: ');
  });

  it('normalizes Turkish characters and validates Draw & Guess answers case-insensitively', () => {
    expect(normalizeTurkishGuess('İSTANBUL Şehir ÖĞRENCİ üÇ')).toBe('istanbul sehir ogrenci uc');
    expect(isCorrectDrawGuess('gunes', 'güneş')).toBe(true);
    expect(isCorrectDrawGuess('  Kulaklik ', 'kulaklık')).toBe(true);
    expect(isCorrectDrawGuess('araba', 'roket')).toBe(false);
    expect(isCorrectDrawGuess('', 'ev')).toBe(false);
  });

  it('masks Draw & Guess words with optional first-letter reveal', () => {
    expect(maskDrawWord('roket', false)).toBe('_ _ _ _ _');
    expect(maskDrawWord('roket', true)).toBe('r _ _ _ _');
    expect(maskDrawWord('', true)).toBe('');
  });
});
