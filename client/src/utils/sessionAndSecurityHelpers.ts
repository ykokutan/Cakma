export function buildTwoFactorBackupCodesText(username: string, codes: string[]): string {
  const safeUser = String(username || 'kullanici').trim() || 'kullanici';
  const generatedAt = new Date().toISOString();
  const formattedCodes = (Array.isArray(codes) ? codes : [])
    .map((c, idx) => `${String(idx + 1).padStart(2, '0')}. ${String(c || '').trim()}`)
    .join('\n');

  return [
    'Çakma — İki Faktörlü Doğrulama (2FA) Kurtarma Kodları',
    `Hesap: ${safeUser}`,
    `Oluşturulma: ${generatedAt}`,
    '------------------------------------------------------------',
    'ÖNEMLİ: Her kod yalnızca tek seferlik kullanılabilir.',
    'Bu dosyayı güvenli, çevrimdışı bir yerde saklayın.',
    '',
    formattedCodes,
    '',
  ].join('\n');
}

export function downloadTwoFactorBackupCodes(username: string, codes: string[]): void {
  if (typeof window === 'undefined' || !Array.isArray(codes) || codes.length === 0) return;
  const content = buildTwoFactorBackupCodesText(username, codes);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug =
    String(username || 'kullanici')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || 'kullanici';
  a.href = url;
  a.download = `cakma-2fa-kurtarma-kodlari-${slug}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseReadableUserAgent(rawUa: string): string {
  const ua = String(rawUa || '').trim();
  if (!ua) return 'Bilinmeyen Cihaz';

  if (/Tauri|CakmaDesktop/i.test(ua)) {
    if (/Windows/i.test(ua)) return 'Windows · Çakma Masaüstü';
    if (/Mac|Darwin/i.test(ua)) return 'macOS · Çakma Masaüstü';
    if (/Linux/i.test(ua)) return 'Linux · Çakma Masaüstü';
    return 'Çakma Masaüstü';
  }

  let os = 'Bilinmeyen İS';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Tarayıcı';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/node|undici|curl/i.test(ua)) browser = 'API İstemcisi';

  return `${os} · ${browser}`;
}
