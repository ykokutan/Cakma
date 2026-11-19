import { describe, expect, it } from 'vitest';
import type { RemoteAssistAnnotationStroke } from '../../types';
import {
  clampPanOffset,
  classifyConnectionQuality,
  clientPointToNormalizedVideo,
  computeVideoContentRect,
  formatCallDuration,
  getDirectScreenShareConstraints,
  pruneExpiredAnnotations,
} from '../remoteAssistHelpers';

describe('remoteAssistHelpers', () => {
  describe('computeVideoContentRect', () => {
    it('centers letterboxed video inside taller or wider containers', () => {
      // 16:9 video in 1000x600 container -> width 1000, height 562.5, top 18.75
      const r1 = computeVideoContentRect(1000, 600, 1920, 1080);
      expect(r1.left).toBe(0);
      expect(r1.width).toBe(1000);
      expect(r1.height).toBeCloseTo(562.5, 4);
      expect(r1.top).toBeCloseTo(18.75, 4);

      // 4:3 video in 1600x900 container -> height 900, width 1200, left 200
      const r2 = computeVideoContentRect(1600, 900, 1200, 900);
      expect(r2.top).toBe(0);
      expect(r2.height).toBe(900);
      expect(r2.width).toBeCloseTo(1200, 4);
      expect(r2.left).toBeCloseTo(200, 4);
    });
  });

  describe('clientPointToNormalizedVideo', () => {
    const viewport = { left: 0, top: 0, width: 1000, height: 600 };

    it('maps fit-mode coordinates and rejects letterbox margin clicks', () => {
      const center = clientPointToNormalizedVideo(500, 300, viewport, 1920, 1080, 1, 0, 0);
      expect(center).not.toBeNull();
      expect(center!.x).toBeCloseTo(0.5, 4);
      expect(center!.y).toBeCloseTo(0.5, 4);

      // y=5 is inside top 18.75px letterbox bar
      expect(clientPointToNormalizedVideo(500, 5, viewport, 1920, 1080, 1, 0, 0)).toBeNull();
    });

    it('accurately reverses 2x zoom and pan transforms', () => {
      // With panX=+100, panY=0, video center shifts to clientX=600, clientY=300
      const shiftedCenter = clientPointToNormalizedVideo(600, 300, viewport, 1920, 1080, 2, 100, 0);
      expect(shiftedCenter).not.toBeNull();
      expect(shiftedCenter!.x).toBeCloseTo(0.5, 4);
      expect(shiftedCenter!.y).toBeCloseTo(0.5, 4);

      // +100px at 2x zoom corresponds to +50px in 1000px unscaled video = +0.05
      const rightStep = clientPointToNormalizedVideo(700, 300, viewport, 1920, 1080, 2, 100, 0);
      expect(rightStep!.x).toBeCloseTo(0.55, 4);
    });
  });

  describe('clampPanOffset', () => {
    it('resets pan to zero at 1x zoom and clamps to viewport edge slack when zoomed', () => {
      expect(clampPanOffset(120, -80, 1, 1000, 600)).toEqual({ panX: 0, panY: 0 });
      // At zoom=2 on 1000x600: maxX = 500, maxY = 300
      expect(clampPanOffset(999, -999, 2, 1000, 600)).toEqual({ panX: 500, panY: -300 });
    });
  });

  describe('getDirectScreenShareConstraints', () => {
    it('returns preset-appropriate hints, bitrates, and system audio option', () => {
      const sharp = getDirectScreenShareConstraints({ preset: 'sharp-text', shareAudio: false });
      expect(sharp.contentHint).toBe('text');
      expect(sharp.displayMediaOptions.audio).toBe(false);

      const smooth = getDirectScreenShareConstraints({ preset: 'smooth-60', shareAudio: true });
      expect(smooth.contentHint).toBe('motion');
      expect(smooth.displayMediaOptions.audio).toBe(true);
      expect(smooth.maxBitrateBps).toBeGreaterThan(sharp.maxBitrateBps);

      const source = getDirectScreenShareConstraints({ preset: 'source', shareAudio: true });
      expect(source.maxBitrateBps).toBeGreaterThanOrEqual(8_000_000);
    });
  });

  describe('formatCallDuration', () => {
    it('formats sub-hour durations as MM:SS and hourly durations as H:MM:SS', () => {
      expect(formatCallDuration(0)).toBe('00:00');
      expect(formatCallDuration(65)).toBe('01:05');
      expect(formatCallDuration(3665)).toBe('1:01:05');
    });
  });

  describe('pruneExpiredAnnotations', () => {
    it('keeps fresh strokes and removes expired strokes past TTL', () => {
      const strokes: RemoteAssistAnnotationStroke[] = [
        { id: 'old', tool: 'pen', color: '#f43f5e', points: [{ x: 0.1, y: 0.1 }], createdAt: 1000 },
        { id: 'fresh', tool: 'rect', color: '#38bdf8', points: [{ x: 0.2, y: 0.2 }], createdAt: 4000 },
      ];
      const kept = pruneExpiredAnnotations(strokes, 6000, 4500);
      expect(kept.map((s) => s.id)).toEqual(['fresh']);
    });
  });

  describe('classifyConnectionQuality', () => {
    it('maps RTT and packet loss thresholds to Turkish quality levels', () => {
      expect(classifyConnectionQuality(18, 0).level).toBe('excellent');
      expect(classifyConnectionQuality(85, 0.2).level).toBe('good');
      expect(classifyConnectionQuality(150, 1).level).toBe('fair');
      expect(classifyConnectionQuality(280, 0).level).toBe('poor');
      expect(classifyConnectionQuality(20, 6).level).toBe('poor');
    });
  });
});
