export interface CustomThemeConfig {
  mode: 'dark' | 'light';
  bgColor: string;
  accentColor: string;
}

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  mode: 'dark',
  bgColor: '#111827',
  accentColor: '#3b82f6',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX_RE = /^#[0-9a-fA-F]{3}$/;

export function sanitizeHexColor(input: string, fallback: string): string {
  const trimmed = (input || '').trim();
  if (HEX_COLOR_RE.test(trimmed)) return trimmed.toLowerCase();
  if (SHORT_HEX_RE.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback.toLowerCase();
}

export function hexToRgbTuple(hex: string, fallback = '#3b82f6'): string {
  const normalized = sanitizeHexColor(hex, fallback);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export function applyCustomThemeVariables(root: HTMLElement, cfg: CustomThemeConfig): void {
  const bg = sanitizeHexColor(cfg.bgColor, DEFAULT_CUSTOM_THEME.bgColor);
  const accent = sanitizeHexColor(cfg.accentColor, DEFAULT_CUSTOM_THEME.accentColor);
  root.style.setProperty('--custom-bg', bg);
  root.style.setProperty('--custom-accent', accent);
  root.style.setProperty('--custom-accent-rgb', hexToRgbTuple(accent));
}
