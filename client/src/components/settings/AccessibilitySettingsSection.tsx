import React, { useState } from 'react';
import { t, type AppLanguage } from '../../utils/i18n';
import { StatusIndicator } from '../StatusIndicator';
import {
  loadAccessibilityPrefs,
  saveAccessibilityPrefs,
  applyAccessibilityPrefs,
  type AccessibilityPrefs,
} from '../../utils/accessibilityPrefs';

interface AccessibilitySettingsSectionProps {
  language: AppLanguage;
}

export const AccessibilitySettingsSection: React.FC<AccessibilitySettingsSectionProps> = ({ language }) => {
  const [a11yPrefs, setA11yPrefs] = useState<AccessibilityPrefs>(() => loadAccessibilityPrefs());

  const updateA11yPref = (key: keyof AccessibilityPrefs, value: boolean) => {
    setA11yPrefs((prev) => {
      const next = { ...prev, [key]: value };
      saveAccessibilityPrefs(next);
      applyAccessibilityPrefs(next);
      return next;
    });
  };

  return (
    <div className="pt-3 border-t border-white/10 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-white/90">{t(language, 'accessibilityTitle')}</div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/30 border border-white/10">
          <StatusIndicator status="online" />
          <StatusIndicator status="idle" />
          <StatusIndicator status="dnd" />
          <StatusIndicator status="offline" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(
          [
            {
              key: 'highContrast' as const,
              label: t(language, 'highContrastMode'),
              desc: 'Kenarlıkları ve odak halkalarını belirginleştirir',
            },
            {
              key: 'colorblindStatus' as const,
              label: t(language, 'colorblindStatusMode'),
              desc: 'Çevrimiçi/Meşgul/Boşta noktalarına geometrik ikon ekler',
            },
            {
              key: 'narrowCompactMode' as const,
              label: t(language, 'narrowCompactMode'),
              desc: 'Dar pencerede sol sütunları kompakt genişliğe alır',
            },
          ]
        ).map((item) => {
          const active = a11yPrefs[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => updateA11yPref(item.key, !active)}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                active
                  ? 'ui-accent-bg shadow'
                  : 'bg-black/25 border-white/10 text-white/75 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold">{item.label}</span>
                <span className="text-[10px] font-mono opacity-80">{active ? 'Açık' : 'Kapalı'}</span>
              </div>
              <span className="text-[10px] text-white/60 leading-snug">{item.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
