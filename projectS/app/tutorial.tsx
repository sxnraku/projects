/**
 * TUTORIAL GUIADO — mostrado uma vez por carreira, logo depois de escolher clube.
 *
 * O tutorial antigo era um carrossel de seis cartões ao centro: dizia o que
 * cada aba fazia e desaparecia. Ninguém aprende a jogar assim, porque nada do
 * que se lê está ligado ao que se vê.
 *
 * Este leva o treinador PELO JOGO: navega para a aba certa, escurece o ecrã
 * todo menos o elemento de que está a falar, e explica-o ali, encostado ao
 * próprio elemento. Cada passo é uma coisa que se faz, não uma etiqueta.
 *
 * Se um alvo ainda não foi medido (ecrã nunca aberto, elemento fora do que está
 * visível), o passo cai para um cartão centrado com o mesmo texto — o tutorial
 * nunca fica preso à espera de uma medição.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '../src/ui/i18n';
import { theme } from '../src/ui/theme';
import {
  clearTargets, forgetTarget, getTargetRect, remeasure, subscribeTargets, TutorialTargets,
} from '../src/ui/tutorial/registry';

/** Um passo: onde vive, o que aponta e o que diz. */
interface Step {
  /** Aba para onde navegar antes de mostrar o passo. */
  route?: string;
  /** Elemento a destacar. Sem alvo = cartão ao centro (capítulos). */
  target?: string;
  titleKey: string;
  bodyKey: string;
  /** Marca os passos de abertura de capítulo (visual diferente). */
  chapter?: boolean;
}

const STEPS: Step[] = [
  // --------------------------------------------------------- boas-vindas
  { titleKey: 'tut.welcome.t', bodyKey: 'tut.welcome.b', chapter: true },

  // ------------------------------------------------------------- início
  { route: '/(tabs)', target: TutorialTargets.topBar, titleKey: 'tut.topbar.t', bodyKey: 'tut.topbar.b' },
  { route: '/(tabs)', target: TutorialTargets.nextMatch, titleKey: 'tut.next.t', bodyKey: 'tut.next.b' },
  { route: '/(tabs)', target: TutorialTargets.advance, titleKey: 'tut.advance.t', bodyKey: 'tut.advance.b' },
  { route: '/(tabs)', target: TutorialTargets.inbox, titleKey: 'tut.inbox.t', bodyKey: 'tut.inbox.b' },
  { route: '/(tabs)', target: TutorialTargets.fansCard, titleKey: 'tut.fans.t', bodyKey: 'tut.fans.b' },

  // ------------------------------------------------------------- plantel
  { titleKey: 'tut.ch.squad.t', bodyKey: 'tut.ch.squad.b', chapter: true },
  { route: '/(tabs)/squad', target: TutorialTargets.squadFilters, titleKey: 'tut.squadFilters.t', bodyKey: 'tut.squadFilters.b' },
  { route: '/(tabs)/squad', target: TutorialTargets.squadRow, titleKey: 'tut.squadRow.t', bodyKey: 'tut.squadRow.b' },
  { route: '/(tabs)/squad', target: TutorialTargets.squadRow, titleKey: 'tut.injuries.t', bodyKey: 'tut.injuries.b' },

  // -------------------------------------------------------------- tática
  { titleKey: 'tut.ch.tactics.t', bodyKey: 'tut.ch.tactics.b', chapter: true },
  { route: '/(tabs)/tactics', target: TutorialTargets.formation, titleKey: 'tut.formation.t', bodyKey: 'tut.formation.b' },
  { route: '/(tabs)/tactics', target: TutorialTargets.pitch, titleKey: 'tut.pitch.t', bodyKey: 'tut.pitch.b' },
  { route: '/(tabs)/tactics', target: TutorialTargets.pitch, titleKey: 'tut.roles.t', bodyKey: 'tut.roles.b' },
  { route: '/(tabs)/tactics', target: TutorialTargets.setPieces, titleKey: 'tut.setPieces.t', bodyKey: 'tut.setPieces.b' },
  { titleKey: 'tut.talk.t', bodyKey: 'tut.talk.b' },

  // ------------------------------------------------------------- mercado
  { titleKey: 'tut.ch.market.t', bodyKey: 'tut.ch.market.b', chapter: true },
  { route: '/(tabs)/market', target: TutorialTargets.marketList, titleKey: 'tut.market.t', bodyKey: 'tut.market.b' },
  { route: '/(tabs)/market', target: TutorialTargets.marketList, titleKey: 'tut.free.t', bodyKey: 'tut.free.b' },

  // ---------------------------------------------------------------- liga
  { route: '/(tabs)/league', target: TutorialTargets.leagueTable, titleKey: 'tut.league.t', bodyKey: 'tut.league.b' },

  // --------------------------------------------------------------- clube
  { titleKey: 'tut.ch.club.t', bodyKey: 'tut.ch.club.b', chapter: true },
  { route: '/(tabs)/club', target: TutorialTargets.clubFinances, titleKey: 'tut.money.t', bodyKey: 'tut.money.b' },
  { route: '/(tabs)/club', target: TutorialTargets.clubFacilities, titleKey: 'tut.facilities.t', bodyKey: 'tut.facilities.b' },
  { route: '/(tabs)/club', target: TutorialTargets.clubStaff, titleKey: 'tut.staff.t', bodyKey: 'tut.staff.b' },
  { route: '/(tabs)/club', target: TutorialTargets.manual, titleKey: 'tut.manual.t', bodyKey: 'tut.manual.b' },

  // ------------------------------------------------------------- fechar
  { route: '/(tabs)', titleKey: 'tut.end.t', bodyKey: 'tut.end.b', chapter: true },
];

