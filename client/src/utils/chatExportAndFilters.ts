import type { Message } from '../types';

export interface ParsedSearchQuery {
  text: string;
  hasImage: boolean;
  hasFile: boolean;
  hasLink: boolean;
  hasCode: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  isPinned: boolean;
  extensions: string[];
  codeLanguages: string[];
  fromUser?: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const FENCED_CODE_REGEX = /```([a-zA-Z0-9_+-]*)\s*[\r\n][\s\S]*?```/g;
const LANG_ALIASES: Record<string, string[]> = {
  js: ['js', 'javascript'],
  javascript: ['js', 'javascript'],
  ts: ['ts', 'typescript'],
  typescript: ['ts', 'typescript'],
  py: ['py', 'python'],
  python: ['py', 'python'],
  cs: ['cs', 'csharp'],
  csharp: ['cs', 'csharp'],
  sh: ['sh', 'bash', 'shell'],
  bash: ['sh', 'bash', 'shell'],
};

export function parseSmartSearchQuery(rawQuery: string): ParsedSearchQuery {
  const parts = String(rawQuery || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const textTokens: string[] = [];
  let hasImage = false;
  let hasFile = false;
  let hasLink = false;
  let hasCode = false;
  let hasVideo = false;
  let hasAudio = false;
  let isPinned = false;
  const extensions: string[] = [];
  const codeLanguages: string[] = [];
  let fromUser: string | undefined;

  for (const token of parts) {
    const lower = token.toLowerCase();
    if (lower === 'has:image' || lower === 'has:resim') {
      hasImage = true;
    } else if (lower === 'has:file' || lower === 'has:dosya') {
      hasFile = true;
    } else if (lower === 'has:link') {
      hasLink = true;
    } else if (lower === 'has:code' || lower === 'has:kod') {
      hasCode = true;
    } else if (lower === 'has:video') {
      hasVideo = true;
    } else if (lower === 'has:audio' || lower === 'has:ses' || lower === 'has:voice') {
      hasAudio = true;
    } else if (lower === 'is:pinned' || lower === 'is:sabit') {
      isPinned = true;
    } else if (lower.startsWith('from:')) {
      const candidate = token.slice(5).replace(/^@/, '').trim().toLowerCase();
      if (candidate) fromUser = candidate;
    } else if (lower.startsWith('ext:')) {
      const ext = lower.slice(4).replace(/^\./, '').trim();
      if (ext && !extensions.includes(ext)) extensions.push(ext);
    } else if (lower.startsWith('lang:')) {
      const lang = lower.slice(5).trim();
      if (lang && !codeLanguages.includes(lang)) codeLanguages.push(lang);
    } else {
      textTokens.push(token);
    }
  }

  return {
    text: textTokens.join(' ').toLowerCase(),
    hasImage,
    hasFile,
    hasLink,
    hasCode,
    hasVideo,
    hasAudio,
    isPinned,
    extensions,
    codeLanguages,
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
  if (parsed.hasVideo) {
    const vidMatch = attachments.some(
      (a) =>
        (a.type && a.type.startsWith('video/')) ||
        (a.e2ee?.origType && a.e2ee.origType.startsWith('video/'))
    );
    if (!vidMatch) return false;
  }
  if (parsed.hasAudio) {
    const audMatch = attachments.some(
      (a) =>
        (a.type && a.type.startsWith('audio/')) ||
        (a.e2ee?.origType && a.e2ee.origType.startsWith('audio/'))
    );
    if (!audMatch) return false;
  }
  if (parsed.hasFile && attachments.length === 0) return false;
  if (parsed.hasLink && !URL_REGEX.test(content)) return false;

  if (parsed.extensions.length > 0) {
    const extOk = parsed.extensions.every((reqExt) =>
      attachments.some((a) => {
        const name = String(a.e2ee?.origName || a.name || '').toLowerCase();
        const dot = name.lastIndexOf('.');
        const actual = dot > 0 ? name.slice(dot + 1) : '';
        return actual === reqExt;
      })
    );
    if (!extOk) return false;
  }

  if (parsed.hasCode || parsed.codeLanguages.length > 0) {
    FENCED_CODE_REGEX.lastIndex = 0;
    const foundLangs: string[] = [];
    let match: RegExpExecArray | null;
    let foundAnyBlock = false;
    while ((match = FENCED_CODE_REGEX.exec(content)) !== null) {
      foundAnyBlock = true;
      const lang = (match[1] || '').trim().toLowerCase();
      if (lang) foundLangs.push(lang);
    }
    if (!foundAnyBlock) return false;
    if (parsed.codeLanguages.length > 0) {
      const langOk = parsed.codeLanguages.every((req) => {
        const variants = LANG_ALIASES[req] || [req];
        return foundLangs.some((fl) => variants.includes(fl));
      });
      if (!langOk) return false;
    }
  }

  if (parsed.text) {
    const attNames = attachments.map((a) => a.e2ee?.origName || a.name || '').join(' ');
    const lfgText = msg.lfg ? `${msg.lfg.game} ${msg.lfg.title}` : '';
    const hay = `${msg.author?.username || ''} ${content} ${attNames} ${msg.forumPost?.title || ''} ${lfgText}`.toLowerCase();
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
