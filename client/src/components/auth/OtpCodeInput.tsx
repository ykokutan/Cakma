import React, { useRef } from 'react';
import { normalizeOtpInput } from '../../utils/authValidation';

interface OtpCodeInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  length?: number;
  accent?: 'emerald' | 'rose';
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export const OtpCodeInput: React.FC<OtpCodeInputProps> = ({
  value,
  onChange,
  length = 6,
  accent = 'emerald',
  autoFocus = false,
  disabled = false,
  ariaLabel = 'Doğrulama kodu',
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = normalizeOtpInput(value, length);
  const slots = Array.from({ length }, (_, idx) => digits[idx] || '');

  const focusBox = (idx: number) => {
    const clamped = Math.max(0, Math.min(length - 1, idx));
    const el = inputRefs.current[clamped];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleChange = (index: number, raw: string) => {
    const cleaned = normalizeOtpInput(raw, length);
    if (!cleaned) {
      const nextSlots = [...slots];
      nextSlots[index] = '';
      onChange(nextSlots.join('').slice(0, length));
      return;
    }

    if (cleaned.length > 1) {
      const startIdx = cleaned.length >= length || digits.length === 0 ? 0 : Math.min(index, digits.length);
      const nextSlots = [...slots];
      for (let offset = 0; offset < cleaned.length && startIdx + offset < length; offset++) {
        nextSlots[startIdx + offset] = cleaned[offset];
      }
      const joined = nextSlots.join('').slice(0, length);
      onChange(joined);
      focusBox(Math.min(startIdx + cleaned.length, length - 1));
      return;
    }

    const insertIdx = Math.min(index, digits.length);
    const nextDigits = digits.split('');
    if (insertIdx < nextDigits.length) {
      nextDigits[insertIdx] = cleaned;
    } else {
      nextDigits.push(cleaned);
    }
    const nextValue = nextDigits.join('').slice(0, length);
    onChange(nextValue);
    if (insertIdx + 1 < length) {
      focusBox(insertIdx + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (slots[index]) {
        const nextDigits = digits.split('');
        nextDigits.splice(index, 1);
        onChange(nextDigits.join(''));
        focusBox(Math.max(0, index));
      } else if (index > 0) {
        const nextDigits = digits.split('');
        const target = Math.min(index - 1, Math.max(0, nextDigits.length - 1));
        if (nextDigits.length > target) {
          nextDigits.splice(target, 1);
          onChange(nextDigits.join(''));
        }
        focusBox(index - 1);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (index > 0) focusBox(index - 1);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (index < length - 1) focusBox(index + 1);
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = normalizeOtpInput(e.clipboardData.getData('text'), length);
    if (!pasted) return;

    const startIdx = pasted.length >= length || digits.length === 0 ? 0 : Math.min(index, digits.length);
    const nextSlots = [...slots];
    for (let offset = 0; offset < pasted.length && startIdx + offset < length; offset++) {
      nextSlots[startIdx + offset] = pasted[offset];
    }
    const nextValue = nextSlots.join('').slice(0, length);
    onChange(nextValue);
    focusBox(Math.min(startIdx + pasted.length, length - 1));
  };

  const focusRing =
    accent === 'rose'
      ? 'focus:border-rose-400 focus:ring-2 focus:ring-rose-500/35'
      : 'focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/35';

  const filledStyle =
    accent === 'rose'
      ? 'border-rose-400/70 bg-rose-400/10 shadow-sm shadow-rose-500/10'
      : 'border-emerald-400/70 bg-emerald-400/10 shadow-sm shadow-emerald-500/10';

  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-2" role="group" aria-label={ariaLabel}>
      {slots.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={idx === 0 ? length : 2}
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && idx === 0}
          disabled={disabled}
          value={digit}
          aria-label={`${ariaLabel} ${idx + 1}. hane`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={(e) => handlePaste(idx, e)}
          className={`flex-1 min-w-0 h-11 sm:h-12 text-center font-mono text-base sm:text-lg font-bold rounded-xl bg-white/5 border text-white outline-none transition-all duration-150 disabled:opacity-50 ${
            digit ? filledStyle : 'border-white/15 hover:border-white/25'
          } ${focusRing}`}
        />
      ))}
    </div>
  );
};
