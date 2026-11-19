import React, { useState } from 'react';
import {
  Building2,
  Check,
  Coins,
  CreditCard,
  Percent,
  RotateCcw,
  ShoppingBag,
  Tag,
  Wallet,
} from 'lucide-react';
import type { StoreSettings } from '../../types';
import type { AdminStoreFormController } from './useAdminStoreForm';

interface AdminStoreTabProps {
  form: AdminStoreFormController;
  onUpdateStoreSettings: (settings: StoreSettings) => void;
}

export const AdminStoreTab: React.FC<AdminStoreTabProps> = ({ form, onUpdateStoreSettings }) => {
  const [storeSavedNotice, setStoreSavedNotice] = useState(false);
  const { fields, isStoreDirty, setIsStoreDirty, discardChanges, buildPayload } = form;

  const saveStore = () => {
    onUpdateStoreSettings(buildPayload());
    setIsStoreDirty(false);
    setStoreSavedNotice(true);
    setTimeout(() => setStoreSavedNotice(false), 3000);
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveStore();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-16 relative">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            Lisans Mağazası &amp; Fiyatlandırma Yönetimi
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Mağazayı satışa açıp kapatabilir, paket fiyatlarını, slot limitlerini, indirim oranlarını ve ödeme
            yöntemlerini yönetebilirsiniz.
          </p>
        </div>

        {storeSavedNotice && (
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
            <Check className="w-4 h-4 text-emerald-400" />
            Ayarlar Başarıyla Kaydedildi!
          </div>
        )}
      </div>

      <form onSubmit={handleSaveSubmit} onChange={() => setIsStoreDirty(true)} className="space-y-6">
        {/* 1. STORE OPEN/CLOSED MASTER SWITCH */}
        <div
          className={`p-5 rounded-3xl border transition ${
            fields.storeIsOpen
              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
              : 'bg-rose-500/10 border-rose-500/30 shadow-lg shadow-rose-500/10'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  fields.storeIsOpen ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'
                }`}
              >
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>Mağaza Satış Durumu:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      fields.storeIsOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {fields.storeIsOpen ? '🟢 SATIŞLAR AÇIK (AKTİF)' : '🔴 SATIŞA KAPALI (BAKIM MODU)'}
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">
                  {fields.storeIsOpen
                    ? 'Kullanıcılar mağazadan dedicated server lisansı satın alabilir.'
                    : 'Satışlar durdurulur, kullanıcılar yeni lisans alamaz ancak mevcut lisanslarını görüntüleyebilir.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                fields.setStoreIsOpen(!fields.storeIsOpen);
                setIsStoreDirty(true);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm shrink-0 ${
                fields.storeIsOpen
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400'
              }`}
            >
              {fields.storeIsOpen ? 'Satışları Durdur (Kapat)' : 'Satışa Aç (Aktifleştir)'}
            </button>
          </div>

          {!fields.storeIsOpen && (
            <div className="mt-4 pt-4 border-t border-rose-500/20">
              <label className="block text-[11px] font-semibold text-rose-300 uppercase mb-1">
                Kullanıcılara Gösterilecek Bakım / Kapalı Mesajı
              </label>
              <input
                type="text"
                value={fields.storeClosedReason}
                onChange={(e) => fields.setStoreClosedReason(e.target.value)}
                placeholder="Örn: Mağazamız planlı bakım çalışması nedeniyle geçici olarak hizmete kapalıdır."
                className="w-full bg-black/40 border border-rose-500/30 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/30"
              />
            </div>
          )}
        </div>

        {/* 2. PACKAGES & PRICING */}
        <div className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-400" />
              Paket Fiyatlandırması ve Slot Ayarları
            </h4>
            <span className="text-[11px] text-white/40">Para Birimi: ₺ Türk Lirası</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Starter (Başlangıç)</span>
                <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields.starterEnabled}
                    onChange={(e) => fields.setStarterEnabled(e.target.checked)}
                    className="rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0"
                  />
                  Satışta
                </label>
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase mb-1">Aylık Fiyat (₺)</label>
                <input
                  type="number"
                  min="1"
                  value={fields.starterPrice}
                  onChange={(e) => fields.setStarterPrice(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase mb-1">Varsayılan Slot</label>
                <input
                  type="number"
                  min="4"
                  value={fields.starterSlots}
                  onChange={(e) => fields.setStarterSlots(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300">Klan Pro (Önerilen)</span>
                <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields.proEnabled}
                    onChange={(e) => fields.setProEnabled(e.target.checked)}
                    className="rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0"
                  />
                  Satışta
                </label>
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase mb-1">Aylık Fiyat (₺)</label>
                <input
                  type="number"
                  min="1"
                  value={fields.proPrice}
                  onChange={(e) => fields.setProPrice(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase mb-1">Varsayılan Slot</label>
                <input
                  type="number"
                  min="4"
                  value={fields.proSlots}
                  onChange={(e) => fields.setProSlots(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300">Enterprise (Büyük)</span>
                <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields.enterpriseEnabled}
                    onChange={(e) => fields.setEnterpriseEnabled(e.target.checked)}
                    className="rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0"
                  />
                  Satışta
                </label>
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase mb-1">Aylık Fiyat (₺)</label>
                <input
                  type="number"
                  min="1"
                  value={fields.enterprisePrice}
                  onChange={(e) => fields.setEnterprisePrice(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/40 uppercase mb-1">Varsayılan Slot</label>
                <input
                  type="number"
                  min="4"
                  value={fields.enterpriseSlots}
                  onChange={(e) => fields.setEnterpriseSlots(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
            <div>
              <div className="text-xs font-semibold text-white">Özel Konfigüratör Slot Başına Taban Fiyat</div>
              <div className="text-[10px] text-white/40">
                Kullanıcı kendi slot sayısını belirlerken 1 slot için hesaplanacak birim ücret
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-300 font-mono">₺</span>
              <input
                type="number"
                min="1"
                max="50"
                value={fields.customSlotUnitPrice}
                onChange={(e) => fields.setCustomSlotUnitPrice(Number(e.target.value))}
                className="w-20 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs font-mono font-bold text-center outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-[11px] text-white/40">/ slot</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div>
              <div className="text-xs font-bold text-white">Süre &amp; Yıllık Fiyatlandırma Çarpanları</div>
              <div className="text-[10px] text-white/45">
                Aylık paket fiyatı × çarpan = dönem toplam fiyatı (örn. Yıllık 8x = 4 ay ücretsiz!)
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-black/25 border border-white/5">
                <label className="block text-[10px] text-white/50 mb-1">3 Aylık (90 Gün)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="20"
                  value={fields.mult90}
                  onChange={(e) => fields.setMult90(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div className="p-3 rounded-xl bg-black/25 border border-white/5">
                <label className="block text-[10px] text-white/50 mb-1">6 Aylık (180 Gün)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="30"
                  value={fields.mult180}
                  onChange={(e) => fields.setMult180(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                <label className="block text-[10px] text-amber-300 font-bold mb-1">1 Yıllık (365 Gün)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="50"
                  value={fields.mult365}
                  onChange={(e) => fields.setMult365(Number(e.target.value))}
                  className="w-full bg-black/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-amber-200 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                />
                <div className="text-[9px] text-amber-300/70 mt-1">
                  Pro Yıllık: ₺{Math.round(fields.proPrice * (fields.mult365 || 8))}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/25 border border-white/5">
                <label className="block text-[10px] text-white/50 mb-1">Ömür Boyu (Lifetime)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="100"
                  value={fields.multLifetime}
                  onChange={(e) => fields.setMultLifetime(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-white">Ömür Boyu (Lifetime) Satışı</div>
                  <div className="text-[10px] text-white/40">
                    Kapatıldığında mağazada yalnızca süreli planlar görünür
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={fields.allowLifetimePurchase}
                  onChange={(e) => fields.setAllowLifetimePurchase(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-amber-500"
                />
              </label>
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                <div>
                  <div className="text-xs font-semibold text-white">Lisans Uzatma İndirimi (%)</div>
                  <div className="text-[10px] text-white/40">Mevcut lisansını yenileyenlere ek indirim</div>
                </div>
                <input
                  type="number"
                  min="0"
                  max="75"
                  value={fields.renewalDiscountPercentage}
                  onChange={(e) => fields.setRenewalDiscountPercentage(Number(e.target.value))}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-mono font-bold text-center outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. CAMPAIGN & DISCOUNT MODULE */}
        <div className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Percent className="w-4 h-4 text-emerald-400" />
              Kampanya, İndirim &amp; Duyuru Bannerı
            </h4>
            {fields.discountPercentage > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                %{fields.discountPercentage} AKTİF İNDİRİM
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                Genel İndirim Oranı (% 0 - 90)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={fields.discountPercentage}
                  onChange={(e) => fields.setDiscountPercentage(Number(e.target.value))}
                  className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-xs text-white/50">% İndirim</span>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                Mağazada Gözükecek Kampanya Banner Metni
              </label>
              <input
                type="text"
                value={fields.campaignBanner}
                onChange={(e) => fields.setCampaignBanner(e.target.value)}
                placeholder="Örn: 🔥 Lansmana Özel Tüm Dedicated Lisanslarda %15 İndirim!"
                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-white/20"
              />
            </div>
          </div>
        </div>

        {/* 4. PAYMENT METHODS CONFIGURATION */}
        <div className="p-6 rounded-3xl ios-glass-card border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              Aktif Ödeme Yöntemleri
            </h4>
            <span className="text-[11px] text-white/40">Kullanıcıların ödeme yapabileceği kanallar</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: 'wallet',
                title: 'Cüzdan Bakiyesi',
                enabled: fields.payWallet,
                setEnabled: fields.setPayWallet,
                desc: fields.payWalletDesc,
                setDesc: fields.setPayWalletDesc,
                icon: <Wallet className="w-4 h-4" />,
                iconBg: 'bg-blue-500/20 text-blue-400',
              },
              {
                id: 'credit_card',
                title: 'Kredi / Banka Kartı',
                enabled: fields.payCard,
                setEnabled: fields.setPayCard,
                desc: fields.payCardDesc,
                setDesc: fields.setPayCardDesc,
                icon: <CreditCard className="w-4 h-4" />,
                iconBg: 'bg-emerald-500/20 text-emerald-400',
              },
              {
                id: 'bank_transfer',
                title: 'Havale / FAST / EFT',
                enabled: fields.payBank,
                setEnabled: fields.setPayBank,
                desc: fields.payBankDesc,
                setDesc: fields.setPayBankDesc,
                icon: <Building2 className="w-4 h-4" />,
                iconBg: 'bg-purple-500/20 text-purple-400',
              },
              {
                id: 'crypto',
                title: 'Kripto Para (USDT/BTC)',
                enabled: fields.payCrypto,
                setEnabled: fields.setPayCrypto,
                desc: fields.payCryptoDesc,
                setDesc: fields.setPayCryptoDesc,
                icon: <Coins className="w-4 h-4" />,
                iconBg: 'bg-amber-500/20 text-amber-400',
              },
            ].map((pm) => (
              <div
                key={pm.id}
                className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                  pm.enabled ? 'bg-white/[0.04] border-emerald-500/30' : 'bg-black/25 border-white/5 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${pm.iconBg}`}>
                      {pm.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{pm.title}</div>
                      <div
                        className={`text-[10px] font-semibold ${
                          pm.enabled ? 'text-emerald-400' : 'text-white/40'
                        }`}
                      >
                        {pm.enabled ? 'Aktif (Kullanıcılar seçebilir)' : 'Devre Dışı'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pm.enabled}
                    onClick={() => {
                      pm.setEnabled(!pm.enabled);
                      setIsStoreDirty(true);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      pm.enabled ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                        pm.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <input
                  type="text"
                  value={pm.desc}
                  onChange={(e) => {
                    pm.setDesc(e.target.value);
                    setIsStoreDirty(true);
                  }}
                  placeholder="Kullanıcıya gösterilecek açıklama / IBAN / cüzdan..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-black font-bold text-xs rounded-2xl transition shadow-xl shadow-amber-500/25 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Mağaza Ayarlarını Kaydet &amp; Canlıya Al
          </button>
        </div>
      </form>

      {/* Sticky Unsaved Store Changes Bar */}
      {isStoreDirty && (
        <div className="sticky bottom-0 z-20 p-3.5 rounded-2xl bg-[#151822]/95 backdrop-blur-xl border border-amber-400/40 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-200">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>Kaydedilmemiş mağaza değişiklikleri var</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Vazgeç
            </button>
            <button
              type="button"
              onClick={saveStore}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/25 transition"
            >
              <Check className="w-3.5 h-3.5" />
              Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
