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

export function searchAllMessages(
  allMessages: Record<string, Message[]>,
  query: string,
  allowedChannelIds?: Set<string>,
  limit = 50
): SearchHit[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const [chId, list] of Object.entries(allMessages)) {
    if (allowedChannelIds && !allowedChannelIds.has(chId)) continue;
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const text = (m.content || '').toLowerCase();
      const author = (m.author?.username || '').toLowerCase();
      if (text.includes(q) || author.includes(q)) {
        hits.push({ channelId: chId, message: m });
      }
    }
  }
  hits.sort((a, b) => new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime());
  return hits.slice(0, Math.min(Math.max(limit, 1), 100));
}
