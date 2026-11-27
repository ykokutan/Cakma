export interface CustomGameRule {
  exe: string;
  name: string;
}

export const CUSTOM_GAME_RULES_KEY = 'dc_custom_game_rules_v1';
export const INTERACTIVE_OVERLAY_HOTKEY_KEY = 'dc_interactive_overlay_hotkey';
export const DEFAULT_INTERACTIVE_OVERLAY_HOTKEY = 'Alt+Shift+O';

export function normalizeGameExeName(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .toLowerCase()
    .replace(/^.*[/\\]/, '');
  if (!cleaned) return '';
  return cleaned.endsWith('.exe') || !cleaned.includes('.') ? (cleaned.endsWith('.exe') ? cleaned : `${cleaned}.exe`) : cleaned;
}

export function loadCustomGameRules(): CustomGameRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_GAME_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: CustomGameRule[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const exe = normalizeGameExeName(String((item as CustomGameRule).exe || ''));
      const name = String((item as CustomGameRule).name || '').trim().slice(0, 64);
      if (exe && name && !seen.has(exe)) {
        seen.add(exe);
        out.push({ exe, name });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomGameRules(rules: CustomGameRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_GAME_RULES_KEY, JSON.stringify(rules.slice(0, 40)));
  } catch {}
}

export function addCustomGameRule(rules: CustomGameRule[], exe: string, name: string): CustomGameRule[] {
  const normExe = normalizeGameExeName(exe);
  const cleanName = String(name || '').trim().slice(0, 64);
  if (!normExe || !cleanName) return rules;
  const filtered = rules.filter((r) => r.exe.toLowerCase() !== normExe);
  return [{ exe: normExe, name: cleanName }, ...filtered].slice(0, 40);
}

export function removeCustomGameRule(rules: CustomGameRule[], exe: string): CustomGameRule[] {
  const target = normalizeGameExeName(exe);
  return rules.filter((r) => r.exe.toLowerCase() !== target);
}

export function formatElapsedPlaytime(startedAtMs?: number, nowMs: number = Date.now()): string {
  if (!startedAtMs || !Number.isFinite(startedAtMs) || startedAtMs <= 0) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (diffSec < 60) return '<1 dk';
  const totalMins = Math.floor(diffSec / 60);
  if (totalMins < 60) return `${totalMins} dk`;
  const hours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;
  return remMins > 0 ? `${hours} sa ${remMins} dk` : `${hours} sa`;
}
