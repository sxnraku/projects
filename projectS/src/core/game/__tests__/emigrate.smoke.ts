/**
 * Teste de fumo da EMIGRAÇÃO — mudar de país sem perder a carreira.
 * Corre com: npm run smoke:emigrate
 *
 * O risco desta funcionalidade não é ela não funcionar: é funcionar e levar
 * metade do save à frente. Por isso a maioria destes testes verifica o que TEM
 * de sobreviver, não o que muda.
 */
import {
  acceptMeritOffer,
  activeCountrySlug,
  advanceWeek,
  countryNameOf,
  createNewGame,
  emigrate,
  generateMeritOffers,
  isAbroad,
  rolloverSeason,
  worldTeamOfClubId,
} from '../index';
import { deserialize, serialize } from '../../../persistence/serialize';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('EMIGRAÇÃO — teste de fumo\n');

// ------------------------------------------------------------- identificação
console.log('Identificar um clube estrangeiro:');
const s = createNewGame({ managerName: 'Renato', useBase: true, seed: 2024 });
const paisInicial = activeCountrySlug(s);
console.log(`  país inicial: ${paisInicial} (${countryNameOf(paisInicial)})`);

const meu = s.clubs[s.meta.managedClubId]!;
assert(!isAbroad(s, meu.id), 'o meu próprio clube não conta como estrangeiro');

const outroLocal = Object.values(s.clubs).find((c) => c.id !== meu.id)!;
assert(!isAbroad(s, outroLocal.id), 'um clube do mesmo país não conta como estrangeiro');

// Um clube de 1ª divisão de OUTRO país.
const { WORLD_TEAMS } = require('../../data/world/worldTeams') as typeof import('../../data/world/worldTeams');
const estrangeiro = WORLD_TEAMS.find((t) => t.slug !== paisInicial && t.tier === 1 && t.forca > 70)!;
const alvo = `club_${estrangeiro.id}`;
assert(isAbroad(s, alvo), `${estrangeiro.name} (${estrangeiro.country}) é reconhecido como estrangeiro`);
assert(worldTeamOfClubId(alvo)?.id === estrangeiro.id, 'o id do clube resolve para a equipa do dataset');
assert(worldTeamOfClubId('lixo') === undefined, 'um id inválido não resolve para nada');

// --------------------------------------------- carreira antes de emigrar
console.log('\nUma carreira com passado:');
let semanasEp = 0;
while (semanasEp++ < 80 && !advanceWeek(s).seasonEnded) { /* joga a época */ }
// `advanceWeek` NÃO vira a época — quem o faz é `rolloverSeason`. Sem esta
// chamada a "carreira com passado" não tinha passado nenhum: zero épocas
// registadas, zero troféus e a reputação parada nos 45 iniciais. Foi assim que
// eu próprio andei a "verificar" a funcionalidade sem estar a verificar nada.
rolloverSeason(s);
s.career.trophies.push({ season: s.meta.season, key: 'trophy.league' });
s.career.reputation = 75;
s.career.timesFired = 1;
const trofeusAntes = s.career.trophies.length;
const epocasAntes = s.career.seasons.length;
const historicoAntes = s.history?.seasons.length ?? 0;
const nomeAntes = s.meta.managerName;
const saveAntes = s.meta.saveId;
const epocaAntes = s.meta.season;
console.log(`  ${trofeusAntes} troféu(s) · ${epocasAntes} época(s) registada(s) · reputação ${s.career.reputation}`);

// ------------------------------------------------------------- emigrar
console.log('\nEmigrar:');
const r = emigrate(s, alvo);
assert(r.ok, `mudou-se para ${r.clubName} (${countryNameOf(r.country ?? '')})`);
assert(activeCountrySlug(s) === estrangeiro.slug, 'o país ativo passou a ser o novo');
assert(s.meta.managedClubId === alvo, 'o clube gerido é o que fez a oferta');
assert(!!s.clubs[alvo], 'o clube novo existe mesmo no estado');
assert((s.clubs[alvo]!.squad.length ?? 0) > 10, `o plantel novo foi materializado (${s.clubs[alvo]!.squad.length})`);

console.log('\nO que TEM de sobreviver:');
assert(s.career.trophies.length === trofeusAntes, `os ${trofeusAntes} troféus vieram com ele`);
assert(s.career.seasons.length === epocasAntes, 'o registo época a época veio com ele');
assert((s.history?.seasons.length ?? 0) === historicoAntes, 'o histórico do mundo manteve-se');
assert(s.career.reputation === 75, 'a reputação de treinador manteve-se');
assert(s.career.timesFired === 1, 'os despedimentos anteriores continuam contados');
assert(s.meta.managerName === nomeAntes, 'o nome do treinador manteve-se');
assert(s.meta.saveId === saveAntes, 'é o MESMO save, não uma carreira nova');
assert(s.meta.season === epocaAntes, 'a época não recuou');

