import { beforeEach, describe, it, expect } from 'vitest';
import {
  enqueueOfflineItem,
  loadOfflineQueueFromStorage,
  removeOfflineItem,
  saveOfflineQueueToStorage,
  updateOfflineItemStatus,
} from '../../context/hooks/useOfflineMessageQueue';
import { SHARED_CONTRACT_VERSION } from '../../sharedContracts';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
  return store;
}

describe('offline message queue & shared contract v0.8.0', () => {
  beforeEach(() => {
    installMockLocalStorage();
  });

  it('persists FIFO queue across reloads and resets stuck sending status to queued', () => {
    let q = enqueueOfflineItem([], 'srv-1', 'ch-1', 'Birinci mesaj');
    q = enqueueOfflineItem(q, 'srv-1', 'ch-1', 'Ikinci mesaj', {
      id: 'm-0',
      username: 'Alice',
      content: 'Alinti',
    });
    expect(q).toHaveLength(2);
    expect(q[0].content).toBe('Birinci mesaj');
    expect(q[1].replyTo?.username).toBe('Alice');

    q = updateOfflineItemStatus(q, q[0].localId, 'sending');
    saveOfflineQueueToStorage(q);

    const reloaded = loadOfflineQueueFromStorage();
    expect(reloaded).toHaveLength(2);
    expect(reloaded[0].status).toBe('queued');
    expect(reloaded[1].content).toBe('Ikinci mesaj');
  });

  it('handles failure status, cancellation, and corrupted storage gracefully', () => {
    let q = enqueueOfflineItem([], 'srv-1', 'ch-2', 'Tekrar dene');
    const id = q[0].localId;
    q = updateOfflineItemStatus(q, id, 'failed', 'Baglanti koptu');
    expect(q[0].status).toBe('failed');
    expect(q[0].error).toBe('Baglanti koptu');

    q = updateOfflineItemStatus(q, id, 'queued');
    expect(q[0].error).toBeUndefined();

    q = removeOfflineItem(q, id);
    expect(q).toHaveLength(0);
    saveOfflineQueueToStorage(q);
    expect(loadOfflineQueueFromStorage()).toEqual([]);

    globalThis.localStorage.setItem('cakma_offline_msg_queue_v1', '{not-valid-json');
    expect(loadOfflineQueueFromStorage()).toEqual([]);
  });

  it('exposes shared contract version 0.8.0 on client side', () => {
    expect(SHARED_CONTRACT_VERSION).toBe('0.8.0');
  });
});
