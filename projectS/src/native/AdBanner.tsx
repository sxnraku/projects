/**
 * Banner AdMob (versão NATIVA — Android/iOS).
 * Em web o Metro usa AdBanner.web.tsx. Auto-esconde para utilizadores premium.
 * ID de teste da Google por defeito — substituir pelo ad unit real no lançamento.
 */
import React, { useEffect, useState } from 'react';
import { useMonetizationStore } from '../state/monetizationStore';
import { AD_UNITS } from './adConfig';

const BANNER_ID = AD_UNITS.banner;

export default function AdBanner() {
  const premium = useMonetizationStore((s) => s.m.premium);
  const [Ads, setAds] = useState<typeof import('react-native-google-mobile-ads') | null>(null);

  useEffect(() => {
    let alive = true;
    import('react-native-google-mobile-ads')
      .then((mod) => { if (alive) setAds(mod); })
      .catch(() => {}); // Expo Go sem módulo nativo → sem banner
    return () => { alive = false; };
  }, []);

  if (premium || !Ads) return null;

  const { BannerAd, BannerAdSize } = Ads;
  return (
    <BannerAd
      unitId={BANNER_ID}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
    />
  );
}
