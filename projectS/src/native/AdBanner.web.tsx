/**
 * Banner (versão WEB) — o SDK AdMob é só-nativo, por isso em web mostramos
 * um marcador discreto em desenvolvimento (e nada em produção premium).
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useMonetizationStore } from '../state/monetizationStore';

export default function AdBanner() {
  const premium = useMonetizationStore((s) => s.m.premium);
  if (premium) return null;
  return (
    <View style={{
      height: 50, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#2B3138', borderTopWidth: 1, borderTopColor: '#3A424C',
    }}>
      <Text style={{ color: '#9AA3AD', fontSize: 11 }}>[ banner de anúncio — visível no build Android ]</Text>
    </View>
  );
}
