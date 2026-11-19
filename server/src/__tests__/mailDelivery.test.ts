import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliverEmail,
  extractBareEmail,
  maskEmail,
  resolveMailSettings,
} from '../utils/mailDelivery.js';

describe('mailDelivery helpers', () => {
  it('extractBareEmail parses bare addresses, display names, strips CRLF, and rejects invalid inputs', () => {
    assert.equal(extractBareEmail('Noreply@Example.COM'), 'noreply@example.com');
    assert.equal(extractBareEmail('Çakma <Noreply@YahyaKemalOkutan.com>'), 'noreply@yahyakemalokutan.com');
    assert.equal(extractBareEmail('Çakma <user@example.com>\r\n'), 'user@example.com');
    assert.equal(extractBareEmail('user@example.com\r\nBcc: evil@attacker.com'), '');
    assert.equal(extractBareEmail('mail.yahyakemalokutan.com'), '');
    assert.equal(extractBareEmail(''), '');
  });

  it('maskEmail hides full local part while keeping domain', () => {
    assert.equal(maskEmail('ykokutan@gmail.com'), 'yk***@gmail.com');
    assert.equal(maskEmail('a@example.com'), 'a***@example.com');
  });

  it('resolveMailSettings falls back from empty systemConfig strings to env vars', () => {
    const systemCfg = {
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '',
      mailRelayUrl: '',
      mailRelaySecret: '',
    };
    const env: NodeJS.ProcessEnv = {
      MAIL_RELAY_URL: 'https://example.com/mail-relay.php',
      MAIL_RELAY_SECRET: 'relay-secret-123',
      SMTP_HOST: 'smtp.env.example',
      SMTP_PORT: '465',
      SMTP_SECURE: 'false',
      SMTP_USER: 'mailer@example.com',
      SMTP_PASS: 'app-pass',
      SMTP_FROM: 'Çakma <Mailer@Example.COM>',
    };

    const resolved = resolveMailSettings(systemCfg, env);
    assert.equal(resolved.relayUrl, 'https://example.com/mail-relay.php');
    assert.equal(resolved.relaySecret, 'relay-secret-123');
    assert.equal(resolved.host, 'smtp.env.example');
    assert.equal(resolved.port, 465);
    assert.equal(resolved.secure, true);
    assert.equal(resolved.smtpFromHeader, 'Çakma <Mailer@Example.COM>');
    assert.equal(resolved.relayFrom, 'mailer@example.com');
  });

  it('resolveMailSettings lets empty override mailRelayUrl bypass saved relay and normalizes port 465/587 TLS', () => {
    const systemCfg = {
      smtpHost: 'smtp.saved.example',
      smtpPort: 587,
      smtpSecure: true,
      smtpUser: 'noreply@saved.example',
      smtpPass: 'secret',
      smtpFrom: 'noreply@cakma.local',
      mailRelayUrl: 'https://saved.example/mail-relay.php',
      mailRelaySecret: 'saved-secret',
    };

    const directOverride = resolveMailSettings(systemCfg, {}, { mailRelayUrl: '' });
    assert.equal(directOverride.relayUrl, '');
    assert.equal(directOverride.host, 'smtp.saved.example');
    assert.equal(directOverride.port, 587);
    assert.equal(directOverride.secure, false);
    assert.equal(directOverride.relayFrom, '');

    const sslOverride = resolveMailSettings(systemCfg, {}, { smtpPort: 465, smtpSecure: false });
    assert.equal(sslOverride.port, 465);
    assert.equal(sslOverride.secure, true);
  });

  it('deliverEmail rejects HTTP 200 non-JSON/HTML relay responses and explicit ok:false JSON', async () => {
    const sysCfg = {
      mailRelayUrl: 'https://yahyakemalokutan.com/mail-relay.php',
      mailRelaySecret: 'topsecret',
      smtpFrom: 'noreply@yahyakemalokutan.com',
    };

    const htmlRes = await deliverEmail(
      'user@gmail.com',
      'OTP',
      'Code 123456',
      undefined,
      sysCfg,
      undefined,
      {
        fetchImpl: async () =>
          new Response('<html><body>Cloudflare Challenge</body></html>', { status: 200 }),
      }
    );
    assert.equal(htmlRes.ok, false);
    assert.equal(htmlRes.transport, 'relay');
    assert.match(htmlRes.error || '', /JSON dışı/);

    const falseRes = await deliverEmail(
      'user@gmail.com',
      'OTP',
      'Code 123456',
      undefined,
      sysCfg,
      undefined,
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: false, error: 'PHP mail() gonderemedi' }), { status: 200 }),
      }
    );
    assert.equal(falseRes.ok, false);
    assert.equal(falseRes.error, 'PHP mail() gonderemedi');
  });

  it('deliverEmail sends bare from + X-Relay-Secret on valid relay response', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const res = await deliverEmail(
      'user@gmail.com',
      'Doğrulama\r\nKodu',
      'Kod: 654321',
      '<p>654321</p>',
      {
        mailRelayUrl: 'https://yahyakemalokutan.com/mail-relay.php',
        mailRelaySecret: 'relay-key-999',
        smtpFrom: 'Çakma <noreply@yahyakemalokutan.com>',
      },
      undefined,
      {
        fetchImpl: async (input, init) => {
          capturedUrl = String(input);
          capturedHeaders = (init?.headers || {}) as Record<string, string>;
          capturedBody = JSON.parse(String(init?.body || '{}'));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      }
    );

    assert.equal(res.ok, true);
    assert.equal(res.transport, 'relay');
    assert.equal(capturedUrl, 'https://yahyakemalokutan.com/mail-relay.php');
    assert.equal(capturedHeaders['X-Relay-Secret'], 'relay-key-999');
    assert.equal(capturedBody.from, 'noreply@yahyakemalokutan.com');
    assert.equal(capturedBody.subject, 'Doğrulama Kodu');
  });

  it('deliverEmail detects rejected recipients in direct SMTP transport', async () => {
    const res = await deliverEmail(
      'bad@invalid.test',
      'Test',
      'Hello',
      undefined,
      {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'noreply@example.com',
        smtpPass: 'secret',
      },
      undefined,
      {
        createTransportImpl: (() => ({
          sendMail: async () => ({
            accepted: [],
            rejected: ['bad@invalid.test'],
          }),
        })) as any,
      }
    );

    assert.equal(res.ok, false);
    assert.equal(res.transport, 'smtp');
    assert.match(res.error || '', /bad@invalid\.test/);
  });
});
