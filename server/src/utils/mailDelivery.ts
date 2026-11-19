import nodemailer from 'nodemailer';

export interface MailConfigInput {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  mailRelayUrl?: string;
  mailRelaySecret?: string;
}

export interface MailSendResult {
  ok: boolean;
  error?: string;
  transport?: 'relay' | 'smtp';
}

export interface ResolvedMailSettings {
  relayUrl: string;
  relaySecret: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  smtpFromHeader: string;
  relayFrom: string;
}

export interface MailDeliveryDeps {
  fetchImpl?: typeof fetch;
  createTransportImpl?: typeof nodemailer.createTransport;
  env?: NodeJS.ProcessEnv;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const val of values) {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return '';
}

/**
 * Strips CR/LF newlines from header-like values to prevent SMTP header injection.
 */
export function sanitizeHeaderValue(raw?: string): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Extracts and validates a lowercase bare e-mail address from a raw address or "Name <email>" string.
 */
export function extractBareEmail(raw?: string): string {
  const cleaned = sanitizeHeaderValue(raw);
  if (!cleaned) return '';
  const angleMatch = cleaned.match(/<([^<>]+)>/);
  const candidate = (angleMatch ? angleMatch[1] : cleaned).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(candidate)) {
    return '';
  }
  return candidate;
}

/**
 * Masks an e-mail address for safe operational logs (never exposing the full local part).
 */