console.log('\nO que fica para trás:');
assert(s.career.meritOffers?.length === 0, 'as ofertas foram limpas');
assert(s.inbox.length === 0, 'a caixa de entrada do clube antigo ficou para trás');
assert(s.career.preContracts?.length === 0, 'os pré-contratos do clube antigo não vêm');
const paisDosClubes = new Set(Object.values(s.clubs).map((c) => c.country));
assert(paisDosClubes.size === 1 && paisDosClubes.has(estrangeiro.slug),
  'não sobrou nenhum clube do país anterior');

// -------------------------------------------------- o jogo continua a andar
console.log('\nO jogo continua:');
let semanas = 0;
let rebentou = false;
try {
  for (let i = 0; i < 80; i++) { semanas++; if (advanceWeek(s).seasonEnded) break; }
  rolloverSeason(s);
} catch (e) {
  rebentou = true;
  console.error('   ', (e as Error).message);
}
assert(!rebentou, `${semanas} jornadas jogadas no país novo sem rebentar`);
assert(s.career.trophies.length >= trofeusAntes, 'os troféus antigos continuam lá depois de jogar');

// ----------------------------------------------------------- save round-trip
console.log('\nO save aguenta:');
const round = deserialize(serialize(s));
assert(round.meta.managedClubId === alvo, 'o clube gerido sobrevive ao save');
assert(activeCountrySlug(round) === estrangeiro.slug, 'o país ativo sobrevive ao save');
assert(round.career.trophies.length === s.career.trophies.length, 'os troféus sobrevivem ao save');
assert(Object.keys(round.clubs).length === Object.keys(s.clubs).length, 'os clubes do país novo sobrevivem');

// ------------------------------------------------------- recusar com segurança
console.log('\nRecusar com segurança:');
const s2 = createNewGame({ managerName: 'R', useBase: true, seed: 31 });
const antesClube = s2.meta.managedClubId;
assert(!emigrate(s2, 'club_999999').ok, 'um clube inexistente não emigra');
assert(s2.meta.managedClubId === antesClube, 'e não deixa o save a meio');
assert(!acceptMeritOffer(s2, alvo), 'não se aceita uma oferta que não foi feita');

// ------------------------------------------ o caminho COMPLETO, ponta a ponta
//
// Tudo acima chama `emigrate()` à mão. Este bloco verifica o que o JOGADOR vive:
// a oferta é gerada sozinha, aparece na lista, e aceitá-la muda mesmo de país.
// Sem isto a funcionalidade podia estar correta e nunca chegar a acontecer.
console.log('\nDa oferta à mudança, ponta a ponta:');
const s3 = createNewGame({ managerName: 'R', useBase: true, seed: 909 });
let w3 = 0;
while (w3++ < 80 && !advanceWeek(s3).seasonEnded) { /* joga */ }
// Treinador de topo — é a condição que a funcionalidade pressupõe.
s3.career.confidence = 90;
s3.career.reputation = 80;
const geradas = generateMeritOffers(s3);
const doFora = geradas.filter((id) => isAbroad(s3, id));
assert(doFora.length === 1, `um treinador de topo recebe 1 oferta do estrangeiro (${doFora.length})`);

const wtOferta = worldTeamOfClubId(doFora[0]!)!;
assert(wtOferta.tier === 1, `a oferta é de 1ª divisão (${wtOferta.name}, ${wtOferta.country})`);
assert(wtOferta.slug !== activeCountrySlug(s3), 'e de um país diferente do atual');

s3.career.meritOffers = geradas;
const paisAntes3 = activeCountrySlug(s3);
assert(acceptMeritOffer(s3, doFora[0]!), 'aceitar a oferta estrangeira devolve true');
assert(activeCountrySlug(s3) !== paisAntes3,
  `o país mudou de ${countryNameOf(paisAntes3)} para ${countryNameOf(activeCountrySlug(s3))}`);
assert(s3.clubs[s3.meta.managedClubId]?.name === wtOferta.name, 'o clube gerido é o que fez a oferta');
assert(s3.news.some((n) => n.key === 'news.emigrated'), 'a mudança gerou notícia');

let w4 = 0;
let partiu = false;
try { while (w4++ < 20) advanceWeek(s3); } catch { partiu = true; }
assert(!partiu, `${w4 - 1} jornadas jogadas no país novo sem rebentar`);

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
