export interface SummaryEntryInput {
  author: string;
  content: string;
  timestamp?: string;
}

export interface ConversationDigest {
  mode: 'builtin' | 'gemini' | 'openai';
  headline: string;
  highlights: Array<{ author: string; text: string }>;
  decisionsAndQuestions: Array<{ kind: 'decision' | 'question'; author: string; text: string }>;
  sharedLinks: string[];
  mentions: Array<{ target: string; count: number }>;
  participants: Array<{ username: string; count: number }>;
}

const STOPWORDS = new Set([
  've', 'veya', 'ama', 'fakat', 'ile', 'için', 'bu', 'şu', 'o', 'bir', 'iki', 'da', 'de',
  'ki', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl', 'neden', 'ben', 'sen', 'biz', 'siz', 'onlar',
  'var', 'yok', 'çok', 'az', 'daha', 'en', 'gibi', 'kadar', 'olarak', 'olan', 'evet', 'hayır',
  'the', 'and', 'or', 'but', 'for', 'with', 'this', 'that', 'are', 'was', 'is', 'not', 'you',
  'have', 'has', 'had', 'from', 'just', 'yes', 'no', 'lol', 'ok', 'tamam', 'selam', 'merhaba',
]);

const DECISION_MARKERS = [
  'karar', 'onay', 'onaylandı', 'tamamlandı', 'yapalım', 'plan', 'aksiyon',
  'böylece', 'anlaştık', 'saat', 'yarın', 'toplantı', 'hedef', 'yayın', 'güncelle',
];

const URL_RE = /https?:\/\/[^\s<>"'`)]+/gi;
const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_.-]{2,32})/g;

export function summarizeConversation(
  entries: SummaryEntryInput[],
  opts?: { channelName?: string }
): ConversationDigest {
  const cleanEntries = entries
    .map((e) => ({
      author: String(e.author || 'Kullanıcı').trim() || 'Kullanıcı',
      content: String(e.content || '').replace(/\s+/g, ' ').trim(),
      timestamp: e.timestamp,
    }))
    .filter((e) => e.content.length > 0 && !e.content.startsWith('[[CAKMA_'));

  const participantMap = new Map<string, number>();
  const linkSet = new Set<string>();
  const mentionMap = new Map<string, number>();
  const wordFreq = new Map<string, number>();

  for (const e of cleanEntries) {
    participantMap.set(e.author, (participantMap.get(e.author) || 0) + 1);
    const urls = e.content.match(URL_RE);
    if (urls) {
      for (const u of urls) {
        if (linkSet.size < 8) linkSet.add(u.replace(/[.,;!?]+$/, ''));
      }
    }
    let m: RegExpExecArray | null;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(e.content)) !== null) {
      const target = m[1];
      mentionMap.set(target, (mentionMap.get(target) || 0) + 1);
    }

    const words = e.content
      .toLowerCase()
      .replace(URL_RE, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/);
    for (const w of words) {
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }

  const participants = Array.from(participantMap.entries())
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const mentions = Array.from(mentionMap.entries())
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const decisionsAndQuestions: ConversationDigest['decisionsAndQuestions'] = [];
  const scored: Array<{ idx: number; author: string; text: string; score: number }> = [];

  cleanEntries.forEach((e, idx) => {
    const lower = e.content.toLowerCase();
    const isQuestion = e.content.includes('?') && e.content.length >= 6;
    const isDecision = DECISION_MARKERS.some((kw) => lower.includes(kw)) && e.content.length >= 10;

    if (decisionsAndQuestions.length < 6) {
      if (isDecision) {
        decisionsAndQuestions.push({
          kind: 'decision',
          author: e.author,
          text: e.content.slice(0, 200),
        });
      } else if (isQuestion) {
        decisionsAndQuestions.push({
          kind: 'question',
          author: e.author,
          text: e.content.slice(0, 200),
        });
      }
    }

    const words = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/);
    let score = 0;
    let useful = 0;
    for (const w of words) {
      if (w.length >= 3 && !STOPWORDS.has(w)) {
        useful += 1;
        score += wordFreq.get(w) || 1;
      }
    }
    if (useful === 0) return;
    const recencyBoost = 1 + (idx / Math.max(1, cleanEntries.length)) * 0.35;
    const lengthFactor = Math.min(1.8, Math.max(0.5, useful / 6));
    scored.push({
      idx,
      author: e.author,
      text: e.content.slice(0, 220),
      score: (score / useful) * lengthFactor * recencyBoost,
    });
  });

  const highlights = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.idx - b.idx)
    .map(({ author, text }) => ({ author, text }));

  const chPrefix = opts?.channelName ? `#${opts.channelName} kanalında ` : '';
  const headline =
    cleanEntries.length === 0
      ? `${chPrefix}özetlenecek yeterli mesaj bulunamadı.`
      : `${chPrefix}${participantMap.size} katılımcı arasında ${cleanEntries.length} mesaj incelendi.`;

  return {
    mode: 'builtin',
    headline,
    highlights,
    decisionsAndQuestions,
    sharedLinks: Array.from(linkSet),
    mentions,
    participants,
  };
}
