import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../../src/state/gameStore';
import { FACILITY_MAX_LEVEL, weeklyNet } from '../../src/core/models';
import {
  FACILITY_EFFECTS,
  FACILITY_LABELS,
  FacilityType,
  facilityUpgradeCost,
} from '../../src/core/economy';
import { money } from '../../src/ui/format';
import { theme } from '../../src/ui/theme';
import { Body, RowKV, Screen, Section, Stars } from '../components';
import { reputationStars } from '../../src/ui/theme';
import { useMonetizationStore } from '../../src/state/monetizationStore';

const FACILITY_TYPES: FacilityType[] = ['stadium', 'training', 'academy', 'medical'];

export default function ClubScreen() {
  const state = useGameStore((s) => s.state);
  const club = useGameStore((s) => s.managedClub)();
  const upgrade = useGameStore((s) => s.upgrade);
  const newGame = useGameStore((s) => s.newGame);
  const premium = useMonetizationStore((s) => s.m.premium);
  const setPremium = useMonetizationStore((s) => s.setPremium);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!state || !club) return <Screen><Body>A carregar…</Body></Screen>;

  const fin = state.finances[club.id]!;
  const career = state.career;
  const net = weeklyNet(fin);
  const record = `${career.totalWins}V ${career.totalDraws}E ${career.totalLosses}D`;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* PERFIL */}
        <Section title="Clube" />
        <RowKV k="Nome" v={club.name} />
        <View style={styles.repRow}>
          <Text style={styles.repKey}>Reputação</Text>
          <Stars value={reputationStars(club.reputation)} />
        </View>
        <RowKV k="Estádio" v={`${club.stadiumName} (${club.stadiumCapacity.toLocaleString('pt-PT')})`} />
        <RowKV k="Divisão" v={state.leagues[club.leagueId]?.name ?? '—'} />

        {/* INSTALAÇÕES */}
        <Section title="Instalações" />
        {upgradeMsg ? <Text style={styles.upgradeMsg}>{upgradeMsg}</Text> : null}
        {FACILITY_TYPES.map((type) => {
          const level = club.facilities[type];
          const maxed = level >= FACILITY_MAX_LEVEL;
          const cost = maxed ? 0 : facilityUpgradeCost(type, level);
          const affordable = !maxed && fin.balance >= cost;
          return (
            <View key={type} style={styles.facRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.facName}>{FACILITY_LABELS[type]}</Text>
                <Text style={styles.facEffect}>{FACILITY_EFFECTS[type]}</Text>
                <Text style={styles.facLevel}>
                  {'▰'.repeat(level)}{'▱'.repeat(FACILITY_MAX_LEVEL - level)}  Nível {level}
                </Text>
              </View>
              <Pressable
                disabled={!affordable}
                onPress={() => {
                  const r = upgrade(type);
                  setUpgradeMsg(r.ok
                    ? `${FACILITY_LABELS[type]} melhorado para o nível ${r.newLevel} (−${money(r.cost ?? 0)}).`
                    : r.error ?? null);
                }}
                style={[styles.facBtn, !affordable && styles.facBtnDisabled]}
              >
                <Text style={[styles.facBtnText, !affordable && { color: theme.colors.textDim }]}>
                  {maxed ? 'MÁX' : money(cost)}
                </Text>
              </Pressable>
            </View>
          );
        })}

        {/* FINANÇAS */}
        <Section title="Receitas semanais" />
        <RowKV k="Bilheteira (último jogo em casa)" v={money(fin.income.tickets)} vColor={theme.colors.green} />
        <RowKV k="Patrocínios" v={money(fin.income.sponsorship)} vColor={theme.colors.green} />
        <RowKV k="Direitos de TV" v={money(fin.income.tvRights)} vColor={theme.colors.green} />
        <RowKV k="Merchandising" v={money(fin.income.merchandising)} vColor={theme.colors.green} />

        <Section title="Despesas semanais" />
        <RowKV k="Salários" v={money(fin.expenses.wages)} vColor={theme.colors.red} />
        <RowKV k="Instalações" v={money(fin.expenses.facilities)} vColor={theme.colors.red} />
        <RowKV k="Equipa técnica" v={money(fin.expenses.staff)} vColor={theme.colors.red} />

        <Section title="Balanço" />
        <RowKV k="Fluxo semanal" v={`${net >= 0 ? '+' : ''}${money(net)}`}
          vColor={net >= 0 ? theme.colors.green : theme.colors.red} />
        <RowKV k="Saldo" v={money(fin.balance)}
          vColor={fin.balance >= 0 ? theme.colors.green : theme.colors.red} />
        <RowKV k="Orçamento de transferências" v={money(fin.transferBudget)} />

        {/* CARREIRA */}
        <Section title="Carreira do treinador" />
        <RowKV k="Treinador" v={state.meta.managerName} />
        <RowKV k="Registo" v={record} />
        <RowKV k="Despedimentos" v={String(career.timesFired)}
          vColor={career.timesFired > 0 ? theme.colors.red : undefined} />

        {/* TROFÉUS */}
        <Section title="Sala de troféus" />
        {career.trophies.length === 0 ? (
          <Text style={styles.empty}>Ainda sem troféus. A escalada começa agora.</Text>
        ) : (
          career.trophies.map((t, i) => (
            <View key={i} style={styles.trophyRow}>
              <Text style={styles.trophyIcon}>🏆</Text>
              <Text style={styles.trophyText}>{t.label}</Text>
              <Text style={styles.trophySeason}>{t.season}</Text>
            </View>
          ))
        )}

        {/* HISTORIAL */}
        <Section title="Historial de épocas" />
        {career.seasons.length === 0 ? (
          <Text style={styles.empty}>A primeira época ainda está a decorrer.</Text>
        ) : (
          <View>
            <View style={styles.histHead}>
              <Text style={[styles.hh, { width: 44 }]}>Época</Text>
              <Text style={[styles.hh, { flex: 1 }]}>Clube · Liga</Text>
              <Text style={[styles.hh, { width: 30, textAlign: 'center' }]}>Pos</Text>
              <Text style={[styles.hh, { width: 30, textAlign: 'right' }]}>Pts</Text>
            </View>
            {[...career.seasons].reverse().map((s, i) => (
              <View key={i} style={styles.histRow}>
                <Text style={[styles.hc, { width: 44 }]}>{s.season}</Text>
                <Text style={[styles.hc, { flex: 1 }]} numberOfLines={1}>
                  {s.clubName} · {s.leagueName}
                  {s.champion ? <Text style={{ color: theme.colors.yellow }}> 🏆</Text> : null}
                  {s.promoted && !s.champion ? <Text style={{ color: theme.colors.green }}> ↑</Text> : null}
                  {s.relegated ? <Text style={{ color: theme.colors.red }}> ↓</Text> : null}
                </Text>
                <Text style={[styles.hc, { width: 30, textAlign: 'center' }]}>{s.position}º</Text>
                <Text style={[styles.hc, { width: 30, textAlign: 'right' }]}>{s.points}</Text>
              </View>
            ))}
          </View>
        )}
        {/* DEFINIÇÕES */}
        <Section title="Definições" />
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>Remover anúncios (Premium)</Text>
            <Text style={styles.settingSub}>
              {premium ? 'Ativo — obrigado pelo apoio! Os interstitials desapareceram.' : 'Sem interstitials nem banners. Bónus de anúncio continuam disponíveis.'}
            </Text>
          </View>
          <Pressable
            disabled={premium}
            onPress={() => setPremium(true)} // TODO lançamento: fluxo real Google Play Billing
            style={[styles.settingBtn, premium && styles.settingBtnDone]}
          >
            <Text style={styles.settingBtnText}>{premium ? '✓ Ativo' : 'Ativar'}</Text>
          </Pressable>
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>Nova carreira</Text>
            <Text style={styles.settingSub}>
              {confirmReset ? '⚠ Apaga TODO o progresso. Toca de novo para confirmar.' : 'Recomeça do zero com um mundo novo.'}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (!confirmReset) { setConfirmReset(true); return; }
              setConfirmReset(false);
              newGame({ managerName: '' }); // volta ao onboarding; auto-save trata do resto
            }}
            style={[styles.settingBtn, confirmReset && styles.settingBtnDanger]}
          >
            <Text style={[styles.settingBtnText, confirmReset && { color: '#fff' }]}>
              {confirmReset ? 'Confirmar' : 'Recomeçar'}
            </Text>
          </Pressable>
        </View>

        <RowKV k="Versão" v="1.0.0" />
        <Text style={styles.legal}>
          Este jogo mostra anúncios (Google AdMob). Política de privacidade obrigatória antes do lançamento na Play Store.
        </Text>

        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  upgradeMsg: { color: theme.colors.green, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  facRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  facName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  facEffect: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  facLevel: { color: theme.colors.blue, fontSize: theme.font.small, marginTop: 2, letterSpacing: 1 },
  facBtn: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(1),
    minWidth: 76, alignItems: 'center',
  },
  facBtnDisabled: { borderColor: theme.colors.border },
  facBtnText: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.25),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  settingName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  settingSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  settingBtn: {
    borderWidth: 1, borderColor: theme.colors.blue, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
    minWidth: 88, alignItems: 'center',
  },
  settingBtnDone: { borderColor: theme.colors.green },
  settingBtnDanger: { backgroundColor: theme.colors.red, borderColor: theme.colors.red },
  settingBtnText: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700' },
  legal: { color: theme.colors.textDim, fontSize: 10, marginTop: theme.spacing(1.5), lineHeight: 14 },
  repRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.9),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  repKey: { color: theme.colors.textDim, fontSize: theme.font.body },
  empty: { color: theme.colors.textDim, fontSize: theme.font.body, paddingVertical: theme.spacing(0.5) },
  trophyRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  trophyIcon: { fontSize: 14 },
  trophyText: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  trophySeason: { color: theme.colors.textDim, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  histHead: { flexDirection: 'row', gap: 6, paddingVertical: theme.spacing(0.75) },
  hh: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  histRow: {
    flexDirection: 'row', gap: 6, paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  hc: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
});
