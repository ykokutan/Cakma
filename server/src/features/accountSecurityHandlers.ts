import crypto from 'crypto';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { FriendRequest, RegisteredAccount, Server, User } from '../types.js';
import type { PushSubscriptionRecord } from '../storage.js';
import { verifyTotpCode } from '../totp.js';
import { hashPasswordAsync, verifyPasswordAsync } from '../utils/authCrypto.js';
import { maskEmail } from '../utils/mailDelivery.js';
import { validatePasswordAgainstPolicy } from '../utils/passwordPolicy.js';
import { matchesServerMember } from '../utils/serverIdentity.js';

export interface ActiveSessionRecord {
  socketId: string;
  username: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
}

export interface PendingPasswordResetOtp {
  username: string;
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export interface PendingEmailChangeOtp {
  newEmail: string;
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export interface AccountSecurityDeps {
  io: Pick<SocketIOServer, 'to' | 'emit' | 'sockets'>;
  registeredAccounts: Map<string, RegisteredAccount>;
  activeUsers: Map<string, User>;
  activeSessions: Map<string, ActiveSessionRecord>;
  servers: Server[];
  pendingFriendRequests: Map<string, FriendRequest>;
  getPushSubscriptions: () => PushSubscriptionRecord[];
  setPushSubscriptions: (next: PushSubscriptionRecord[]) => void;
  savePushSubscriptions: (records: PushSubscriptionRecord[]) => void;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  deleteUserReadCursors?: (username: string) => void;
  saveServers: (servers: Server[]) => void;
  saveFriendRequests: (requests: Map<string, FriendRequest>) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  emitUserUpdated: (user: User) => void;
  emitServerUpdatedToMembers: (srv: Server) => void;
  sendSmtpEmail: (
    to: string,
    subject: string,
    text: string,
    html?: string
  ) => Promise<{ ok: boolean; error?: string; transport?: 'relay' | 'smtp' }>;
  disposableEmailDomains: Set<string>;
  getSystemConfig: () => { requireStrongPasswords: boolean };
  getClientIp: (socket: Socket) => string;
  isIpBanned: (ip: string) => boolean;
}

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONFIRM_DELETE_TOKENS = new Set(['SİL', 'SIL', 'DELETE']);

export function createAccountSecurityManager(deps: AccountSecurityDeps) {
  const pendingPasswordResetOtps = new Map<string, PendingPasswordResetOtp>();
  const pendingEmailChangeOtps = new Map<string, PendingEmailChangeOtp>();

  const pruneExpired = () => {
    const now = Date.now();
    for (const [key, otp] of pendingPasswordResetOtps.entries()) {
      if (now > otp.expiresAt && now - otp.sentAt >= 60_000) {
        pendingPasswordResetOtps.delete(key);
      }
    }
    for (const [key, otp] of pendingEmailChangeOtps.entries()) {
      if (now > otp.expiresAt) {
        pendingEmailChangeOtps.delete(key);
      }
    }
  };

  const cleanupTimer = setInterval(pruneExpired, 10 * 60_000);
  cleanupTimer.unref?.();

  const disconnectAccountSockets = (usernameLower: string, reasonMessage: string, excludeSocketId?: string) => {
    for (const [sid, sess] of Array.from(deps.activeSessions.entries())) {
      if (sess.username.toLowerCase() !== usernameLower) continue;
      if (excludeSocketId && sid === excludeSocketId) continue;

      const targetSock = deps.io.sockets?.sockets?.get(sid);
      if (targetSock) {
        targetSock.emit('auth_response', {
          success: false,
          tokenExpired: true,
          error: reasonMessage,
        });
        targetSock.emit('logged_out');
        targetSock.disconnect(true);
      }
      deps.activeSessions.delete(sid);
      deps.activeUsers.delete(sid);
      deps.io.emit('user_disconnected', sid);
    }
  };

  const requestPasswordResetCode = async (email: string, ip: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (deps.isIpBanned(ip)) {
      return { success: false, error: 'IP adresiniz engellenmiştir.' };
    }

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 64) : '';
    if (!cleanEmail || !EMAIL_FORMAT_REGEX.test(cleanEmail)) {
      return { success: false, error: 'Lütfen geçerli bir e-posta adresi girin.' };
    }

    const existing = pendingPasswordResetOtps.get(cleanEmail);
    if (existing && Date.now() - existing.sentAt < 60_000) {
      const waitSec = Math.ceil((60_000 - (Date.now() - existing.sentAt)) / 1000);
      return { success: false, error: `Yeni kod istemek için ${waitSec} saniye bekleyin.` };
    }

    const genericSuccess = 'Eğer bu e-posta sistemde kayıtlıysa 6 haneli şifre sıfırlama kodu gönderildi.';

    let matchedAccount: RegisteredAccount | undefined;
    for (const acc of deps.registeredAccounts.values()) {
      if ((acc.email || '').trim().toLowerCase() === cleanEmail) {
        matchedAccount = acc;
        break;
      }
    }

    if (!matchedAccount) {
      // Rate-limit repeated probes on non-existent emails without revealing absence
      pendingPasswordResetOtps.set(cleanEmail, {
        username: '',
        code: '',
        expiresAt: 0,
        attempts: 0,
        sentAt: Date.now(),
      });
      return { success: true, message: genericSuccess };
    }

    const code = String(crypto.randomInt(100000, 1000000));
    pendingPasswordResetOtps.set(cleanEmail, {
      username: matchedAccount.username,
      code,
      expiresAt: Date.now() + 10 * 60_000,
      attempts: 0,
      sentAt: Date.now(),
    });

    const mailRes = await deps.sendSmtpEmail(
      cleanEmail,
      'Çakma - Şifre Sıfırlama Kodunuz',
      `Şifre sıfırlama kodunuz: ${code} (10 dakika geçerlidir).`,
      `<div style="font-family:sans-serif;padding:16px;background:#0f172a;color:#f8fafc;border-radius:12px;">
        <h2 style="margin:0 0 8px;color:#fb7185;">Çakma Şifre Sıfırlama</h2>
        <p style="margin:0 0 12px;color:#cbd5e1;">Hesabınızın şifresini sıfırlamak için aşağıdaki 6 haneli kodu girin:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:6px;padding:12px 18px;background:#1e293b;border-radius:8px;display:inline-block;color:#34d399;">${code}</div>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Bu kod 10 dakika boyunca geçerlidir. Bu isteği siz yapmadıysanız güvenle yok sayabilirsiniz.</p>
      </div>`
    );

    const masked = maskEmail(cleanEmail);
    if (!mailRes.ok) {
      pendingPasswordResetOtps.delete(cleanEmail);
      const errDetail = mailRes.error || 'Bilinmeyen gönderim hatası.';
      console.warn(`⚠️ [OTP-Reset] ${masked} için şifre sıfırlama maili gönderilemedi: ${errDetail}`);
      deps.addAuditLog('SIFRE_SIFIRLAMA_MAIL_HATASI', `${masked} için şifre sıfırlama maili gönderilemedi: ${errDetail}`, 'warn');
      return { success: false, error: `Şifre sıfırlama e-postası gönderilemedi: ${errDetail}` };
    }

    console.log(`✉️ [OTP-Reset] ${masked} adresine şifre sıfırlama kodu gönderildi (${mailRes.transport || 'mail'}).`);
    return { success: true, message: genericSuccess };
  };

  const confirmPasswordReset = async (
    email: string,
    code: string,
    newPassword: string,
    ip: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (deps.isIpBanned(ip)) {
      return { success: false, error: 'IP adresiniz engellenmiştir.' };
    }

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 64) : '';
    const cleanCode = typeof code === 'string' ? code.trim() : '';
    const otp = pendingPasswordResetOtps.get(cleanEmail);

    if (!otp || !otp.code || Date.now() > otp.expiresAt) {
      if (otp && Date.now() > otp.expiresAt) pendingPasswordResetOtps.delete(cleanEmail);
      return { success: false, error: 'Şifre sıfırlama kodu bulunamadı veya süresi doldu. Lütfen yeni kod isteyin.' };
    }

    if (!cleanCode || cleanCode !== otp.code) {
      otp.attempts += 1;
      if (otp.attempts >= 5) pendingPasswordResetOtps.delete(cleanEmail);
      return { success: false, error: 'Doğrulama kodu hatalı.' };
    }

    const acc = deps.registeredAccounts.get(otp.username.toLowerCase());
    if (!acc) {
      pendingPasswordResetOtps.delete(cleanEmail);
      return { success: false, error: 'Hesap bulunamadı.' };
    }

    const policyCheck = validatePasswordAgainstPolicy(
      newPassword,
      acc.username,
      Boolean(deps.getSystemConfig().requireStrongPasswords)
    );
    if (!policyCheck.ok) {
      return { success: false, error: policyCheck.error };
    }

    acc.password = await hashPasswordAsync(newPassword);
    acc.minTokenIssuedAt = Date.now();
    acc.failedLoginCount = 0;
    acc.lockedUntil = undefined;
    pendingPasswordResetOtps.delete(cleanEmail);
    deps.saveAccounts(deps.registeredAccounts);

    disconnectAccountSockets(
      acc.username.toLowerCase(),
      'Şifreniz sıfırlandığı için mevcut oturumunuz sonlandırıldı. Lütfen yeni şifrenizle giriş yapın.'
    );
    deps.addAuditLog('SIFRE_SIFIRLANDI', `${acc.username} e-posta doğrulama kodu ile şifresini sıfırladı.`, 'auth');

    return {
      success: true,
      message: 'Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.',
    };
  };

