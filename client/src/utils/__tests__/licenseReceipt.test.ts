import { describe, it, expect } from 'vitest';
import { buildLicenseReceiptHtml } from '../licenseReceipt';

describe('licenseReceipt', () => {
  it('renders printable receipt HTML with license details and escapes untrusted XSS characters', () => {
    const html = buildLicenseReceiptHtml(
      {
        id: 'lic-99',
        licenseKey: 'LIC2-XYZ-123',
        licensee: '<script>alert("xss")</script>Clan',
        assignedUsername: 'ykokutas',
        maxSlots: 128,
        tier: 'Pro',
        status: 'active',
        issuedAt: '2026-11-25T00:00:00.000Z',
        expiresAt: '2027-11-25T00:00:00.000Z',
        source: 'store',
      },
      'ykokutas',
      '₺'
    );

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lic-99');
    expect(html).toContain('LIC2-XYZ-123');
    expect(html).toContain('Pro · 128 Slot');
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Clan');
  });
});
