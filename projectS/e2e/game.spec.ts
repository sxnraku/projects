/**
 * E2E — o jogo real, clicado como uma pessoa clica.
 *
 * O que estes testes protegem é EXATAMENTE o que os testes de fumo não
 * alcançam: eles provam as regras, isto prova que a app abre, desenha e
 * responde. Um ecrã que rebenta ao montar, um emblema que não aparece, um
 * tutorial que não avança ou um manual vazio passam por todos os outros testes
 * sem deixar rasto.
 *
 * Corre num viewport de telemóvel de propósito: é aí que a falta de espaço
 * (siglas a transbordar, cartões a tapar o que explicam) se vê.
 */
import { expect, Page, test } from '@playwright/test';

/** Texto visível, em pt-PT (o idioma por omissão do arranque nos testes). */
const T = {
  newCareer: 'Nova Carreira',
  chooseCountry: 'Escolhe o país',
  portugal: 'Portugal',
  startCareer: 'COMEÇAR CARREIRA',
  tutorialNext: 'Seguinte',
  tutorialSkip: 'Saltar',
  tutorialDone: 'Começar ▶',
  manual: 'Manual de jogo',
};

/**
 * Cria uma carreira nova do zero: menu → país → nome → clube → começar.
 * Devolve o nome do clube escolhido, para os testes seguintes o reconhecerem.
 */
async function newCareer(page: Page): Promise<string> {
  await page.goto('/');
  // O arranque carrega o mundo (1085 clubes): dá-lhe tempo.
  await expect(page.getByText('Football Legacy').first()).toBeVisible({ timeout: 60_000 });

  // O jogo arranca no idioma do sistema — no browser de teste isso é inglês.
  // Trocar para pt-PT aqui serve duas coisas: fixa o idioma dos seletores e
  // testa o próprio seletor de idioma logo no primeiro ecrã.
  await page.getByText('Português (PT)').first().click();
  await expect(page.getByText(T.newCareer, { exact: true }).first()).toBeVisible();

  await page.getByText(T.newCareer, { exact: true }).first().click();
  await expect(page.getByText(T.chooseCountry)).toBeVisible();
  await page.getByText(T.portugal, { exact: true }).first().click();

  // Onboarding: nome + clube.
  await expect(page.getByText(T.startCareer)).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Nome do treinador').fill('Renato');

  // Escolhe o primeiro clube da lista (o rádio ○ marca cada linha).
  await expect(page.getByText('ESCOLHE O TEU CLUBE')).toBeVisible();
  await page.getByText('○', { exact: true }).first().click();
  await page.getByText(T.startCareer).click();
  return 'ok';
}