  const requestEmailChangeCode = async (
    usernameLower: string,
    currentPassword: string,
    newEmail: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const acc = deps.registeredAccounts.get(usernameLower);
    if (!acc) return { success: false, error: 'Hesap bulunamadı.' };

    if (!(await verifyPasswordAsync(currentPassword || '', acc.password))) {
      return { success: false, error: 'Mevcut şifreniz hatalı.' };
    }

    const cleanEmail = typeof newEmail === 'string' ? newEmail.trim().toLowerCase().slice(0, 64) : '';
    if (!cleanEmail || !EMAIL_FORMAT_REGEX.test(cleanEmail)) {
      return { success: false, error: 'Lütfen geçerli bir e-posta adresi girin.' };
    }

    const domain = cleanEmail.split('@')[1] || '';
    if (deps.disposableEmailDomains.has(domain)) {
      return { success: false, error: 'Geçici e-posta adresleri kullanılamaz.' };
    }

    if ((acc.email || '').trim().toLowerCase() === cleanEmail) {
      return { success: false, error: 'Yeni e-posta adresiniz mevcut adresinizle aynı.' };
    }

    for (const [k, otherAcc] of deps.registeredAccounts.entries()) {
      if (k !== usernameLower && (otherAcc.email || '').trim().toLowerCase() === cleanEmail) {
        return { success: false, error: 'Bu e-posta adresi başka bir hesapta zaten kayıtlı.' };
      }
    }

    const existing = pendingEmailChangeOtps.get(usernameLower);
    if (existing && Date.now() - existing.sentAt < 60_000) {
      const waitSec = Math.ceil((60_000 - (Date.now() - existing.sentAt)) / 1000);
      return { success: false, error: `Yeni kod istemek için ${waitSec} saniye bekleyin.` };
    }

    const code = String(crypto.randomInt(100000, 1000000));
    pendingEmailChangeOtps.set(usernameLower, {
      newEmail: cleanEmail,
      code,
      expiresAt: Date.now() + 10 * 60_000,
      attempts: 0,
      sentAt: Date.now(),
    });

    const mailRes = await deps.sendSmtpEmail(
      cleanEmail,
      'Çakma - E-Posta Değişikliği Doğrulama Kodunuz',
      `Yeni e-posta adresinizi doğrulamak için kodunuz: ${code} (10 dakika geçerlidir).`,
      `<div style="font-family:sans-serif;padding:16px;background:#0f172a;color:#f8fafc;border-radius:12px;">
        <h2 style="margin:0 0 8px;color:#38bdf8;">E-Posta Adresi Değişikliği</h2>
        <p style="margin:0 0 12px;color:#cbd5e1;">Yeni e-posta adresinizi onaylamak için aşağıdaki 6 haneli kodu girin:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:6px;padding:12px 18px;background:#1e293b;border-radius:8px;display:inline-block;color:#34d399;">${code}</div>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Bu kod 10 dakika boyunca geçerlidir.</p>
      </div>`
    );

    if (!mailRes.ok) {
      pendingEmailChangeOtps.delete(usernameLower);
      return { success: false, error: `Doğrulama e-postası gönderilemedi: ${mailRes.error || 'Bilinmeyen hata.'}` };
    }

    return {
      success: true,
      message: `${cleanEmail} adresine 6 haneli doğrulama kodu gönderildi.`,
    };
  };

