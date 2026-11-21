import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContractReplyRef, OfflineQueuedMessage } from '../../sharedContracts';

const STORAGE_KEY = 'cakma_offline_msg_queue_v1';
const MAX_QUEUED_MESSAGES = 50;

export function loadOfflineQueueFromStorage(): OfflineQueuedMessage[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is OfflineQueuedMessage => Boolean(item && item.localId && item.channelId && item.content))
      .map((item) => ({
        ...item,
        status: item.status === 'sending' ? 'queued' : item.status,
      }));
  } catch {
    return [];
  }
}

export function saveOfflineQueueToStorage(queue: OfflineQueuedMessage[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED_MESSAGES)));
    }
  } catch {}
}

export function enqueueOfflineItem(
  prev: OfflineQueuedMessage[],
  serverId: string,
  channelId: string,
  content: string,
  replyTo?: ContractReplyRef
): OfflineQueuedMessage[] {
  const cleanContent = String(content || '').trim();
  if (!channelId || !cleanContent) return prev;
  const item: OfflineQueuedMessage = {
    localId: `qmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serverId: serverId || 'default',
    channelId,
    content: cleanContent,
    createdAt: new Date().toISOString(),
    status: 'queued',
    ...(replyTo ? { replyTo } : {}),
  };
  return [...prev.slice(-(MAX_QUEUED_MESSAGES - 1)), item];
}

export function updateOfflineItemStatus(
  prev: OfflineQueuedMessage[],
  localId: string,
  status: OfflineQueuedMessage['status'],
  error?: string
): OfflineQueuedMessage[] {
  return prev.map((item) =>
    item.localId === localId ? { ...item, status, error: status === 'failed' ? error : undefined } : item
  );
}

export function removeOfflineItem(prev: OfflineQueuedMessage[], localId: string): OfflineQueuedMessage[] {
  return prev.filter((item) => item.localId !== localId);
}

interface UseOfflineMessageQueueOptions {
  isConnectedAndAuthed: boolean;
  emitMessage: (payload: {
    serverId: string;
    channelId: string;
    content: string;
    replyTo?: ContractReplyRef;
  }) => boolean;
}

export function useOfflineMessageQueue({ isConnectedAndAuthed, emitMessage }: UseOfflineMessageQueueOptions) {
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedMessage[]>(() => loadOfflineQueueFromStorage());
  const isFlushingRef = useRef(false);
  const queueRef = useRef<OfflineQueuedMessage[]>(offlineQueue);
  queueRef.current = offlineQueue;

  useEffect(() => {
    saveOfflineQueueToStorage(offlineQueue);
  }, [offlineQueue]);

  const enqueueMessage = useCallback(
    (serverId: string, channelId: string, content: string, replyTo?: ContractReplyRef) => {
      setOfflineQueue((prev) => enqueueOfflineItem(prev, serverId, channelId, content, replyTo));
    },
    []
  );

  const cancelQueuedMessage = useCallback((localId: string) => {
    setOfflineQueue((prev) => removeOfflineItem(prev, localId));
  }, []);

  const retryQueuedMessage = useCallback(
    (localId: string) => {
      const target = queueRef.current.find((q) => q.localId === localId);
      if (!target) return;
      if (!isConnectedAndAuthed) {
        setOfflineQueue((prev) => updateOfflineItemStatus(prev, localId, 'queued'));
        return;
      }
      setOfflineQueue((prev) => updateOfflineItemStatus(prev, localId, 'sending'));
      const sent = emitMessage({
        serverId: target.serverId,
        channelId: target.channelId,
        content: target.content,
        replyTo: target.replyTo,
      });
      if (sent) {
        setOfflineQueue((prev) => removeOfflineItem(prev, localId));
      } else {
        setOfflineQueue((prev) =>
          updateOfflineItemStatus(prev, localId, 'failed', 'Sunucuya gönderilemedi. Bağlantıyı kontrol edin.')
        );
      }
    },
    [isConnectedAndAuthed, emitMessage]
  );

  useEffect(() => {
    if (!isConnectedAndAuthed || isFlushingRef.current) return;
    const queuedItems = queueRef.current.filter((item) => item.status === 'queued');
    if (queuedItems.length === 0) return;

    isFlushingRef.current = true;
    try {
      for (const item of queuedItems) {
        setOfflineQueue((prev) => updateOfflineItemStatus(prev, item.localId, 'sending'));
        const ok = emitMessage({
          serverId: item.serverId,
          channelId: item.channelId,
          content: item.content,
          replyTo: item.replyTo,
        });
        if (ok) {
          setOfflineQueue((prev) => removeOfflineItem(prev, item.localId));
        } else {
          setOfflineQueue((prev) =>
            updateOfflineItemStatus(prev, item.localId, 'failed', 'Yeniden bağlanırken gönderim başarısız oldu.')
          );
          break;
        }
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, [isConnectedAndAuthed, offlineQueue.length, emitMessage]);

  return {
    offlineQueue,
    enqueueMessage,
    retryQueuedMessage,
    cancelQueuedMessage,
  };
}
