import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import { COUNTRIES } from '../src/core/data/world/playerIndex';
import { WORLD_TEAMS } from '../src/core/data/world/worldTeams';
import { bgTableSorted } from '../src/core/game';
import { PositionGroup } from '../src/core/models';
import { CountryFlag } from '../src/ui/CountryFlag';
import { theme } from '../src/ui/theme';
import { useT } from '../src/ui/i18n';
import { Screen, H1, Body } from './components';

const teamName = (id: number) => WORLD_TEAMS.find((t) => t.id === id)?.name ?? '—';

export default function World() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const worldLeagues = useGameStore((s) => s.worldLeagues);
  const scoutedCountries = useGameStore((s) => s.scoutedCountries);
  const scoutCountry = useGameStore((s) => s.scoutCountry);
  const scoutCountryCost = useGameStore((s) => s.scoutCountryCost);
  const internationalTargets = useGameStore((s) => s.internationalTargets);
  const signWorldTarget = useGameStore((s) => s.signWorldTarget);

  const [tab, setTab] = useState<'leagues' | 'market'>('leagues');

  if (!state) return <Screen edges={['left', 'right', 'bottom']}><H1>{t('world.title')}</H1><Body dim>—</Body></Screen>;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.seg}>
        <Pressable onPress={() => setTab('leagues')} style={[styles.segBtn, tab === 'leagues' && styles.segOn]}>
          <Text style={[styles.segText, tab === 'leagues' && styles.segTextOn]}>🌍 {t('world.tab.leagues')}</Text>
        </Pressable>
        <Pressable onPress={() => setTab('market')} style={[styles.segBtn, tab === 'market' && styles.segOn]}>
          <Text style={[styles.segText, tab === 'market' && styles.segTextOn]}>🔎 {t('world.tab.market')}</Text>
        </Pressable>
      </View>

      {tab === 'leagues'
        ? <LeaguesBrowser worldLeagues={worldLeagues()} activeCountry={state.clubs[state.meta.managedClubId]?.country ?? 'portugal'} />
        : <MarketPanel
            scouted={scoutedCountries()}
            ownCountry={state.clubs[state.meta.managedClubId]?.country ?? 'portugal'}
            cost={scoutCountryCost()}
            balance={state.finances[state.meta.managedClubId]?.balance ?? 0}
            budget={state.finances[state.meta.managedClubId]?.transferBudget ?? 0}
            listTargets={internationalTargets}
            onScout={scoutCountry}
            onSign={signWorldTarget}
          />}
    </Screen>
  );
}

