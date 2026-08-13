import React, { useEffect, useState } from 'react';
import { useMonetizationStore } from '../../src/state/monetizationStore';
import { buyPremium, premiumPrice, purchasesAvailable } from '../../src/native/purchases';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { Spot } from '../../src/ui/tutorial/Spot';
import { TutorialTargets } from '../../src/ui/tutorial/registry';
import { abilityTo100, STAFF_ROLES, StaffMember, StaffRole } from '../../src/core/staff';
import { FACILITY_MAX_LEVEL, weeklyNet } from '../../src/core/models';
import {
  cashRunway, cashWarning, FacilityType, facilityUpgradeCost,
  RUNWAY_WARNING_WEEKS, TRANSFER_SHARE, WAGE_RESERVE_WEEKS,
} from '../../src/core/economy';
import { showRewarded } from '../../src/native/ads';
import { money } from '../../src/ui/format';
import { theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { useT, useTMsg } from '../../src/ui/i18n';
import { LANGS, LANG_LABELS } from '../../src/core/i18n';
import { OBJECTIVE_KEYS } from '../../src/core/career';
import { CloudBackup } from '../../src/ui/CloudBackup';
import { BalanceSplit, Bar, Body, contrastOn, CrestCircle, darken, RowKV, Screen, Section, Stars } from '../components';
import { reputationStars } from '../../src/ui/theme';
import { Toast } from '../../src/ui/Toast';
import { haptic, playSound } from '../../src/ui/sound';

const FACILITY_TYPES: FacilityType[] = ['stadium', 'training', 'academy', 'medical', 'scouting'];

/** Passos de volume oferecidos na UI (um slider seria exagero para 5 valores). */
const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * Política de privacidade publicada (GitHub Pages). Verificada viva antes de
 * ser ligada — um link morto nas definições é pior do que não ter link.
 */
const PRIVACY_URL = 'https://sxnraku.github.io/projects/';

/**
 * PREMIUM — linha das Definições.
 *
 * Só aparece se a loja responder: num emulador sem Play Services, ou se o
 * produto ainda não estiver ativo na Play Console, é preferível não haver linha
 * nenhuma do que haver uma que não faz nada (era esse o problema do botão
 * anterior, que ativava o Premium sem cobrar).
 */
function PremiumRow() {
  const t = useT();
  const premium = useMonetizationStore((s) => s.m.premium);
  const setPremium = useMonetizationStore((s) => s.setPremium);
  const [available, setAvailable] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void purchasesAvailable().then((ok) => {
      if (!alive) return;
      setAvailable(ok);
      if (ok) void premiumPrice().then((p) => { if (alive) setPrice(p); });
    });
    return () => { alive = false; };
  }, []);

  // Sem loja, sem linha. Com Premium já ativo, mostra-se sempre (é a prova de
  // que a compra foi reconhecida).
  if (!available && !premium) return null;

  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingName}>{t('club.premiumName')}</Text>
        <Text style={styles.settingSub}>
          {msg ?? (premium
            ? t('club.premiumActiveSub')
            : price ? t('club.premiumPriceSub', { price }) : t('club.premiumSub'))}
        </Text>
      </View>
      <Pressable
        disabled={premium || busy}
        onPress={() => {
          setBusy(true);
          setMsg(null);
          void buyPremium().then((r) => {
            setBusy(false);
            if (r.ok) {
              setPremium(true);
              setMsg(t(r.restored ? 'club.premiumRestored' : 'club.premiumThanks'));
              return;
            }
            if (r.reason === 'CANCELLED') return; // desistir não é erro
            setMsg(t(r.reason === 'UNAVAILABLE' ? 'club.premiumUnavailable' : 'club.premiumFailed'));
          });
        }}
        style={[styles.settingBtn, (premium || busy) && styles.settingBtnDone]}
      >
        <Text style={styles.settingBtnText}>
          {premium ? t('club.premiumOn') : busy ? t('common.loading') : t('club.premiumActivate')}
        </Text>
      </Pressable>
    </View>
  );
}

