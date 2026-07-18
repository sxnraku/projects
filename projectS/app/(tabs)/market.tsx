import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../../src/state/gameStore';
import { suggestedWage } from '../../src/core/economy';
import { naturalOverall, Player } from '../../src/core/models';
import { money, wage } from '../../src/ui/format';
import { attrColor, theme } from '../../src/ui/theme';
import { Body, Button, PosText, RowKV, Screen, Stepper } from '../components';

type Feedback = { kind: 'ok' | 'counter' | 'error'; text: string } | null;

export default function Market() {
  const state = useGameStore((s) => s.state);
  const submitOffer = useGameStore((s) => s.submitOffer);

  const managedId = state?.meta.managedClubId;
  const budget = managedId ? state?.finances[managedId]?.transferBudget ?? 0 : 0;

  // Negociação inline: jogador selecionado + termos atuais.
  const [openId, setOpenId] = useState<string | null>(null);
  const [fee, setFee] = useState(0);
  const [wageOffer, setWageOffer] = useState(0);
  const [years, setYears] = useState(3);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const targets = useMemo(() => {
    if (!state) return [];
    return Object.values(state.players)
      .filter((p) => p.clubId && p.clubId !== managedId)
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 100);
  }, [state, managedId]);

  if (!state || !managedId) return <Screen><Body>A carregar…</Body></Screen>;

  const openNegotiation = (p: Player) => {
    setOpenId(p.id);
    setFee(Math.round(p.marketValue / 1000) * 1000);
    setWageOffer(suggestedWage(p, state.meta.season));
    setYears(3);
    setFeedback(null);
  };

  const send = (p: Player) => {
    const evaluation = submitOffer({
      playerId: p.id, fromClubId: managedId, fee, wageOffer, contractYears: years,
    });
    if (evaluation.decision === 'ACCEPTED') {
      setFeedback({ kind: 'ok', text: `${p.firstName} ${p.lastName} assinou por ${money(fee)}.` });
      setOpenId(null);
    } else if (evaluation.decision === 'COUNTER') {
      setFeedback({ kind: 'counter', text: evaluation.reason });
      // Ajusta automaticamente os termos ao pedido, para o utilizador só confirmar.
      if (evaluation.requiredFee) setFee(evaluation.requiredFee);
      if (evaluation.requiredWage) setWageOffer(evaluation.requiredWage);
    } else {
      setFeedback({ kind: 'error', text: evaluation.reason });
    }
  };

  return (
    <Screen>
      <View style={styles.budgetRow}>
        <Text style={styles.budgetLabel}>ORÇAMENTO</Text>
        <Text style={styles.budgetVal}>{money(budget)}</Text>
      </View>

      {feedback ? (
        <Text style={[styles.feedback, {
          color: feedback.kind === 'ok' ? theme.colors.green
            : feedback.kind === 'counter' ? theme.colors.yellow : theme.colors.red,
        }]}>
          {feedback.text}
        </Text>
      ) : null}

      <FlatList
        data={targets}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={styles.headRow}>
            <Text style={[styles.h, styles.cOvr]}>OVR</Text>
            <Text style={[styles.h, styles.cName]}>Nome</Text>
            <Text style={[styles.h, styles.cNum]}>Id</Text>
            <Text style={[styles.h, styles.cVal]}>Valor</Text>
            <Text style={[styles.h, styles.cVal]}>Salário</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            <TargetRow
              player={item}
              clubName={state.clubs[item.clubId!]?.shortName ?? ''}
              open={openId === item.id}
              onPress={() => (openId === item.id ? setOpenId(null) : openNegotiation(item))}
            />
            {openId === item.id ? (
              <View style={styles.negBox}>
                <RowKV k="Valor de mercado" v={money(item.marketValue)} />
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>A tua oferta</Text>
                  <Stepper
                    value={fee}
                    onChange={setFee}
                    step={Math.max(50_000, Math.round(item.marketValue * 0.05 / 1000) * 1000)}
                    min={0}
                    format={money}
                  />
                </View>
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>Salário</Text>
                  <Stepper
                    value={wageOffer}
                    onChange={setWageOffer}
                    step={Math.max(100, Math.round(wageOffer * 0.1 / 100) * 100)}
                    min={100}
                    format={(v) => wage(v)}
                  />
                </View>
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>Duração</Text>
                  <Stepper value={years} onChange={setYears} step={1} min={1} max={5} format={(v) => `${v} anos`} />
                </View>
                <View style={{ marginTop: theme.spacing(1) }}>
                  <Button
                    label={fee > budget ? 'Orçamento insuficiente' : 'Enviar proposta'}
                    disabled={fee > budget}
                    onPress={() => send(item)}
                  />
                </View>
              </View>
            ) : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: theme.spacing(3) }}
      />
    </Screen>
  );
}

function TargetRow({
  player, clubName, open, onPress,
}: { player: Player; clubName: string; open: boolean; onPress: () => void }) {
  const ovr = naturalOverall(player);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, (pressed || open) && styles.rowOpen]}>
      <Text style={[styles.cell, styles.cOvr, { color: attrColor(ovr), fontWeight: '700' }]}>{ovr}</Text>
      <View style={styles.cName}>
        <Text style={styles.cell} numberOfLines={1}>{player.lastName}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <PosText position={player.positions[0]!} style={{ fontSize: 9 }} />
          <Text style={styles.sub}>{clubName}</Text>
        </View>
      </View>
      <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.age}</Text>
      <Text style={[styles.cell, styles.cVal]}>{money(player.marketValue)}</Text>
      <Text style={[styles.cell, styles.cVal, styles.dim]}>{wage(player.wage)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  budgetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(1.25),
  },
  budgetLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 1.2 },
  budgetVal: { color: theme.colors.green, fontSize: theme.font.h2, fontWeight: '700', fontVariant: ['tabular-nums'] },
  feedback: { fontSize: theme.font.body, fontWeight: '600', marginBottom: theme.spacing(1) },

  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.75), gap: 4 },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), gap: 4 },
  rowOpen: { backgroundColor: theme.colors.surfaceAlt },
  cell: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
  dim: { color: theme.colors.textDim },
  cOvr: { width: 32, textAlign: 'center' },
  cName: { flex: 1 },
  cNum: { width: 26, textAlign: 'center' },
  cVal: { width: 64, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  negBox: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(1.5), marginVertical: theme.spacing(1),
  },
  negRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.75),
  },
  negLabel: { color: theme.colors.textDim, fontSize: theme.font.body },
});