/** Folga à volta do elemento destacado, para o buraco não o cortar. */
const PAD = 8;
/** Espaço mínimo que o cartão precisa acima/abaixo do alvo. */
const CARD_GAP = 12;
/** Altura mínima que o cartão ocupa — abaixo disto não cabe de lado nenhum. */
const CARD_MIN_H = 260;

export default function Tutorial({ onDone }: { onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  // As medidas dos alvos chegam de forma assíncrona (cada ecrã mede-se quando
  // desenha). Subscrever o registo mantém o buraco em cima do elemento certo
  // sem andar a sondar com `setInterval`.
  const [, bump] = useState(0);
  useEffect(() => subscribeTargets(() => bump((v) => v + 1)), []);
  const rect = getTargetRect(step.target);

  // ORIGEM DO OVERLAY em coordenadas de janela — o elo que faltava entre a
  // medição do alvo e o desenho do buraco. Ver o comentário no `return`.
  const overlayRef = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const measureOrigin = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y) => {
      setOrigin((o) => (Math.abs(o.x - x) < 0.5 && Math.abs(o.y - y) < 0.5 ? o : { x, y }));
    });
  }, []);

  // O BURACO SEGUE O ELEMENTO, em vez de ser fotografado uma vez.
  //
  // As coordenadas são de janela e mudam sem que o `onLayout` do alvo dispare:
  // basta o ecrã fazer scroll, ou um cartão acima aparecer mais tarde (dados
  // assíncronos) e empurrar tudo para baixo. Antes media-se em quatro instantes
  // fixos depois de mudar de passo; se o ecrã montasse ou mexesse depois do
  // último, o buraco ficava onde o elemento ESTEVE — era esse o destaque
  // desalinhado.
  //
  // Agora remede-se em ciclo enquanto o passo está à vista. O custo é um
  // `measureInWindow` a cada 250 ms, e o `setTargetRect` ignora medições
  // iguais, por isso só há redesenho quando o elemento se mexe mesmo.
  //
  // O `forgetTarget` é o que impede o pior caso: se o ecrã do alvo não estiver
  // montado, ficava lá a medida da visita ANTERIOR e o buraco aparecia, cheio
  // de confiança, no sítio errado. Sem medida, o passo cai no cartão centrado.
  useEffect(() => {
    const id = step.target;
    if (!id) return undefined;
    forgetTarget(id);
    measureOrigin();
    remeasure(id);
    const timer = setInterval(() => { measureOrigin(); remeasure(id); }, 250);
    return () => clearInterval(timer);
  }, [i, step.target, measureOrigin]);

  // Navega para a aba do passo. O tutorial conduz — não pede que o utilizador
  // encontre o ecrã sozinho, que é onde os tutoriais costumam perder gente.
  //
  // `navigate` e não `push`: com `push`, os passos empilhavam ecrãs no
  // histórico e, no fim, o botão de voltar obrigava a dezenas de toques para
  // sair do jogo. `navigate` reutiliza o ecrã que já lá está.
  useEffect(() => {
    if (step.route) router.navigate(step.route as never);
  }, [i, step.route, router]);

  useEffect(() => () => clearTargets(), []);

  const finish = () => { clearTargets(); onDone(); };

  const win = Dimensions.get('window');

  // O alvo só serve se estiver MESMO à vista. Alvos que vivem dentro de um
  // ScrollView (as bolas paradas, o staff) podem estar medidos abaixo da dobra:
  // o buraco ficava desenhado fora do ecrã e o cartão ia atrás dele, deixando o
  // tutorial preso num ecrã escuro sem nada em que carregar. Nesse caso o passo
  // passa a cartão centrado — explica na mesma, e quem quiser vê o sítio a
  // seguir.
  const onScreen = !!rect
    && rect.width > 0 && rect.height > 0
    && rect.y + rect.height > 0
    && rect.y < win.height - 48;

  // O buraco desenha-se em coordenadas DO OVERLAY, e o alvo foi medido em
  // coordenadas da JANELA. Descontar a origem do overlay é o que junta os dois.
  //
  // Mede-se em vez de se assumir: com o overlay colado ao topo a origem é (0,0)
  // e não muda nada, mas se algum dia levar um `SafeAreaView`, uma barra ou um
  // padding, isto corrige-se sozinho em vez de ficar torto outra vez.
  const hole = onScreen && rect ? {
    x: Math.max(0, rect.x - origin.x - PAD),
    y: Math.max(0, rect.y - origin.y - PAD),
    width: Math.min(win.width, rect.width + PAD * 2),
    height: rect.height + PAD * 2,
  } : null;

  // ONDE PÔR O CARTÃO.
  //
  // Abaixo do alvo se lá couber; senão acima; e se NENHUM dos lados tiver
  // espaço — um alvo alto como o campo de jogo ocupa quase o ecrã todo — o
  // cartão vai para o meio, por cima do próprio alvo.
  //
  // Este último caso não existia e dava um ecrã escurecido SEM cartão nenhum:
  // o contentor ficava ancorado tão acima que saía da janela, e o tutorial
  // parecia congelado sem forma de avançar.
  const below = hole ? hole.y + hole.height : 0;
  const spaceBelow = hole ? win.height - below : 0;
  const spaceAbove = hole ? hole.y : 0;
  const placeBelow = hole ? spaceBelow >= CARD_MIN_H : false;
  const placeAbove = hole ? !placeBelow && spaceAbove >= CARD_MIN_H : false;
  const centred = !hole || (!placeBelow && !placeAbove);

  return (
    // SEM `Modal`.
    //
    // O overlay estava dentro de um `<Modal statusBarTranslucent>`, que no
    // Android é uma JANELA NATIVA à parte. Os alvos medem-se com
    // `measureInWindow` na janela da APP; o buraco era desenhado na janela do
    // Modal. Duas janelas, dois sistemas de coordenadas — e o destaque saía ao
    // lado do elemento por um desvio constante que nenhuma remedição corrige.
    //
    // O `Modal` também não era preciso para ficar por cima: o `TutorialGate` já
    // é irmão do navegador na raiz (ver `_layout.tsx`), portanto um `View`
    // absoluto aqui cobre tudo na mesma.
    <View
      ref={overlayRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={measureOrigin}
    >
      <View style={styles.fill} pointerEvents="box-none">
        {/* MÁSCARA — quatro retângulos à volta do buraco. É assim (e não com um
            SVG com máscara) porque o projeto não tem react-native-svg e quatro
            Views fazem exatamente o mesmo com zero dependências. */}
        {hole ? (
          <>
            <View style={[styles.shade, { left: 0, right: 0, top: 0, height: hole.y }]} />
            <View style={[styles.shade, { left: 0, top: hole.y, width: hole.x, height: hole.height }]} />
            <View style={[styles.shade, {
              left: hole.x + hole.width, right: 0, top: hole.y, height: hole.height,
            }]} />
            <View style={[styles.shade, { left: 0, right: 0, top: hole.y + hole.height, bottom: 0 }]} />
            <View
              pointerEvents="none"
              testID="tutorial-ring"
              style={[styles.ring, {
                left: hole.x, top: hole.y, width: hole.width, height: hole.height,
              }]}
            />
          </>
        ) : (
          <View style={[styles.shade, StyleSheet.absoluteFillObject]} />
        )}

        {/* CARTÃO */}
        <View
          style={[
            styles.cardWrap,
            // Os `Math.min` são a rede de segurança: aconteça o que acontecer à
            // medição, o cartão nunca sai da janela.
            placeBelow
              ? { top: Math.min(below + CARD_GAP, win.height - CARD_MIN_H), bottom: undefined }
              : placeAbove
                ? { bottom: Math.min(win.height - hole!.y + CARD_GAP, win.height - CARD_MIN_H), top: undefined }
                // Centrado: esticar de topo a fundo. Só com `justifyContent` o
                // contentor colapsava e o cartão ficava colado ao cimo do ecrã.
                : { top: 0, bottom: 0, justifyContent: 'center' },
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.card, step.chapter && styles.cardChapter, centred && hole && styles.cardOverTarget]}>
            <View style={styles.headRow}>
              <Text style={styles.kicker}>
                {step.chapter ? t('tut.chapter') : t('tutorial.title')}
              </Text>
              <Pressable onPress={finish} hitSlop={10}>
                <Text style={styles.skip}>{t('tutorial.skip')}</Text>
              </Pressable>
            </View>

            <Text style={styles.title}>{t(step.titleKey)}</Text>
            <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.body}>{t(step.bodyKey)}</Text>
            </ScrollView>

            {/* Barra de progresso — num tutorial de 21 passos, pontinhos não se leem. */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((i + 1) / STEPS.length) * 100}%` }]} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.counter}>{t('tutorial.step', { n: i + 1, total: STEPS.length })}</Text>
              <View style={{ flex: 1 }} />
              {i > 0 ? (
                <Pressable onPress={() => setI(i - 1)} hitSlop={8} style={styles.backBtn}>
                  <Text style={styles.backText}>{t('tut.back')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => (last ? finish() : setI(i + 1))}
                style={styles.nextBtn}
              >
                <Text style={styles.nextText}>
                  {last ? t('tutorial.done') : t('tutorial.next')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.78)' },
  ring: {
    position: 'absolute', borderWidth: 2, borderColor: theme.colors.green,
    borderRadius: theme.radius.sm,
  },

  cardWrap: { position: 'absolute', left: 0, right: 0, padding: theme.spacing(1.5) },
  card: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing(2),
  },
  cardChapter: { borderColor: theme.colors.green },
  // Cartão por cima do próprio alvo (alvos altos): sombra a separar os dois.
  cardOverTarget: {
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 12,
  },

  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: {
    color: theme.colors.green, fontSize: theme.font.small, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  skip: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },

  title: {
    color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800',
    marginTop: theme.spacing(1),
  },
  body: {
    color: theme.colors.textDim, fontSize: theme.font.body, lineHeight: 21,
    marginTop: theme.spacing(0.75),
  },

  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: theme.colors.border,
    marginTop: theme.spacing(1.5), overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: theme.colors.green },

  footer: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: theme.spacing(1.5) },
  counter: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  backBtn: { paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(0.9) },
  backText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800' },
  nextBtn: {
    backgroundColor: theme.colors.green, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1),
  },
  nextText: { color: '#08130C', fontSize: theme.font.body, fontWeight: '900' },
});