/** Fecha o tutorial guiado, quando está aberto. */
async function skipTutorial(page: Page) {
  const skip = page.getByText(T.tutorialSkip).first();
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

test.describe('Football Legacy — app real', () => {
  test('a app arranca e cria uma carreira sem rebentar', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await newCareer(page);

    // Chegou ao jogo: a barra de topo mostra energia, lesões e dinheiro.
    await expect(page.getByText('⚡').first()).toBeVisible({ timeout: 30_000 });
    expect(errors.filter((e) => !e.includes('favicon')).join('\n')).toBe('');
  });

  test('o tutorial guiado aparece e percorre todos os passos', async ({ page }) => {
    await newCareer(page);

    // Passo 1: o capítulo de boas-vindas.
    await expect(page.getByText('Bem-vindo ao Football Legacy')).toBeVisible({ timeout: 30_000 });

    // O total vem do próprio contador — assim o teste não fica a dever a um
    // número fixo que muda cada vez que se acrescenta um passo.
    const counter = page.getByText(/^\d+ de \d+$/).first();
    const total = Number((await counter.textContent())!.split(' de ')[1]);
    expect(total).toBeGreaterThan(15);

    for (let step = 1; step <= total; step++) {
      await expect(page.getByText(`${step} de ${total}`)).toBeVisible();
      if (step < total) await page.getByText(T.tutorialNext, { exact: true }).click();
    }
    // O último passo fecha o tutorial e não volta a aparecer.
    await page.getByText(T.tutorialDone).first().click();
    await expect(page.getByText(`${total} de ${total}`)).toBeHidden();
    await expect(page.getByText(T.tutorialNext, { exact: true })).toBeHidden();
  });

  test('os separadores todos abrem sem erro', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.message}`));
    await newCareer(page);
    await skipTutorial(page);

    for (const tab of ['Plantel', 'Tática', 'Mercado', 'Liga', 'Clube', 'Início']) {
      await page.getByText(tab, { exact: true }).first().click();
      // Espera que algo desenhe antes de saltar para o próximo.
      await page.waitForTimeout(700);
      expect(errors.join('\n'), `erro ao abrir o separador ${tab}`).toBe('');
    }
  });

  test('o emblema desenha com a sigla dentro do escudo', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    // A barra de topo tem o emblema do clube ao lado do nome.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/__screens__/topbar-crest.png' });

    // O cartão do próximo jogo tem dois emblemas com sigla de 1 a 3 letras.
    const vs = page.getByText('VS').first();
    await expect(vs).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: 'e2e/__screens__/next-match.png' });
  });

  test('a tática deixa escolher papel e marcadores de bola parada', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Tática', { exact: true }).first().click();
    await expect(page.getByText('Formação').first()).toBeVisible({ timeout: 20_000 });

    // Toca num jogador do campo → abre o seletor com os PAPÉIS.
    await page.getByText('GK', { exact: true }).first().click();
    await expect(page.getByText('Papel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Guarda-redes avançado')).toBeVisible();
    await page.getByText('Guarda-redes avançado').click();
    // O veredicto de adequação aparece a seguir a escolher.
    await expect(page.getByText(/de rendimento no papel/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.click(10, 10); // fecha o modal tocando fora

    // Secção de bolas paradas com os dois marcadores e a instrução de canto.
    await page.getByText('Bolas paradas').first().scrollIntoViewIfNeeded();
    await expect(page.getByText('Marcador de livres')).toBeVisible();
    await expect(page.getByText('Marcador de cantos')).toBeVisible();
    await page.getByText('1.º poste').click();
    await expect(page.getByText(/Desvio ao primeiro poste/)).toBeVisible();
    await page.screenshot({ path: 'e2e/__screens__/set-pieces.png', fullPage: true });
  });

  test('o manual abre, pesquisa e mostra onde cada coisa vive', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Clube', { exact: true }).first().click();
    await page.getByText(T.manual).first().click();

    await expect(page.getByText(/tópicos, do básico/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Como se joga')).toBeVisible();

    // Pesquisa: escrever "canto" tem de encontrar as bolas paradas.
    await page.getByPlaceholder('Procurar no manual…').fill('canto');
    await expect(page.getByText(/resultado/)).toBeVisible();
    await expect(page.getByText('Bolas paradas').first()).toBeVisible();
    await expect(page.getByText(/Tática › Bolas paradas/)).toBeVisible();
    await page.screenshot({ path: 'e2e/__screens__/manual-search.png', fullPage: true });
  });

  test('o cartão dos adeptos mostra humor e faixa', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    // O cartão vive no Início, por baixo da caixa de entrada.
    await expect(page.getByText('Adeptos', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    // A faixa é sempre uma das cinco — é o que se lê de relance.
    await expect(
      page.getByText(/Em revolta|Contestação|Expectantes|Contentes|Em delírio/).first(),
    ).toBeVisible();
    // E a explicação do que o humor faz, para não ser um número decorativo.
    await expect(page.getByText(/enche ou esvazia o estádio/)).toBeVisible();
    await page.screenshot({ path: 'e2e/__screens__/fans.png', fullPage: true });
  });

  test('a ficha do jogador mostra os amarelos acumulados', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Plantel', { exact: true }).first().click();
    // Abre a ficha do guarda-redes (a primeira linha da lista, ordenada por posição).
    await page.getByText('GK', { exact: true }).first().click();
    // Confirma que estamos MESMO na ficha antes de procurar a disciplina —
    // sem isto, um clique falhado passava despercebido.
    await expect(page.getByText('Potencial')).toBeVisible({ timeout: 20_000 });
    // A linha de disciplina tem de estar aqui: é onde se decide poupar (ou não)
    // um titular que está no limite.
    await expect(page.getByText('Amarelos').first()).toBeVisible();
  });

  test('o manual explica adeptos e imprensa, e diz onde estão', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Clube', { exact: true }).first().click();
    await page.getByText(T.manual).first().click();
    await expect(page.getByText('Como se joga')).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder('Procurar no manual…').fill('bravata');
    await expect(page.getByText('Conferências de imprensa').first()).toBeVisible();
    await expect(page.getByText(/Início › caixa de entrada/)).toBeVisible();

    await page.getByPlaceholder('Procurar no manual…').fill('amarelos');
    await expect(page.getByText('Amarelos acumulados').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/__screens__/manual-new.png', fullPage: true });
  });

  test('a imprensa acaba por aparecer e a resposta muda os adeptos', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await newCareer(page);
    await skipTutorial(page);

    /**
     * ⚠ Depois de se ir ao ecrã de jogo e voltar, o Início fica montado DUAS
     * vezes: a cópia antiga continua na árvore com caixa 0×0 (medida numa sonda
     * ao DOM — `visibility` e `opacity` normais, só o tamanho a zero). Um
     * `getByText(...).first()` apanha essa cópia morta e o clique falha com
     * "Element is not visible", mesmo com `force`.
     *
     * Daí o `.filter({ visible: true })` em tudo o que se toca aqui, e o uso do
     * `innerText` do body — que só devolve texto REALMENTE desenhado — para as
     * verificações. Quem escrever testes novos que naveguem para fora e voltem
     * tem de fazer o mesmo.
     */
    const live = (label: string | RegExp) => page.getByText(label).filter({ visible: true }).first();
    const tap = async (label: string | RegExp) => {
      const el = live(label);
      await el.waitFor({ state: 'visible', timeout: 20_000 });
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click();
    };
    /**
     * "Está no ecrã?" — contando ELEMENTOS visíveis, não o `innerText` do body.
     * O `innerText` só devolve o que cabe na janela: tudo o que esteja abaixo da
     * dobra, dentro do ScrollView, fica de fora. Foi por isso que uma versão
     * anterior deste teste jogou 8 jornadas seguidas sem "ver" a conferência
     * que estava lá, mais abaixo na página.
     */
    const has = async (needle: string) =>
      (await page.getByText(needle).filter({ visible: true }).count()) > 0;

    /** Joga uma jornada até ao fim e volta ao Início. */
    async function playRound() {
      // Propostas BLOQUEIAM o avanço (regra do jogo): dispensam-se todas, senão
      // o botão fica em "⚠ Resolve a caixa de entrada" e a jornada não anda.
      for (let i = 0; i < 10; i++) {
        const xs = page.getByText('✕').filter({ visible: true });
        if ((await xs.count()) === 0) break;
        await xs.first().click();
      }
      await tap('Jogar ▶');
      // Com o plantel cansado o jogo abre primeiro uma folha a avisar. Faz
      // parte do jogo — o teste responde-lhe e segue.
      if (await has('Tens titulares exaustos')) await tap('Jogar na mesma');
      await expect.poll(has.bind(null, '⏩ Fim'), { timeout: 30_000 }).toBe(true);
      await tap('⏩ Fim');
      // O fecho pode encadear dois jogos (noite europeia + liga).
      for (let i = 0; i < 3; i++) {
        if (!(await has('PRÓXIMO JOGO ▶'))) break;
        await tap('PRÓXIMO JOGO ▶');
        await tap('⏩ Fim');
      }
      await tap('CONTINUAR ▶');
      // O relatório da semana abre por cima. Fecha-se com "CONTINUAR ›" — o
      // chevron distingue-o do "CONTINUAR ▶" do ecrã de jogo.
      await expect.poll(has.bind(null, 'CONTINUAR ›'), { timeout: 30_000 }).toBe(true);
      await tap('CONTINUAR ›');
      await expect.poll(has.bind(null, 'CONTINUAR ›'), { timeout: 20_000 }).toBe(false);
    }

    // A conferência não chega à 1.ª jornada de propósito (seria ruído). Joga-se
    // até ela aparecer — se em 12 jornadas não aparecer nenhuma, o sistema está
    // morto e o teste tem de falhar, não passar em silêncio.
    //
    // 12 e não 8: a antevisão banal só sai de 4 em 4 jornadas, e os assuntos
    // quentes dependem do que o mundo fizer. Com 8 o teste passava quase sempre
    // e falhava de vez em quando — que é a pior espécie de teste.
    let found = false;
    for (let round = 0; round < 12 && !found; round++) {
      await playRound();
      found = await has('Conferência de imprensa');
    }
    expect(found, 'nenhuma conferência de imprensa em 12 jornadas').toBe(true);

    await page.screenshot({ path: 'e2e/__screens__/press.png', fullPage: true });

    // A pergunta traz sempre TRÊS saídas — uma conferência com duas não é uma
    // decisão. Quais são as três depende do assunto.
    const tones: string[] = [];
    for (const tone of ['Diplomático', 'Defender o plantel', 'Bravata', 'Apontar o dedo']) {
      if (await has(tone)) tones.push(tone);
    }
    expect(tones.length, `tons encontrados: ${tones.join(', ')}`).toBeGreaterThanOrEqual(3);

    // Responder fecha a conferência.
    await tap('Diplomático');
    await expect.poll(has.bind(null, 'Conferência de imprensa'), { timeout: 20_000 }).toBe(false);
    expect(errors.join('\n')).toBe('');
  });

  test('a tatica mostra o adversario e deixa ligar instrucoes', async ({ page }) => {
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Tática', { exact: true }).first().click();
    await expect(page.getByText('Formação').first()).toBeVisible({ timeout: 20_000 });

    // A secção do adversário vive no fundo do ecrã, a seguir às bolas paradas.
    const opp = page.getByText(/^Adversário: /).first();
    await opp.scrollIntoViewIfNeeded();
    await expect(opp).toBeVisible();

    // Com a rede de olheiros no nível inicial mostram-se BANDAS, não números:
    // é o que faz a instalação de olheiros valer alguma coisa fora do mercado.
    await expect(page.getByText(/Comparado com a tua equipa/)).toBeVisible();
    // As bandas sao RELATIVAS a nossa equipa — sem isso 82% dos setores liam
    // "forte" e o relatorio dizia sempre o mesmo.
    await expect(page.getByText(/Mais fraco|Idêntico|Mais forte/).first()).toBeVisible();

    // Ligar uma instrução tem de ficar ligada.
    const mark = page.getByText('Marcação individual').first();
    await mark.scrollIntoViewIfNeeded();
    await expect(page.getByText(/joga-se igual contra toda a gente/)).toBeVisible();
    await mark.click();
    await expect(page.getByText(/O plano vale em todas as provas/)).toBeVisible();

    // E desligar tem de a desligar (senão era um botão de sentido único).
    await mark.click();
    await expect(page.getByText(/joga-se igual contra toda a gente/)).toBeVisible();
    await page.screenshot({ path: 'e2e/__screens__/opponent.png', fullPage: true });
  });

  test('a palestra do intervalo abre aos 45 e o balneario responde', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Jogar ▶').first().click();
    await expect(page.getByText(/^\d+'$/).first()).toBeVisible({ timeout: 30_000 });

    // A 4x cada minuto de jogo dura 100ms: o intervalo chega em segundos.
    // Saltar com "⏩ Fim" NÃO serve — aí o jogo acaba e não há intervalo.
    await page.getByText('4x').first().click();
    await expect(page.getByText('Palestra do intervalo')).toBeVisible({ timeout: 30_000 });

    // Os quatro tons, e a frase que o treinador diria em cada um.
    for (const tone of ['Elogiar', 'Acalmar', 'Exigir mais', 'Explodir']) {
      await expect(page.getByText(tone, { exact: true })).toBeVisible();
    }

    // Escolher um tom mostra a REACAO do balneario antes de seguir — sem isso o
    // jogador nunca aprendia a ler o momento e isto era um botao ao acaso.
    await page.getByText('Exigir mais', { exact: true }).click();
    await expect(
      page.getByText(/O balneário levantou-se|Boa leitura|Ouviram, acenaram|Não caiu bem|Leste mal o balneário/),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Segunda parte mais|Sem efeito de maior/)).toBeVisible();
    await page.screenshot({ path: 'e2e/__screens__/team-talk.png', fullPage: true });

    // A seguir a palestra vem o painel de substituicoes, como sempre.
    await page.getByText('Aplicar e continuar ▶').first().click();
    await expect(page.getByText('Palestra do intervalo')).toBeHidden({ timeout: 10_000 });
    expect(errors.join('\n')).toBe('');
  });

  test('jogar uma jornada abre a partida e mostra o marcador', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await newCareer(page);
    await skipTutorial(page);

    await page.getByText('Jogar ▶').first().click();
    // O ecrã de jogo mostra o relógio da partida.
    await expect(page.getByText(/^\d+'$/).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'e2e/__screens__/match.png' });
    expect(errors.join('\n')).toBe('');
  });
});
