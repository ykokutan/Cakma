export interface AccessibilityPrefs {
  highContrast: boolean;
  colorblindStatus: boolean;
  narrowCompactMode: boolean;
}

export const ACCESSIBILITY_PREFS_KEY = 'cakma_a11y_prefs_v1';

export const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  highContrast: false,
  colorblindStatus: false,
  narrowCompactMode: false,
};

export function loadAccessibilityPrefs(): AccessibilityPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_ACCESSIBILITY_PREFS };
  try {
    const raw = localStorage.getItem(ACCESSIBILITY_PREFS_KEY);
    if (!raw) return { ...DEFAULT_ACCESSIBILITY_PREFS };
    const parsed = JSON.parse(raw);
    return {
      highContrast: Boolean(parsed?.highContrast),
      colorblindStatus: Boolean(parsed?.colorblindStatus),
      narrowCompactMode: Boolean(parsed?.narrowCompactMode),
    };
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFS };
  }
}

export function saveAccessibilityPrefs(prefs: AccessibilityPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACCESSIBILITY_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export function applyAccessibilityPrefs(prefs: AccessibilityPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (prefs.highContrast) root.setAttribute('data-high-contrast', 'true');
  else root.removeAttribute('data-high-contrast');

  if (prefs.colorblindStatus) root.setAttribute('data-colorblind-status', 'true');
  else root.removeAttribute('data-colorblind-status');

  if (prefs.narrowCompactMode) root.setAttribute('data-narrow-compact', 'true');
  else root.removeAttribute('data-narrow-compact');
}
