import React from 'react';
import { Image, View } from 'react-native';

/**
 * Bandeira nacional REAL — imagem PNG empacotada (assets/flags/<slug>.png), sem
 * módulos nativos nem rede. As imagens vêm do flagcdn.com (domínio público) e são
 * carregadas por `require` estático (exigência do Metro). Recebe o slug do país
 * (Club.country / League.country / COUNTRIES.slug).
 */

// Mapa estático slug → asset. Tem de ser literal (o Metro resolve `require` em
// tempo de build; não aceita caminho dinâmico).
export const FLAG_IMAGES: Record<string, number> = {
  albania: require('../../assets/flags/albania.png'),
  andorra: require('../../assets/flags/andorra.png'),
  argentina: require('../../assets/flags/argentina.png'),
  armenia: require('../../assets/flags/armenia.png'),
  austria: require('../../assets/flags/austria.png'),
  azerbaijao: require('../../assets/flags/azerbaijao.png'),
  belgica: require('../../assets/flags/belgica.png'),
  bielorrussia: require('../../assets/flags/bielorrussia.png'),
  bosniaeherzegovina: require('../../assets/flags/bosniaeherzegovina.png'),
  brazil: require('../../assets/flags/brazil.png'),
  bulgaria: require('../../assets/flags/bulgaria.png'),
  cazaquistao: require('../../assets/flags/cazaquistao.png'),
  chipre: require('../../assets/flags/chipre.png'),
  croacia: require('../../assets/flags/croacia.png'),
  dinamarca: require('../../assets/flags/dinamarca.png'),
  england: require('../../assets/flags/england.png'),
  escocia: require('../../assets/flags/escocia.png'),
  eslovaquia: require('../../assets/flags/eslovaquia.png'),
  eslovenia: require('../../assets/flags/eslovenia.png'),
  estonia: require('../../assets/flags/estonia.png'),
  finlandia: require('../../assets/flags/finlandia.png'),
  france: require('../../assets/flags/france.png'),
  georgia: require('../../assets/flags/georgia.png'),
  germany: require('../../assets/flags/germany.png'),
  gibraltar: require('../../assets/flags/gibraltar.png'),
  grecia: require('../../assets/flags/grecia.png'),
  hungria: require('../../assets/flags/hungria.png'),
  ilhasfaroe: require('../../assets/flags/ilhasfaroe.png'),
  irlanda: require('../../assets/flags/irlanda.png'),
  irlandadonorte: require('../../assets/flags/irlandadonorte.png'),
  islandia: require('../../assets/flags/islandia.png'),
  israel: require('../../assets/flags/israel.png'),
  italia: require('../../assets/flags/italia.png'),
  kosovo: require('../../assets/flags/kosovo.png'),
  letonia: require('../../assets/flags/letonia.png'),
  lituania: require('../../assets/flags/lituania.png'),
  luxemburgo: require('../../assets/flags/luxemburgo.png'),
  macedoniadonorte: require('../../assets/flags/macedoniadonorte.png'),
  malta: require('../../assets/flags/malta.png'),
  moldavia: require('../../assets/flags/moldavia.png'),
  montenegro: require('../../assets/flags/montenegro.png'),
  netherlands: require('../../assets/flags/netherlands.png'),
  noruega: require('../../assets/flags/noruega.png'),
  paisdegales: require('../../assets/flags/paisdegales.png'),
  polonia: require('../../assets/flags/polonia.png'),
  portugal: require('../../assets/flags/portugal.png'),
  republicacheca: require('../../assets/flags/republicacheca.png'),
  romenia: require('../../assets/flags/romenia.png'),
  sanmarino: require('../../assets/flags/sanmarino.png'),
  servia: require('../../assets/flags/servia.png'),
  spain: require('../../assets/flags/spain.png'),
  suecia: require('../../assets/flags/suecia.png'),
  suica: require('../../assets/flags/suica.png'),
  turquia: require('../../assets/flags/turquia.png'),
  ucrania: require('../../assets/flags/ucrania.png'),
};

/** Aliases para valores legados (ex.: código alpha-3 antigo). */
const ALIAS: Record<string, string> = { PRT: 'portugal', prt: 'portugal' };

export function flagSource(slug: string): number | undefined {
  return FLAG_IMAGES[slug] ?? FLAG_IMAGES[ALIAS[slug] ?? ''];
}

interface Props {
  slug: string;
  size?: number; // altura em px; largura = 1.4× (mesmo footprint da versão antiga), salvo `circle`
  circle?: boolean;
}

export function CountryFlag({ slug, size = 24, circle = false }: Props) {
  const src = flagSource(slug);
  const w = circle ? size : Math.round(size * 1.4);
  const h = size;
  const radius = circle ? size / 2 : 3;
  return (
    <View style={{
      width: w, height: h, borderRadius: radius, overflow: 'hidden',
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)',
      backgroundColor: 'rgba(255,255,255,0.06)',
    }}>
      {src != null && (
        <Image source={src} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      )}
    </View>
  );
}
