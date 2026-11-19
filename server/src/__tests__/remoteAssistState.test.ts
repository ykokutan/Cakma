import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RemoteAssistManager,
  buildDirectCallLogContent,
  normalizeRemoteAssistPermissions,
} from '../utils/remoteAssistState.js';

describe('remoteAssistState', () => {
  describe('normalizeRemoteAssistPermissions', () => {
    it('defaults all permission flags to true and honors explicit false values', () => {
      assert.deepEqual(normalizeRemoteAssistPermissions(), {
        control: true,
        clipboard: true,
        annotate: true,
      });
      assert.deepEqual(
        normalizeRemoteAssistPermissions({ control: false, clipboard: true }),
        {
          control: false,
          clipboard: true,
          annotate: true,
        }
      );
    });
  });

  describe('RemoteAssistManager', () => {
    it('blocks input until an active authorized session exists between controller and host', () => {
      const mgr = new RemoteAssistManager();
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), false);

      mgr.startSession('ctrl-1', 'host-1', true, {
        control: true,
        clipboard: true,
        annotate: true,
      });
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), true);
      assert.equal(mgr.canSendInput('ctrl-1', 'other-host'), false);
      assert.equal(mgr.canSendInput('other-ctrl', 'host-1'), false);
    });

    it('enforces pause/resume and host-only live permission mutations', () => {
      const mgr = new RemoteAssistManager();
      mgr.startSession('ctrl-1', 'host-1', true);

      assert.equal(mgr.setPaused('host-1', true)?.paused, true);
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), false);

      assert.equal(mgr.setPaused('ctrl-1', false)?.paused, false);
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), true);

      // Controller cannot elevate/mutate host permissions
      assert.equal(mgr.updatePermissions('ctrl-1', { control: false }), null);
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), true);

      // Host can revoke control & clipboard live
      const updated = mgr.updatePermissions('host-1', {
        control: false,
        clipboard: false,
      });
      assert.ok(updated);
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), false);
      assert.equal(mgr.canShareClipboard('ctrl-1', 'host-1'), false);
      assert.equal(mgr.canShareClipboard('ctrl-1', 'host-1'), false);
    });

    it('rate limits pointer moves (90/s) and other inputs (150/s) independently per window', () => {
      const mgr = new RemoteAssistManager();
      const base = 1_700_000_000_000;

      for (let i = 0; i < 90; i++) {
        assert.equal(mgr.allowInput('ctrl-1', 'move', base + 10), true);
      }
      assert.equal(mgr.allowInput('ctrl-1', 'move', base + 20), false);

      for (let i = 0; i < 150; i++) {
        assert.equal(mgr.allowInput('ctrl-1', 'keydown', base + 30), true);
      }
      assert.equal(mgr.allowInput('ctrl-1', 'keydown', base + 40), false);

      // Next 1s window resets quotas (windowStart was base + 10)
      assert.equal(mgr.allowInput('ctrl-1', 'move', base + 1020), true);
      assert.equal(mgr.allowInput('ctrl-1', 'keydown', base + 1020), true);
    });

    it('cleans up both sockets and rate windows when session ends', () => {
      const mgr = new RemoteAssistManager();
      mgr.startSession('ctrl-1', 'host-1', true);
      mgr.allowInput('ctrl-1', 'move', 5000);

      const ended = mgr.endSessionForSocket('host-1');
      assert.ok(ended);
      assert.equal(mgr.getSessionForSocket('ctrl-1'), undefined);
      assert.equal(mgr.getSessionForSocket('host-1'), undefined);
      assert.equal(mgr.canSendInput('ctrl-1', 'host-1'), false);
    });
  });

  describe('buildDirectCallLogContent', () => {
    it('formats call summaries accurately for all statuses', () => {
      assert.match(buildDirectCallLogContent('ended', 125), /02:05/);
      assert.match(buildDirectCallLogContent('timeout', 0), /yanıtlanmadı/);
      assert.match(buildDirectCallLogContent('busy', 0), /Meşgul/);
      assert.match(buildDirectCallLogContent('dnd', 0), /Rahatsız Etme/);
      assert.match(
        buildDirectCallLogContent('declined', 0, 'Toplantıdayım'),
        /Toplantıdayım/
      );
    });
  });
});
