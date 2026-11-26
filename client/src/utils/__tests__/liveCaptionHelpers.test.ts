import { describe, it, expect } from 'vitest';
import {
  formatCaptionBadge,
  shouldTranslateCaption,
  formatCaptionTranscriptMarkdown,
  parseClientGtxTranslate,
  detectSpokenLangHint,
  downsampleTo16kHz,
  computeAudioRms,
  cleanWhisperTranscript,
  type LiveCaptionEntry,
} from '../liveCaptionHelpers';

describe('liveCaptionHelpers', () => {
  it('formats distinct source badges for users vs game/stream audio', () => {
    expect(
      formatCaptionBadge({ source: 'user', author: 'ykokutan' })
    ).toBe('👤 ykokutan');

    expect(
      formatCaptionBadge({ source: 'stream', author: 'ykokutan', sourceLabel: 'Counter-Strike 2' })
    ).toBe('🎮 Uygulama · Counter-Strike 2');

    expect(
      formatCaptionBadge({ source: 'stream', author: 'ykokutan' })
    ).toBe('🎮 Yayın / Uygulama');
  });

  it('determines when caption translation should run', () => {
    expect(shouldTranslateCaption('Reloading cover me', 'en', 'tr')).toBe(true);
    expect(shouldTranslateCaption('Selam', 'tr', 'tr')).toBe(false);
    expect(shouldTranslateCaption('Hi', 'en', null)).toBe(false);
    expect(shouldTranslateCaption('a', 'en', 'tr')).toBe(false);
  });

  it('formats markdown transcript including both translated and original lines', () => {
    const entries: LiveCaptionEntry[] = [
      {
        id: '1',
        time: '05:59',
        author: 'ykokutan',
        source: 'stream',
        sourceLabel: 'Valorant',
        text: 'Spike planted at A',
        translatedText: 'Spike A bölgesine kuruldu',
        sourceLang: 'en',
        targetLang: 'tr',
      },
      {
        id: '2',
        time: '05:59',
        author: 'Furkan',
        source: 'user',
        text: 'Hemen geliyorum',
        sourceLang: 'tr',
      },
    ];
    const md = formatCaptionTranscriptMarkdown('oyun-odasi', entries);
    expect(md).toContain('Canlı Ses Altyazı Transkripti — #oyun-odasi');
    expect(md).toContain('🎮 Uygulama · Valorant');
    expect(md).toContain('Spike A bölgesine kuruldu _(Orijinal: Spike planted at A)_');
    expect(md).toContain('👤 Furkan');
  });

  it('allows auto source language when evaluating shouldTranslateCaption', () => {
    expect(shouldTranslateCaption('Hello team', 'auto', 'tr')).toBe(true);
    expect(shouldTranslateCaption('Hello team', 'auto', 'off')).toBe(false);
    expect(shouldTranslateCaption('A', 'auto', 'tr')).toBe(false);
  });

  it('parses Google GTX client translation payloads and detected language', () => {
    const payload = [
      [
        ['Merhaba takım, ', 'Hello team, ', null, null, 10],
        ['saldırıya hazır mısınız?', 'ready to push?', null, null, 10],
      ],
      null,
      'en',
    ];
    expect(parseClientGtxTranslate(payload)).toEqual({
      translatedText: 'Merhaba takım, saldırıya hazır mısınız?',
      detectedLang: 'en',
    });
    expect(parseClientGtxTranslate([[], null, 'en'])).toBeNull();
    expect(parseClientGtxTranslate(null)).toBeNull();
  });

  it('detects spoken language hints across supported scripts and tokens', () => {
    expect(detectSpokenLangHint('Привет команда, идем на точку')).toBe('ru');
    expect(detectSpokenLangHint('Şimdi B bölgesine geçiyoruz, hazır olun')).toBe('tr');
    expect(detectSpokenLangHint('Wir müssen die Straße sichern')).toBe('de');
    expect(detectSpokenLangHint("C'est très bien, allons-y")).toBe('fr');
    expect(detectSpokenLangHint('Cover me while reloading')).toBe('en');
    expect(detectSpokenLangHint('42')).toBeNull();
  });

  it('downsamples 48kHz audio to 16kHz and passes 16kHz through unchanged', () => {
    const passthrough = new Float32Array([0.1, -0.2, 0.3]);
    expect(downsampleTo16kHz(passthrough, 16000)).toBe(passthrough);

    const input48k = new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]);
    const out16k = downsampleTo16kHz(input48k, 48000);
    expect(out16k.length).toBe(2);
    expect(out16k[0]).toBeCloseTo(0.3, 5);
    expect(out16k[1]).toBeCloseTo(-0.6, 5);
    expect(downsampleTo16kHz(new Float32Array(0), 48000).length).toBe(0);
  });

  it('computes audio RMS for silence and constant signal', () => {
    expect(computeAudioRms(new Float32Array(0))).toBe(0);
    expect(computeAudioRms(new Float32Array([0, 0, 0, 0]))).toBe(0);
    expect(computeAudioRms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 5);
  });

  it('cleans Whisper silence hallucinations and preserves real multilingual text', () => {
    expect(cleanWhisperTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanWhisperTranscript('[Music] (silence) ♪la la♪')).toBe('');
    expect(cleanWhisperTranscript('Thank you.')).toBe('');
    expect(cleanWhisperTranscript('...')).toBe('');
    expect(cleanWhisperTranscript('  [Music] Spike planted at A  ')).toBe('Spike planted at A');
    expect(cleanWhisperTranscript('Şimdi B bölgesine geçiyoruz')).toBe(
      'Şimdi B bölgesine geçiyoruz'
    );
  });
});
