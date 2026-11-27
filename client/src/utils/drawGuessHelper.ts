export const DRAW_GUESS_WORDS: readonly string[] = [
  'araba',
  'kedi',
  'köpek',
  'güneş',
  'ev',
  'ağaç',
  'balık',
  'roket',
  'kulaklık',
  'klavye',
  'fare',
  'mikrofon',
  'gemi',
  'uçak',
  'dağ',
  'deniz',
  'yıldız',
  'ay',
  'kalp',
  'elma',
  'kahve',
  'pizza',
  'gitar',
  'kitap',
  'saat',
  'gözlük',
  'kamera',
  'bulut',
  'şimşek',
  'kale',
  'köprü',
  'bisiklet',
  'traktör',
  'çadır',
  'robot',
  'karpuz',
];

export function normalizeTurkishGuess(input: string): string {
  return String(input || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrectDrawGuess(guess: string, secretWord: string): boolean {
  const normGuess = normalizeTurkishGuess(guess);
  const normSecret = normalizeTurkishGuess(secretWord);
  if (!normGuess || !normSecret) return false;
  return normGuess === normSecret;
}

export function maskDrawWord(word: string, revealFirst = false): string {
  const chars = Array.from(String(word || '').trim());
  if (chars.length === 0) return '';
  return chars
    .map((ch, idx) => {
      if (ch === ' ') return ' ';
      if (revealFirst && idx === 0) return ch;
      return '_';
    })
    .join(' ');
}
