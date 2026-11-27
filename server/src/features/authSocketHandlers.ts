import crypto from 'crypto';
import type { Socket } from 'socket.io';
import type { RegisteredAccount, User, UserBadge } from '../types.js';
import type { SystemConfig } from '../storage.js';
import { verifyTotpCode } from '../totp.js';
import { parseCookieFromHeader } from '../utils/adminAuth.js';
import { hashPasswordAsync, verifyPasswordAsync } from '../utils/authCrypto.js';
import { maskEmail, type MailConfigInput, type MailSendResult } from '../utils/mailDelivery.js';
import { validatePasswordAgainstPolicy } from '../utils/passwordPolicy.js';
import type { ActiveSessionRecord } from './accountSecurityHandlers.js';

export interface PendingEmailOtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export interface AuthSocketHandlersDeps {
  registeredAccounts: Map<string, RegisteredAccount>;
  activeUsers: Map<string, User>;
  activeSessions: Map<string, ActiveSessionRecord>;
  pendingEmailOtps: Map<string, PendingEmailOtpEntry>;
  ipDailyRegistrations: Map<string, { date: string; count: number }>;
  disposableEmailDomains: Set<string>;
  getSystemConfig: () => SystemConfig;
  saveSystemConfig: (cfg: SystemConfig) => void;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  sanitizeText: (input: string) => string;
  getClientIp: (socket: Socket) => string;
  findActiveIpBan: (ip: string) => { ip: string; reason: string; expiresAt?: number | null } | undefined;
  checkLoginRateLimit: (ip: string) => { allowed: boolean; retryAfterSeconds?: number };
  recordFailedLogin: (ip: string) => void;
  clearLoginRateLimit: (ip: string) => void;
  checkRegisterRateLimit: (ip: string) => { allowed: boolean; retryAfterSeconds?: number };
  recordRegisterAttempt: (ip: string) => void;
  generateRegisterChallenge: () => { token: string; question: string };
  verifyRegisterChallenge: (token: string, answer: string | number) => boolean;
  generateSessionToken: (username: string) => string;
  generateMediaToken: (username: string) => string;
  generatePending2faToken: (username: string) => string;
  verifyPending2faToken: (token: string) => string | null;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getUserBadges: (role: string, username: string, hasDedicatedServer?: boolean) => UserBadge[];
  toPublicUser: (user: User) => User;
  emitInitData: (socket: Socket, user: User) => void;
  getFriendsData: (username: string) => unknown;
  syncUserMembershipProfiles: (user: User) => void;
  recordUserConnection: (socket: Socket, username: string, role: 'admin' | 'user') => void;
  recordUserDisconnection: (socketId: string) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  sendAdminWebhook: (eventType: 'security' | 'bans' | 'dedicated' | 'backups' | 'test', title: string, details: string) => Promise<boolean>;
  sendSmtpEmail: (to: string, subject: string, text: string, html?: string, overrideCfg?: MailConfigInput) => Promise<MailSendResult>;
  emitToRelevantUsers: (subjectUser: User, event: string, payload: unknown) => void;
}

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED_ADMIN_NAMES = new Set([
  'admin',
  'administrator',
  'system',
  'root',
  'sistem',
  'moderator',
  'mod',
  'destek',
  'support',
  'yetkili',
  'owner',
  'kurucu',
]);