  const confirmEmailChange = (
    usernameLower: string,
    code: string
  ): { success: boolean; email?: string; message?: string; error?: string } => {
    const acc = deps.registeredAccounts.get(usernameLower);
    if (!acc) return { success: false, error: 'Hesap bulunamadı.' };

    const otp = pendingEmailChangeOtps.get(usernameLower);
    const cleanCode = typeof code === 'string' ? code.trim() : '';
    if (!otp || Date.now() > otp.expiresAt) {
      pendingEmailChangeOtps.delete(usernameLower);
      return { success: false, error: 'E-posta doğrulama kodu bulunamadı veya süresi doldu.' };
    }

    if (!cleanCode || cleanCode !== otp.code) {
      otp.attempts += 1;
      if (otp.attempts >= 5) pendingEmailChangeOtps.delete(usernameLower);
      return { success: false, error: 'Doğrulama kodu hatalı.' };
    }

    for (const [k, otherAcc] of deps.registeredAccounts.entries()) {
      if (k !== usernameLower && (otherAcc.email || '').trim().toLowerCase() === otp.newEmail) {
        pendingEmailChangeOtps.delete(usernameLower);
        return { success: false, error: 'Bu e-posta adresi başka bir hesap tarafından alınmış.' };
      }
    }

    acc.email = otp.newEmail;
    pendingEmailChangeOtps.delete(usernameLower);
    deps.saveAccounts(deps.registeredAccounts);

    for (const activeUser of deps.activeUsers.values()) {
      if (activeUser.username.toLowerCase() === usernameLower) {
        activeUser.email = otp.newEmail;
        deps.emitUserUpdated(activeUser);
      }
    }

    deps.addAuditLog(
      'EPOSTA_DEGISTIRILDI',
      `${acc.username} e-posta adresini güncelledi (${maskEmail(otp.newEmail)}).`,
      'auth'
    );

    return {
      success: true,
      email: otp.newEmail,
      message: 'E-posta adresiniz başarıyla güncellendi.',
    };
  };

