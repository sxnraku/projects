import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { bidForPlayer, isWonderkid } from '../../src/core/game';
import { suggestedWage } from '../../src/core/economy';
import { naturalOverall } from '../../src/core/models';
import { money, wage } from '../../src/ui/format';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { Body, Button, PosText, RowKV, Screen, StatBar, Stepper } from '../components';

type Tab = 'OVERVIEW' | 'STATS' | 'CONTRACT' | 'SELL';
const TABS: { key: Tab; label: string }[] = [
  { key: 'OVERVIEW', label: 'Visão' },
  { key: 'STATS', label: 'Atributos' },
  { key: 'CONTRACT', label: 'Contrato' },
  { key: 'SELL', label: 'Vender' },
];

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useGameStore((s) => s.state);
  const renewPlayer = useGameStore((s) => s.renewPlayer);
  const setListed = useGameStore((s) => s.setListed);
  const acceptBid = useGameStore((s) => s.acceptBid);

  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [years, setYears] = useState(3);
  const [renewMsg, setRenewMsg] = useState<string | null>(null);
  const [sellMsg, setSellMsg] = useState<string | null>(null);

  const player = state?.players[id ?? ''];
  if (!state || !player) return <Screen><Body>Jogador não encontrado.</Body></Screen>;

  const ovr = naturalOverall(player);
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const a = player.attributes;
  const askedWage = suggestedWage(player, state.meta.season);
  const isOurs = player.clubId === state.meta.managedClubId;
  const pendingBid = isOurs ? bidForPlayer(state, player.id) : null;

  return (
    <Screen>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <View style={[styles.ovrBox, { backgroundColor: attrColor(ovr) }]}>
          <Text style={styles.ovrText}>{ovr}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>
            {player.firstName} {player.lastName}
            {isWonderkid(player) ? <Text style={{ color: theme.colors.yellow }}> ★</Text> : null}
          </Text>
          <View style={styles.metaRow}>
            <PosText position={player.positions[0]!} />
            <Text style={styles.sub}>{player.age} anos · {player.nationality} · {club?.name ?? 'Livre'}</Text>
          </View>
        </View>
      </View>

      {/* Separadores (o "Vender" só aparece para jogadores nossos) */}
      <View style={styles.tabs}>
        {TABS.filter((t) => t.key !== 'SELL' || isOurs).map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}{t.key === 'SELL' && pendingBid ? ' •' : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === 'OVERVIEW' ? (
          <View>
            <RowKV k="Overall" v={String(ovr)} vColor={attrColor(ovr)} />
            <RowKV k="Potencial" v={String(player.potential)} vColor={attrColor(player.potential)} />
            <RowKV k="Forma" v={String(player.condition.form)} />
            <RowKV k="Moral" v={String(player.condition.morale)} />
            <RowKV k="Fitness" v={`${player.condition.fitness}%`} vColor={fitnessColor(player.condition.fitness)} />
            <RowKV k="Pé" v={player.foot === 'RIGHT' ? 'Direito' : player.foot === 'LEFT' ? 'Esquerdo' : 'Ambos'} />
            <RowKV k="Valor de mercado" v={money(player.marketValue)} />
            {player.condition.status === 'INJURED' ? (
              <RowKV k="Estado" v={`Lesionado (${player.condition.injuryDaysRemaining} dias)`} vColor={theme.colors.red} />
            ) : null}
          </View>
        ) : null}

        {tab === 'STATS' ? (
          <View>
            <Text style={styles.group}>FÍSICO</Text>
            <StatBar label="Velocidade" value={a.pace} />
            <StatBar label="Resistência" value={a.stamina} />
            <StatBar label="Força" value={a.strength} />
            <StatBar label="Agilidade" value={a.agility} />
            <Text style={styles.group}>TÉCNICA</Text>
            <StatBar label="Finalização" value={a.finishing} />
            <StatBar label="Passe" value={a.passing} />
            <StatBar label="Drible" value={a.dribbling} />
            <StatBar label="Desarme" value={a.tackling} />
            <StatBar label="Cabeceamento" value={a.heading} />
            {player.positions[0] === 'GK' ? <StatBar label="Guarda-redes" value={a.goalkeeping} /> : null}
            <Text style={styles.group}>MENTAL</Text>
            <StatBar label="Posicionamento" value={a.positioning} />
            <StatBar label="Compostura" value={a.composure} />
            <StatBar label="Equipa" value={a.teamwork} />
            <StatBar label="Visão" value={a.vision} />
          </View>
        ) : null}

        {tab === 'CONTRACT' ? (
          <View>
            <RowKV k="Salário atual" v={wage(player.wage)} />
            <RowKV
              k="Contrato até"
              v={player.contractUntil ? `${player.contractUntil}${player.contractUntil === state.meta.season ? ' ⚠ último ano!' : ''}` : '—'}
              vColor={player.contractUntil === state.meta.season ? theme.colors.red : undefined}
            />
            <RowKV k="Salário pedido (renovação)" v={wage(askedWage)} vColor={theme.colors.yellow} />

            {isOurs ? (
              <View style={styles.renewBox}>
                <View style={styles.renewRow}>
                  <Text style={styles.sub}>Duração</Text>
                  <Stepper value={years} onChange={setYears} step={1} min={1} max={5}
                    format={(v) => `${v} anos`} />
                </View>
                {renewMsg ? <Text style={styles.renewMsg}>{renewMsg}</Text> : null}
                <Button label="Renovar contrato" onPress={() => {
                  const r = renewPlayer(player.id, years, askedWage);
                  setRenewMsg(r.ok ? `Renovado até ${state.meta.season + years} por ${wage(askedWage)}.` : r.error ?? 'Recusado.');
                }} />
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'SELL' && isOurs ? (
          <View>
            <RowKV k="Valor de mercado" v={money(player.marketValue)} />
            <RowKV k="Na lista de transferências" v={player.transferListed ? 'Sim' : 'Não'}
              vColor={player.transferListed ? theme.colors.yellow : undefined} />

            {sellMsg ? <Text style={styles.renewMsg}>{sellMsg}</Text> : null}

            {/* Proposta pendente, se houver */}
            {pendingBid ? (
              <View style={styles.bidBox}>
                <Text style={styles.bidTitle}>Proposta de {state.clubs[pendingBid.fromClubId]?.name}</Text>
                <Text style={styles.bidFee}>{money(pendingBid.fee)}</Text>
                <Button label="Aceitar e vender" onPress={() => {
                  const r = acceptBid(pendingBid.id);
                  setSellMsg(r.ok ? `Vendido por ${money(r.fee ?? pendingBid.fee)}.` : r.error ?? 'Falhou.');
                }} />
              </View>
            ) : (
              <Text style={styles.sub}>Sem propostas de momento. Põe o jogador na lista para atrair interessados.</Text>
            )}

            <View style={{ marginTop: theme.spacing(2) }}>
              <Button
                label={player.transferListed ? 'Retirar da lista de transferências' : 'Pôr na lista de transferências'}
                variant={player.transferListed ? 'ghost' : 'primary'}
                onPress={() => {
                  setListed(player.id, !player.transferListed);
                  setSellMsg(player.transferListed
                    ? 'Retirado da lista.'
                    : 'Na lista — os clubes vão começar a fazer propostas nas próximas jornadas.');
                }}
              />
            </View>
          </View>
        ) : null}
        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.5),
  },
  ovrBox: { width: 46, height: 46, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  ovrText: { color: '#141414', fontSize: 20, fontWeight: '800' },
  name: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: 2 },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },

  tabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing(1),
  },
  tab: { flex: 1, paddingVertical: theme.spacing(1), alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: theme.colors.blue },
  tabText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '600' },
  tabTextActive: { color: theme.colors.blue },

  group: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700',
    letterSpacing: 1.2, marginTop: theme.spacing(2), marginBottom: theme.spacing(0.5),
  },

  renewBox: { marginTop: theme.spacing(2), gap: theme.spacing(1.5) },
  renewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  renewMsg: { color: theme.colors.green, fontSize: theme.font.body, marginVertical: theme.spacing(0.5) },
  bidBox: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), marginTop: theme.spacing(1.5),
    gap: theme.spacing(1),
  },
  bidTitle: { color: theme.colors.textDim, fontSize: theme.font.small },
  bidFee: { color: theme.colors.green, fontSize: theme.font.h1, fontWeight: '800' },
});
