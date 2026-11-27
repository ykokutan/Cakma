import fs from 'fs';
import path from 'path';
import type { Message } from './types.js';

export interface SearchHit {
  channelId: string;
  message: Message;
}

/**
 * Resolves a collision-free filesystem-safe filename for any channelId / DM key.
 */
function channelToFilename(channelId: string): string {
  const safe = encodeURIComponent(channelId).replace(/[^a-zA-Z0-9._%-]/g, '_');
  return `${safe}.json`;
}

/**
 * Per-channel sharded async message store with automatic migration from legacy messages.json.
 */
export class ShardedMessageStore {
  private readonly messagesDir: string;
  private readonly legacyFilePath: string;
  private readonly pendingChannels = new Map<string, Message[]>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly dataDir: string) {
    this.messagesDir = path.join(dataDir, 'messages');
    this.legacyFilePath = path.join(dataDir, 'messages.json');
  }

  private ensureDir() {
    if (!fs.existsSync(this.messagesDir)) {
      fs.mkdirSync(this.messagesDir, { recursive: true });
    }
  }

  loadAll(defaultMessages: Record<string, Message[]> = {}): Record<string, Message[]> {
    this.ensureDir();
    const result: Record<string, Message[]> = {};
    let loadedFiles = 0;

    try {
      const entries = fs.readdirSync(this.messagesDir);
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const fullPath = path.join(this.messagesDir, entry);
        try {
          const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          if (parsed && typeof parsed.channelId === 'string' && Array.isArray(parsed.messages)) {
            result[parsed.channelId] = parsed.messages;
            loadedFiles++;
          } else if (Array.isArray(parsed)) {
            const channelId = decodeURIComponent(entry.slice(0, -5));
            result[channelId] = parsed;
            loadedFiles++;
          }
        } catch (err) {
          console.warn(`⚠️ [MessageStore] ${entry} okunamadı:`, err);
        }
      }
    } catch {}

    // Migrate legacy single messages.json once if shard folder is empty
    if (loadedFiles === 0 && fs.existsSync(this.legacyFilePath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(this.legacyFilePath, 'utf-8')) as Record<string, Message[]>;
        if (legacy && typeof legacy === 'object') {
          for (const [chId, msgs] of Object.entries(legacy)) {
            if (Array.isArray(msgs)) {
              result[chId] = msgs;
              this.writeChannelSync(chId, msgs);
            }
          }
          console.log(`🔄 [MessageStore] Eski messages.json (${Object.keys(result).length} kanal) parçalı yapıya geçirildi.`);
          return result;
        }
      } catch (err) {
        console.warn('⚠️ [MessageStore] Eski messages.json taşınamadı:', err);
      }
    }

    if (loadedFiles === 0 && Object.keys(defaultMessages).length > 0) {
      for (const [chId, msgs] of Object.entries(defaultMessages)) {
        result[chId] = [...msgs];
        this.writeChannelSync(chId, result[chId]);
      }
      return result;
    }

    console.log(`💾 [MessageStore] ${loadedFiles} kanalın mesaj geçmişi yüklendi.`);
    return result;
  }

  private writeChannelSync(channelId: string, msgs: Message[]) {
    try {
      this.ensureDir();
      const target = path.join(this.messagesDir, channelToFilename(channelId));
      const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify({ channelId, messages: msgs }, null, 2), 'utf-8');
      fs.renameSync(tmp, target);
    } catch (err) {
      console.error(`❌ [MessageStore] ${channelId} senkron yazılamadı:`, err);
    }
  }

  private async writeChannelAsync(channelId: string, msgs: Message[]) {
    const prev = this.inFlight.get(channelId) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        try {
          await fs.promises.mkdir(this.messagesDir, { recursive: true });
          const target = path.join(this.messagesDir, channelToFilename(channelId));
          const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          await fs.promises.writeFile(tmp, JSON.stringify({ channelId, messages: msgs }, null, 2), 'utf-8');
          await fs.promises.rename(tmp, target);
        } catch (err) {
          console.error(`❌ [MessageStore] ${channelId} asenkron yazılamadı:`, err);
        }
      });
    this.inFlight.set(channelId, next);
    await next;
  }

  scheduleSaveChannel(channelId: string, msgs: Message[], delayMs = 200) {
    this.pendingChannels.set(channelId, msgs);
    const existingTimer = this.timers.get(channelId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      this.timers.delete(channelId);
      const snapshot = this.pendingChannels.get(channelId);
      if (snapshot !== undefined) {
        this.pendingChannels.delete(channelId);
        void this.writeChannelAsync(channelId, snapshot);
      }
    }, delayMs);
    timer.unref?.();
    this.timers.set(channelId, timer);
  }

  flushSync() {
    for (const [chId, timer] of this.timers.entries()) {
      clearTimeout(timer);
      this.timers.delete(chId);
    }
    for (const [chId, msgs] of this.pendingChannels.entries()) {
      this.pendingChannels.delete(chId);
      this.writeChannelSync(chId, msgs);
    }
  }

  getPendingCount(): number {
    return this.pendingChannels.size + this.inFlight.size;
  }
}

