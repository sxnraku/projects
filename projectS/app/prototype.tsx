import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrototypeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'matchday' | 'player' | 'tactics' | 'office'>('matchday');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Header */}
      <View style={styles.topNav}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backBtnText}>Voltar</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>PROTÓTIPO NEXT-GEN</Text>
          <Text style={styles.headerSubtitle}>Football Legacy UI 2.0</Text>
        </View>
        <View style={styles.badgeLive}>
          <View style={styles.pulseDot} />
          <Text style={styles.badgeLiveText}>PREVIEW</Text>
        </View>
      </View>

      {/* Tabs Selector */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'matchday' && styles.tabBtnActive]}
          onPress={() => setActiveTab('matchday')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'matchday' && styles.tabBtnTextActive]}>
            Jornada
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'player' && styles.tabBtnActive]}
          onPress={() => setActiveTab('player')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'player' && styles.tabBtnTextActive]}>
            Jogador
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'tactics' && styles.tabBtnActive]}
          onPress={() => setActiveTab('tactics')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'tactics' && styles.tabBtnTextActive]}>
            Tática
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'office' && styles.tabBtnActive]}
          onPress={() => setActiveTab('office')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'office' && styles.tabBtnTextActive]}>
            Gabinete
          </Text>
        </Pressable>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'matchday' && (
          <View style={styles.cardSection}>
            {/* Matchday Broadcast Card */}
            <View style={styles.glassCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.matchTag}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.matchTagText}>PRÓXIMO DUELO · JORNADA 28</Text>
                </View>
                <View style={styles.derbyBadge}>
                  <Text style={styles.derbyBadgeText}>DÉRBI ETERNO</Text>
                </View>
              </View>

              {/* Faceoff */}
              <View style={styles.faceoffRow}>
                <View style={styles.teamCol}>
                  <View style={[styles.crestBox, { backgroundColor: '#1E40AF', borderColor: '#60A5FA' }]}>
                    <Text style={styles.crestLetter}>SLB</Text>
                  </View>
                  <Text style={styles.teamName}>Benfica</Text>
                  <View style={styles.formRow}>
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#94A3B8' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                  </View>
                </View>

                <View style={styles.vsCol}>
                  <View style={styles.vsCircle}>
                    <Text style={styles.vsText}>VS</Text>
                  </View>
                  <Text style={styles.timeText}>SÁB 20:30</Text>
                </View>

                <View style={styles.teamCol}>
                  <View style={[styles.crestBox, { backgroundColor: '#991B1B', borderColor: '#F87171' }]}>
                    <Text style={styles.crestLetter}>SCP</Text>
                  </View>
                  <Text style={styles.teamName}>Sporting</Text>
                  <View style={styles.formRow}>
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#FF3366' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#00F59B' }]} />
                    <View style={[styles.formDot, { backgroundColor: '#94A3B8' }]} />
                  </View>
                </View>
              </View>

              {/* Sector Bars */}
              <View style={styles.sectorBox}>
                <View style={styles.sectorRow}>
                  <Text style={[styles.sectorVal, { color: '#60A5FA' }]}>86</Text>
                  <View style={styles.sectorBarWrap}>
                    <View style={[styles.sectorBar, { width: '53%', backgroundColor: '#3B82F6' }]} />
                    <View style={[styles.sectorBar, { width: '47%', backgroundColor: '#EF4444' }]} />
                  </View>
                  <Text style={[styles.sectorVal, { color: '#F87171' }]}>83</Text>
                  <Text style={styles.sectorLabel}>ATQ</Text>
                </View>

                <View style={styles.sectorRow}>
                  <Text style={[styles.sectorVal, { color: '#60A5FA' }]}>88</Text>
                  <View style={styles.sectorBarWrap}>
                    <View style={[styles.sectorBar, { width: '56%', backgroundColor: '#3B82F6' }]} />
                    <View style={[styles.sectorBar, { width: '44%', backgroundColor: '#EF4444' }]} />
                  </View>
                  <Text style={[styles.sectorVal, { color: '#F87171' }]}>81</Text>
                  <Text style={styles.sectorLabel}>MÉD</Text>
                </View>

                <View style={styles.sectorRow}>
                  <Text style={[styles.sectorVal, { color: '#60A5FA' }]}>84</Text>
                  <View style={styles.sectorBarWrap}>
                    <View style={[styles.sectorBar, { width: '51%', backgroundColor: '#3B82F6' }]} />
                    <View style={[styles.sectorBar, { width: '49%', backgroundColor: '#EF4444' }]} />
                  </View>
                  <Text style={[styles.sectorVal, { color: '#F87171' }]}>83</Text>
                  <Text style={styles.sectorLabel}>DEF</Text>
                </View>
              </View>

              {/* Hero Button */}
              <Pressable
                style={styles.heroPlayBtn}
                onPress={() => Alert.alert('Simulação ao Vivo', 'A arrancar simulação de dérbi com novo motor gráfico.')}
              >
                <Text style={styles.heroPlayBtnText}>JOGAR PARTIDA</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeTab === 'player' && (
          <View style={styles.cardSection}>
            {/* Player Card */}
            <View style={styles.futCard}>
              <View style={styles.futHeader}>
                <View style={styles.futRatingCol}>
                  <Text style={styles.futOvr}>89</Text>
                  <View style={styles.futPosBadge}>
                    <Text style={styles.futPosText}>MCO</Text>
                  </View>
                  <View style={styles.captainPill}>
                    <Text style={styles.captainPillText}>CAPITÃO</Text>
                  </View>
                </View>
                <View style={styles.futAvatarBox}>
                  <Text style={styles.futAvatarText}>10</Text>
                </View>
              </View>

              <View style={styles.futIdentity}>
                <Text style={styles.futName}>Bernardo Neves</Text>
                <Text style={styles.futMeta}>Portugal · 25 Anos · € 58,4 M</Text>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#00F59B' }]}>88</Text>
                  <Text style={styles.statLbl}>PAS</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#00F59B' }]}>91</Text>
                  <Text style={styles.statLbl}>VIS</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#00D2FF' }]}>85</Text>
                  <Text style={styles.statLbl}>DRI</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>82</Text>
                  <Text style={styles.statLbl}>REM</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>84</Text>
                  <Text style={styles.statLbl}>VEL</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#FFB800' }]}>94</Text>
                  <Text style={styles.statLbl}>LID</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'tactics' && (
          <View style={styles.cardSection}>
            {/* Tactical Pitch Board */}
            <View style={styles.glassCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.tacticsTitle}>4-3-3 OFENSIVO</Text>
                <View style={styles.pillGreen}>
                  <Text style={styles.pillGreenText}>PRESSÃO ALTA</Text>
                </View>
              </View>

              {/* Pitch */}
              <View style={styles.pitch}>
                {/* Lines */}
                <View style={styles.pitchHalfLine} />
                <View style={styles.pitchCircle} />

                {/* Nodes */}
                <View style={[styles.node, { top: '88%', left: '46%' }]}>
                  <Text style={styles.nodeNum}>1</Text>
                </View>
                <View style={[styles.node, { top: '72%', left: '12%' }]}>
                  <Text style={styles.nodeNum}>2</Text>
                </View>
                <View style={[styles.node, styles.nodeCaptain, { top: '74%', left: '34%' }]}>
                  <Text style={styles.nodeNum}>3</Text>
                </View>
                <View style={[styles.node, { top: '74%', left: '58%' }]}>
                  <Text style={styles.nodeNum}>4</Text>
                </View>
                <View style={[styles.node, { top: '72%', left: '80%' }]}>
                  <Text style={styles.nodeNum}>5</Text>
                </View>
                <View style={[styles.node, { top: '54%', left: '46%' }]}>
                  <Text style={styles.nodeNum}>6</Text>
                </View>
                <View style={[styles.node, { top: '44%', left: '26%' }]}>
                  <Text style={styles.nodeNum}>8</Text>
                </View>
                <View style={[styles.node, { top: '40%', left: '66%' }]}>
                  <Text style={styles.nodeNum}>10</Text>
                </View>
                <View style={[styles.node, { top: '20%', left: '14%' }]}>
                  <Text style={styles.nodeNum}>7</Text>
                </View>
                <View style={[styles.node, { top: '14%', left: '46%' }]}>
                  <Text style={styles.nodeNum}>9</Text>
                </View>
                <View style={[styles.node, { top: '20%', left: '78%' }]}>
                  <Text style={styles.nodeNum}>11</Text>
                </View>
              </View>

              <View style={styles.tacticsFooterRow}>
                <Text style={styles.tacticsFooterText}>Mentalidade: <Text style={{ color: '#00F59B' }}>Ofensiva</Text></Text>
                <Text style={styles.tacticsFooterText}>Ritmo: <Text style={{ color: '#00D2FF' }}>Rápido</Text></Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'office' && (
          <View style={styles.cardSection}>
            {/* Manager Office Dialogue */}
            <View style={styles.glassCard}>
              <View style={styles.officeHeader}>
                <View style={styles.officeIconWrap}>
                  <Text style={styles.officeIconText}>AUD</Text>
                </View>
                <View>
                  <Text style={styles.officeTitle}>Audiência com Jogador</Text>
                  <Text style={styles.officeSub}>Bernardo Neves (Capitão) solicitou reunião</Text>
                </View>
              </View>

              <View style={styles.speechBubble}>
                <Text style={styles.speechText}>
                  "Mister, tenho trabalhado no limite nos treinos e considero justo ter mais tempo de jogo como titular nas próximas jornadas."
                </Text>
              </View>

              <View style={styles.choicesCol}>
                <Pressable
                  style={styles.choiceBtn}
                  onPress={() => Alert.alert('Decisão', 'Prometeste titularidade. A moral subiu (+4). Não falhes a promessa.')}
                >
                  <Text style={styles.choiceBtnText}>A. Prometer titularidade no dérbi</Text>
                </Pressable>
                <Pressable
                  style={styles.choiceBtn}
                  onPress={() => Alert.alert('Decisão', 'Pediste paciência. O jogador aceitou com respeito à liderança.')}
                >
                  <Text style={styles.choiceBtnText}>B. Pedir paciência e foco no grupo</Text>
                </Pressable>
                <Pressable
                  style={styles.choiceBtn}
                  onPress={() => Alert.alert('Decisão', 'Recusaste com autoridade. Moral do jogador -3, autoridade mantida.')}
                >
                  <Text style={styles.choiceBtnText}>C. Recusar: "Ninguém é intocável aqui"</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080B10',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(14, 19, 30, 0.8)',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: '#00F59B',
    fontSize: 11,
    fontWeight: '600',
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 245, 155, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 155, 0.3)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00F59B',
  },
  badgeLiveText: {
    color: '#00F59B',
    fontSize: 9,
    fontWeight: '800',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0E131E',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(0, 245, 155, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 155, 0.4)',
  },
  tabBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#00F59B',
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
  },
  cardSection: {
    gap: 16,
  },
  glassCard: {
    backgroundColor: 'rgba(18, 24, 38, 0.85)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  matchTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchTagText: {
    color: '#00F59B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  derbyBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  derbyBadgeText: {
    color: '#F87171',
    fontSize: 9,
    fontWeight: '800',
  },
  faceoffRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 10,
  },
  teamCol: {
    alignItems: 'center',
    gap: 6,
  },
  crestBox: {
    width: 52,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestLetter: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  teamName: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
  },
  formRow: {
    flexDirection: 'row',
    gap: 3,
  },
  formDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vsCol: {
    alignItems: 'center',
    gap: 4,
  },
  vsCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  vsText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  timeText: {
    color: '#00D2FF',
    fontSize: 10,
    fontWeight: '700',
  },
  sectorBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  sectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectorVal: {
    fontSize: 11,
    fontWeight: '800',
    width: 20,
    textAlign: 'center',
  },
  sectorBarWrap: {
    flex: 1,
    height: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sectorBar: {
    height: '100%',
  },
  sectorLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    width: 32,
    textAlign: 'center',
  },
  heroPlayBtn: {
    backgroundColor: '#00F59B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#00F59B',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  heroPlayBtnText: {
    color: '#052316',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  futCard: {
    backgroundColor: 'rgba(26, 35, 54, 0.95)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  futHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  futRatingCol: {
    gap: 4,
  },
  futOvr: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFF',
    lineHeight: 40,
  },
  futPosBadge: {
    backgroundColor: 'rgba(0, 210, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  futPosText: {
    color: '#00D2FF',
    fontSize: 11,
    fontWeight: '800',
  },
  captainPill: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  captainPillText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
  futAvatarBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 245, 155, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  futAvatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
  },
  futIdentity: {
    alignItems: 'center',
    marginVertical: 14,
  },
  futName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  futMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 10,
  },
  statBox: {
    width: '33.3%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statVal: {
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '800',
  },
  statLbl: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  tacticsTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  pillGreen: {
    backgroundColor: 'rgba(0, 245, 155, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillGreenText: {
    color: '#00F59B',
    fontSize: 10,
    fontWeight: '800',
  },
  pitch: {
    height: 220,
    backgroundColor: '#143825',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    position: 'relative',
    overflow: 'hidden',
  },
  pitchHalfLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  pitchCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginLeft: -30,
    marginTop: -30,
  },
  node: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00F59B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  nodeCaptain: {
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  nodeNum: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
  tacticsFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  tacticsFooterText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  officeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  officeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  officeIconText: {
    color: '#00D2FF',
    fontSize: 10,
    fontWeight: '900',
  },
  officeTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  officeSub: {
    color: '#64748B',
    fontSize: 11,
  },
  speechBubble: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  speechText: {
    color: '#E2E8F0',
    fontSize: 12.5,
    lineHeight: 18,
  },
  choicesCol: {
    gap: 8,
  },
  choiceBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  choiceBtnText: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '600',
  },
});
