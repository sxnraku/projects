/** Conjuntos de nomes para geração procedural de jogadores e clubes. */

export const FIRST_NAMES = [
  'João', 'Pedro', 'Rui', 'André', 'Bruno', 'Diogo', 'Tiago', 'Miguel',
  'Nuno', 'Ricardo', 'Fábio', 'Hélder', 'Gonçalo', 'Rafael', 'Daniel',
  'Vítor', 'Sérgio', 'Paulo', 'Luís', 'Carlos', 'Hugo', 'Marco', 'José',
  'António', 'Filipe', 'Renato', 'Eduardo', 'Bernardo', 'Francisco', 'Duarte',
 
];

export const LAST_NAMES = [
  'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues',
  'Martins', 'Jesus', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes',
  'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira',
  'Moreira', 'Correia', 'Mendes', 'Nunes', 'Soares', 'Vieira', 'Monteiro',
  'Ronaldo', 'Barbosa', 'Cunha', 'Figueiredo', 'Cardoso', 'Moura', 'Coelho',
];

export const CITIES = [
  'Lisboa', 'Porto', 'Braga', 'Coimbra', 'Aveiro', 'Faro', 'Setúbal', 'Leiria',
  'Viseu', 'Guimarães', 'Funchal', 'Évora', 'Faial', 'Sintra', 'Vila Real',
  'Bragança', 'Portimão', 'Chaves', 'Tomar', 'Beja', 'Vila de Conde', 'Ponta Delgada',
   'Lagos', 'Albufeira', 'Covilhã', 'Santarém', 'Vila Nova de Gaia', 'Amadora', 'Oeiras', 'Cascais', 'Matosinhos', 'Viana do Castelo', 'Póvoa de Varzim', 'Guarda', 'Sines', 'Almada', 'Seixal', 'Montijo', 'Barreiro', 'Vila Franca de Xira', 'Torres Vedras', 'Peniche', 'Loulé', 'Oliveira de Azeméis',
];

/** Estilo dos nomes de clube, escolhido ao criar carreira. */
export type NameStyle = 'serious' | 'meme' | 'mixed';

/** Sufixos "a sério" — clubes com cara de clube. */
export const SERIOUS_SUFFIXES = ['FC', 'SC', 'CD', 'GD', 'AD', 'Atlético', 'União', 'Sporting', 'Académico', 'Estrela'];

/** Sufixos "meme/brainrot" — só para quem quer piada. */
export const MEME_SUFFIXES = ['Tung Tung Tung', 'Skibidi', 'Ohio', 'Sigma', 'Gronk', 'Rizzler', 'Gyatt', 'Fanum', 'Mewing'];

/** Devolve o conjunto de sufixos conforme o estilo escolhido. */
export function suffixesFor(style: NameStyle): string[] {
  if (style === 'meme') return MEME_SUFFIXES;
  if (style === 'mixed') return [...SERIOUS_SUFFIXES, ...MEME_SUFFIXES];
  return SERIOUS_SUFFIXES;
}

/** @deprecated Usa `suffixesFor(style)`. Mantido para compatibilidade. */
export const CLUB_SUFFIXES = SERIOUS_SUFFIXES;

export const NATIONALITIES = ['PRT', 'BRA', 'ESP', 'ARG', 'FRA', 'ENG'];
