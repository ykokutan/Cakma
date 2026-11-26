import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranslateLang, parseGtxTranslateResponse } from '../features/translateRoute.js';

describe('Live Captions Translate Helpers', () => {
  it('normalizes supported translate languages and falls back safely', () => {
    assert.equal(normalizeTranslateLang('TR'), 'tr');
    assert.equal(normalizeTranslateLang('en'), 'en');
    assert.equal(normalizeTranslateLang('fr'), 'fr');
    assert.equal(normalizeTranslateLang('auto'), 'auto');
    assert.equal(normalizeTranslateLang('xx-invalid'), 'en');
    assert.equal(normalizeTranslateLang(null), 'en');
  });

  it('parses single and multi-segment Google GTX arrays and handles malformed inputs', () => {
    const sample = [
      [
        ['Merhaba dünya. ', 'Hello world. ', null, null, 1],
        ['Görev tamamlandı!', 'Mission accomplished!', null, null, 1],
      ],
      null,
      'en',
    ];
    assert.equal(parseGtxTranslateResponse(sample), 'Merhaba dünya. Görev tamamlandı!');
    assert.equal(parseGtxTranslateResponse([[]]), null);
    assert.equal(parseGtxTranslateResponse(null), null);
    assert.equal(parseGtxTranslateResponse({ error: true }), null);
  });
});