// ---------- Browser de todas as ligas ----------
function LeaguesBrowser({ worldLeagues, activeCountry }: { worldLeagues: import('../src/core/game').BgLeague[]; activeCountry: string }) {
  const t = useT();
  const [pick, setPick] = useState(false);
  const [slug, setSlug] = useState<string>(activeCountry);
  const country = COUNTRIES.find((c) => c.slug === slug);
  const leagues = useMemo(() => worldLeagues.filter((l: any) => l.slug === slug).sort((a: any, b: any) => a.tier - b.tier), [worldLeagues, slug]);

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={styles.countryBtn} onPress={() => setPick(true)}>
        <CountryFlag slug={slug} size={24} />
        <Text style={styles.countryBtnText}>{country?.country ?? slug}</Text>
        <Text style={styles.countryBtnGo}>▾</Text>
      </Pressable>

      {leagues.length === 0 ? (
        <Body dim>{t('world.leagues.activeHint')}</Body>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {leagues.map((lg: any) => (
            <View key={lg.key} style={styles.leagueCard}>
              <Text style={styles.leagueName}>{lg.name}</Text>
              <View style={styles.tHead}>
                <Text style={[styles.tPos, styles.tHeadText]}>#</Text>
                <Text style={[styles.tTeam, styles.tHeadText]}>{t('world.table.team')}</Text>
                <Text style={[styles.tNum, styles.tHeadText]}>J</Text>
                <Text style={[styles.tNum, styles.tHeadText]}>DG</Text>
                <Text style={[styles.tPts, styles.tHeadText]}>P</Text>
              </View>
              {bgTableSorted(lg).map((r, i) => (
                <View key={r.id} style={styles.tRow}>
                  <Text style={styles.tPos}>{i + 1}</Text>
                  <Text style={styles.tTeam} numberOfLines={1}>{teamName(r.id)}</Text>
                  <Text style={styles.tNum}>{r.P}</Text>
                  <Text style={styles.tNum}>{r.GF - r.GA > 0 ? '+' : ''}{r.GF - r.GA}</Text>
                  <Text style={styles.tPts}>{r.Pts}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <CountrySelect visible={pick} onClose={() => setPick(false)} onPick={(s) => { setSlug(s); setPick(false); }} />
    </View>
  );
}

// ---------- Mercado internacional ----------
function MarketPanel({
  scouted, ownCountry, cost, balance, budget, listTargets, onScout, onSign,
}: {
  scouted: string[]; ownCountry: string; cost: number; balance: number; budget: number;
  listTargets: (filter?: import('../src/core/game').WorldFilter) => import('../src/core/game').WorldTarget[];
  onScout: (slug: string) => boolean; onSign: (id: string) => boolean;
}) {
  const t = useT();
  const [pick, setPick] = useState(false);
  // Um país de cada vez e um setor de cada vez: com 5 países explorados a lista
  // misturava tudo e nunca se via o melhor de cada mercado.
  const [country, setCountry] = useState<string | null>(null);
  const [group, setGroup] = useState<PositionGroup | null>(null);
  const canAfford = balance >= cost;
  const targets = listTargets({
    country: country ?? undefined,
    group: group ?? undefined,
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.moneyRow}>
        <Text style={styles.moneyText}>{t('world.market.budget', { v: budget.toLocaleString('pt-PT') })}</Text>
      </View>
      <Pressable style={[styles.scoutBtn, !canAfford && { opacity: 0.5 }]} disabled={!canAfford} onPress={() => setPick(true)}>
        <Text style={styles.scoutBtnText}>🔎 {t('world.market.scout', { v: cost.toLocaleString('pt-PT') })}</Text>
      </Pressable>
      {scouted.length > 0 ? (
        <>
          <View style={styles.chipRow}>
            <Pressable onPress={() => setCountry(null)} style={[styles.chip, country === null && styles.chipOn]}>
              <Text style={[styles.chipText, country === null && styles.chipTextOn]}>{t('world.market.allCountries')}</Text>
            </Pressable>
            {scouted.map((s) => (
              <Pressable key={s} onPress={() => setCountry(country === s ? null : s)}
                style={[styles.chip, country === s && styles.chipOn]}>
                <CountryFlag slug={s} size={16} />
                <Text style={[styles.chipText, country === s && styles.chipTextOn]}>
                  {COUNTRIES.find((c) => c.slug === s)?.country ?? s}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {([null, 'GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'] as const).map((g) => (
              <Pressable key={g ?? 'ALL'} onPress={() => setGroup(g as PositionGroup | null)}
                style={[styles.chip, group === g && styles.chipOn]}>
                <Text style={[styles.chipText, group === g && styles.chipTextOn]}>
                  {g === null ? t('world.market.allPos') : t(`world.pos.${g}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : <Body dim>{t('world.market.empty')}</Body>}

      <ScrollView style={{ flex: 1, marginTop: theme.spacing(1) }} showsVerticalScrollIndicator={false}>
        {targets.map((tg) => (
          <View key={tg.id} style={styles.tgRow}>
            <CountryFlag slug={tg.slug} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tgName} numberOfLines={1}>{tg.name} <Text style={styles.tgPos}>{tg.pos} · {tg.age}a</Text></Text>
              <Text style={styles.tgSub} numberOfLines={1}>{tg.clubName} · OVR {tg.ovr}/POT {tg.pot}</Text>
            </View>
            <Text style={styles.tgFee}>{tg.fee.toLocaleString('pt-PT')}€</Text>
            <Pressable
              disabled={tg.reach === 'LOCKED'}
              onPress={() => onSign(tg.id)}
              style={[styles.signBtn, tg.reach === 'LOCKED' && { opacity: 0.35 }]}
            >
              <Text style={styles.signBtnText}>{tg.reach === 'LOCKED' ? '🔒' : t('world.market.sign')}</Text>
            </Pressable>
          </View>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>

      <CountrySelect visible={pick} onClose={() => setPick(false)} exclude={[ownCountry, ...scouted]}
        onPick={(s) => { setPick(false); onScout(s); }} />
    </View>
  );
}

// ---------- Seletor de país reutilizável ----------
function CountrySelect({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (slug: string) => void; exclude?: string[] }) {
  const t = useT();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const ex = new Set(exclude ?? []);
    const base = COUNTRIES.filter((c) => !ex.has(c.slug));
    const query = q.trim().toLowerCase();
    return query ? base.filter((c) => c.country.toLowerCase().includes(query)) : base;
  }, [q, exclude]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.pickBackdrop}>
        <View style={styles.pickSheet}>
          <Text style={styles.pickTitle}>{t('start.chooseCountry')}</Text>
          <TextInput style={styles.search} placeholder={t('start.searchCountry')} placeholderTextColor={theme.colors.textDim} value={q} onChangeText={setQ} autoCorrect={false} />
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {list.map((c) => (
              <Pressable key={c.slug} style={styles.cRow} onPress={() => onPick(c.slug)}>
                <CountryFlag slug={c.slug} size={22} />
                <Text style={styles.cName} numberOfLines={1}>{c.country}</Text>
                <Text style={styles.cSub}>{c.tiers}D · {c.teams}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.pickCancel} onPress={onClose}><Text style={styles.pickCancelText}>{t('common.cancel')}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: theme.spacing(0.75), marginBottom: theme.spacing(1) },
  segBtn: { flex: 1, paddingVertical: theme.spacing(1), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface },
  segOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  segText: { color: theme.colors.textDim, fontWeight: '700', fontSize: theme.font.small },
  segTextOn: { color: theme.colors.blue },

  countryBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.spacing(1.25), marginBottom: theme.spacing(1) },
  countryBtnText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flex: 1 },
  countryBtnGo: { color: theme.colors.textDim, fontSize: 16 },

  leagueCard: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing(1.25), marginBottom: theme.spacing(1) },
  leagueName: { color: theme.colors.accent, fontSize: theme.font.h3, fontWeight: '800', marginBottom: theme.spacing(0.75) },
  tHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tHeadText: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  tPos: { width: 24, color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  tTeam: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  tNum: { width: 34, textAlign: 'center', color: theme.colors.textDim, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  tPts: { width: 28, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900', fontVariant: ['tabular-nums'] },

  moneyRow: { marginBottom: theme.spacing(0.75) },
  moneyText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  scoutBtn: { backgroundColor: theme.colors.blue, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(1.25), alignItems: 'center' },
  scoutBtnText: { color: '#fff', fontWeight: '800', fontSize: theme.font.body },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: theme.spacing(1) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipOn: { backgroundColor: theme.colors.blue },
  chipTextOn: { color: '#fff', fontWeight: '800' },
  chipText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },

  tgRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(0.85), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  tgName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  tgPos: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '600' },
  tgSub: { color: theme.colors.textDim, fontSize: theme.font.small },
  tgFee: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  signBtn: { backgroundColor: theme.colors.green, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(0.75) },
  signBtnText: { color: '#fff', fontWeight: '800', fontSize: theme.font.small },

  pickBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  pickSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(2), paddingBottom: theme.spacing(3) },
  pickTitle: { color: theme.colors.accent, fontSize: theme.font.h2, fontWeight: '900', textAlign: 'center', marginBottom: theme.spacing(1) },
  search: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(1), color: theme.colors.text, fontSize: theme.font.body, marginBottom: theme.spacing(1) },
  cRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25), paddingVertical: theme.spacing(1), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  cName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', flex: 1 },
  cSub: { color: theme.colors.textDim, fontSize: theme.font.small },
  pickCancel: { alignItems: 'center', paddingTop: theme.spacing(1.5) },
  pickCancelText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '700' },
});