export function getInitialMessagesSlice(
  allMessages: Record<string, Message[]>,
  perChannelLimit = 60
): { initialMessages: Record<string, Message[]>; hasMoreMessages: Record<string, boolean> } {
  const initialMessages: Record<string, Message[]> = {};
  const hasMoreMessages: Record<string, boolean> = {};
  for (const [chId, list] of Object.entries(allMessages)) {
    if (!Array.isArray(list)) continue;
    if (list.length > perChannelLimit) {
      initialMessages[chId] = list.slice(-perChannelLimit);
      hasMoreMessages[chId] = true;
    } else {
      initialMessages[chId] = list;
      hasMoreMessages[chId] = false;
    }
  }
  return { initialMessages, hasMoreMessages };
}

export function getChannelMessagesPage(
  channelMsgs: Message[] | undefined,
  beforeId?: string,
  limit = 50
): { messages: Message[]; hasMore: boolean } {
  const list = Array.isArray(channelMsgs) ? channelMsgs : [];
  if (list.length === 0) return { messages: [], hasMore: false };
  const clampedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const endIndex = beforeId ? list.findIndex((m) => m.id === beforeId) : list.length;
  if (endIndex <= 0) return { messages: [], hasMore: false };
  const startIndex = Math.max(0, endIndex - clampedLimit);
  return {
    messages: list.slice(startIndex, endIndex),
    hasMore: startIndex > 0,
  };
}

export interface ParsedServerSearchQuery {
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

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const FENCED_CODE_RE = /```([a-zA-Z0-9_+-]*)\s*[\r\n][\s\S]*?```/g;
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

export function parseServerSearchQuery(rawQuery: string): ParsedServerSearchQuery {
  const parts = String(rawQuery || '').trim().split(/\s+/).filter(Boolean);
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
    if (lower === 'has:image' || lower === 'has:resim') hasImage = true;
    else if (lower === 'has:file' || lower === 'has:dosya') hasFile = true;
    else if (lower === 'has:link') hasLink = true;
    else if (lower === 'has:code' || lower === 'has:kod') hasCode = true;
    else if (lower === 'has:video') hasVideo = true;
    else if (lower === 'has:audio' || lower === 'has:ses' || lower === 'has:voice') hasAudio = true;
    else if (lower === 'is:pinned' || lower === 'is:sabit') isPinned = true;
    else if (lower.startsWith('from:')) {
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

export function matchesServerSearchQuery(msg: Message, parsed: ParsedServerSearchQuery): boolean {
  const content = String(msg.content || '');
  const attachments = msg.attachments || [];

  if (parsed.isPinned && !msg.isPinned) return false;
  if (parsed.fromUser && !(msg.author?.username || '').toLowerCase().includes(parsed.fromUser)) {
    return false;
  }
  if (parsed.hasImage) {
    const ok = attachments.some((a) => (a.e2ee?.origType || a.type || '').startsWith('image/'));
    if (!ok) return false;
  }
  if (parsed.hasVideo) {
    const ok = attachments.some((a) => (a.e2ee?.origType || a.type || '').startsWith('video/'));
    if (!ok) return false;
  }
  if (parsed.hasAudio) {
    const ok = attachments.some((a) => (a.e2ee?.origType || a.type || '').startsWith('audio/'));
    if (!ok) return false;
  }
  if (parsed.hasFile && attachments.length === 0) return false;
  if (parsed.hasLink && !URL_RE.test(content)) return false;

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
    FENCED_CODE_RE.lastIndex = 0;
    const foundLangs: string[] = [];
    let match: RegExpExecArray | null;
    let foundAnyBlock = false;
    while ((match = FENCED_CODE_RE.exec(content)) !== null) {
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

export function searchAllMessages(
  allMessages: Record<string, Message[]>,
  query: string,
  allowedChannelIds?: Set<string>,
  limit = 50
): SearchHit[] {
  const raw = (query || '').trim();
  if (!raw) return [];
  const parsed = parseServerSearchQuery(raw);
  const hits: SearchHit[] = [];
  for (const [chId, list] of Object.entries(allMessages)) {
    if (allowedChannelIds && !allowedChannelIds.has(chId)) continue;
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (matchesServerSearchQuery(m, parsed)) {
        hits.push({ channelId: chId, message: m });
      }
    }
  }
  hits.sort((a, b) => new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime());
  return hits.slice(0, Math.min(Math.max(limit, 1), 100));
}
