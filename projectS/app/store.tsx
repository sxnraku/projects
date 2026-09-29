/**
 * LOJA — pacotes de dinheiro, Premium e VIP.
 *
 * Tudo passa por `src/native/purchases`. Se a loja não responder (web, emulador
 * sem Play Services, produto ainda inativo na Play Console) o ecrã diz isso em
 * vez de mostrar botões que não fazem nada.
 *
 * O dinheiro só entra na caixa quando a Play Store confirma a compra; o preço
 * mostrado é o da própria loja (já com moeda e impostos do país do jogador).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import { useMonetizationStore } from '../src/state/monetizationStore';
import {
  buyCashPack, buyPremium, buyVip, cashPrices, premiumPrice, purchasesAvailable, vipPrices,
  type PurchaseOutcome,
} from '../src/native/purchases';
import { CASH_PACKS, VIP_PLANS, VIP_DAILY_MULTIPLIER, type VipPlan } from '../src/monetization/catalog';
import { money } from '../src/ui/format';
import { theme } from '../src/ui/theme';
import { useT } from '../src/ui/i18n';
import { Body, Screen, Section } from './components';

const PACK_LABEL: Record<string, string> = {
  cash_small: 'store.cash.small',
  cash_medium: 'store.cash.medium',
  cash_large: 'store.cash.large',
};

export default function StoreScreen() {
  const t = useT();
  const creditCash = useGameStore((s) => s.creditCash);
  const hasCareer = useGameStore((s) => !!s.state && s.state.meta.managerName !== '');
  const premiumOwned = useMonetizationStore((s) => s.m.premiumOwned);
  const vip = useMonetizationStore((s) => s.m.vip);
  const setPremium = useMonetizationStore((s) => s.setPremium);
  const setVip = useMonetizationStore((s) => s.setVip);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [cash, setCash] = useState<Record<string, string>>({});
  const [vipPrice, setVipPrice] = useState<Partial<Record<VipPlan, string>>>({});
  const [premPrice, setPremPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void purchasesAvailable().then(async (ok) => {
      if (!alive) return;
      setAvailable(ok);
      if (!ok) return;
      const [c, v, p] = await Promise.all([cashPrices(), vipPrices(), premiumPrice()]);
      if (!alive) return;
      setCash(c);
      setVipPrice(v);
      setPremPrice(p);
    });
    return () => { alive = false; };
  }, []);

  const run = useCallback(async (key: string, fn: () => Promise<PurchaseOutcome>, onOk: (r: PurchaseOutcome) => void) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      if (r.ok) onOk(r);
      else if (r.reason !== 'CANCELLED') setMsg(t(r.reason === 'UNAVAILABLE' ? 'store.unavailable' : 'store.failed'));
    } finally {
      setBusy(null);
    }
  }, [t]);

  if (available === false) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Body dim>{t('store.unavailable')}</Body>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <Section title={t('store.cash.title')} />
        <Body dim>{t('store.cash.sub')}</Body>
        {CASH_PACKS.map((pack) => (
          <View key={pack.sku} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{t(PACK_LABEL[pack.sku] ?? pack.sku)}</Text>
              <Text style={styles.sub}>+{money(pack.amount)}</Text>
            </View>
            <Pressable
              disabled={busy !== null || !hasCareer || !cash[pack.sku]}
              onPress={() => void run(
                pack.sku,
                () => buyCashPack(pack.sku, (amount) => creditCash(amount)),
                () => setMsg(t('store.cash.thanks', { amount: money(pack.amount) })),
              )}
              style={[styles.btn, (busy !== null || !hasCareer || !cash[pack.sku]) && styles.btnOff]}
            >
              <Text style={styles.btnText}>{busy === pack.sku ? t('common.loading') : cash[pack.sku] ?? t('store.buy')}</Text>
            </Pressable>
          </View>
        ))}

        <Section title={t('store.vip.title')} />
        <Body dim>{t('store.vip.sub')} (×{VIP_DAILY_MULTIPLIER})</Body>
        {vip ? (
          <Text style={styles.active}>{t('store.vip.active')}</Text>
        ) : (
          VIP_PLANS.map((plan) => (
            <View key={plan} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{t(`store.vip.${plan}`)}</Text>
              </View>
              <Pressable
                disabled={busy !== null || !vipPrice[plan]}
                onPress={() => void run(
                  `vip_${plan}`,
                  () => buyVip(plan),
                  (r) => {
                    setVip(true);
                    setMsg(t(r.ok && r.restored ? 'store.vip.restored' : 'store.vip.thanks'));
                  },
                )}
                style={[styles.btn, (busy !== null || !vipPrice[plan]) && styles.btnOff]}
              >
                <Text style={styles.btnText}>{busy === `vip_${plan}` ? t('common.loading') : vipPrice[plan] ?? t('store.subscribe')}</Text>
              </Pressable>
            </View>
          ))
        )}

        <Section title={t('club.premiumName')} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sub}>{premiumOwned ? t('club.premiumActiveSub') : t('club.premiumSub')}</Text>
          </View>
          <Pressable
            disabled={premiumOwned || busy !== null || !premPrice}
            onPress={() => void run(
              'premium',
              () => buyPremium(),
              (r) => {
                setPremium(true);
                setMsg(t(r.ok && r.restored ? 'club.premiumRestored' : 'club.premiumThanks'));
              },
            )}
            style={[styles.btn, (premiumOwned || busy !== null || !premPrice) && styles.btnOff]}
          >
            <Text style={styles.btnText}>{premiumOwned ? t('club.premiumOn') : premPrice ?? t('club.premiumActivate')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(1.5),
  },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  btn: {
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.green,
    minWidth: 88,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.45 },
  btnText: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700' },
  msg: { color: theme.colors.yellow, fontSize: theme.font.body, fontWeight: '600' },
  active: { color: theme.colors.green, fontSize: theme.font.body, fontWeight: '700' },
});
