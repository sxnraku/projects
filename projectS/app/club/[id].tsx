import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { computeTeamStrength } from '../../src/core/engine';
import { naturalOverallFine, Player, POSITION_GROUP, PositionGroup, shortName } from '../../src/core/models';
import { money, to100 } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, reputationStars, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Body, CrestCircle, PosText, RowKV, Screen, Section, Stars, StrengthTriplet } from '../components';

/** Ordem de leitura do plantel: guarda-redes primeiro, avançados por último. */
const GROUP_ORDER: PositionGroup[] = ['GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'];
const GROUP_KEYS: Record<PositionGroup, string> = {
  GOALKEEPER: 'club.group.gk',
  DEFENCE: 'club.group.def',
  MIDFIELD: 'club.group.mid',
  ATTACK: 'club.group.att',
};

/**
 * FICHA DE OUTRO CLUBE — plantel, força por setor e dados do estádio.
 *
 * Vinha do playtest: dava para ver a tabela e o calendário mas não QUEM era o
 * adversário, o que tornava impossível preparar um jogo ou avaliar o mercado.
 * Chega-se aqui pela tabela da liga, pelo calendário e pelo cartão do próximo
 * jogo; cada jogador abre a ficha completa já existente.
 */
export default function ClubDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const router = useRouter();
  const state = useGameStore((s) => s.state);

  const club = state?.clubs[id ?? ''];
  if (!state || !club) {
    return <Screen edges={['left', 'right', 'bottom']}><Body>{t('club.notFound')}</Body></Screen>;
  }

  const league = state.leagues[club.leagueId];
  const tactic = state.tactics[club.id];
  const strength = tactic ? computeTeamStrength(tactic, state.players) : null;
  const squad = club.squad
    .map((pid) => state.players[pid])
    .filter((p): p is Player => !!p);
  const starters = new Set(tactic?.lineup.map((s) => s.playerId) ?? []);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing(3) }}>
        <View style={styles.header}>
          <CrestCircle club={club} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{club.name}</Text>
            <Text style={styles.sub} numberOfLines={1}>{league?.name ?? ''}</Text>
            <Stars value={reputationStars(club.reputation)} />
          </View>
        </View>

        {strength ? (
          <StrengthTriplet
            def={Math.min(100, to100(strength.defence))}
            mid={Math.min(100, to100(strength.midfield))}
            att={Math.min(100, to100(strength.attack))}
          />
        ) : null}

        <Section title={t('club.info')} />
        <RowKV k={t('club.stadium')} v={club.stadiumName} />
        <RowKV k={t('club.capacity')} v={String(club.stadiumCapacity)} />
        <RowKV k={t('club.squadSize')} v={String(squad.length)} />
        <RowKV k={t('club.squadValue')} v={money(squad.reduce((s, p) => s + p.marketValue, 0))} />

        {GROUP_ORDER.map((group) => {
          const rows = squad
            .filter((p) => POSITION_GROUP[p.positions[0]!] === group)
            .sort((a, b) => naturalOverallFine(b) - naturalOverallFine(a));
          if (rows.length === 0) return null;
          return (
            <View key={group}>
              <Section title={t(GROUP_KEYS[group])} />
              {rows.map((p) => (
                <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/player/${p.id}`)}>
                  <Text style={[styles.ovr, { color: attrColor(naturalOverallFine(p)) }]}>
                    {to100(naturalOverallFine(p))}
                  </Text>
                  <Face seed={p.id} size={30} shirt={club.primaryColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName} numberOfLines={1}>
                      {shortName(p)}{starters.has(p.id) ? <Text style={styles.xi}> XI</Text> : null}
                    </Text>
                    <View style={styles.metaRow}>
                      <PosText position={p.positions[0]!} style={{ fontSize: 9 }} />
                      <Text style={styles.sub}>{t('club.playerMeta', { age: p.age, value: money(p.marketValue) })}</Text>
                    </View>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
  },
  name: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.85),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  ovr: { width: 30, textAlign: 'center', fontSize: theme.font.body, fontWeight: '800' },
  pName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  xi: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chev: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '700' },
});
