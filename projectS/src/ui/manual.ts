/**
 * MANUAL DE JOGO — o índice do que existe e onde está.
 *
 * O tutorial guiado ensina a jogar na primeira vez; o manual responde ao
 * "espera, o que faz isto?" três horas depois. São coisas diferentes e por isso
 * vivem em sítios diferentes: o tutorial aparece uma vez, o manual está sempre
 * nas Definições.
 *
 * O conteúdo é só ESTRUTURA + chaves i18n. O texto vive no ficheiro de
 * traduções como todo o resto do jogo — um manual com strings fixas ficaria em
 * português para quem joga em inglês, que é exatamente o tipo de buraco que a
 * regra dos 3 idiomas existe para evitar.
 *
 * `where` é o caminho no jogo ("Clube › Equipa técnica"). É o que transforma
 * isto num manual em vez de uma lista de conceitos: quem lê fica a saber onde
 * carregar.
 */

export interface ManualEntry {
  /** Chave do título da entrada. */
  titleKey: string;
  /** Chave do corpo. */
  bodyKey: string;
  /** Chave do caminho na UI ("Tática › Bolas paradas"). Opcional. */
  whereKey?: string;
}

export interface ManualChapter {
  id: string;
  icon: string;
  titleKey: string;
  entries: ManualEntry[];
}

const e = (id: string, where?: string): ManualEntry => ({
  titleKey: `man.${id}.t`,
  bodyKey: `man.${id}.b`,
  whereKey: where ? `man.${id}.w` : undefined,
});

export const MANUAL: ManualChapter[] = [
  {
    id: 'basics',
    icon: '▶',
    titleKey: 'man.ch.basics',
    entries: [
      e('loop', 'w'),
      e('week', 'w'),
      e('season', 'w'),
      e('save', 'w'),
    ],
  },
  {
    id: 'squad',
    icon: '☰',
    titleKey: 'man.ch.squad',
    entries: [
      e('overall', 'w'),
      e('attrs', 'w'),
      e('fitness', 'w'),
      e('morale', 'w'),
      e('injury', 'w'),
      e('suspension', 'w'),
      e('cards', 'w'),
      e('relations', 'w'),
    ],
  },
  {
    id: 'tactics',
    icon: '◫',
    titleKey: 'man.ch.tactics',
    entries: [
      e('formation', 'w'),
      e('mentality', 'w'),
      e('sliders', 'w'),
      e('roles', 'w'),
      e('setpieces', 'w'),
      e('load', 'w'),
      e('subs', 'w'),
    ],
  },
  {
    id: 'training',
    icon: '⚙',
    titleKey: 'man.ch.training',
    entries: [
      e('teamTraining', 'w'),
      e('individual', 'w'),
      e('retrain', 'w'),
      e('growth', 'w'),
    ],
  },
  {
    id: 'market',
    icon: '⇄',
    titleKey: 'man.ch.market',
    entries: [
      e('windows', 'w'),
      e('offers', 'w'),
      e('interest', 'w'),
      e('clauses', 'w'),
      e('free', 'w'),
      e('precontract', 'w'),
      e('loans', 'w'),
      e('scouting', 'w'),
      e('academy', 'w'),
    ],
  },
  {
    id: 'money',
    icon: '€',
    titleKey: 'man.ch.money',
    entries: [
      e('balance', 'w'),
      e('budgets', 'w'),
      e('gate', 'w'),
      e('upkeep', 'w'),
      e('insolvency', 'w'),
      e('facilities', 'w'),
      e('staff', 'w'),
    ],
  },
  {
    id: 'compete',
    icon: '#',
    titleKey: 'man.ch.compete',
    entries: [
      e('league', 'w'),
      e('promotion', 'w'),
      e('cup', 'w'),
      e('europe', 'w'),
      e('derby', 'w'),
      e('world', 'w'),
    ],
  },
  {
    id: 'career',
    icon: '★',
    titleKey: 'man.ch.career',
    entries: [
      e('objective', 'w'),
      e('confidence', 'w'),
      e('fans', 'w'),
      e('press', 'w'),
      e('sack', 'w'),
      e('jobs', 'w'),
      e('history', 'w'),
    ],
  },
  {
    id: 'match',
    icon: '⚽',
    titleKey: 'man.ch.match',
    entries: [
      e('engine', 'w'),
      e('live', 'w'),
      e('goalclip', 'w'),
      e('ratings', 'w'),
    ],
  },
];

/** Nº total de entradas — mostrado no cabeçalho do manual. */
export const MANUAL_ENTRIES = MANUAL.reduce((n, c) => n + c.entries.length, 0);
