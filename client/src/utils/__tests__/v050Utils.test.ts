import { describe, it, expect, beforeEach } from 'vitest';
import { getDraft, setDraft, clearDraft, resetAllDrafts } from '../channelDrafts';
import {
  getTargetNotificationPref,
  shouldNotifyForMessage,
  shouldShowUnreadForChannel,
} from '../notificationPrefs';
import { parseDeepLinkUrl } from '../deepLink';
import { computeVirtualWindow } from '../virtualWindow';

describe('channelDrafts store', () => {
  beforeEach(() => {
    resetAllDrafts();
  });

  it('saves, reads, and clears drafts per channel', () => {
    expect(getDraft('ch-1')).toBe('');
    setDraft('ch-1', 'Merhaba ekip!');
    expect(getDraft('ch-1')).toBe('Merhaba ekip!');
    setDraft('ch-1', '   ');
    expect(getDraft('ch-1')).toBe('');
    setDraft('dm:ali', 'Selam');
    clearDraft('dm:ali');
    expect(getDraft('dm:ali')).toBe('');
  });
});

describe('notificationPrefs helpers', () => {
  it('resolves channel override before server setting and filters alerts cleanly', () => {
    const prefs = {
      'srv-1': 'muted' as const,
      'ch-vip': 'mentions' as const,
    };
    expect(getTargetNotificationPref(prefs, 'ch-general', 'srv-1')).toBe('muted');
    expect(getTargetNotificationPref(prefs, 'ch-vip', 'srv-1')).toBe('mentions');
    expect(getTargetNotificationPref(prefs, 'ch-other', 'srv-2')).toBe('all');

    expect(shouldNotifyForMessage({ level: 'muted', isMention: true, isDM: true })).toBe(false);
    expect(shouldNotifyForMessage({ level: 'mentions', isMention: false, isDM: false })).toBe(false);
    expect(shouldNotifyForMessage({ level: 'mentions', isMention: true, isDM: false })).toBe(true);
    expect(shouldShowUnreadForChannel({ level: 'mentions', isMention: false })).toBe(false);
    expect(shouldShowUnreadForChannel({ level: 'all', isMention: false })).toBe(true);
  });
});

describe('parseDeepLinkUrl', () => {
  it('extracts invite codes from cakma:// and web invite URLs', () => {
    expect(parseDeepLinkUrl('cakma://invite/ABC-123')).toEqual({ type: 'invite', code: 'ABC-123' });
    expect(parseDeepLinkUrl('"cakma://invite?code=TEAM_42"')).toEqual({ type: 'invite', code: 'TEAM_42' });
    expect(parseDeepLinkUrl('https://ses.yahyakemalokutan.com/?invite=OYUN99')).toEqual({
      type: 'invite',
      code: 'OYUN99',
    });
    expect(parseDeepLinkUrl('cakma://invalid')).toBeNull();
  });
});

describe('computeVirtualWindow', () => {
  it('skips virtualization under 80 messages and windows large lists accurately', () => {
    const small = computeVirtualWindow({ totalCount: 45, scrollTop: 0, viewportHeight: 500 });
    expect(small.virtualized).toBe(false);
    expect(small.startIndex).toBe(0);
    expect(small.endIndex).toBe(45);

    const large = computeVirtualWindow({
      totalCount: 200,
      scrollTop: 4000,
      viewportHeight: 600,
      estimatedRowHeight: 80,
      overscan: 5,
    });
    expect(large.virtualized).toBe(true);
    expect(large.startIndex).toBe(45);
    expect(large.endIndex).toBe(63);
    expect(large.paddingTop).toBe(45 * 80);
    expect(large.paddingBottom).toBe((200 - 63) * 80);
  });
});