export function maskEmail(rawEmail?: string): string {
  const email = extractBareEmail(rawEmail) || sanitizeHeaderValue(rawEmail);
  const atIdx = email.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const prefix = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${prefix}***@${domain}`;
}

/**
 * Resolves effective mail delivery configuration across explicit test overrides, saved systemConfig, and env vars.
 */
export function resolveMailSettings(
  systemCfg: MailConfigInput,
  env: NodeJS.ProcessEnv = process.env,
  overrideCfg?: MailConfigInput
): ResolvedMailSettings {
  const relayUrl =
    overrideCfg && overrideCfg.mailRelayUrl !== undefined
      ? overrideCfg.mailRelayUrl.trim()
      : firstNonEmpty(systemCfg.mailRelayUrl, env.MAIL_RELAY_URL);

  const relaySecret = firstNonEmpty(
    overrideCfg?.mailRelaySecret,
    systemCfg.mailRelaySecret,
    env.MAIL_RELAY_SECRET
  );

  const host = firstNonEmpty(overrideCfg?.smtpHost, systemCfg.smtpHost, env.SMTP_HOST);
  const user = firstNonEmpty(overrideCfg?.smtpUser, systemCfg.smtpUser, env.SMTP_USER);
  const pass = firstNonEmpty(overrideCfg?.smtpPass, systemCfg.smtpPass, env.SMTP_PASS);

  const hasConfiguredHost =
    Boolean(overrideCfg?.smtpHost?.trim()) || Boolean(systemCfg.smtpHost?.trim());
  const envHost = (env.SMTP_HOST || '').trim();
  const hostFromEnv = !hasConfiguredHost && Boolean(envHost);

  const rawPort = hostFromEnv
    ? (env.SMTP_PORT ?? overrideCfg?.smtpPort ?? systemCfg.smtpPort ?? 587)
    : (overrideCfg?.smtpPort ?? systemCfg.smtpPort ?? env.SMTP_PORT ?? 587);
  const parsedPort = Number(rawPort);
  const port =
    Number.isFinite(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
      ? Math.floor(parsedPort)
      : 587;

  const envSecure =
    env.SMTP_SECURE !== undefined ? env.SMTP_SECURE.toLowerCase() === 'true' : undefined;
  const rawSecure = hostFromEnv
    ? (envSecure ?? overrideCfg?.smtpSecure ?? systemCfg.smtpSecure)
    : (overrideCfg?.smtpSecure ?? systemCfg.smtpSecure ?? envSecure);
  const secure = port === 465 ? true : port === 587 ? false : Boolean(rawSecure);

  const rawFrom = sanitizeHeaderValue(
    firstNonEmpty(overrideCfg?.smtpFrom, systemCfg.smtpFrom, env.SMTP_FROM)
  );
  const bareFrom = extractBareEmail(rawFrom) || extractBareEmail(user);
  const smtpFromHeader = rawFrom && extractBareEmail(rawFrom)
    ? rawFrom
    : (bareFrom || 'noreply@cakma.local');
  const relayFrom = bareFrom && !bareFrom.endsWith('.local') ? bareFrom : '';

  return {
    relayUrl,
    relaySecret,
    host,
    port,
    secure,
    user,
    pass,
    smtpFromHeader,
    relayFrom,
  };
}

/**
 * Delivers an email via configured HTTPS Mail Relay or direct SMTP transport.
 */
export async function deliverEmail(
  to: string,
  subject: string,
  text: string,
  html: string | undefined,
  systemCfg: MailConfigInput,
  overrideCfg?: MailConfigInput,
  deps?: MailDeliveryDeps
): Promise<MailSendResult> {
  const resolved = resolveMailSettings(systemCfg, deps?.env ?? process.env, overrideCfg);
  const cleanTo = sanitizeHeaderValue(to);
  const cleanSubject = sanitizeHeaderValue(subject);

  if (resolved.relayUrl) {
    if (!resolved.relayUrl.startsWith('https://') && !resolved.relayUrl.startsWith('http://')) {
      return {
        ok: false,
        transport: 'relay',
        error: 'Mail Relay URL geçerli bir http/https adresi olmalıdır.',
      };
    }

    const fetchFn = deps?.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const payload: Record<string, string> = {
        to: cleanTo,
        subject: cleanSubject,
        text,
        html: html || `<p>${text}</p>`,
      };
      if (resolved.relayFrom) {
        payload.from = resolved.relayFrom;
      }

      const res = await fetchFn(resolved.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(resolved.relaySecret ? { 'X-Relay-Secret': resolved.relaySecret } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await res.text();
      const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 140);
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {}

      if (!res.ok) {
        return {
          ok: false,
          transport: 'relay',
          error: parsed?.error || parsed?.message || `Relay HTTP ${res.status}: ${snippet || res.statusText}`,
        };
      }
      if (!parsed || typeof parsed !== 'object') {
        return {
          ok: false,
          transport: 'relay',
          error: `Mail Relay geçersiz JSON dışı yanıt döndürdü (HTTP ${res.status}): ${snippet || 'boş yanıt'}`,
        };
      }
      if (
        parsed.ok === false ||
        parsed.success === false ||
        (parsed.ok !== true && parsed.success !== true)
      ) {
        return {
          ok: false,
          transport: 'relay',
          error: parsed.error || parsed.message || 'Mail Relay gönderimi onaylamadı.',
        };
      }
      return { ok: true, transport: 'relay' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { ok: false, transport: 'relay', error: 'Mail Relay zaman aşımına uğradı (15 sn).' };
      }
      return {
        ok: false,
        transport: 'relay',
        error: err?.message || 'Mail Relay bağlantısı başarısız.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!resolved.host || !resolved.user || !resolved.pass) {
    return { ok: false, transport: 'smtp', error: 'SMTP veya Mail Relay ayarları eksik.' };
  }

  try {
    const createTransport = deps?.createTransportImpl ?? nodemailer.createTransport;
    const transporter = createTransport({
      host: resolved.host,
      port: resolved.port,
      secure: resolved.secure,
      auth: { user: resolved.user, pass: resolved.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: resolved.smtpFromHeader,
      to: cleanTo,
      subject: cleanSubject,
      text,
      html: html || `<p>${text}</p>`,
    });

    if (Array.isArray(info?.rejected) && info.rejected.length > 0) {
      const rejectedList = info.rejected
        .map((r: any) => (typeof r === 'string' ? r : r?.address || String(r)))
        .join(', ');
      return {
        ok: false,
        transport: 'smtp',
        error: `SMTP alıcıyı reddetti: ${rejectedList}`,
      };
    }

    return { ok: true, transport: 'smtp' };
  } catch (err: any) {
    return {
      ok: false,
      transport: 'smtp',
      error: err?.message || 'E-posta gönderilemedi.',
    };
  }
}
