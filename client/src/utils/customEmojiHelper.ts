export interface CustomEmojiItem {
  id: string;
  name: string;
  url: string;
}

const TRAILING_EMOJI_QUERY_RE = /(?:^|\s):([a-zA-Z0-9_-]{2,32})$/;

export function findEmojiAutocompleteMatches(
  inputText: string,
  customEmojis: CustomEmojiItem[] = [],
  limit = 8
): CustomEmojiItem[] {
  if (!inputText || customEmojis.length === 0) return [];
  const match = inputText.match(TRAILING_EMOJI_QUERY_RE);
  if (!match) return [];
  const partial = match[1].toLowerCase();

  const startsWith: CustomEmojiItem[] = [];
  const includes: CustomEmojiItem[] = [];
  for (const em of customEmojis) {
    const lower = em.name.toLowerCase();
    if (lower.startsWith(partial)) {
      startsWith.push(em);
    } else if (lower.includes(partial)) {
      includes.push(em);
    }
  }
  return [...startsWith, ...includes].slice(0, Math.max(1, limit));
}

export function applyEmojiAutocomplete(inputText: string, emojiName: string): string {
  const match = inputText.match(TRAILING_EMOJI_QUERY_RE);
  if (!match || match.index === undefined) {
    return `${inputText}:${emojiName}: `;
  }
  const hasLeadingSpace = match[0].startsWith(' ') || /\s/.test(match[0][0] || '');
  const prefix = inputText.slice(0, match.index) + (hasLeadingSpace ? match[0][0] : '');
  return `${prefix}:${emojiName}: `;
}
