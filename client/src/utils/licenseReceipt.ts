import type { IssuedLicense } from '../types';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildLicenseReceiptHtml(
  license: IssuedLicense,
  buyerUsername?: string,
  currencySymbol = '₺'
): string {
  const issuedDate = license.issuedAt
    ? new Date(license.issuedAt).toLocaleString('tr-TR')
    : new Date().toLocaleString('tr-TR');
  const expiryLabel =
    license.expiresAt === 'lifetime' || String(license.expiresAt).startsWith('2099')
      ? 'Ömür Boyu (Lifetime)'
      : new Date(license.expiresAt).toLocaleString('tr-TR');
  const owner = buyerUsername || license.assignedUsername || '-';
  const symbol = escapeHtml(currencySymbol || '₺');
  const statusLabel =
    license.status === 'active'
      ? 'Aktif'
      : license.status === 'revoked'
        ? 'İptal Edildi'
        : 'Süresi Doldu';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Çakma Lisans Makbuzu — ${escapeHtml(license.id)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px; }
    .card { max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 28px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 20px; font-weight: 800; color: #0f172a; }
    .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 20px; }
    .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .val { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; word-break: break-word; }
    .keybox { background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 10px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; word-break: break-all; margin-bottom: 18px; }
    .footer { font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border: 1px solid #cbd5e1; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="hdr">
      <div>
        <div class="brand">Çakma — Dedicated Lisans Makbuzu</div>
        <div class="sub">Resmî İşlem Özeti &amp; Anahtar Belgesi (${symbol})</div>
      </div>
      <span class="badge">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="grid">
      <div><div class="lbl">Makbuz / Lisans ID</div><div class="val">${escapeHtml(license.id)}</div></div>
      <div><div class="lbl">Hesap / Alıcı</div><div class="val">${escapeHtml(owner)}</div></div>
      <div><div class="lbl">Sunucu / Lisans Sahibi</div><div class="val">${escapeHtml(license.licensee)}</div></div>
      <div><div class="lbl">Paket &amp; Kapasite</div><div class="val">${escapeHtml(license.tier)} · ${escapeHtml(license.maxSlots)} Slot</div></div>
      <div><div class="lbl">Düzenlenme Tarihi</div><div class="val">${escapeHtml(issuedDate)}</div></div>
      <div><div class="lbl">Geçerlilik Sonu</div><div class="val">${escapeHtml(expiryLabel)}</div></div>
    </div>
    <div class="lbl" style="margin-bottom:6px;">Ed25519 İmzalı Lisans Anahtarı</div>
    <div class="keybox">${escapeHtml(license.licenseKey)}</div>
    <div class="footer">
      <span>Oluşturan Kaynak: ${escapeHtml(license.source || 'store')}</span>
      <span>Çakma v1.2.0 Store</span>
    </div>
  </div>
</body>
</html>`;
}

export function printLicenseReceipt(
  license: IssuedLicense,
  buyerUsername?: string,
  currencySymbol = '₺'
): boolean {
  const html = buildLicenseReceiptHtml(license, buyerUsername, currencySymbol);
  if (typeof window === 'undefined') return false;

  const popup = window.open('', '_blank', 'width=720,height=840');
  if (popup && popup.document) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      try {
        popup.print();
      } catch {}
    }, 150);
    return true;
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `makbuz-${license.id}.html`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
