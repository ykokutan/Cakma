import { describe, expect, it } from 'vitest';
import {
  buildPersistentDmChannelId,
  decodeDmSegment,
  encodeDmSegment,
  parseDmChannelParticipants,
} from '../dmChannel';
import { resolveMediaUrl } from '../authFetch';
import { appConfirm, appPrompt, appToast, registerAppDialogHandlers } from '../appDialogs';

describe('dmChannel & media helpers', () => {
  it('generates consistent username-based DM channel IDs independent of user order or casing', () => {
    const id1 = buildPersistentDmChannelId('Ahmet-Kaya', 'Zeynep');
    const id2 = buildPersistentDmChannelId('zeynep', 'ahmet-kaya');
    expect(id1).toBe(id2);
    expect(id1.startsWith('dm-u-')).toBe(true);
    expect(parseDmChannelParticipants(id1)?.sort()).toEqual(['ahmet-kaya', 'zeynep']);
    expect(decodeDmSegment(encodeDmSegment('çağrı-test'))).toBe('çağrı-test');
  });

  it('resolves relative server media paths against host while leaving data/http URLs intact', () => {
    expect(resolveMediaUrl('', 'ses.yahyakemalokutan.com')).toBe('');
    expect(resolveMediaUrl('data:image/png;base64,abc', 'localhost:4000')).toBe('data:image/png;base64,abc');
    expect(resolveMediaUrl('https://cdn.example.com/a.png', 'localhost:4000')).toBe('https://cdn.example.com/a.png');
    expect(resolveMediaUrl('/uploads/upl-1.webp', 'localhost:4000')).toBe('http://localhost:4000/uploads/upl-1.webp');
  });

  it('routes appToast, appConfirm, and appPrompt through registered host handlers cleanly', async () => {
    const captured: Array<{ message: string; variant: string }> = [];
    const unregister = registerAppDialogHandlers({
      toast: (message, variant) => captured.push({ message, variant }),
      confirm: async (opts) => opts.message.includes('Sil'),
      prompt: async (opts) => (opts.defaultValue ? `${opts.defaultValue}!` : null),
    });

    appToast('Kaydedildi', 'success');
    expect(captured).toEqual([{ message: 'Kaydedildi', variant: 'success' }]);
    expect(await appConfirm('Silinsin mi?')).toBe(true);
    expect(await appConfirm('Vazgeç?')).toBe(false);
    expect(await appPrompt({ message: 'Sebep?', defaultValue: 'Test' })).toBe('Test!');

    unregister();
    expect(await appConfirm('Silinsin mi?')).toBe(false);
    expect(await appPrompt({ message: 'Sebep?' })).toBeNull();
  });
});