  const revokeSingleSession = (
    currentSocketId: string,
    usernameLower: string,
    targetSocketId: string
  ): { success: boolean; remaining?: Array<ActiveSessionRecord & { isCurrent: boolean }>; error?: string } => {
    if (!targetSocketId || targetSocketId === currentSocketId) {
      return { success: false, error: 'Aktif mevcut oturumunuzu bu işlemden sonlandıramazsınız.' };
    }

    const targetSess = deps.activeSessions.get(targetSocketId);
    if (!targetSess || targetSess.username.toLowerCase() !== usernameLower) {
      return { success: false, error: 'Belirtilen oturum bulunamadı.' };
    }

    const targetSock = deps.io.sockets?.sockets?.get(targetSocketId);
    if (targetSock) {
      targetSock.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: 'Oturumunuz başka bir cihazdan sonlandırıldı.',
      });
      targetSock.emit('logged_out');
      targetSock.disconnect(true);
    }

    deps.activeSessions.delete(targetSocketId);
    deps.activeUsers.delete(targetSocketId);
    deps.io.emit('user_disconnected', targetSocketId);
    deps.addAuditLog('OTURUM_SONLANDIRILDI', `${targetSess.username} bir cihaz oturumunu sonlandırdı.`, 'auth');

    const remaining = Array.from(deps.activeSessions.values())
      .filter((s) => s.username.toLowerCase() === usernameLower)
      .map((s) => ({ ...s, isCurrent: s.socketId === currentSocketId }));

    return { success: true, remaining };
  };

  const deleteAccount = async (
    usernameLower: string,
    currentPassword: string,
    confirmText: string,
    totpCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const acc = deps.registeredAccounts.get(usernameLower);
    if (!acc) return { success: false, error: 'Hesap bulunamadı.' };

    const normalizedConfirm = typeof confirmText === 'string' ? confirmText.trim().toUpperCase() : '';
    if (!CONFIRM_DELETE_TOKENS.has(normalizedConfirm)) {
      return { success: false, error: 'Onaylamak için kutucuğa "SİL" yazmalısınız.' };
    }

    if (!(await verifyPasswordAsync(currentPassword || '', acc.password))) {
      return { success: false, error: 'Mevcut şifreniz hatalı.' };
    }

    if (acc.twoFactorEnabled && acc.twoFactorSecret) {
      const cleanCode = (totpCode || '').trim().toUpperCase();
      let twoFaValid = verifyTotpCode(acc.twoFactorSecret, cleanCode);
      if (!twoFaValid && Array.isArray(acc.twoFactorBackupCodes)) {
        for (const hash of acc.twoFactorBackupCodes) {
          if (await verifyPasswordAsync(cleanCode, hash)) {
            twoFaValid = true;
            break;
          }
        }
      }
      if (!twoFaValid) {
        return { success: false, error: 'İki faktörlü doğrulama (2FA) kodu geçersiz.' };
      }
    }

    const deletedUsername = acc.username;
    const deletedAccountId = acc.id;

    // 1. Delete account record & friend lists
    deps.registeredAccounts.delete(usernameLower);
    for (const otherAcc of deps.registeredAccounts.values()) {
      if (Array.isArray(otherAcc.friends)) {
        const filtered = otherAcc.friends.filter((f) => f.toLowerCase() !== usernameLower);
        if (filtered.length !== otherAcc.friends.length) {
          otherAcc.friends = filtered;
        }
      }
    }
    deps.saveAccounts(deps.registeredAccounts);

    // 2. Remove pending friend requests involving user
    let requestsChanged = false;
    for (const [reqId, req] of Array.from(deps.pendingFriendRequests.entries())) {
      if (
        req.fromUsername.toLowerCase() === usernameLower ||
        req.toUsername.toLowerCase() === usernameLower
      ) {
        deps.pendingFriendRequests.delete(reqId);
        requestsChanged = true;
      }
    }
    if (requestsChanged) {
      deps.saveFriendRequests(deps.pendingFriendRequests);
    }

    // 3. Prune push subscriptions
    const currentSubs = deps.getPushSubscriptions();
    const remainingSubs = currentSubs.filter((s) => s.username.toLowerCase() !== usernameLower);
    if (remainingSubs.length !== currentSubs.length) {
      deps.setPushSubscriptions(remainingSubs);
      deps.savePushSubscriptions(remainingSubs);
    }

    // 4. Remove user from server memberships and transfer ownership if other members remain
    let serversChanged = false;
    const deletedIdentity = { id: deletedAccountId, accountId: deletedAccountId, username: deletedUsername };
    for (const srv of deps.servers) {
      const members = srv.members || [];
      const hadMember = members.some((m) => matchesServerMember(m, deletedIdentity));
      const wasOwner =
        srv.ownerId === deletedAccountId ||
        members.some((m) => matchesServerMember(m, deletedIdentity) && m.isOwner);

      if (hadMember) {
        srv.members = members.filter((m) => !matchesServerMember(m, deletedIdentity));
        serversChanged = true;
      }
      if (wasOwner && srv.members && srv.members.length > 0) {
        const nextOwner = srv.members[0];
        srv.ownerId = nextOwner.userId;
        nextOwner.isOwner = true;
        if (!nextOwner.roleIds.includes('role-owner')) {
          nextOwner.roleIds = ['role-owner', ...nextOwner.roleIds];
        }
        serversChanged = true;
      }
      if (hadMember || wasOwner) {
        deps.emitServerUpdatedToMembers(srv);
      }
    }
    if (serversChanged) {
      deps.saveServers(deps.servers);
    }

    pendingEmailChangeOtps.delete(usernameLower);
    deps.deleteUserReadCursors?.(usernameLower);
    deps.addAuditLog('HESAP_SILINDI', `${deletedUsername} hesabını kalıcı olarak sildi.`, 'auth');

    return { success: true };
  };

  return {
    pendingPasswordResetOtps,
    pendingEmailChangeOtps,
    pruneExpired,
    stop: () => clearInterval(cleanupTimer),
    requestPasswordResetCode,
    confirmPasswordReset,
    requestEmailChangeCode,
    confirmEmailChange,
    revokeSingleSession,
    deleteAccount,
    disconnectAccountSockets,
  };
}

