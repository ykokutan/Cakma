import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  ShoppingBag,
  Key,
  Check,
  Copy,
  Sparkles,
  Server,
  Zap,
  AlertCircle,
  X,
  HelpCircle,
  Wallet,
  CreditCard,
  Building2,
  Coins,
  Ban,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';
import { IssuedLicense } from '../types';

interface LicenseStoreModalProps {
  onClose: () => void;
}

export const LicenseStoreModal: React.FC<LicenseStoreModalProps> = ({ onClose }) => {
  const {
    currentUser,
    myLicenses,
    fetchMyLicenses,
    storePurchaseLicense,
    storeExtendLicense,
    storeSettings,
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'store' | 'my_licenses' | 'guide'>('store');
  const [selectedTier, setSelectedTier] = useState<'Starter' | 'Pro' | 'Enterprise'>('Pro');
  const [slots, setSlots] = useState<number>(64);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [serverName, setServerName] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'wallet' | 'credit_card' | 'bank_transfer' | 'crypto'>('wallet');
  const [cardNumber, setCardNumber] = useState<string>('4543 •••• •••• 9821');
  const [cardExpiry, setCardExpiry] = useState<string>('12/28');
  const [cardCvc, setCardCvc] = useState<string>('842');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [purchasedLicense, setPurchasedLicense] = useState<IssuedLicense | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // User License Extension State
  const [extendingLicense, setExtendingLicense] = useState<IssuedLicense | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extendPaymentMethod, setExtendPaymentMethod] = useState<'wallet' | 'credit_card' | 'bank_transfer' | 'crypto'>('wallet');
  const [extendLoading, setExtendLoading] = useState<boolean>(false);
  const [extendError, setExtendError] = useState<string>('');
  const [extendSuccess, setExtendSuccess] = useState<string>('');

  useEffect(() => {
    fetchMyLicenses();
  }, []);

  // Set default slots based on tier
  useEffect(() => {
    if (storeSettings?.packages) {
      if (selectedTier === 'Starter') setSlots(storeSettings.packages.starter.slots || 16);
      else if (selectedTier === 'Pro') setSlots(storeSettings.packages.pro.slots || 64);
      else if (selectedTier === 'Enterprise') setSlots(storeSettings.packages.enterprise.slots || 256);
    }
  }, [selectedTier, storeSettings]);

  // Dynamic price calculation
  const calculatePrice = (s: number, d: number, t: 'Starter' | 'Pro' | 'Enterprise') => {
    let base = 99;
    if (storeSettings) {
      if (t === 'Starter') base = storeSettings.packages.starter.price;
      else if (t === 'Pro') base = storeSettings.packages.pro.price;
      else if (t === 'Enterprise') base = storeSettings.packages.enterprise.price;
      else base = s * (storeSettings.customSlotUnitPrice || 4);
    } else {
      if (s === 32) base = 169;
      else if (s === 64) base = 249;
      else if (s === 128) base = 399;
      else if (s >= 512) base = 799;
    }

    const mults = storeSettings?.durationMultipliers || { days90: 2.5, days180: 4.5, days365: 8, lifetime: 12 };
    let mult = 1;
    if (d === 90) mult = mults.days90 ?? 2.5;
    else if (d === 180) mult = mults.days180 ?? 4.5;
    else if (d === 365) mult = mults.days365 ?? 8;
    else if (d === -1) mult = mults.lifetime ?? 12;

    let total = Math.round(base * mult);
    if (storeSettings && storeSettings.discountPercentage > 0) {
      total = Math.max(1, Math.round(total * (1 - storeSettings.discountPercentage / 100)));
    }
    return total;
  };

  const currentPrice = calculatePrice(slots, durationDays, selectedTier);

  const handleSelectPackage = (t: 'Starter' | 'Pro' | 'Enterprise', s: number) => {
    setSelectedTier(t);
    setSlots(s);
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const res = await storePurchaseLicense({
        serverName: serverName.trim() || `${currentUser?.username || 'Topluluk'} Ses Sunucusu`,
        maxSlots: slots,
        expireDays: durationDays,
        tier: selectedTier,
        paymentMethod: selectedPaymentMethod,
      });

      if (res.success && res.license) {
        setPurchasedLicense(res.license);
        fetchMyLicenses();
      } else {
        setErrorMessage(res.error || 'Satın alma işlemi tamamlanamadı.');
      }
    } catch {
      setErrorMessage('Sunucuya bağlanırken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const calculateExtendPrice = (license: IssuedLicense, days: number) => {
    const baseMonthlyPrice = Math.round(license.maxSlots * (storeSettings?.customSlotUnitPrice || 4));
    let rawPrice = 0;
    if (days === 30) rawPrice = baseMonthlyPrice;
    else if (days === 90) rawPrice = Math.round(baseMonthlyPrice * 2.7);
    else if (days === 180) rawPrice = Math.round(baseMonthlyPrice * 5.2);
    else if (days === 365) rawPrice = Math.round(baseMonthlyPrice * 9.5);
    else if (days === -1) rawPrice = Math.round(baseMonthlyPrice * 20);
    else rawPrice = Math.round(baseMonthlyPrice * (days / 30));

    if (storeSettings && storeSettings.discountPercentage > 0) {
      rawPrice = Math.max(1, Math.round(rawPrice * (1 - storeSettings.discountPercentage / 100)));
    }
    return rawPrice;
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingLicense) return;
    setExtendError('');
    setExtendSuccess('');
    setExtendLoading(true);

    try {
      const res = await storeExtendLicense({
        licenseId: extendingLicense.id,
        addDays: extendDays,
        paymentMethod: extendPaymentMethod,
      });

      if (res.success && res.license) {
        setExtendSuccess(`Lisans süresi başarıyla ${extendDays === -1 ? 'Ömür Boyu yapıldı' : extendDays + ' gün uzatıldı'}!`);
        fetchMyLicenses();
        setTimeout(() => {
          setExtendingLicense(null);
          setExtendSuccess('');
        }, 1500);
      } else {
        setExtendError(res.error || 'Süre uzatma işlemi başarısız oldu.');
      }
    } catch {
      setExtendError('Sunucu bağlantısı sırasında bir hata oluştu.');
    } finally {
      setExtendLoading(false);
    }
  };

  const isStoreOpen = storeSettings?.isOpen ?? true;
  const availablePaymentMethods = storeSettings?.paymentMethods
    ? storeSettings.paymentMethods.filter((m) => m.enabled)
    : [{ id: 'wallet', name: 'Cüzdan Bakiyesi', enabled: true, icon: 'Wallet', description: 'Hesap bakiyesinden anında onay.' }];

  const isStarterEnabled = storeSettings?.packages?.starter?.enabled ?? true;
  const isProEnabled = storeSettings?.packages?.pro?.enabled ?? true;
  const isEnterpriseEnabled = storeSettings?.packages?.enterprise?.enabled ?? true;

  useEffect(() => {
    if (availablePaymentMethods.length > 0) {
      if (!availablePaymentMethods.some((m) => m.id === selectedPaymentMethod)) {
        setSelectedPaymentMethod(availablePaymentMethods[0].id as any);
      }
      if (!availablePaymentMethods.some((m) => m.id === extendPaymentMethod)) {
        setExtendPaymentMethod(availablePaymentMethods[0].id as any);
      }
    }
  }, [storeSettings]);

  useEffect(() => {
    if (selectedTier === 'Starter' && !isStarterEnabled) {
      if (isProEnabled) setSelectedTier('Pro');
      else if (isEnterpriseEnabled) setSelectedTier('Enterprise');
    } else if (selectedTier === 'Pro' && !isProEnabled) {
      if (isStarterEnabled) setSelectedTier('Starter');
      else if (isEnterpriseEnabled) setSelectedTier('Enterprise');
    } else if (selectedTier === 'Enterprise' && !isEnterpriseEnabled) {
      if (isProEnabled) setSelectedTier('Pro');
      else if (isStarterEnabled) setSelectedTier('Starter');
    }
  }, [isStarterEnabled, isProEnabled, isEnterpriseEnabled, selectedTier]);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-3xl flex items-center justify-center p-4">
      <div className="w-full max-w-4xl ios-glass rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-emerald-500/30 h-[660px] relative">
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Dedicated Sunucu Mağazası</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  LİSANS MARKETİ
                </span>
                {!isStoreOpen && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-extrabold border border-rose-500/30 flex items-center gap-1">
                    <Ban className="w-3 h-3" />
                    BAKIMDA
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/50">
                Kendi VPS/VDS sunucunuzda TeamSpeak 6 benzeri yüksek kaliteli ses sunucusu açmak için lisans satın alın.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* User Wallet Balance */}
            <div className="px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2 text-xs">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white/60">Bakiye:</span>
              <span className="font-extrabold text-emerald-400 font-mono">
                ₺{currentUser?.walletBalance ?? 1000}
              </span>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Navigation Pills */}
        <div className="px-6 py-2.5 bg-black/20 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setActiveTab('store'); setPurchasedLicense(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'store'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Lisans Paketleri & Satın Al
          </button>

          <button
            onClick={() => setActiveTab('my_licenses')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'my_licenses'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Satın Aldığım Lisanslar ({myLicenses.length})
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Kurulum & Sunucu Açma Rehberi
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* TAB 1: STORE PACKAGES */}
          {activeTab === 'store' && !purchasedLicense && (
            <div className="space-y-6">
              {/* Campaign Announcement Banner */}
              {storeSettings?.campaignBanner && isStoreOpen && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-emerald-500/15 border border-amber-500/40 text-white flex items-center justify-between shadow-lg shadow-amber-500/10">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-xs font-bold text-amber-200">
                      {storeSettings.campaignBanner}
                    </span>
                  </div>
                  {storeSettings.discountPercentage > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-black font-extrabold text-[10px] shadow">
                      %{storeSettings.discountPercentage} İNDİRİM
                    </span>
                  )}
                </div>
              )}

              {/* STORE CLOSED / MAINTENANCE VIEW */}
              {!isStoreOpen ? (
                <div className="p-12 rounded-3xl ios-glass-card border border-rose-500/30 text-center space-y-4 max-w-lg mx-auto my-6">
                  <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 shadow-xl shadow-rose-500/20">
                    <Ban className="w-8 h-8" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-bold text-white">Mağazamız Geçici Olarak Kapalıdır</h3>
                    <p className="text-xs text-white/60 leading-relaxed">
                      {storeSettings?.closedReason || 'Planlı bakım veya güncelleme nedeniyle yeni lisans satışları geçici olarak durdurulmuştur.'}
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center gap-3">
                    <button
                      onClick={() => setActiveTab('my_licenses')}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                    >
                      Mevcut Lisanslarımı Gör
                    </button>
                    <button
                      onClick={() => setActiveTab('guide')}
                      className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold transition"
                    >
                      Kurulum Rehberi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {errorMessage && (
                    <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center gap-2.5 text-red-300 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Ready Tier Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Starter */}
                    <div
                      onClick={() => isStarterEnabled && handleSelectPackage('Starter', storeSettings?.packages?.starter?.slots || 16)}
                      className={`p-5 rounded-3xl border transition flex flex-col justify-between relative ${
                        !isStarterEnabled
                          ? 'border-white/5 bg-black/30 opacity-50 cursor-not-allowed'
                          : selectedTier === 'Starter'
                          ? 'border-emerald-400 bg-emerald-500/15 shadow-xl shadow-emerald-500/15 scale-[1.02] cursor-pointer'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 cursor-pointer'
                      }`}
                    >
                      {!isStarterEnabled && (
                        <div className="absolute -top-3 right-5 px-3 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[10px] shadow-md">
                          SATIŞA KAPALI
                        </div>
                      )}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold font-mono">
                            {storeSettings?.packages?.starter?.slots || 16}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                            BAŞLANGIÇ
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white">
                            {storeSettings?.packages?.starter?.name || 'Starter Topluluk'}
                          </h3>
                          <p className="text-xs text-white/50 mt-0.5">
                            {storeSettings?.packages?.starter?.description || 'Küçük arkadaş grupları & oyun ekipleri için ideal.'}
                          </p>
                        </div>

                        <div className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
                          ₺{storeSettings?.packages?.starter?.price || 99}
                          <span className="text-xs font-normal text-white/40">/ ay</span>
                        </div>

                        <ul className="text-xs text-white/70 space-y-2 pt-2 border-t border-white/[0.06]">
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span><b>{storeSettings?.packages?.starter?.slots || 16} Kişilik</b> Slot Kapasitesi</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Düşük Gecikmeli WebRTC Ses</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Sınırsız Metin & Ses Kanalı</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Klan Pro */}
                    <div
                      onClick={() => isProEnabled && handleSelectPackage('Pro', storeSettings?.packages?.pro?.slots || 64)}
                      className={`p-5 rounded-3xl border transition flex flex-col justify-between relative ${
                        !isProEnabled
                          ? 'border-white/5 bg-black/30 opacity-50 cursor-not-allowed'
                          : selectedTier === 'Pro'
                          ? 'border-emerald-400 bg-emerald-500/20 shadow-xl shadow-emerald-500/20 scale-[1.02] cursor-pointer'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 cursor-pointer'
                      }`}
                    >
                      <div className={`absolute -top-3 right-5 px-3 py-0.5 rounded-full font-extrabold text-[10px] shadow-md ${
                        !isProEnabled ? 'bg-rose-500 text-white' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-black'
                      }`}>
                        {!isProEnabled ? 'SATIŞA KAPALI' : 'EN ÇOK TERCİH EDİLEN'}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-sm font-bold font-mono">
                            {storeSettings?.packages?.pro?.slots || 64}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                            PRO KLAN
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white">
                            {storeSettings?.packages?.pro?.name || 'Klan Pro'}
                          </h3>
                          <p className="text-xs text-white/50 mt-0.5">
                            {storeSettings?.packages?.pro?.description || 'E-Spor takımları, klanlar ve aktif topluluklar.'}
                          </p>
                        </div>

                        <div className="text-2xl font-black text-emerald-400 font-mono flex items-baseline gap-1">
                          ₺{storeSettings?.packages?.pro?.price || 249}
                          <span className="text-xs font-normal text-white/40">/ ay</span>
                        </div>

                        <ul className="text-xs text-white/70 space-y-2 pt-2 border-t border-white/[0.06]">
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span><b>{storeSettings?.packages?.pro?.slots || 64} Kişilik</b> Slot Kapasitesi</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Canlı Ekran Yayını & HD Video</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>DSP Gürültü Engelleme Destekli</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>7/24 Kesintisiz VPS Uyumlu</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Enterprise */}
                    <div
                      onClick={() => isEnterpriseEnabled && handleSelectPackage('Enterprise', storeSettings?.packages?.enterprise?.slots || 256)}
                      className={`p-5 rounded-3xl border transition flex flex-col justify-between relative ${
                        !isEnterpriseEnabled
                          ? 'border-white/5 bg-black/30 opacity-50 cursor-not-allowed'
                          : selectedTier === 'Enterprise'
                          ? 'border-emerald-400 bg-emerald-500/15 shadow-xl shadow-emerald-500/15 scale-[1.02] cursor-pointer'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 cursor-pointer'
                      }`}
                    >
                      {!isEnterpriseEnabled && (
                        <div className="absolute -top-3 right-5 px-3 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[10px] shadow-md">
                          SATIŞA KAPALI
                        </div>
                      )}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center text-sm font-bold font-mono">
                            {storeSettings?.packages?.enterprise?.slots || 256}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                            ENTERPRISE
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white">
                            {storeSettings?.packages?.enterprise?.name || 'Mega Enterprise'}
                          </h3>
                          <p className="text-xs text-white/50 mt-0.5">
                            {storeSettings?.packages?.enterprise?.description || 'Büyük yayıncılar & binlerce üyeli dev topluluklar.'}
                          </p>
                        </div>

                        <div className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
                          ₺{storeSettings?.packages?.enterprise?.price || 799}
                          <span className="text-xs font-normal text-white/40">/ ay</span>
                        </div>

                        <ul className="text-xs text-white/70 space-y-2 pt-2 border-t border-white/[0.06]">
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span><b>{storeSettings?.packages?.enterprise?.slots || 256} Kişilik</b> Devasa Kapasite</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Maksimum WebRTC Hat Bant Genişliği</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Özel Sunucu Rozeti & Öncelikli Destek</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Order & Customization Box */}
                  <form onSubmit={handlePurchase} className="p-5 rounded-3xl ios-glass-card border border-white/10 space-y-5">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Sipariş Detayları & Yapılandırma
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                          Sunucu / Topluluk Adı
                        </label>
                        <input
                          type="text"
                          required
                          value={serverName}
                          onChange={(e) => setServerName(e.target.value)}
                          placeholder="Örn: Anadolu Valorant Topluluğu"
                          className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-white/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                          Slot Kapasitesi
                        </label>
                        <select
                          value={slots}
                          onChange={(e) => setSlots(Number(e.target.value))}
                          className="w-full bg-[#181920] border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="16">16 Kişilik Slot</option>
                          <option value="32">32 Kişilik Slot</option>
                          <option value="64">64 Kişilik Slot (Pro)</option>
                          <option value="128">128 Kişilik Slot</option>
                          <option value="256">256 Kişilik Slot (Enterprise)</option>
                          <option value="512">512 Kişilik Slot (Mega)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                          Kullanım Süresi
                        </label>
                        <select
                          value={durationDays}
                          onChange={(e) => setDurationDays(Number(e.target.value))}
                          className="w-full bg-[#181920] border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="30">1 Ay (Standart)</option>
                          <option value="90">3 Ay (%15 İndirimli)</option>
                          <option value="180">6 Ay (%25 İndirimli)</option>
                          <option value="365">1 Yıl (En Avantajlı)</option>
                          {(storeSettings?.allowLifetimePurchase ?? true) && (
                            <option value="-1">Ömür Boyu (Lifetime)</option>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* PAYMENT METHOD SELECTOR */}
                    <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                      <label className="block text-[11px] font-semibold text-white/40 uppercase">
                        Ödeme Yöntemi Seçin:
                      </label>
                      {availablePaymentMethods.length === 0 ? (
                        <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                          Şu anda aktif bir ödeme yöntemi bulunmuyor. Lütfen yönetici ile iletişime geçin.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {availablePaymentMethods.map((method) => {
                              const isSelected = selectedPaymentMethod === method.id;
                              return (
                                <button
                                  key={method.id}
                                  type="button"
                                  onClick={() => setSelectedPaymentMethod(method.id as any)}
                                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 ${
                                    isSelected
                                      ? 'border-emerald-400 bg-emerald-500/20 text-white shadow-md shadow-emerald-500/10'
                                      : 'border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    {method.id === 'wallet' && <Wallet className="w-4 h-4 text-blue-400" />}
                                    {method.id === 'credit_card' && <CreditCard className="w-4 h-4 text-emerald-400" />}
                                    {method.id === 'bank_transfer' && <Building2 className="w-4 h-4 text-purple-400" />}
                                    {method.id === 'crypto' && <Coins className="w-4 h-4 text-amber-400" />}
                                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                  </div>
                                  <span className="text-xs font-bold block">{method.name}</span>
                                </button>
                              );
                            })}
                          </div>
                          {(() => {
                            const activeM = availablePaymentMethods.find((m) => m.id === selectedPaymentMethod);
                            if (!activeM?.description) return null;
                            return (
                              <div className="text-[11px] text-white/60 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2">
                                {activeM.description}
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {/* Payment Method Details Preview */}
                      {selectedPaymentMethod === 'credit_card' && (
                        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5 animate-fade-in">
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <span className="font-semibold flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              256-Bit SSL 3D Secure Kart Ödemesi
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">Simülasyon Aktif</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={cardNumber}
                              onChange={(e) => setCardNumber(e.target.value)}
                              placeholder="Kart Numarası"
                              className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none"
                            />
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={cardExpiry}
                                onChange={(e) => setCardExpiry(e.target.value)}
                                placeholder="AA/YY"
                                className="w-1/2 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white font-mono text-center outline-none"
                              />
                              <input
                                type="text"
                                value={cardCvc}
                                onChange={(e) => setCardCvc(e.target.value)}
                                placeholder="CVC"
                                className="w-1/2 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white font-mono text-center outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedPaymentMethod === 'bank_transfer' && (
                        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-1.5 text-xs animate-fade-in">
                          <div className="text-white/60">Banka: <b>Garanti BBVA / FAST</b></div>
                          <div className="font-mono text-amber-300 select-all">IBAN: TR56 0006 2000 0001 2345 6789 01</div>
                          <div className="text-[11px] text-white/40">Açıklama: <code className="text-emerald-400 font-mono">{currentUser?.username}_LISANS</code></div>
                        </div>
                      )}

                      {selectedPaymentMethod === 'crypto' && (
                        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-1.5 text-xs animate-fade-in">
                          <div className="text-white/60">Ağ: <b>USDT (TRC-20)</b></div>
                          <div className="font-mono text-amber-300 text-[11px] select-all break-all">TXYZ9876543210AntigravityNodeNetwork777</div>
                          <div className="text-[11px] text-white/40">Ödeme 1 onay sonrasında lisansınızı anında onaylar.</div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/50">Ödenecek Tutar:</span>
                        <span className="text-2xl font-black text-emerald-400 font-mono">
                          ₺{currentPrice}
                        </span>
                        {storeSettings && storeSettings.discountPercentage > 0 && (
                          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-bold">
                            %{storeSettings.discountPercentage} İndirimli
                          </span>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-black font-extrabold text-xs rounded-xl transition shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-40"
                      >
                        <Zap className="w-4 h-4 fill-current" />
                        {loading ? 'İşleniyor...' : 'Lisansı Hemen Satın Al'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}

          {/* SUCCESS SCREEN AFTER PURCHASE */}
          {activeTab === 'store' && purchasedLicense && (
            <div className="max-w-xl mx-auto space-y-5 text-center pt-2 animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white mx-auto shadow-2xl shadow-emerald-500/40">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-white">Lisansınız Başarıyla Oluşturuldu!</h3>
                <p className="text-xs text-white/50">
                  Satın aldığınız lisans hesabınıza kaydedildi. Aşağıdaki anahtarı kopyalayarak hemen sunucunuzu açabilirsiniz.
                </p>
              </div>

              <div className="p-5 rounded-3xl ios-glass-card border border-emerald-500/40 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{purchasedLicense.licensee}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    {purchasedLicense.maxSlots} SLOT ({purchasedLicense.tier})
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/50 uppercase mb-1">
                    Kriptografik Lisans Anahtarınız:
                  </label>
                  <div className="p-3 bg-black/60 rounded-xl border border-white/10 font-mono text-[11px] text-emerald-400 break-all select-all flex items-center justify-between gap-3">
                    <span>{purchasedLicense.licenseKey}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(purchasedLicense.licenseKey, purchasedLicense.id)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-xs flex items-center gap-1.5 shrink-0 transition"
                    >
                      {copiedKey === purchasedLicense.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === purchasedLicense.id ? 'Kopyalandı' : 'Kopyala'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    Nasıl Kullanacaksınız?
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    1. Proje ana klasöründeki <code>dedicated-server\server.config.json</code> dosyasını açın.<br />
                    2. <code>licenseKey</code> alanına bu anahtarı yapıştırın ve kaydedin.<br />
                    3. <code>start-dedicated-server.bat</code> dosyasını çalıştırın. Sunucunuz anında aktifleşecektir!
                  </p>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('my_licenses')}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition"
                >
                  Lisanslarım Sekmesine Git
                </button>
                <button
                  type="button"
                  onClick={() => setPurchasedLicense(null)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs transition"
                >
                  Yeni Lisans Al
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: MY LICENSES */}
          {activeTab === 'my_licenses' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Hesabınıza Kayıtlı Lisanslar ({myLicenses.length})
                </h3>
                <span className="text-xs text-white/40">Satın aldığınız veya adınıza atanan tüm sunucu lisansları</span>
              </div>

              {myLicenses.length === 0 ? (
                <div className="p-10 rounded-2xl ios-glass-card border border-white/10 text-center space-y-3">
                  <Key className="w-10 h-10 text-white/30 mx-auto" />
                  <div className="text-sm font-semibold text-white">Henüz Bir Lisansınız Bulunmuyor</div>
                  <p className="text-xs text-white/50 max-w-sm mx-auto">
                    Lisans Paketleri sekmesinden sunucunuz için hemen bir paket seçebilir veya yöneticiden adınıza lisans talep edebilirsiniz.
                  </p>
                  <button
                    onClick={() => setActiveTab('store')}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs transition"
                  >
                    Mağazaya Git
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {myLicenses.map((lic) => {
                    const isRevoked = lic.status === 'revoked';

                    return (
                      <div
                        key={lic.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isRevoked
                            ? 'bg-red-500/[0.04] border-red-500/20 opacity-75'
                            : 'ios-glass-card border-white/10'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{lic.licensee}</span>
                              {isRevoked ? (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                                  İPTAL EDİLDİ
                                </span>
                              ) : lic.status === 'pending_payment' ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                  ÖDEME BEKLİYOR
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  AKTİF
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold border border-purple-500/30">
                                {lic.tier} TIER
                              </span>
                            </div>

                            <div className="text-xs text-white/60 flex items-center gap-3">
                              <span>Kapasite: <b className="text-white/90">{lic.maxSlots} Slot</b></span>
                              <span>•</span>
                              <span>Veriliş: <b>{new Date(lic.issuedAt).toLocaleDateString('tr-TR')}</b></span>
                              <span>•</span>
                              <span>
                                Süre: <b>{lic.expiresAt === 'lifetime' ? 'Ömür Boyu (Lifetime)' : new Date(lic.expiresAt).toLocaleDateString('tr-TR')}</b>
                              </span>
                            </div>

                            {lic.activeServerHost && (
                              <div className="text-[11px] text-emerald-400 flex items-center gap-1 pt-1 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Çalıştığı Sunucu: <b>{lic.activeServerHost}</b>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isRevoked}
                              onClick={() => {
                                setExtendingLicense(lic);
                                setExtendDays(30);
                                setExtendError('');
                                setExtendSuccess('');
                              }}
                              className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs transition flex items-center gap-1.5 border border-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Lisans süresini uzat"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>Süreyi Uzat</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopy(lic.licenseKey, lic.id)}
                              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition flex items-center gap-1.5"
                            >
                              {copiedKey === lic.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedKey === lic.id ? 'Kopyalandı' : 'Anahtarı Kopyala'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INSTALLATION GUIDE */}
          {activeTab === 'guide' && (
            <div className="max-w-2xl mx-auto space-y-6 pt-2">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/30">
                  <Server className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Dedicated Ses Sunucusu Kurulum Rehberi</h3>
                <p className="text-xs text-white/50">
                  Lisansınızı kullanarak kendi sunucunuzu 3 adımda nasıl ayağa kaldıracağınızı öğrenin.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-2">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-300">1</span>
                    Sunucu Dosyalarını Hazırlayın
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed pl-8">
                    Proje içerisindeki <code>dedicated-server/</code> klasörü bağımsız, taşınabilir bir sunucu paketidir. Bu klasörü dilediğiniz bir Windows veya Linux VPS sunucuya kopyalayabilirsiniz.
                  </p>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-2">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-300">2</span>
                    Lisans Anahtarını Yapıştırın
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed pl-8">
                    <code>server.config.json</code> dosyasını açın. Satın aldığınız <code>licenseKey</code> değerini buraya yapıştırın ve sunucu adını dilediğiniz gibi belirleyin.
                  </p>
                </div>

                <div className="p-4 rounded-2xl ios-glass-card border border-white/10 space-y-2">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-300">3</span>
                    Sunucuyu Başlatın & Arkadaşlarınızı Çağırın
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed pl-8">
                    <code>start-dedicated-server.bat</code> dosyasına çift tıklayın. Sunucunuz kriptografik lisansını onaylar onaylamaz HD ses ve ekran yayını ile aktifleşecektir!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* USER LICENSE EXTENSION MODAL */}
      {extendingLicense && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg p-6 rounded-3xl ios-glass border border-emerald-500/40 shadow-2xl space-y-5 animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setExtendingLicense(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                <RotateCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Lisans Süresini Uzat</h3>
                <p className="text-xs text-white/50">{extendingLicense.licensee} ({extendingLicense.maxSlots} Slot - {extendingLicense.tier})</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1.5 text-xs">
              <div className="flex justify-between text-white/60">
                <span>Mevcut Geçerlilik Tarihi:</span>
                <span className="font-semibold text-amber-300">
                  {extendingLicense.expiresAt === 'lifetime'
                    ? 'Ömür Boyu (Lifetime)'
                    : new Date(extendingLicense.expiresAt).toLocaleDateString('tr-TR')}
                </span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Uzatma Sonrası Yeni Bitiş:</span>
                <span className="font-semibold text-emerald-400">
                  {extendDays === -1
                    ? 'Ömür Boyu (Lifetime)'
                    : new Date(
                        (extendingLicense.expiresAt === 'lifetime' ? Date.now() : Math.max(Date.now(), new Date(extendingLicense.expiresAt).getTime())) +
                        extendDays * 86400000
                      ).toLocaleDateString('tr-TR')}
                </span>
              </div>
            </div>

            {/* Duration Options */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/60 uppercase">Eklemek İstediğiniz Süre:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { days: 30, label: '+30 Gün (1 Ay)' },
                  { days: 90, label: '+90 Gün (3 Ay)' },
                  { days: 180, label: '+180 Gün (6 Ay)' },
                  { days: 365, label: '+365 Gün (1 Yıl)' },
                  { days: -1, label: '♾️ Ömür Boyu' }
                ].map((opt) => {
                  const price = calculateExtendPrice(extendingLicense, opt.days);
                  return (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setExtendDays(opt.days)}
                      className={`p-3 rounded-2xl border text-left transition ${
                        extendDays === opt.days
                          ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{opt.label}</div>
                      <div className="text-[11px] text-emerald-400 font-extrabold mt-1">
                        {price} {storeSettings?.currencySymbol || '₺'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/60 uppercase">Ödeme Yöntemi:</label>
              <div className="grid grid-cols-2 gap-2">
                {availablePaymentMethods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExtendPaymentMethod(m.id as any)}
                    className={`p-2.5 rounded-xl border text-left text-xs transition flex items-center gap-2 ${
                      extendPaymentMethod === m.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {m.id === 'wallet' && <Wallet className="w-4 h-4 text-emerald-400" />}
                    {m.id === 'credit_card' && <CreditCard className="w-4 h-4 text-blue-400" />}
                    {m.id === 'bank_transfer' && <Building2 className="w-4 h-4 text-amber-400" />}
                    {m.id === 'crypto' && <Coins className="w-4 h-4 text-purple-400" />}
                    <div>
                      <div className="font-bold text-white">{m.name}</div>
                      {m.id === 'wallet' && currentUser && (
                        <div className="text-[10px] text-emerald-400/80">
                          Bakiye: ₺{currentUser.walletBalance ?? 0}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Total & Feedback */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-white/50 block">Ödenecek Tutar</span>
                <span className="text-lg font-black text-emerald-400">
                  {calculateExtendPrice(extendingLicense, extendDays)} {storeSettings?.currencySymbol || '₺'}
                </span>
              </div>
              {storeSettings && storeSettings.discountPercentage > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 text-[10px] font-extrabold border border-red-500/30">
                  %{storeSettings.discountPercentage} KAMPANYA İNDİRİMİ
                </span>
              )}
            </div>

            {extendError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{extendError}</span>
              </div>
            )}

            {extendSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{extendSuccess}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setExtendingLicense(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/50 hover:text-white transition"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={extendLoading}
                onClick={handleExtendSubmit}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-black text-xs font-extrabold transition shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                {extendLoading ? 'İşleniyor...' : 'Ödemeyi Yap ve Süreyi Uzat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};