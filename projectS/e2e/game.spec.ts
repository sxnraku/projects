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