export function buildSessionUser(
  socketId: string,
  acc: RegisteredAccount,
  getUserBadges: AuthSocketHandlersDeps['getUserBadges'],
  opts?: { forceTwoFactor?: boolean; defaultBio?: string; defaultStatus?: string }
): User {
  return {
    id: socketId,
    accountId: acc.id,
    username: acc.username,
    email: acc.email,
    role: acc.role,
    avatar: acc.avatar,
    status: 'online',
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    createdAt: acc.createdAt,
    walletBalance: acc.walletBalance,
    statusMessage: acc.statusMessage || opts?.defaultStatus || 'Çevrimiçi',
    bannerColor: acc.bannerColor || 'from-indigo-600 to-purple-600',
    bannerImage: acc.bannerImage || '',
    bannerPosition: acc.bannerPosition || 'center',
    avatarFrame: acc.avatarFrame || 'none',
    nameGradient: acc.nameGradient || 'none',
    unlockedCosmetics: acc.unlockedCosmetics || [],
    pinnedBadgeId: acc.pinnedBadgeId || '',
    socialLinks: acc.socialLinks || {},
    verifiedConnections: acc.verifiedConnections || [],
    bio: acc.bio || opts?.defaultBio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.',
    badges: acc.badges || getUserBadges(acc.role, acc.username, acc.role === 'admin'),
    friends: acc.friends || [],
    blockedUsers: acc.blockedUsers || [],
    twoFactorEnabled: opts?.forceTwoFactor ? true : Boolean(acc.twoFactorEnabled),
    e2eePublicKey: acc.e2eePublicKey,
    acceptedTermsAt: acc.acceptedTermsAt,
    acceptedTermsVersion: acc.acceptedTermsVersion,
    serverFolders: acc.serverFolders || [],
  };
}