export default function ClubScreen() {
  const router = useRouter();
  const t = useT();
  const tMsg = useTMsg();
  const state = useGameStore((s) => s.state);
  const club = useGameStore((s) => s.managedClub)();
  const upgrade = useGameStore((s) => s.upgrade);
  const staff = useGameStore((s) => s.staff);
  const staffCandidates = useGameStore((s) => s.staffCandidates);
  const hireStaff = useGameStore((s) => s.hireStaff);
  const fireStaff = useGameStore((s) => s.fireStaff);
  const freeUpgradePending = useGameStore((s) => s.freeUpgradePending);
  const replayTutorial = useGameStore((s) => s.replayTutorial);
  const claimFreeUpgrade = useGameStore((s) => s.claimFreeUpgrade);
  const newGame = useGameStore((s) => s.newGame);
  const lang = useGameStore((s) => s.lang);
  const setLang = useGameStore((s) => s.setLang);
  const audio = useGameStore((s) => s.audio);
  const setAudio = useGameStore((s) => s.setAudio);
  const requestBudget = useGameStore((s) => s.requestBudget);
  const budgetRequestUsed = useGameStore((s) => s.budgetRequestUsed);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  /** Lugar cuja lista de candidatos está aberta (null = todas fechadas). */
  const [openRole, setOpenRole] = useState<StaffRole | null>(null);

  if (!state || !club) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const fin = state.finances[club.id]!;
  const staffList = staff();
  const career = state.career;
  const net = weeklyNet(fin);
  const record = `${career.totalWins}V ${career.totalDraws}E ${career.totalLosses}D`;

  return (
    <Screen>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind === 'error' ? 'error' : 'ok'} onHide={() => setFeedback(null)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: theme.spacing(1.25) }}>
        {/* HERO DO CLUBE — cor, escudo, nome, divisão, estádio, reputação */}
        {(() => {
          const base = club.primaryColor;
          const ink = contrastOn(base);
          const onDim = ink === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(20,23,28,0.72)';
          return (
            <View style={[styles.hero, { backgroundColor: base }]}>
              <View style={[styles.heroShade, { backgroundColor: darken(base, 0.55) }]} />
              <View style={styles.heroGlow} />
              <View style={styles.heroRow}>
                <CrestCircle club={club} size={56} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.heroName, { color: ink }]} numberOfLines={1}>{club.name}</Text>
                  <Text style={[styles.heroSub, { color: onDim }]} numberOfLines={1}>
                    {state.leagues[club.leagueId]?.name ?? '—'} · {club.stadiumName}
                  </Text>
                  <View style={styles.heroStars}>
                    <Stars value={reputationStars(club.reputation)} />
                    <Text style={[styles.heroCap, { color: onDim }]}>{club.stadiumCapacity.toLocaleString('pt-PT')}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}

        {/* TREINADOR + números de carreira */}
        <View style={styles.card}>
          <View style={styles.managerRow}>
            <Face seed={`mgr_${state.meta.managerName}`} size={46} staff />
            <View style={{ flex: 1 }}>
              <Text style={styles.managerName}>{state.meta.managerName}</Text>
              <Text style={styles.managerSub}>{t('club.managerSub', { club: club.name, season: state.meta.season })}</Text>
            </View>
          </View>
          <View style={styles.tiles}>
            <Tile v={record} k={t('club.record')} />
            <Tile v={`${career.confidence}%`} k={t('label.confidence')}
              color={career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red} />
            <Tile v={String(career.timesFired)} k={t('club.timesFired')}
              color={career.timesFired > 0 ? theme.colors.red : undefined} />
          </View>
        </View>

        {/* FINANÇAS — cartão com saldo grande + fluxo semanal */}
        <Spot id={TutorialTargets.clubFinances}><Section title={t('club.section.balance')} /></Spot>
        <View style={styles.card}>
          <View style={styles.finTop}>
            <View>
              <Text style={styles.finLabel}>{t('fin.balance')}</Text>
              <Text style={[styles.finBig, { color: fin.balance >= 0 ? theme.colors.green : theme.colors.red }]}>{money(fin.balance)}</Text>
            </View>
            <View style={[styles.netChip, { borderColor: net >= 0 ? theme.colors.green : theme.colors.red }]}>
              <Text style={[styles.netVal, { color: net >= 0 ? theme.colors.green : theme.colors.red }]}>
                {net >= 0 ? '+' : ''}{money(net)}
              </Text>
              <Text style={styles.netLbl}>{t('fin.weeklyFlow')}</Text>
            </View>
          </View>
          {/* UM saldo, três destinos — não são carteiras separadas. */}
          <Section title={t('fin.split.title')} />
          <BalanceSplit fin={fin} />
          <Text style={styles.boardHint}>
            {t('fin.split.hint', { weeks: WAGE_RESERVE_WEEKS, share: Math.round(TRANSFER_SHARE * 100) })}
          </Text>
          <Text style={[styles.boardHint, cashWarning(fin) && { color: theme.colors.yellow, fontWeight: '700' }]}>
            {cashWarning(fin)
              ? t('fin.runway.short', { n: RUNWAY_WARNING_WEEKS })
              : t('fin.runway', { n: Math.floor(Math.min(99, cashRunway(fin))) })}
          </Text>
          <View style={styles.finSplit}>
            <View style={styles.finCol}>
              <Text style={styles.finColHead}>{t('club.section.income')}</Text>
              <FinLine k={t('income.tickets')} v={fin.income.tickets} up />
              <FinLine k={t('income.sponsorship')} v={fin.income.sponsorship} up />
              <FinLine k={t('income.tv')} v={fin.income.tvRights} up />
              <FinLine k={t('income.merch')} v={fin.income.merchandising} up />
            </View>
            <View style={styles.finCol}>
              <Text style={styles.finColHead}>{t('club.section.expenses')}</Text>
              <FinLine k={t('expense.wages')} v={fin.expenses.wages} />
              <FinLine k={t('expense.facilities')} v={fin.expenses.facilities} />
              <FinLine k={t('expense.staff')} v={fin.expenses.staff} />
            </View>
          </View>
        </View>

        {/* INSTALAÇÕES — cartões com barra de nível */}
        <Spot id={TutorialTargets.clubFacilities}><Section title={t('club.section.facilities')} /></Spot>
        {freeUpgradePending() ? (
          <View style={styles.freeBanner}>
            <Text style={styles.freeBannerText}>🎁 {t('facility.freeAvailable')}</Text>
          </View>
        ) : null}
        {FACILITY_TYPES.map((type) => {
          const tier = state.leagues[club.leagueId]?.tier ?? 1;
          const level = club.facilities[type];
          const maxed = level >= FACILITY_MAX_LEVEL;
          const cost = maxed ? 0 : facilityUpgradeCost(type, level, tier);
          const affordable = !maxed && fin.balance >= cost;
          const canFree = !maxed && freeUpgradePending();
          return (
            <View key={type} style={styles.facCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.facHead}>
                  <Text style={styles.facName}>{t(`facility.${type}`)}</Text>
                  <Text style={styles.facLvlTag}>{t('facility.level', { n: level })}</Text>
                </View>
                <Text style={styles.facEffect}>{t(`facility.effect.${type}`)}</Text>
                <View style={styles.facBarWrap}>
                  <Bar value={(level / FACILITY_MAX_LEVEL) * 100} color={theme.colors.blue} height={7} />
                </View>
              </View>
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                {canFree ? (
                  <Pressable
                    disabled={adBusy}
                    onPress={async () => {
                      if (adBusy) return;
                      setAdBusy(true);
                      const watched = await showRewarded();
                      setAdBusy(false);
                      if (!watched) { setFeedback({ kind: 'error', text: t('facility.freeFailed') }); return; }
                      const r = claimFreeUpgrade(type);
                      setFeedback(r.ok
                        ? { kind: 'ok', text: t('club.upgraded', { name: t(`facility.${type}`), level: r.newLevel ?? level + 1, cost: money(0) }) }
                        : r.error ? { kind: 'error', text: r.error } : null);
                    }}
                    style={[styles.freeBtn, adBusy && { opacity: 0.5 }]}
                  >
                    <Text style={styles.freeBtnText}>{adBusy ? t('facility.freeWatching') : `▶ ${t('facility.freeBtn')}`}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  disabled={!affordable}
                  onPress={() => {
                    const r = upgrade(type);
                    setFeedback(r.ok
                      ? { kind: 'ok', text: t('club.upgraded', { name: t(`facility.${type}`), level: r.newLevel ?? level + 1, cost: money(r.cost ?? 0) }) }
                      : r.error ? { kind: 'error', text: r.error } : null);
                  }}
                  style={[styles.facBtn, !affordable && styles.facBtnDisabled]}
                >
                  <Text style={[styles.facBtnText, !affordable && { color: theme.colors.textDim }]}>
                    {maxed ? t('facility.max') : money(cost)}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}


        {/* EQUIPA TÉCNICA — pessoas, não níveis. Somam-se às instalações. */}
        <Spot id={TutorialTargets.clubStaff}><Section title={t('staff.title')} /></Spot>
        <Text style={styles.staffSubtitle}>{t('staff.subtitle')}</Text>
        <Text style={styles.staffBill}>
          {t('staff.wageBill', { amount: money(staffList.reduce((n, m) => n + m.wage, 0)) })}
        </Text>
        {STAFF_ROLES.map((role) => {
          const member = staffList.find((m) => m.role === role) ?? null;
          const open = openRole === role;
          const candidates = open ? staffCandidates(role) : [];
          return (
            <View key={role} style={styles.staffCard}>
              <View style={styles.staffHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffRole}>{t(`staff.role.${role}`)}</Text>
                  <Text style={styles.staffEffect}>{t(`staff.effect.${role}`)}</Text>
                </View>
                <Pressable
                  onPress={() => setOpenRole(open ? null : role)}
                  style={[styles.staffToggle, open && styles.staffToggleOn]}>
                  <Text style={[styles.staffToggleText, open && styles.staffToggleTextOn]}>
                    {open ? '×' : t('staff.hire')}
                  </Text>
                </Pressable>
              </View>

              {member ? (
                <View style={styles.staffMember}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{member.name}</Text>
                    <Text style={styles.staffMeta}>
                      {t('staff.ability')} {abilityTo100(member.ability)} · {money(member.wage)}/sem · {member.age}
                    </Text>
                    <View style={styles.staffBarWrap}>
                      <Bar value={abilityTo100(member.ability)} color={theme.colors.green} height={6} />
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      const r = fireStaff(member.id);
                      setFeedback(r.ok
                        ? { kind: 'ok', text: t('staff.fired', { name: member.name }) }
                        : { kind: 'error', text: t(r.errorKey ?? '') });
                    }}
                    style={styles.staffFire}>
                    <Text style={styles.staffFireText}>{t('staff.fire')}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.staffEmpty}>{t('staff.empty')}</Text>
              )}

              {open ? (
                <View style={styles.staffCands}>
                  <Text style={styles.staffCandsTitle}>{t('staff.candidates')}</Text>
                  {candidates.length === 0 ? (
                    <Text style={styles.staffEmpty}>{t('staff.noCandidates')}</Text>
                  ) : candidates.map((c: StaffMember) => (
                    <View key={c.id} style={styles.staffCandRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.staffName}>{c.name}</Text>
                        <Text style={styles.staffMeta}>
                          {t('staff.ability')} {abilityTo100(c.ability)} · {money(c.wage)}/sem · {c.age}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          const r = hireStaff(c);
                          if (r.ok) {
                            setOpenRole(null);
                            setFeedback({
                              kind: 'ok',
                              text: r.replaced
                                ? t('staff.replaced', { name: r.replaced.name, newName: c.name })
                                : t('staff.hired', { name: c.name }),
                            });
                          } else {
                            setFeedback({ kind: 'error', text: tMsg({ key: r.errorKey ?? '', params: r.params }) });
                          }
                        }}
                        style={styles.staffHireBtn}>
                        <Text style={styles.staffHireText}>{t('staff.hire')}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {/* DIREÇÃO — objetivo, confiança e pedido de orçamento */}
        <Section title={t('club.section.board')} />
        <View style={styles.card}>
          <View style={styles.confHead}>
            <Text style={styles.confTitle}>{t('label.confidence')}</Text>
            <Text style={[styles.confPct, {
              color: career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red,
            }]}>{career.confidence}%</Text>
          </View>
          <Bar value={career.confidence} height={8}
            color={career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red} />
          <Text style={styles.boardObjective}>{t(OBJECTIVE_KEYS[career.objective])}</Text>
          <Pressable
            disabled={budgetRequestUsed()}
            onPress={() => {
              const r = requestBudget();
              setFeedback({ kind: r.granted > 0 ? 'ok' : 'error', text: tMsg({ key: r.messageKey, params: r.messageParams }) });
            }}
            style={[styles.boardBtn, budgetRequestUsed() && styles.boardBtnOff]}
          >
            <Text style={styles.boardBtnText}>{t('club.board.requestBudget')}</Text>
          </Pressable>
          <Text style={styles.boardHint}>{t('club.board.requestHint')}</Text>
        </View>

        {/* CÓPIA NA NUVEM (Google Drive) */}
        <Section title={t('cloud.section')} />
        <CloudBackup />

        {/* TROFÉUS */}
        <Section title={t('club.section.trophies')} />
        {career.trophies.length === 0 ? (
          <Text style={styles.empty}>{t('club.noTrophies')}</Text>
        ) : (
          career.trophies.map((tr, i) => (
            <View key={i} style={styles.trophyRow}>
              <Text style={styles.trophyIcon}>🏆</Text>
              <Text style={styles.trophyText}>{tMsg(tr)}</Text>
              <Text style={styles.trophySeason}>{tr.season}</Text>
            </View>
          ))
        )}

        {/* HISTORIAL */}
        <Section title={t('club.historyFull')} />
        {career.seasons.length === 0 ? (
          <Text style={styles.empty}>{t('club.firstSeason')}</Text>
        ) : (
          <View>
            <View style={styles.histHead}>
              <Text style={[styles.hh, { width: 44 }]}>{t('hist.season')}</Text>
              <Text style={[styles.hh, { flex: 1 }]}>{t('hist.clubLeague')}</Text>
              <Text style={[styles.hh, { width: 30, textAlign: 'center' }]}>{t('hist.pos')}</Text>
              <Text style={[styles.hh, { width: 30, textAlign: 'right' }]}>{t('hist.pts')}</Text>
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
        <Section title={t('club.section.settings')} />

        {/* AJUDA — manual completo + repetir o tutorial guiado. Fica em
            primeiro nas Definições porque é o que alguém perdido procura. */}
        <Spot id={TutorialTargets.manual}>
          <Pressable style={styles.helpBtn} onPress={() => router.push('/manual' as never)}>
            <Text style={styles.helpIcon}>📖</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.helpTitle}>{t('manual.title')}</Text>
              <Text style={styles.helpSub}>{t('manual.subtitle')}</Text>
            </View>
            <Text style={styles.helpChevron}>›</Text>
          </Pressable>
        </Spot>
        <Pressable style={styles.helpBtn} onPress={() => { replayTutorial(); router.push('/(tabs)' as never); }}>
          <Text style={styles.helpIcon}>🎓</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>{t('manual.replayTutorial')}</Text>
            <Text style={styles.helpSub}>{t('manual.replayTutorial.sub')}</Text>
          </View>
          <Text style={styles.helpChevron}>›</Text>
        </Pressable>

        {/* Idioma — 3 botões */}
        <Text style={styles.langLabel}>{t('club.lang')}</Text>
        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <Pressable key={l} onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnOn]}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextOn]}>{LANG_LABELS[l]}</Text>
            </Pressable>
          ))}
        </View>

        {/* SOM E VIBRAÇÃO — tudo desligável; o volume tem 5 passos, que chega
            para um jogo de gestão e evita um slider só para isto. */}
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>{t('club.sound')}</Text>
            <Text style={styles.settingSub}>{t('club.soundSub')}</Text>
          </View>
          <Pressable
            onPress={() => {
              const on = !audio.sound;
              setAudio({ sound: on });
              if (on) playSound('click');
            }}
            style={[styles.settingBtn, audio.sound && styles.settingBtnDone]}
          >
            <Text style={styles.settingBtnText}>{audio.sound ? t('common.on') : t('common.off')}</Text>
          </Pressable>
        </View>

        <Text style={styles.langLabel}>{t('club.volume')}</Text>
        <View style={styles.langRow}>
          {VOLUME_STEPS.map((v) => {
            const on = Math.abs(audio.volume - v) < 0.01;
            return (
              <Pressable
                key={v}
                disabled={!audio.sound}
                onPress={() => { setAudio({ volume: v }); if (v > 0) playSound('click'); }}
                style={[styles.langBtn, on && styles.langBtnOn, !audio.sound && styles.langBtnOff]}
              >
                <Text style={[styles.langBtnText, on && audio.sound && styles.langBtnTextOn]}>
                  {Math.round(v * 100)}%
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>{t('club.haptics')}</Text>
            <Text style={styles.settingSub}>{t('club.hapticsSub')}</Text>
          </View>
          <Pressable
            onPress={() => {
              const on = !audio.haptics;
              setAudio({ haptics: on });
              if (on) haptic('medium'); // amostra imediata do que se acabou de ligar
            }}
            style={[styles.settingBtn, audio.haptics && styles.settingBtnDone]}
          >
            <Text style={styles.settingBtnText}>{audio.haptics ? t('common.on') : t('common.off')}</Text>
          </Pressable>
        </View>

        {/* PREMIUM — compra a sério pela Play Store. O botão antigo chamava
            `setPremium(true)` e mais nada: sem compra, sem pagamento, e perdia-se
            ao fechar a app. Ver `src/native/purchases.ts` e `docs/PREMIUM.md`. */}
        <PremiumRow />

        {/* POLÍTICA DE PRIVACIDADE — a app mostra anúncios e pede consentimento
            (UMP); ter o documento a um toque é o mínimo, e a Play Store espera
            encontrá-lo também dentro da app, não só na ficha da loja. */}
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>{t('club.privacyName')}</Text>
            <Text style={styles.settingSub}>{t('club.privacySub')}</Text>
          </View>
          <Pressable
            onPress={() => { void Linking.openURL(PRIVACY_URL); }}
            style={styles.settingBtn}
          >
            <Text style={styles.settingBtnText}>{t('club.privacyOpen')}</Text>
          </Pressable>
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>{t('club.newCareer')}</Text>
            <Text style={styles.settingSub}>{confirmReset ? t('club.newCareerConfirmSub') : t('club.newCareerSub')}</Text>
          </View>
          <Pressable
            onPress={() => {
              if (!confirmReset) { setConfirmReset(true); return; }
              setConfirmReset(false);
              newGame({ managerName: '', useBase: true }); // volta ao onboarding; auto-save trata do resto
            }}
            style={[styles.settingBtn, confirmReset && styles.settingBtnDanger]}
          >
            <Text style={[styles.settingBtnText, confirmReset && { color: '#fff' }]}>
              {confirmReset ? t('club.confirm') : t('club.restart')}
            </Text>
          </Pressable>
        </View>

        <RowKV k={t('club.version')} v="1.0.0" />
        <Text style={styles.legal}>{t('club.legal')}</Text>

        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}

/** Tile de estatística (3 por linha) no cartão do treinador. */
function Tile({ v, k, color }: { v: string; k: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileV, color ? { color } : null]} numberOfLines={1}>{v}</Text>
      <Text style={styles.tileK} numberOfLines={1}>{k}</Text>
    </View>
  );
}

/** Linha compacta de receita/despesa (verde para cima, vermelho para baixo). */
function FinLine({ k, v, up }: { k: string; v: number; up?: boolean }) {
  return (
    <View style={styles.finLine}>
      <Text style={styles.finLineK} numberOfLines={1}>{k}</Text>
      <Text style={[styles.finLineV, { color: up ? theme.colors.green : theme.colors.red }]}>{money(v)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Ajuda (manual + tutorial)
  helpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.25), marginBottom: theme.spacing(0.75),
  },
  helpIcon: { fontSize: 20 },
  helpTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  helpSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  helpChevron: { color: theme.colors.textDim, fontSize: 20, fontWeight: '800' },

  staffSubtitle: { color: theme.colors.textDim, fontSize: 12, marginBottom: 2 },
  staffBill: { color: theme.colors.text, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  staffCard: {
    backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  staffHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  staffRole: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  staffEffect: { color: theme.colors.textDim, fontSize: 11, marginTop: 1 },
  staffToggle: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent,
  },
  staffToggleOn: { backgroundColor: theme.colors.border, borderColor: theme.colors.border },
  staffToggleText: { color: theme.colors.accent, fontSize: 12, fontWeight: '700' },
  staffToggleTextOn: { color: theme.colors.textDim },
  staffMember: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  staffName: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  staffMeta: { color: theme.colors.textDim, fontSize: 11, marginTop: 1 },
  staffBarWrap: { marginTop: 5, maxWidth: 160 },
  staffEmpty: { color: theme.colors.textDim, fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  staffFire: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.red,
  },
  staffFireText: { color: theme.colors.red, fontSize: 11, fontWeight: '700' },
  staffCands: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  staffCandsTitle: { color: theme.colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  staffCandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  staffHireBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: theme.colors.green,
  },
  staffHireText: { color: '#04240f', fontSize: 12, fontWeight: '800' },

  // ---- Hero / cartões ----
  hero: {
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), overflow: 'hidden',
    marginBottom: theme.spacing(1.25),
  },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', opacity: 0.5 },
  heroGlow: { position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5) },
  heroName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  heroStars: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: 6 },
  heroCap: { fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), marginBottom: theme.spacing(0.5),
  },
  tiles: { flexDirection: 'row', gap: 8, marginTop: theme.spacing(1.25) },
  tile: {
    flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm,
    paddingVertical: 10, alignItems: 'center',
  },
  tileV: { color: theme.colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileK: { color: theme.colors.textDim, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 3 },

  // ---- Finanças ----
  finTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing(1) },
  finLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  finBig: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  netChip: { borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1), paddingVertical: 6, alignItems: 'flex-end' },
  netVal: { fontSize: theme.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  netLbl: { color: theme.colors.textDim, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginTop: 1 },
  finSplit: { flexDirection: 'row', gap: theme.spacing(1.5), marginTop: theme.spacing(1), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: theme.spacing(1) },
  finCol: { flex: 1 },
  finColHead: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  finLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, gap: 6 },
  finLineK: { color: theme.colors.textDim, fontSize: theme.font.small, flex: 1 },
  finLineV: { fontSize: theme.font.small, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // ---- Instalações ----
  facCard: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), marginBottom: theme.spacing(0.75),
  },
  facHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  facLvlTag: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '800' },
  facBarWrap: { marginTop: 8 },
  freeBanner: {
    backgroundColor: 'rgba(55,194,90,0.14)', borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.sm, paddingVertical: theme.spacing(0.9), paddingHorizontal: theme.spacing(1.25),
    marginBottom: theme.spacing(0.75),
  },
  freeBannerText: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '800' },
  freeBtn: {
    backgroundColor: theme.colors.green, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(1), minWidth: 88, alignItems: 'center',
  },
  freeBtnText: { color: '#04170c', fontSize: theme.font.small, fontWeight: '800' },

  // ---- Direção ----
  confHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  confTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  confPct: { fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },

  managerRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  managerName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  managerSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  boardObjective: { color: theme.colors.text, fontSize: theme.font.small, marginTop: 4, marginBottom: theme.spacing(1) },
  boardBtn: {
    backgroundColor: theme.colors.blue, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(1.1), alignItems: 'center', marginTop: theme.spacing(0.5),
  },
  boardBtnOff: { backgroundColor: theme.colors.surfaceAlt },
  boardBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  boardHint: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 4 },

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
  langLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(1), marginBottom: theme.spacing(0.5) },
  langRow: { flexDirection: 'row', gap: theme.spacing(0.75), marginBottom: theme.spacing(0.5) },
  langBtn: {
    flex: 1, paddingVertical: theme.spacing(1), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface,
  },
  langBtnOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  langBtnOff: { opacity: 0.4 },
  langBtnText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  langBtnTextOn: { color: theme.colors.blue },
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
