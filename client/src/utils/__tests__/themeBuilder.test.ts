import { describe, it, expect } from 'vitest';
import {
  sanitizeHexColor,
  hexToRgbTuple,
  DEFAULT_CUSTOM_THEME,
} from '../themeBuilder';

describe('themeBuilder utilities', () => {
  it('sanitizes 6-digit and 3-digit hex colors with safe fallback', () => {
    expect(sanitizeHexColor('#3B82F6', '#000000')).toBe('#3b82f6');
    expect(sanitizeHexColor('#abc', '#000000')).toBe('#aabbcc');
    expect(sanitizeHexColor('javascript:alert(1)', '#111827')).toBe('#111827');
  });

  it('converts hex colors to RGB comma tuples for CSS variables', () => {
    expect(hexToRgbTuple('#3b82f6')).toBe('59, 130, 246');
    expect(hexToRgbTuple('#fff')).toBe('255, 255, 255');
    expect(DEFAULT_CUSTOM_THEME.mode).toBe('dark');
  });
});