export function registerAuthSocketHandlers(socket: Socket, deps: AuthSocketHandlersDeps): void {
  const bindAuthenticatedSocket = (user: User, isNewUser = false) => {
    deps.activeUsers.set(socket.id, user);
    deps.activeSessions.set(socket.id, {
      socketId: socket.id,
      username: user.username,
      ip: deps.getClientIp(socket),
      userAgent: (socket.handshake.headers['user-agent'] || 'Bilinmeyen Cihaz').slice(0, 80),
      connectedAt: new Date().toISOString(),
    });
    if (user.role === 'admin') socket.join('admins');
    deps.syncUserMembershipProfiles(user);
    deps.recordUserConnection(socket, user.username, user.role);

    const token = deps.generateSessionToken(user.username);
    const mediaToken = deps.generateMediaToken(user.username);
    socket.emit('auth_response', {
      success: true,
      user,
      token,
      mediaToken,
      ...(isNewUser ? { isNewUser: true } : {}),
    });
  };

  // 1a. Registration Challenge (Bot & Spam protection)
  socket.on('get_register_challenge', () => {
    const ch = deps.generateRegisterChallenge();
    const systemConfig = deps.getSystemConfig();
    socket.emit('register_challenge', {
      token: ch.token,
      question: ch.question,
      inviteOnly: Boolean(systemConfig.inviteOnlyRegistration && deps.registeredAccounts.size > 0),
      requireStrongPasswords: Boolean(systemConfig.requireStrongPasswords),
      requireEmailVerification: Boolean(systemConfig.requireEmailVerification && deps.registeredAccounts.size > 0),
    });
  });

  // 1b. Send 6-digit Email Verification Code (OTP)
  socket.on('send_register_email_code', async ({ email }: { email: string }) => {
    const systemConfig = deps.getSystemConfig();
    const clientIp = deps.getClientIp(socket);
    const ipBan = deps.findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('register_email_code_result', { success: false, error: 'IP adresiniz engellenmiştir.' });
    }
    if (!systemConfig.registrationEnabled) {
      return socket.emit('register_email_code_result', { success: false, error: 'Yeni üye kayıtları kapalıdır.' });
    }
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 64) : '';
    if (!cleanEmail || !EMAIL_FORMAT_REGEX.test(cleanEmail)) {
      return socket.emit('register_email_code_result', { success: false, error: 'Lütfen geçerli bir e-posta adresi girin.' });
    }
    const domain = cleanEmail.split('@')[1] || '';
    if (deps.disposableEmailDomains.has(domain)) {
      return socket.emit('register_email_code_result', { success: false, error: 'Geçici e-posta adresleri kullanılamaz.' });
    }
    if (systemConfig.requireUniqueEmail !== false) {
      for (const acc of deps.registeredAccounts.values()) {
        if ((acc.email || '').toLowerCase() === cleanEmail) {
          return socket.emit('register_email_code_result', { success: false, error: 'Bu e-posta adresi zaten kayıtlı.' });
        }
      }
    }

    const existing = deps.pendingEmailOtps.get(cleanEmail);
    if (existing && Date.now() - existing.sentAt < 60_000) {
      const waitSec = Math.ceil((60_000 - (Date.now() - existing.sentAt)) / 1000);
      return socket.emit('register_email_code_result', {
        success: false,
        error: `Yeni kod istemek için ${waitSec} saniye bekleyin.`,
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    deps.pendingEmailOtps.set(cleanEmail, {
      code,
      expiresAt: Date.now() + 10 * 60_000,
      attempts: 0,
      sentAt: Date.now(),
    });

    const mailRes = await deps.sendSmtpEmail(
      cleanEmail,
      'Çakma - E-Posta Doğrulama Kodunuz',
      `Kayıt doğrulama kodunuz: ${code} (10 dakika geçerlidir).`,
      `<div style="font-family:sans-serif;padding:16px;background:#0f172a;color:#f8fafc;border-radius:12px;">
        <h2 style="margin:0 0 8px;color:#38bdf8;">Çakma E-Posta Doğrulaması</h2>
        <p style="margin:0 0 12px;color:#cbd5e1;">Kayıt işleminizi tamamlamak için aşağıdaki 6 haneli kodu girin:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:6px;padding:12px 18px;background:#1e293b;border-radius:8px;display:inline-block;color:#34d399;">${code}</div>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Bu kod 10 dakika boyunca geçerlidir.</p>
      </div>`
    );

    const maskedTarget = maskEmail(cleanEmail);
    if (!mailRes.ok) {
      deps.pendingEmailOtps.delete(cleanEmail);
      const errDetail = mailRes.error || 'Bilinmeyen gönderim hatası.';
      console.warn(`⚠️ [OTP] ${maskedTarget} için doğrulama kodu gönderilemedi (${mailRes.transport || 'mail'}): ${errDetail}`);
      deps.addAuditLog('OTP_MAIL_HATASI', `${maskedTarget} için kayıt OTP maili gönderilemedi: ${errDetail}`, 'warn');
      return socket.emit('register_email_code_result', {
        success: false,
        error: `Doğrulama e-postası gönderilemedi: ${errDetail}`,
      });
    }

    console.log(`✉️ [OTP] ${maskedTarget} adresine doğrulama kodu gönderildi (${mailRes.transport || 'mail'}).`);
    socket.emit('register_email_code_result', {
      success: true,
      message: `${cleanEmail} adresine 6 haneli doğrulama kodu gönderildi. Gelmezse Spam / Gereksiz klasörünü kontrol edin.`,
    });
  });

  // 1. REGISTER
  socket.on('auth_register', async ({
    username,
    email,
    password,
    avatar,
    inviteCode,
    emailCode,
    challengeToken,
    challengeAnswer,
    honeypot,
    acceptedTerms,
    acceptedTermsVersion,
  }: any) => {
    const systemConfig = deps.getSystemConfig();
    const clientIp = deps.getClientIp(socket);
    const ipBan = deps.findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('auth_response', {
        success: false,
        error: `IP adresiniz sistemden engellenmiştir. Sebep: ${ipBan.reason}`,
      });
    }
    if (honeypot && String(honeypot).trim().length > 0) {
      deps.addAuditLog('BOT_KAYIT_ENGEL', `Honeypot tetiklendi (IP: ${clientIp})`, 'auth');
      return socket.emit('auth_response', { success: false, error: 'Kayıt doğrulaması başarısız oldu.' });
    }
    if (systemConfig.maintenanceMode) {
      return socket.emit('auth_response', {
        success: false,
        error: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.',
      });
    }
    if (!systemConfig.registrationEnabled) {
      return socket.emit('auth_response', {
        success: false,
        error: 'Yeni üye kayıtları sistem yöneticisi tarafından geçici olarak kapatılmıştır.',
      });
    }
    if (acceptedTerms !== true) {
      return socket.emit('auth_response', {
        success: false,
        error: "Kayıt olabilmek için Kullanıcı Sözleşmesi, Gizlilik Politikası ve KVKK Aydınlatma Metni'ni kabul etmeniz zorunludur.",
      });
    }
    const regCheck = deps.checkRegisterRateLimit(clientIp);
    if (!regCheck.allowed) {
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla kayıt denemesi yapıldı! Lütfen ${regCheck.retryAfterSeconds} saniye sonra tekrar deneyin.`,
      });
    }

    if (!challengeToken || !deps.verifyRegisterChallenge(challengeToken, challengeAnswer)) {
      deps.recordRegisterAttempt(clientIp);
      return socket.emit('auth_response', {
        success: false,
        error: 'Güvenlik sorusu (doğrulama) hatalı veya süresi doldu. Lütfen yenileyip tekrar deneyin.',
      });
    }

    const isFirstUser = deps.registeredAccounts.size === 0;
    const todayKey = new Date().toISOString().slice(0, 10);
    const dailyRec = deps.ipDailyRegistrations.get(clientIp);
    const maxPerIp = systemConfig.maxAccountsPerIpPerDay ?? 3;
    if (!isFirstUser && dailyRec && dailyRec.date === todayKey && dailyRec.count >= maxPerIp) {
      return socket.emit('auth_response', {
        success: false,
        error: `Bu IP adresinden bugün en fazla ${maxPerIp} hesap oluşturulabilir.`,
      });
    }

    const cleanUsername = deps.sanitizeText(username?.trim()).replace(/[\u200B-\u200D\uFEFF]/g, '').slice(0, 24);
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 64) : '';

    if (!cleanUsername || !/^[a-zA-Z0-9_.-]{3,24}$/.test(cleanUsername)) {
      return socket.emit('auth_response', {
        success: false,
        error: 'Kullanıcı adı 3-24 karakter arasında olmalı ve yalnızca harf, rakam, _, ., - içermelidir.',
      });
    }

    if (!cleanEmail || !EMAIL_FORMAT_REGEX.test(cleanEmail)) {
      return socket.emit('auth_response', {
        success: false,
        error: 'Lütfen geçerli bir e-posta adresi girin.',
      });
    }

    const emailDomain = cleanEmail.split('@')[1] || '';
    if (deps.disposableEmailDomains.has(emailDomain)) {
      return socket.emit('auth_response', {
        success: false,
        error: 'Geçici (tek kullanımlık) e-posta adresleri ile kayıt olunamaz.',
      });
    }

    if (systemConfig.requireUniqueEmail !== false) {
      for (const acc of deps.registeredAccounts.values()) {
        if ((acc.email || '').toLowerCase() === cleanEmail) {
          return socket.emit('auth_response', {
            success: false,
            error: 'Bu e-posta adresi ile zaten kayıtlı bir hesap var.',
          });
        }
      }
    }

    if (!isFirstUser && systemConfig.requireEmailVerification) {
      const otp = deps.pendingEmailOtps.get(cleanEmail);
      const cleanCode = typeof emailCode === 'string' ? emailCode.trim() : '';
      if (!otp || Date.now() > otp.expiresAt) {
        deps.pendingEmailOtps.delete(cleanEmail);
        return socket.emit('auth_response', {
          success: false,
          error: 'E-posta doğrulama kodu bulunamadı veya süresi doldu. Lütfen yeni kod isteyin.',
        });
      }
      if (!cleanCode || cleanCode !== otp.code) {
        otp.attempts += 1;
        if (otp.attempts >= 5) deps.pendingEmailOtps.delete(cleanEmail);
        return socket.emit('auth_response', {
          success: false,
          error: 'E-posta doğrulama kodu hatalı.',
        });
      }
      deps.pendingEmailOtps.delete(cleanEmail);
    }

    if (!password || typeof password !== 'string') {
      return socket.emit('auth_response', { success: false, error: 'Lütfen geçerli bir şifre girin.' });
    }
    const regPassCheck = validatePasswordAgainstPolicy(password, cleanUsername, Boolean(systemConfig.requireStrongPasswords));
    if (!regPassCheck.ok) {
      return socket.emit('auth_response', { success: false, error: regPassCheck.error });
    }

    if (deps.registeredAccounts.has(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    if (!isFirstUser && RESERVED_ADMIN_NAMES.has(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı sistem tarafından ayrılmıştır.' });
    }

    if (!isFirstUser && systemConfig.inviteOnlyRegistration) {
      const cleanInv = typeof inviteCode === 'string' ? inviteCode.trim().toUpperCase() : '';
      const invList = systemConfig.registrationInvites || [];
      const matched = invList.find((inv) => inv.code.toUpperCase() === cleanInv);
      if (!matched) {
        deps.recordRegisterAttempt(clientIp);
        return socket.emit('auth_response', { success: false, error: 'Geçersiz kayıt davet kodu.' });
      }
      if (matched.expiresAt && Date.now() > matched.expiresAt) {
        return socket.emit('auth_response', { success: false, error: 'Bu kayıt davet kodunun süresi dolmuş.' });
      }
      if (matched.maxUses > 0 && matched.uses >= matched.maxUses) {
        return socket.emit('auth_response', { success: false, error: 'Bu kayıt davet kodunun kullanım limiti dolmuş.' });
      }
      matched.uses += 1;
      deps.saveSystemConfig(systemConfig);
    }

    const role = isFirstUser ? 'admin' : 'user';
    const hashedPassword = await hashPasswordAsync(password);
    deps.recordRegisterAttempt(clientIp);
    deps.ipDailyRegistrations.set(clientIp, {
      date: todayKey,
      count: dailyRec && dailyRec.date === todayKey ? dailyRec.count + 1 : 1,
    });

    const newAccount: RegisteredAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      avatar: avatar || '🎮',
      role,
      createdAt: new Date().toLocaleDateString('tr-TR'),
      walletBalance: systemConfig.defaultWalletBalance ?? 100,
      statusMessage: '✨ Yeni Katıldı',
      bannerColor: 'from-blue-600 via-indigo-600 to-purple-600',
      bio: 'Sohbet ve sesli odalara yeni katıldı.',
      badges: deps.getUserBadges(role, cleanUsername, false),
      friends: [],
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion:
        typeof acceptedTermsVersion === 'string' && acceptedTermsVersion.trim()
          ? acceptedTermsVersion.trim().slice(0, 32)
          : '1.1.0',
    };

    deps.registeredAccounts.set(cleanUsername.toLowerCase(), newAccount);
    deps.saveAccounts(deps.registeredAccounts);
    deps.addAuditLog('YENI_KAYIT', `Yeni kullanıcı kaydoldu: ${cleanUsername} (${role}, IP: ${clientIp})`, 'auth');

    const user = buildSessionUser(socket.id, newAccount, deps.getUserBadges);
    bindAuthenticatedSocket(user, true);
    newAccount.knownLoginIps = [clientIp];
    deps.saveAccounts(deps.registeredAccounts);
    deps.emitInitData(socket, user);
    socket.emit('friends_data', deps.getFriendsData(user.username));
    socket.broadcast.emit('user_connected', deps.toPublicUser(user));
  });

  // 2. LOGIN
  socket.on('auth_login', async ({ usernameOrEmail, password }: any) => {
    const systemConfig = deps.getSystemConfig();
    const clientIp = deps.getClientIp(socket);
    const ipBan = deps.findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('auth_response', {
        success: false,
        error: `IP adresiniz sistemden engellenmiştir. Sebep: ${ipBan.reason}`,
      });
    }
    const rateCheck = deps.checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      deps.addAuditLog('GUVENLIK_ENGELI', `IP (${clientIp}) çok fazla başarısız giriş denemesi nedeniyle engellendi.`, 'auth');
      void deps.sendAdminWebhook('security', 'Brute-Force Giriş Engeli', `IP: ${clientIp} (${rateCheck.retryAfterSeconds}sn kilitlendi)`);
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla başarısız giriş denemesi! Güvenlik gereği ${rateCheck.retryAfterSeconds} saniye boyunca giriş engellendi.`,
      });
    }

    const query = usernameOrEmail?.trim()?.toLowerCase();
    if (!query || !password) {
      return socket.emit('auth_response', { success: false, error: 'Lütfen kullanıcı adı ve şifrenizi girin.' });
    }

    let foundAccount: RegisteredAccount | undefined;
    for (const acc of deps.registeredAccounts.values()) {
      if (acc.username.toLowerCase() === query || acc.email.toLowerCase() === query) {
        foundAccount = acc;
        break;
      }
    }

    if (!foundAccount) {
      deps.recordFailedLogin(clientIp);
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    if (foundAccount.isBanned) {
      if (foundAccount.bannedUntil && Date.now() >= foundAccount.bannedUntil) {
        foundAccount.isBanned = false;
        foundAccount.bannedReason = '';
        foundAccount.bannedUntil = null;
        deps.saveAccounts(deps.registeredAccounts);
        deps.addAuditLog('YASAK_SURESI_DOLDU', `"${foundAccount.username}" hesabının süreli yasağı otomatik olarak sona erdi.`, 'info');
      } else {
        const remainingText = foundAccount.bannedUntil
          ? ` (Kalan süre: ~${Math.max(1, Math.ceil((foundAccount.bannedUntil - Date.now()) / 60000))} dk)`
          : '';
        return socket.emit('auth_response', {
          success: false,
          error: `Hesabınız sistem yöneticisi tarafından yasaklandı.${remainingText}${foundAccount.bannedReason ? ` Sebep: ${foundAccount.bannedReason}` : ''}`,
        });
      }
    }

    if (systemConfig.maintenanceMode && foundAccount.role !== 'admin') {
      return socket.emit('auth_response', {
        success: false,
        error: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Yalnızca sistem yöneticileri giriş yapabilir.',
      });
    }

    if (foundAccount.lockedUntil && Date.now() < foundAccount.lockedUntil) {
      const remMins = Math.max(1, Math.ceil((foundAccount.lockedUntil - Date.now()) / 60000));
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla başarısız deneme nedeniyle bu hesap geçici olarak kilitlendi. (~${remMins} dk sonra tekrar deneyin.)`,
      });
    }

    const isPasswordValid = await verifyPasswordAsync(password, foundAccount.password);
    if (isPasswordValid && !foundAccount.password.startsWith('scrypt$')) {
      foundAccount.password = await hashPasswordAsync(password);
      deps.saveAccounts(deps.registeredAccounts);
      console.log(`[Security] Account '${foundAccount.username}' legacy password upgraded to scrypt hash.`);
    }

    if (!isPasswordValid) {
      deps.recordFailedLogin(clientIp);
      foundAccount.failedLoginCount = (foundAccount.failedLoginCount || 0) + 1;
      const maxAttempts = systemConfig.maxLoginAttempts || 5;
      if (foundAccount.failedLoginCount >= maxAttempts) {
        const lockMins = systemConfig.loginLockoutMinutes || 15;
        foundAccount.lockedUntil = Date.now() + lockMins * 60_000;
        deps.addAuditLog(
          'HESAP_KILITLENDI',
          `${foundAccount.username} hesabı ${maxAttempts} başarısız deneme sonrası ${lockMins} dk kilitlendi (Son IP: ${clientIp}).`,
          'auth'
        );
      }
      deps.saveAccounts(deps.registeredAccounts);
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    if (foundAccount.failedLoginCount || foundAccount.lockedUntil) {
      foundAccount.failedLoginCount = 0;
      foundAccount.lockedUntil = undefined;
      deps.saveAccounts(deps.registeredAccounts);
    }
    deps.clearLoginRateLimit(clientIp);

    if (foundAccount.twoFactorEnabled && foundAccount.twoFactorSecret) {
      const pending2faToken = deps.generatePending2faToken(foundAccount.username);
      return socket.emit('auth_response', {
        success: false,
        requires2fa: true,
        pending2faToken,
        username: foundAccount.username,
      });
    }

    const user = buildSessionUser(socket.id, foundAccount, deps.getUserBadges);
    deps.addAuditLog('GIRIS_BASARILI', `${user.username} (${user.role}) sisteme giriş yaptı (IP: ${clientIp}).`, 'auth');
    bindAuthenticatedSocket(user);

    const prevIps = Array.isArray(foundAccount.knownLoginIps) ? foundAccount.knownLoginIps : [];
    if (prevIps.length > 0 && !prevIps.includes(clientIp)) {
      deps.addAuditLog('YENI_IP_GIRISI', `${user.username} hesabına yeni bir IP adresinden (${clientIp}) giriş yapıldı.`, 'auth');
      socket.emit('security_new_ip_alert', { ip: clientIp, timestamp: new Date().toISOString() });
    }
    if (!prevIps.includes(clientIp)) {
      foundAccount.knownLoginIps = [...prevIps.slice(-19), clientIp];
      deps.saveAccounts(deps.registeredAccounts);
    }
    deps.emitInitData(socket, user);
    socket.emit('friends_data', deps.getFriendsData(user.username));
    socket.broadcast.emit('user_connected', deps.toPublicUser(user));
  });

  // 2.2 VERIFY 2FA LOGIN
  socket.on('auth_2fa_verify', async ({ pending2faToken, code }: { pending2faToken: string; code: string }) => {
    const clientIp = deps.getClientIp(socket);
    const rateCheck = deps.checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla başarısız 2FA denemesi! ${rateCheck.retryAfterSeconds} saniye bekleyin.`,
      });
    }

    const verifiedUsername = deps.verifyPending2faToken(pending2faToken);
    if (!verifiedUsername) {
      return socket.emit('auth_response', {
        success: false,
        error: '2FA doğrulama süresi doldu, lütfen tekrar giriş yapın.',
      });
    }

    const foundAccount = deps.registeredAccounts.get(verifiedUsername.toLowerCase());
    if (!foundAccount || !foundAccount.twoFactorEnabled || !foundAccount.twoFactorSecret) {
      return socket.emit('auth_response', { success: false, error: '2FA yapılandırması bulunamadı.' });
    }

    const cleanCode = (code || '').trim().toUpperCase();
    let isValid = verifyTotpCode(foundAccount.twoFactorSecret, cleanCode);

    if (!isValid && Array.isArray(foundAccount.twoFactorBackupCodes) && foundAccount.twoFactorBackupCodes.length > 0) {
      let matchIdx = -1;
      for (let i = 0; i < foundAccount.twoFactorBackupCodes.length; i++) {
        if (await verifyPasswordAsync(cleanCode, foundAccount.twoFactorBackupCodes[i])) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        isValid = true;
        foundAccount.twoFactorBackupCodes.splice(matchIdx, 1);
        deps.saveAccounts(deps.registeredAccounts);
        deps.addAuditLog('2FA_YEDEK_KOD', `${foundAccount.username} yedek kurtarma kodu ile giriş yaptı.`, 'auth');
      }
    }

    if (!isValid) {
      deps.recordFailedLogin(clientIp);
      return socket.emit('auth_response', {
        success: false,
        requires2fa: true,
        pending2faToken,
        error: 'Geçersiz 2FA kodu! Lütfen doğrulayıcı uygulamanızdaki güncel 6 haneli kodu girin.',
      });
    }

    deps.clearLoginRateLimit(clientIp);

    const user = buildSessionUser(socket.id, foundAccount, deps.getUserBadges, { forceTwoFactor: true });
    deps.addAuditLog('GIRIS_BASARILI', `${user.username} (${user.role}) 2FA ile giriş yaptı (IP: ${clientIp}).`, 'auth');
    bindAuthenticatedSocket(user);

    const prevIps = Array.isArray(foundAccount.knownLoginIps) ? foundAccount.knownLoginIps : [];
    if (prevIps.length > 0 && !prevIps.includes(clientIp)) {
      deps.addAuditLog('YENI_IP_GIRISI', `${user.username} hesabına yeni bir IP adresinden (${clientIp}) 2FA ile giriş yapıldı.`, 'auth');
      socket.emit('security_new_ip_alert', { ip: clientIp, timestamp: new Date().toISOString() });
    }
    if (!prevIps.includes(clientIp)) {
      foundAccount.knownLoginIps = [...prevIps.slice(-19), clientIp];
      deps.saveAccounts(deps.registeredAccounts);
    }
    deps.emitInitData(socket, user);
    socket.emit('friends_data', deps.getFriendsData(user.username));
    socket.broadcast.emit('user_connected', deps.toPublicUser(user));
  });

  // 2.5 TOKEN LOGIN
  socket.on('auth_token_login', ({ token }: { token?: string }) => {
    const systemConfig = deps.getSystemConfig();
    const clientIp = deps.getClientIp(socket);
    const ipBan = deps.findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: `IP adresiniz sistemden engellenmiştir. Sebep: ${ipBan.reason}`,
      });
    }
    const effectiveToken =
      token && token !== '__cookie__'
        ? token
        : (parseCookieFromHeader(socket.handshake.headers.cookie, 'cakma_session') || '');
    const verified = deps.verifySessionTokenWithMeta(effectiveToken);
    if (!verified) {
      return socket.emit('auth_response', { success: false, tokenExpired: true, error: 'Oturum süresi doldu, lütfen tekrar giriş yapın.' });
    }

    const foundAccount = deps.registeredAccounts.get(verified.username.toLowerCase());
    if (!foundAccount) {
      return socket.emit('auth_response', { success: false, tokenExpired: true, error: 'Hesap bulunamadı.' });
    }

    if (foundAccount.minTokenIssuedAt && verified.iat < foundAccount.minTokenIssuedAt) {
      return socket.emit('auth_response', { success: false, tokenExpired: true, error: 'Bu oturum başka bir cihazdan sonlandırıldı.' });
    }

    if (foundAccount.isBanned) {
      if (foundAccount.bannedUntil && Date.now() >= foundAccount.bannedUntil) {
        foundAccount.isBanned = false;
        foundAccount.bannedReason = '';
        foundAccount.bannedUntil = null;
        deps.saveAccounts(deps.registeredAccounts);
      } else {
        return socket.emit('auth_response', {
          success: false,
          tokenExpired: true,
          error: `Hesabınız sistem yöneticisi tarafından yasaklandı.${foundAccount.bannedReason ? ` Sebep: ${foundAccount.bannedReason}` : ''}`,
        });
      }
    }

    if (systemConfig.maintenanceMode && foundAccount.role !== 'admin') {
      return socket.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Yalnızca sistem yöneticileri giriş yapabilir.',
      });
    }

    const user = buildSessionUser(socket.id, foundAccount, deps.getUserBadges);
    bindAuthenticatedSocket(user);
    deps.emitInitData(socket, user);
    socket.emit('friends_data', deps.getFriendsData(user.username));
    socket.broadcast.emit('user_connected', deps.toPublicUser(user));
  });

  // 3. LOGOUT
  socket.on('auth_logout', () => {
    const user = deps.activeUsers.get(socket.id);
    if (user) {
      socket.leave('admins');
      deps.recordUserDisconnection(socket.id);
      deps.addAuditLog('CIKIS_YAPILDI', `${user.username} sistemden çıkış yaptı.`, 'auth');
      if (user.currentVoiceChannelId) {
        socket.to(user.currentVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: user.currentVoiceChannelId });
      }
      deps.activeUsers.delete(socket.id);
      deps.emitToRelevantUsers(user, 'user_disconnected', socket.id);
      socket.emit('logged_out');
    }
  });
}
