import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { IssuedLicense, RegisteredAccount, StoreSettings, User } from '../types.js';

export interface StoreSocketHandlerDeps {
  io: SocketIOServer;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  issuedLicenses: Map<string, IssuedLicense>;
  storeSettings: StoreSettings;
  sanitizeText: (input: string) => string;
  generateLicenseKey: (
    licensee: string,
    maxSlots: number,
    expiresIn: number | string,
    tier: 'Starter' | 'Pro' | 'Enterprise'
  ) => string;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  saveLicenses: (licenses: Map<string, IssuedLicense>) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
}

export function registerStoreSocketHandlers(socket: Socket, deps: StoreSocketHandlerDeps): void {
  const {
    io,
    activeUsers,
    registeredAccounts,
    issuedLicenses,
    storeSettings,
    sanitizeText,
    generateLicenseKey,
    saveAccounts,
    saveLicenses,
    addAuditLog,
  } = deps;

  // Store: Lisans Satın Alma (Dinamik Fiyat, Kampanya & Çoklu Ödeme Yöntemi)
  socket.on('store_purchase_license', ({ serverName, maxSlots, expireDays, tier, paymentMethod }: any) => {
    const user = activeUsers.get(socket.id);
    if (!user) {
      return socket.emit('store_purchase_response', { success: false, error: 'Satın almak için oturum açmalısınız.' });
    }

    if (!storeSettings.isOpen) {
      return socket.emit('store_purchase_response', {
        success: false,
        error: storeSettings.closedReason || 'Mağazamız şu anda satışa kapalıdır. Lütfen daha sonra tekrar deneyiniz.',
      });
    }

    const selectedMethod = (paymentMethod || 'wallet') as 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
    const methodConfig = storeSettings.paymentMethods.find((m) => m.id === selectedMethod);
    if (!methodConfig || !methodConfig.enabled) {
      return socket.emit('store_purchase_response', {
        success: false,
        error: 'Seçilen ödeme yöntemi şu anda aktif değildir.',
      });
    }

    const rawSlots = Number(maxSlots);
    const slots = Number.isFinite(rawSlots) ? Math.max(2, Math.min(500, Math.floor(rawSlots))) : 16;
    const rawDays = Number(expireDays);
    const allowedDays = [30, 90, 180, 365, -1];
    const days = allowedDays.includes(rawDays)
      ? rawDays
      : Number.isFinite(rawDays) && rawDays >= 1
        ? Math.floor(rawDays)
        : 30;
    const selectedTier = (tier as 'Starter' | 'Pro' | 'Enterprise') || 'Starter';
    const cleanName = sanitizeText((serverName || `${user.username} Sunucusu`).trim()).slice(0, 64);

    let basePrice: number;
    if (selectedTier === 'Starter') {
      if (storeSettings.packages.starter.enabled === false) {
        return socket.emit('store_purchase_response', { success: false, error: 'Starter paketi şu anda satışa kapalıdır.' });
      }
      basePrice = storeSettings.packages.starter.price;
    } else if (selectedTier === 'Pro') {
      if (storeSettings.packages.pro.enabled === false) {
        return socket.emit('store_purchase_response', { success: false, error: 'Pro paketi şu anda satışa kapalıdır.' });
      }
      basePrice = storeSettings.packages.pro.price;
    } else if (selectedTier === 'Enterprise') {
      if (storeSettings.packages.enterprise.enabled === false) {
        return socket.emit('store_purchase_response', { success: false, error: 'Enterprise paketi şu anda satışa kapalıdır.' });
      }
      basePrice = storeSettings.packages.enterprise.price;
    } else {
      basePrice = slots * (storeSettings.customSlotUnitPrice || 4);
    }

    if (days === -1 && storeSettings.allowLifetimePurchase === false) {
      return socket.emit('store_purchase_response', { success: false, error: 'Ömür boyu lisans satışı şu anda devre dışıdır.' });
    }

    const mults = storeSettings.durationMultipliers || { days90: 2.5, days180: 4.5, days365: 8, lifetime: 12 };
    let multiplier = 1;
    if (days === 90) multiplier = mults.days90 ?? 2.5;
    else if (days === 180) multiplier = mults.days180 ?? 4.5;
    else if (days === 365) multiplier = mults.days365 ?? 8;
    else if (days === -1) multiplier = mults.lifetime ?? 12;

    let totalPrice = Math.max(1, Math.round(basePrice * multiplier));
    if (storeSettings.discountPercentage > 0) {
      totalPrice = Math.max(1, Math.round(totalPrice * (1 - storeSettings.discountPercentage / 100)));
    }

    const isWallet = selectedMethod === 'wallet';
    let licenseStatus: 'active' | 'pending_payment' = 'active';

    if (isWallet) {
      const account = registeredAccounts.get(user.username.toLowerCase());
      if (!account) {
        return socket.emit('store_purchase_response', { success: false, error: 'Kullanıcı hesabı bulunamadı.' });
      }
      if (account.walletBalance < totalPrice) {
        return socket.emit('store_purchase_response', {
          success: false,
          error: `Yetersiz cüzdan bakiyesi! Bu lisans için ₺${totalPrice} gerekiyor. Mevcut bakiyeniz: ₺${account.walletBalance}`,
        });
      }
      account.walletBalance -= totalPrice;
      user.walletBalance = account.walletBalance;
      saveAccounts(registeredAccounts);
      socket.emit('user_updated', user);
    } else {
      licenseStatus = 'pending_payment';
    }

    const licenseKey = generateLicenseKey(cleanName, slots, days, selectedTier);
    const expiresAt =
      days === -1 ? 'lifetime' : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const newLicense: IssuedLicense = {
      id: `lic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      licenseKey,
      licensee: cleanName,
      assignedUsername: user.username,
      assignedUserId: user.id,
      maxSlots: slots,
      tier: selectedTier,
      status: licenseStatus,
      issuedAt: new Date().toISOString(),
      expiresAt,
      price: totalPrice,
      source: 'store',
    };

    issuedLicenses.set(newLicense.id, newLicense);
    saveLicenses(issuedLicenses);

    addAuditLog(
      licenseStatus === 'active' ? 'MAGAZA_SATIS' : 'MAGAZA_SIPARIS_BEKLEMEDE',
      `${user.username} mağazadan "${cleanName}" için ${slots} slot (${selectedTier}) lisans siparişi verdi (₺${totalPrice} - Ödeme: ${methodConfig.name} - Durum: ${licenseStatus === 'active' ? 'Aktif' : 'Ödeme Onayı Bekleniyor'})`,
      licenseStatus === 'active' ? 'auth' : 'warn'
    );

    socket.emit('store_purchase_response', {
      success: true,
      license: newLicense,
      message:
        licenseStatus === 'active'
          ? 'Lisansınız başarıyla oluşturuldu ve aktifleştirildi.'
          : 'Siparişiniz alındı. Havale/kredi kartı ödemeniz yönetici tarafından onaylandığında lisansınız aktifleşecektir.',
    });

    const userLics = Array.from(issuedLicenses.values()).filter(
      (l) => l.assignedUsername.toLowerCase() === user.username.toLowerCase()
    );
    socket.emit('my_licenses_response', userLics);
    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  });

  // Store: Extend License
  socket.on('store_extend_license', ({ licenseId, addDays, paymentMethod }: any) => {
    const user = activeUsers.get(socket.id);
    if (!user) {
      return socket.emit('store_extend_response', { success: false, error: 'Oturum açmalısınız.' });
    }

    if (!storeSettings.isOpen) {
      return socket.emit('store_extend_response', {
        success: false,
        error: storeSettings.closedReason || 'Mağazamız şu anda hizmete kapalıdır.',
      });
    }

    const lic = issuedLicenses.get(licenseId);
    if (!lic || lic.assignedUsername.toLowerCase() !== user.username.toLowerCase()) {
      return socket.emit('store_extend_response', { success: false, error: 'Lisans bulunamadı veya bu lisans size ait değil.' });
    }

    if (lic.status === 'revoked') {
      return socket.emit('store_extend_response', { success: false, error: 'İptal edilmiş lisansların süresi uzatılamaz.' });
    }

    const rawDays = Number(addDays);
    const allowedDays = [30, 90, 180, 365, -1];
    if (!Number.isFinite(rawDays) || (!allowedDays.includes(rawDays) && rawDays < 1)) {
      return socket.emit('store_extend_response', { success: false, error: 'Geçersiz süre uzatma değeri.' });
    }
    const days = rawDays === -1 ? -1 : Math.floor(rawDays);
    const baseMonthlyPrice = Math.round(lic.maxSlots * (storeSettings.customSlotUnitPrice || 4));
    let rawPrice: number;
    if (days === 30) rawPrice = baseMonthlyPrice;
    else if (days === 90) rawPrice = Math.round(baseMonthlyPrice * 2.7);
    else if (days === 180) rawPrice = Math.round(baseMonthlyPrice * 5.2);
    else if (days === 365) rawPrice = Math.round(baseMonthlyPrice * 9.5);
    else if (days === -1) rawPrice = Math.round(baseMonthlyPrice * 20);
    else rawPrice = Math.round(baseMonthlyPrice * (days / 30));

    const finalPrice = Math.max(1, Math.round(rawPrice * (1 - (storeSettings.discountPercentage || 0) / 100)));

    const selectedMethod = (paymentMethod || 'wallet') as 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
    const methodConfig = storeSettings.paymentMethods.find((m) => m.id === selectedMethod);
    if (!methodConfig || !methodConfig.enabled) {
      return socket.emit('store_extend_response', { success: false, error: 'Seçilen ödeme yöntemi aktif değildir.' });
    }

    if (selectedMethod !== 'wallet') {
      return socket.emit('store_extend_response', {
        success: false,
        error: 'Süre uzatma işlemi şu an yalnızca cüzdan bakiyesi ile yapılabilmektedir. Lütfen cüzdanınıza bakiye yükleyiniz veya yönetici ile iletişime geçiniz.',
      });
    }

    const account = registeredAccounts.get(user.username.toLowerCase());
    if (!account || account.walletBalance < finalPrice) {
      return socket.emit('store_extend_response', {
        success: false,
        error: `Yetersiz bakiye! Gereken: ${finalPrice} ${storeSettings.currencySymbol}, Mevcut Cüzdan: ${account?.walletBalance ?? 0} ${storeSettings.currencySymbol}`,
      });
    }
    account.walletBalance -= finalPrice;
    user.walletBalance = account.walletBalance;
    saveAccounts(registeredAccounts);
    socket.emit('user_updated', user);

    let newExpiresAt: string;
    if (days === -1) {
      newExpiresAt = 'lifetime';
    } else {
      const currentExpiry =
        lic.expiresAt === 'lifetime' || lic.expiresAt.startsWith('2099')
          ? Date.now()
          : new Date(lic.expiresAt).getTime();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const newLicenseKey = generateLicenseKey(lic.licensee, lic.maxSlots, newExpiresAt, lic.tier);
    lic.licenseKey = newLicenseKey;
    lic.expiresAt = newExpiresAt;
    if (lic.status === 'expired') {
      lic.status = 'active';
    }
    saveLicenses(issuedLicenses);

    addAuditLog(
      'LISANS_MAGAZA_UZATILDI',
      `${user.username} adlı kullanıcı "${lic.licensee}" lisansını ${days === -1 ? 'Ömür Boyu' : '+' + days + ' gün'} uzattı (${finalPrice} ${storeSettings.currencySymbol} - ${methodConfig.name})`,
      'info'
    );

    socket.emit('store_extend_response', { success: true, license: lic });

    const userLics = Array.from(issuedLicenses.values()).filter(
      (l) => l.assignedUsername.toLowerCase() === user.username.toLowerCase()
    );
    socket.emit('my_licenses_response', userLics);
    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  });

  // Get user's own licenses
  socket.on('get_my_licenses', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const userLics = Array.from(issuedLicenses.values()).filter(
      (l) => l.assignedUsername.toLowerCase() === user.username.toLowerCase()
    );
    socket.emit('my_licenses_response', userLics);
  });
}
