import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreSettings } from '../../types';

export function useAdminStoreForm(serverStoreSettings?: StoreSettings | null) {
  const [storeIsOpen, setStoreIsOpen] = useState<boolean>(true);
  const [storeClosedReason, setStoreClosedReason] = useState<string>('');
  const [starterPrice, setStarterPrice] = useState<number>(99);
  const [starterSlots, setStarterSlots] = useState<number>(16);
  const [starterEnabled, setStarterEnabled] = useState<boolean>(true);
  const [proPrice, setProPrice] = useState<number>(249);
  const [proSlots, setProSlots] = useState<number>(64);
  const [proEnabled, setProEnabled] = useState<boolean>(true);
  const [enterprisePrice, setEnterprisePrice] = useState<number>(799);
  const [enterpriseSlots, setEnterpriseSlots] = useState<number>(256);
  const [enterpriseEnabled, setEnterpriseEnabled] = useState<boolean>(true);
  const [customSlotUnitPrice, setCustomSlotUnitPrice] = useState<number>(4);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [campaignBanner, setCampaignBanner] = useState<string>('');
  const [mult90, setMult90] = useState<number>(2.5);
  const [mult180, setMult180] = useState<number>(4.5);
  const [mult365, setMult365] = useState<number>(8);
  const [multLifetime, setMultLifetime] = useState<number>(12);
  const [allowLifetimePurchase, setAllowLifetimePurchase] = useState<boolean>(true);
  const [renewalDiscountPercentage, setRenewalDiscountPercentage] = useState<number>(0);
  const [payWallet, setPayWallet] = useState<boolean>(true);
  const [payWalletDesc, setPayWalletDesc] = useState<string>('Hesabınızdaki bakiye ile anında onay.');
  const [payCard, setPayCard] = useState<boolean>(true);
  const [payCardDesc, setPayCardDesc] = useState<string>('3D Secure korumalı güvenli kart ödemesi.');
  const [payBank, setPayBank] = useState<boolean>(true);
  const [payBankDesc, setPayBankDesc] = useState<string>('7/24 Anında banka transferi ile manuel onay.');
  const [payCrypto, setPayCrypto] = useState<boolean>(false);
  const [payCryptoDesc, setPayCryptoDesc] = useState<string>('TRC20 / ERC20 ağı ile anonim hızlı ödeme.');
  const [isStoreDirty, setIsStoreDirty] = useState<boolean>(false);
  const initializedRef = useRef<boolean>(false);

  const syncFromServer = useCallback((s: StoreSettings) => {
    setStoreIsOpen(s.isOpen);
    setStoreClosedReason(s.closedReason || '');
    setStarterPrice(s.packages?.starter?.price ?? 99);
    setStarterSlots(s.packages?.starter?.slots ?? 16);
    setStarterEnabled(s.packages?.starter?.enabled ?? true);
    setProPrice(s.packages?.pro?.price ?? 249);
    setProSlots(s.packages?.pro?.slots ?? 64);
    setProEnabled(s.packages?.pro?.enabled ?? true);
    setEnterprisePrice(s.packages?.enterprise?.price ?? 799);
    setEnterpriseSlots(s.packages?.enterprise?.slots ?? 256);
    setEnterpriseEnabled(s.packages?.enterprise?.enabled ?? true);
    setCustomSlotUnitPrice(s.customSlotUnitPrice ?? 4);
    setDiscountPercentage(s.discountPercentage ?? 0);
    setCampaignBanner(s.campaignBanner ?? '');
    setMult90(s.durationMultipliers?.days90 ?? 2.5);
    setMult180(s.durationMultipliers?.days180 ?? 4.5);
    setMult365(s.durationMultipliers?.days365 ?? 8);
    setMultLifetime(s.durationMultipliers?.lifetime ?? 12);
    setAllowLifetimePurchase(s.allowLifetimePurchase ?? true);
    setRenewalDiscountPercentage(s.renewalDiscountPercentage ?? 0);

    const mWallet = s.paymentMethods?.find((m) => m.id === 'wallet');
    const mCard = s.paymentMethods?.find((m) => m.id === 'credit_card');
    const mBank = s.paymentMethods?.find((m) => m.id === 'bank_transfer');
    const mCrypto = s.paymentMethods?.find((m) => m.id === 'crypto');
    setPayWallet(mWallet ? mWallet.enabled : true);
    setPayWalletDesc(mWallet?.description || 'Hesabınızdaki bakiye ile anında onay.');
    setPayCard(mCard ? mCard.enabled : true);
    setPayCardDesc(mCard?.description || '3D Secure korumalı güvenli kart ödemesi.');
    setPayBank(mBank ? mBank.enabled : true);
    setPayBankDesc(mBank?.description || '7/24 Anında banka transferi ile manuel onay.');
    setPayCrypto(mCrypto ? mCrypto.enabled : false);
    setPayCryptoDesc(mCrypto?.description || 'TRC20 / ERC20 ağı ile anonim hızlı ödeme.');
  }, []);

  useEffect(() => {
    if (serverStoreSettings && (!initializedRef.current || !isStoreDirty)) {
      syncFromServer(serverStoreSettings);
      initializedRef.current = true;
    }
  }, [serverStoreSettings, isStoreDirty, syncFromServer]);

  const discardChanges = useCallback(() => {
    if (serverStoreSettings) {
      syncFromServer(serverStoreSettings);
    }
    setIsStoreDirty(false);
  }, [serverStoreSettings, syncFromServer]);

  const buildPayload = useCallback((): StoreSettings => {
    return {
      isOpen: storeIsOpen,
      closedReason: storeClosedReason,
      currencySymbol: '₺',
      customSlotUnitPrice: Number(customSlotUnitPrice),
      discountPercentage: Number(discountPercentage),
      campaignBanner: campaignBanner.trim(),
      durationMultipliers: {
        days90: Number(mult90) || 2.5,
        days180: Number(mult180) || 4.5,
        days365: Number(mult365) || 8,
        lifetime: Number(multLifetime) || 12,
      },
      allowLifetimePurchase,
      renewalDiscountPercentage: Number(renewalDiscountPercentage) || 0,
      packages: {
        starter: {
          tier: 'Starter',
          name: 'Başlangıç Topluluğu',
          slots: Number(starterSlots),
          price: Number(starterPrice),
          enabled: starterEnabled,
          description: 'Küçük arkadaş grupları ve mini ekipler için ideal.',
        },
        pro: {
          tier: 'Pro',
          name: 'Klan Pro Sunucu',
          slots: Number(proSlots),
          price: Number(proPrice),
          enabled: proEnabled,
          description: 'WebRTC Opus HD Ses & e-Spor klanları için optimize.',
        },
        enterprise: {
          tier: 'Enterprise',
          name: 'Kurumsal & Mega',
          slots: Number(enterpriseSlots),
          price: Number(enterprisePrice),
          enabled: enterpriseEnabled,
          description: 'Öncelikli bant genişliği, sınırsız yetki ve özel SLA.',
        },
      },
      paymentMethods: [
        {
          id: 'wallet',
          name: 'Cüzdan Bakiyesi',
          enabled: payWallet,
          icon: 'Wallet',
          description: payWalletDesc.trim() || 'Hesabınızdaki bakiye ile anında onay.',
        },
        {
          id: 'credit_card',
          name: 'Kredi / Banka Kartı',
          enabled: payCard,
          icon: 'CreditCard',
          description: payCardDesc.trim() || '3D Secure korumalı güvenli kart ödemesi.',
        },
        {
          id: 'bank_transfer',
          name: 'Havale / FAST / EFT',
          enabled: payBank,
          icon: 'Building2',
          description: payBankDesc.trim() || '7/24 Anında banka transferi ile manuel onay.',
        },
        {
          id: 'crypto',
          name: 'Kripto Para (USDT/BTC)',
          enabled: payCrypto,
          icon: 'Coins',
          description: payCryptoDesc.trim() || 'TRC20 / ERC20 ağı ile anonim hızlı ödeme.',
        },
      ],
    };
  }, [
    storeIsOpen,
    storeClosedReason,
    customSlotUnitPrice,
    discountPercentage,
    campaignBanner,
    mult90,
    mult180,
    mult365,
    multLifetime,
    allowLifetimePurchase,
    renewalDiscountPercentage,
    starterSlots,
    starterPrice,
    starterEnabled,
    proSlots,
    proPrice,
    proEnabled,
    enterpriseSlots,
    enterprisePrice,
    enterpriseEnabled,
    payWallet,
    payWalletDesc,
    payCard,
    payCardDesc,
    payBank,
    payBankDesc,
    payCrypto,
    payCryptoDesc,
  ]);

  return {
    isStoreDirty,
    setIsStoreDirty,
    discardChanges,
    buildPayload,
    fields: {
      storeIsOpen,
      setStoreIsOpen,
      storeClosedReason,
      setStoreClosedReason,
      starterPrice,
      setStarterPrice,
      starterSlots,
      setStarterSlots,
      starterEnabled,
      setStarterEnabled,
      proPrice,
      setProPrice,
      proSlots,
      setProSlots,
      proEnabled,
      setProEnabled,
      enterprisePrice,
      setEnterprisePrice,
      enterpriseSlots,
      setEnterpriseSlots,
      enterpriseEnabled,
      setEnterpriseEnabled,
      customSlotUnitPrice,
      setCustomSlotUnitPrice,
      discountPercentage,
      setDiscountPercentage,
      campaignBanner,
      setCampaignBanner,
      mult90,
      setMult90,
      mult180,
      setMult180,
      mult365,
      setMult365,
      multLifetime,
      setMultLifetime,
      allowLifetimePurchase,
      setAllowLifetimePurchase,
      renewalDiscountPercentage,
      setRenewalDiscountPercentage,
      payWallet,
      setPayWallet,
      payWalletDesc,
      setPayWalletDesc,
      payCard,
      setPayCard,
      payCardDesc,
      setPayCardDesc,
      payBank,
      setPayBank,
      payBankDesc,
      setPayBankDesc,
      payCrypto,
      setPayCrypto,
      payCryptoDesc,
      setPayCryptoDesc,
    },
  };
}

export type AdminStoreFormController = ReturnType<typeof useAdminStoreForm>;