export type AccountSecurityManager = ReturnType<typeof createAccountSecurityManager>;

export function registerAccountSecuritySocketHandlers(
  socket: Socket,
  manager: AccountSecurityManager,
  deps: AccountSecurityDeps
) {
  socket.on('request_password_reset_code', async ({ email }: { email: string }) => {
    const res = await manager.requestPasswordResetCode(email, deps.getClientIp(socket));
    socket.emit('password_reset_code_result', res);
  });

  socket.on('confirm_password_reset', async ({
    email,
    code,
    newPassword,
  }: {
    email: string;
    code: string;
    newPassword: string;
  }) => {
    const res = await manager.confirmPasswordReset(email, code, newPassword, deps.getClientIp(socket));
    socket.emit('password_reset_result', res);
  });

  socket.on('request_email_change_code', async ({
    currentPassword,
    newEmail,
  }: {
    currentPassword: string;
    newEmail: string;
  }) => {
    const user = deps.activeUsers.get(socket.id);
    if (!user) return socket.emit('email_change_code_result', { success: false, error: 'Oturum açmalısınız.' });
    const res = await manager.requestEmailChangeCode(user.username.toLowerCase(), currentPassword, newEmail);
    socket.emit('email_change_code_result', res);
  });

  socket.on('confirm_email_change', ({ code }: { code: string }) => {
    const user = deps.activeUsers.get(socket.id);
    if (!user) return socket.emit('email_change_confirm_result', { success: false, error: 'Oturum açmalısınız.' });
    const res = manager.confirmEmailChange(user.username.toLowerCase(), code);
    socket.emit('email_change_confirm_result', res);
  });

  socket.on('revoke_single_session', ({ targetSocketId }: { targetSocketId: string }) => {
    const user = deps.activeUsers.get(socket.id);
    if (!user) return;
    const res = manager.revokeSingleSession(socket.id, user.username.toLowerCase(), targetSocketId);
    if (res.success && res.remaining) {
      socket.emit('active_sessions_list', res.remaining);
      socket.emit('revoke_single_session_result', { success: true });
    } else {
      socket.emit('revoke_single_session_result', { success: false, error: res.error });
    }
  });

  socket.on('delete_my_account', async ({
    currentPassword,
    totpCode,
    confirmText,
  }: {
    currentPassword: string;
    totpCode?: string;
    confirmText: string;
  }) => {
    const user = deps.activeUsers.get(socket.id);
    if (!user) return socket.emit('delete_account_result', { success: false, error: 'Oturum açmalısınız.' });
    const usernameLower = user.username.toLowerCase();
    const res = await manager.deleteAccount(usernameLower, currentPassword, confirmText, totpCode);
    socket.emit('delete_account_result', res);
    if (res.success) {
      socket.emit('logged_out');
      manager.disconnectAccountSockets(usernameLower, 'Hesabınız kalıcı olarak silindi.', socket.id);
      deps.activeSessions.delete(socket.id);
      deps.activeUsers.delete(socket.id);
      deps.io.emit('user_disconnected', socket.id);
      socket.disconnect(true);
    }
  });
}
