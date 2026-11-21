import type { Message } from '../types';

export interface ParsedSearchQuery {
  text: string;
  hasImage: boolean;
  hasFile: boolean;
  hasLink: boolean;
  isPinned: boolean;
  fromUser?: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

export function parseSmartSearchQuery(rawQuery: string): ParsedSearchQuery {
  const parts = String(rawQuery || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const textTokens: string[] = [];
  let hasImage = false;
  let hasFile = false;
  let hasLink = false;
  let isPinned = false;
  let fromUser: string | undefined;

  for (const token of parts) {
    const lower = token.toLowerCase();
    if (lower === 'has:image' || lower === 'has:resim') {
      hasImage = true;
    } else if (lower === 'has:file' || lower === 'has:dosya') {
      hasFile = true;
    } else if (lower === 'has:link') {
      hasLink = true;
    } else if (lower === 'is:pinned' || lower === 'is:sabit') {
      isPinned = true;
    } else if (lower.startsWith('from:')) {
      const candidate = token.slice(5).replace(/^@/, '').trim().toLowerCase();
      if (candidate) fromUser = candidate;
    } else {
      textTokens.push(token);
    }
  }

  return {
    text: textTokens.join(' ').toLowerCase(),
    hasImage,
    hasFile,
    hasLink,
    isPinned,
    ...(fromUser ? { fromUser } : {}),
  };
}

export function matchesSmartSearch(
  msg: Message,
  parsed: ParsedSearchQuery,
  resolvedContent?: string
): boolean {
  const content = String(resolvedContent ?? msg.content ?? '');
  const attachments = msg.attachments || [];

  if (parsed.isPinned && !msg.isPinned) return false;
  if (parsed.fromUser) {
    const authorLower = (msg.author?.username || '').toLowerCase();
    if (!authorLower.includes(parsed.fromUser)) return false;
  }
  if (parsed.hasImage) {
    const imgMatch = attachments.some(
      (a) =>
        (a.type && a.type.startsWith('image/')) ||
        (a.e2ee?.origType && a.e2ee.origType.startsWith('image/'))
    );
    if (!imgMatch) return false;
  }
  if (parsed.hasFile && attachments.length === 0) return false;
  if (parsed.hasLink && !URL_REGEX.test(content)) return false;

  if (parsed.text) {
    const hay = `${msg.author?.username || ''} ${content} ${msg.forumPost?.title || ''}`.toLowerCase();
    if (!hay.includes(parsed.text)) return false;
  }

  return true;
}

export function formatTranscriptMarkdown(opts: {
  channelName: string;
  serverName?: string;
  messages: Message[];
  decryptedMap?: Record<string, string>;
}): string {
  const lines: string[] = [
    `# #${opts.channelName}${opts.serverName ? ` — ${opts.serverName}` : ''}`,
    `Dışa Aktarım Tarihi: ${new Date().toISOString()}`,
    `Toplam Mesaj: ${opts.messages.length}`,
    '',
    '---',
    '',
  ];

  for (const m of opts.messages) {
    const body = opts.decryptedMap?.[m.id] ?? m.content ?? '';
    const pinTag = m.isPinned ? ' 📌' : '';
    const attNames = (m.attachments || []).map((a) => a.e2ee?.origName || a.name).filter(Boolean);
    const attSuffix = attNames.length > 0 ? `\n  _Ekler: ${attNames.join(', ')}_` : '';
    lines.push(`- **[${m.timestamp}] ${m.author?.username || 'Kullanıcı'}**${pinTag}: ${body}${attSuffix}`);
  }

  return lines.join('\n');
}

export function formatTranscriptJson(opts: {
  channelName: string;
  serverName?: string;
  messages: Message[];
  decryptedMap?: Record<string, string>;
}): string {
  const payload = {
    channelName: opts.channelName,
    ...(opts.serverName ? { serverName: opts.serverName } : {}),
    exportedAt: new Date().toISOString(),
    messageCount: opts.messages.length,
    messages: opts.messages.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      author: m.author?.username || 'Kullanıcı',
      content: opts.decryptedMap?.[m.id] ?? m.content ?? '',
      isPinned: Boolean(m.isPinned),
      attachments: (m.attachments || []).map((a) => ({
        name: a.e2ee?.origName || a.name,
        size: a.e2ee?.origSize ?? a.size,
        type: a.e2ee?.origType || a.type,
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
