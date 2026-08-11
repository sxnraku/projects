import { defineConfig, devices } from '@playwright/test';

/**
 * E2E DO JOGO A SÉRIO — a app real, num browser, clicada como uma pessoa clica.
 *
 * O jogo é React Native, mas o projeto já traz `react-native-web` e variantes
 * `.web.tsx` dos módulos nativos (anúncios, update). O SQLite desliga-se sozinho
 * na web e o jogo corre em memória. Isso permite exportar a app para estático e
 * conduzi-la com Playwright — que é a única forma de testar o que os testes de
 * fumo NÃO alcançam: se o emblema desenha, se o buraco do tutorial cai por cima
 * do elemento certo, se um ecrã rebenta ao abrir.
 *
 * Antes de correr, é preciso o export:
 *   npm run e2e:build   (expo export --platform web)
 *   npm run e2e         (corre os testes)
 *
 * O `webServer` serve a pasta exportada. `reuseExistingServer` deixa reaproveitar
 * um servidor já aberto durante o desenvolvimento dos testes.
 */
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8099',
    // Tamanho de telemóvel: é para telemóvel que o jogo foi desenhado, e é aí
    // que os problemas de espaço aparecem (siglas a transbordar, cartões
    // do tutorial a tapar o alvo).
    ...devices['Pixel 7'],
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node serve.mjs',
    cwd: __dirname,
    url: 'http://127.0.0.1:8099',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
