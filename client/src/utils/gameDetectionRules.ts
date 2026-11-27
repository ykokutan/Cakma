import type { NoiseDspProfile } from './noiseDspProfiles';

export type GameInputModePref = 'auto' | 'vad' | 'ptt';
export type GameDspProfilePref = 'auto' | NoiseDspProfile;

export interface CustomGameRule {
  exe: string;
  name: string;
  inputMode?: GameInputModePref;
  dspProfile?: GameDspProfilePref;
  autoOpenOverlay?: boolean;
}

export interface ResolvedGameAudioProfile {
  gameName: string;
  inputMode?: 'vad' | 'ptt';
  dspProfile?: NoiseDspProfile;
  autoOpenOverlay?: boolean;
}

export const CUSTOM_GAME_RULES_KEY = 'dc_custom_game_rules_v1';
export const INTERACTIVE_OVERLAY_HOTKEY_KEY = 'dc_interactive_overlay_hotkey';
export const DEFAULT_INTERACTIVE_OVERLAY_HOTKEY = 'Alt+Shift+O';

const VALID_INPUT_PREFS = new Set<GameInputModePref>(['auto', 'vad', 'ptt']);
const VALID_DSP_PREFS = new Set<GameDspProfilePref>([
  'auto',
  'studio',
  'balanced',
  'aggressive',
  'keyboard_guard',
  'voice_isolation',
]);

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
      const r = item as CustomGameRule;
      const exe = normalizeGameExeName(String(r.exe || ''));
      const name = String(r.name || '').trim().slice(0, 64);
      if (exe && name && !seen.has(exe)) {
        seen.add(exe);
        out.push({
          exe,
          name,
          ...(r.inputMode && VALID_INPUT_PREFS.has(r.inputMode) ? { inputMode: r.inputMode } : {}),
          ...(r.dspProfile && VALID_DSP_PREFS.has(r.dspProfile) ? { dspProfile: r.dspProfile } : {}),
          ...(typeof r.autoOpenOverlay === 'boolean' ? { autoOpenOverlay: r.autoOpenOverlay } : {}),
        });
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

export function addCustomGameRule(
  rules: CustomGameRule[],
  exe: string,
  name: string,
  opts?: {
    inputMode?: GameInputModePref;
    dspProfile?: GameDspProfilePref;
    autoOpenOverlay?: boolean;
  }
): CustomGameRule[] {
  const normExe = normalizeGameExeName(exe);
  const cleanName = String(name || '').trim().slice(0, 64);
  if (!normExe || !cleanName) return rules;
  const filtered = rules.filter((r) => r.exe.toLowerCase() !== normExe);
  const entry: CustomGameRule = {
    exe: normExe,
    name: cleanName,
    ...(opts?.inputMode && opts.inputMode !== 'auto' ? { inputMode: opts.inputMode } : {}),
    ...(opts?.dspProfile && opts.dspProfile !== 'auto' ? { dspProfile: opts.dspProfile } : {}),
    ...(opts?.autoOpenOverlay ? { autoOpenOverlay: true } : {}),
  };
  return [entry, ...filtered].slice(0, 40);
}

export function removeCustomGameRule(rules: CustomGameRule[], exe: string): CustomGameRule[] {
  const target = normalizeGameExeName(exe);
  return rules.filter((r) => r.exe.toLowerCase() !== target);
}

export function resolveGameAudioProfile(
  detectedGameName: string | null | undefined,
  rules: CustomGameRule[]
): ResolvedGameAudioProfile | null {
  const target = String(detectedGameName || '').trim().toLowerCase();
  if (!target || !Array.isArray(rules) || rules.length === 0) return null;
  const matched = rules.find((r) => r.name.trim().toLowerCase() === target);
  if (!matched) return null;
  const inputMode = matched.inputMode && matched.inputMode !== 'auto' ? matched.inputMode : undefined;
  const dspProfile = matched.dspProfile && matched.dspProfile !== 'auto' ? matched.dspProfile : undefined;
  const autoOpenOverlay = Boolean(matched.autoOpenOverlay);
  if (!inputMode && !dspProfile && !autoOpenOverlay) return null;
  return {
    gameName: matched.name,
    ...(inputMode ? { inputMode } : {}),
    ...(dspProfile ? { dspProfile } : {}),
    ...(autoOpenOverlay ? { autoOpenOverlay } : {}),
  };
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
