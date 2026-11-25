import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ContentReport, IssuedLicense, RegisteredAccount, StoreSettings, User } from '../types.js';
import { SqliteStore } from '../sqliteStore.js';
import { registerStoreSocketHandlers } from '../features/storeSocketHandlers.js';

function createMockSocket(id: string) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket: any = {
    id,
    on: (ev: string, fn: (p: unknown) => void) => handlers.set(ev, fn),
    emit: (ev: string, payload: unknown) => emitted.push({ event: ev, payload }),
  };
  return {
    socket,
    emitted,
    trigger: (ev: string, payload?: unknown) => {
      const fn = handlers.get(ev);
      if (!fn) throw new Error(`Missing handler for ${ev}`);
      fn(payload);
    },
  };
}

describe('v1.2.0 Stage 4: Relational SQLite & Extracted Store Socket Handlers', () => {
  it('stores and queries relational accounts_index and content_reports rows in SqliteStore', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-sqlite-rel-'));
    const store = new SqliteStore(tmpDir);
    const active = await store.init();
    if (!active) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    try {
      const accounts = new Map<string, RegisteredAccount>([
        [
          'alice',
          {
            id: 'acc-alice',
            username: 'Alice',
            email: 'alice@example.com',
            password: 'hash',
            avatar: '🛡️',
            role: 'user',
            createdAt: '2026-11-25',
            walletBalance: 250.5,
            friends: [],
          },
        ],
        [
          'bob',
          {
            id: 'acc-bob',
            username: 'Bob',
            email: 'bob@example.com',
            password: 'hash',
            avatar: '🎮',
            role: 'admin',
            isBanned: true,
            createdAt: '2026-11-25',
            walletBalance: 10,
            friends: [],
          },
        ],
      ]);

      const syncedAccCount = store.syncAccountsIndex(accounts);
      assert.equal(syncedAccCount, 2);

      const summaries = store.listAccountSummaries();
      assert.equal(summaries.length, 2);
      assert.equal(summaries[0].username, 'Alice');
      assert.equal(summaries[0].walletBalance, 250.5);
      assert.equal(summaries[1].isBanned, true);

      const reports: ContentReport[] = [
        {
          id: 'rep-1',
          reporterUsername: 'Alice',
          targetUsername: 'Bob',
          category: 'spam',
          reason: 'Spam mesaj',
          status: 'open',
          createdAt: '2026-11-25T05:00:00.000Z',
        },
        {
          id: 'rep-2',
          reporterUsername: 'Alice',
          targetUsername: 'Charlie',
          category: 'harassment',
          reason: 'Çözüldü',
          status: 'resolved',
          createdAt: '2026-11-25T06:00:00.000Z',
        },
      ];
      assert.equal(store.syncContentReports(reports), 2);
      assert.equal(store.listContentReports().length, 2);
      assert.equal(store.listContentReports('open').length, 1);
      assert.equal(store.listContentReports('open')[0].id, 'rep-1');
      assert.equal(store.listContentReports('resolved')[0].id, 'rep-2');
    } finally {
      store.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles wallet purchase and license extension via extracted registerStoreSocketHandlers', () => {
    const buyerSock = createMockSocket('sock-buyer');
    const activeUsers = new Map<string, User>([
      [
        'sock-buyer',
        {
          id: 'u-buyer',
          username: 'Buyer',
          role: 'user',
          avatar: '',
          status: 'online',
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
          walletBalance: 500,
        },
      ],
    ]);
    const accounts = new Map<string, RegisteredAccount>([
      [
        'buyer',
        {
          id: 'u-buyer',
          username: 'Buyer',
          email: 'buyer@example.com',
          password: 'hash',
          avatar: '',
          role: 'user',
          createdAt: '2026-11-25',
          walletBalance: 500,
          friends: [],
        },
      ],
    ]);
    const issuedLicenses = new Map<string, IssuedLicense>();
    const storeSettings: StoreSettings = {
      isOpen: true,
      currencySymbol: '₺',
      customSlotUnitPrice: 2,
      discountPercentage: 0,
      packages: {
        starter: { tier: 'Starter', name: 'Starter', slots: 32, price: 40, enabled: true, description: '' },
        pro: { tier: 'Pro', name: 'Pro', slots: 64, price: 100, enabled: true, description: '' },
        enterprise: { tier: 'Enterprise', name: 'Enterprise', slots: 256, price: 250, enabled: true, description: '' },
      },
      paymentMethods: [{ id: 'wallet', name: 'Cüzdan', enabled: true, icon: '💳', description: '' }],
    };

    registerStoreSocketHandlers(buyerSock.socket, {
      io: { to: () => ({ emit: () => {} }) } as any,
      activeUsers,
      registeredAccounts: accounts,
      issuedLicenses,
      storeSettings,
      sanitizeText: (s) => s,
      generateLicenseKey: (lic, slots, _exp, tier) => `KEY-${tier}-${slots}-${lic}`,
      saveAccounts: () => {},
      saveLicenses: () => {},
      addAuditLog: () => {},
    });

    buyerSock.trigger('store_purchase_license', {
      serverName: 'Buyer Klan',
      maxSlots: 64,
      expireDays: 30,
      tier: 'Pro',
      paymentMethod: 'wallet',
    });

    assert.equal(accounts.get('buyer')?.walletBalance, 400);
    assert.equal(issuedLicenses.size, 1);
    const lic = Array.from(issuedLicenses.values())[0];
    assert.equal(lic.status, 'active');

    buyerSock.trigger('store_extend_license', {
      licenseId: lic.id,
      addDays: 30,
      paymentMethod: 'wallet',
    });
    // Extend charges 64 slots * 2 customSlotUnitPrice = 128
    assert.equal(accounts.get('buyer')?.walletBalance, 272);
  });
});
