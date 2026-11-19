export const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.ps1', '.ps2', '.scr', '.msi', '.msp', '.com', '.pif', '.reg', '.hta',
  '.jar', '.sh', '.bash', '.app', '.dmg', '.pkg', '.apk', '.dll',
];

export interface AttachmentValidationResult {
  ok: boolean;
  error?: string;
}

export function validateAttachmentSafety(
  att: { name?: string; size?: number; type?: string },
  maxUploadSizeMb: number
): AttachmentValidationResult {
  const lowerName = (att.name || '').toLowerCase();
  if (DANGEROUS_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return {
      ok: false,
      error: `Güvenlik Engeli: Çalıştırılabilir dosyalar (${lowerName}) sistem üzerinden gönderilemez.`,
    };
  }
  const limitMb = Math.max(1, maxUploadSizeMb || 5);
  const maxBytes = limitMb * 1024 * 1024;
  if (typeof att.size === 'number' && att.size > maxBytes) {
    return {
      ok: false,
      error: `Dosya boyutu sistem limitini (${limitMb} MB) aşıyor.`,
    };
  }
  return { ok: true };
}

export function checkAutoModContent(
  content: string,
  opts: { blockLinks?: boolean; bannedWords?: string[] }
): { blocked: boolean; reason?: string } {
  const lower = (content || '').toLowerCase();
  if (opts.blockLinks && /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/|t\.me\/)/i.test(content)) {
    return { blocked: true, reason: 'Bu sunucu/sistemde bağlantı (link) paylaşımı yasaklanmıştır.' };
  }
  if (Array.isArray(opts.bannedWords)) {
    for (const word of opts.bannedWords) {
      const clean = (word || '').trim().toLowerCase();
      if (clean && lower.includes(clean)) {
        return { blocked: true, reason: 'Mesajınız yasaklı kelimeler içerdiği için engellendi.' };
      }
    }
  }
  return { blocked: false };
}

export function isStrongPassword(password: string): boolean {
  if (!password || password.length < 8) return false;
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
}
