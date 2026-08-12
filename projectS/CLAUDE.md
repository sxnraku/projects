# Football Legacy

Jogo de gestão de futebol PT (RakuLabs), a caminho da Google Play. React Native /
Expo (SDK 54, RN 0.81, New Arch, Hermes). Pacote `com.rakulabs.footballlegacy`.
Toda a lógica de jogo é **TypeScript puro e determinístico**.

## Comandos
- **Dev (Metro):** `npx expo start`
- **Typecheck:** `npx tsc --noEmit -p tsconfig.core.json && npx tsc --noEmit -p tsconfig.json`
- **Testes (gate):** `npm run smoke:all` — 23 suites, arranca com `check:version`, tem de imprimir "TODOS OS TESTES PASSARAM" e sair 0
- **E2E (app real no browser):** `npm run e2e:all` — exporta a app para web e conduz 11 fluxos com
  Playwright (carreira nova, tutorial guiado, todos os separadores, emblema, tática, manual ×2,
  adeptos, disciplina na ficha, conferência de imprensa, jogo).
  É o único teste que apanha erros de RENDER; os smoke tests só cobrem lógica.
- **Dados:** `npm run smoke:data` valida `src/core/data/world/` (worldTeams + 55 JSONs; untracked no git, gerado do Excel)

## Arquitetura
- `src/core/**` — lógica pura, determinística. **SEM React/IO.** RNG por seed (`deriveSeed` + `Rng`).
- `src/state/gameStore.ts` (Zustand) — chama o core e faz `bump()`; a UI lê daqui.
- `app/**` — ecrãs (expo-router). A UI **traduz chaves i18n** (`useT`/`useTMsg`), nunca strings fixas.
- `src/persistence/**` — save SQLite (blobs JSON + tabelas tipadas).
- **Mundo a 2 níveis:** país ativo (sim pesada, jogadores no estado) + ~68 ligas de fundo (sim barata por força, só classificações).

## Convenções
- **Imutabilidade** no core (cria cópias, não mutes). Ficheiros pequenos e coesos.
- **Determinismo:** mesmo seed → mesmo resultado. Nada de `Math.random`/`Date.now` no core.
- **i18n trilingue:** pt-PT (base) · pt-BR (herda o pt-PT, só overrides) · en. Toda a chave nova entra nos 3.
- **Reputação/economia** ancoram à FORÇA (dataset) + país, não ao escalão (ver `economy/prestige.ts`).
- Exibição 0-100 via `to100`; interno 0-20. `computeOverall`/`computeOverallFine` em `models/player.ts`.

## Verificação (antes de dar QUALQUER coisa por feita)
1. `tsc` core + app limpos.
2. `npm run smoke:all` a passar (23/23).
3. Diagnósticos offline com `npx tsx <script>` quando mexes em regras de jogo.

## Release (Google Play — closed testing)
1. **Bump de versão** nos 4 ficheiros, iguais: `app.json` (version + android.versionCode),
   `android/app/build.gradle` (versionCode + versionName), `src/native/appUpdate.ts` e
   `appUpdate.web.ts` (`FALLBACK_VERSION_CODE`). `npm run check:version` falha se divergirem.
2. `npm run smoke:all`.
3. **Build AAB local:** `cd android && ./gradlew :app:bundleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a`
   com `-Pandroid.injected.signing.*` (assinatura injetada — credenciais NÃO estão no repo).
   `JAVA_HOME` = JBR do Android Studio (JDK 21). `expo.useLegacyPackaging=true`.
4. **Verificar o .aab:** `jarsigner -verify` → "jar verified"; SHA-256 do cert = chave de upload;
   `libhermestooling.so` **Defl** nas 2 archs; versionName certo. Arquivar em `_backup/football-legacy-vN.aab`.
5. **`minVersionCode`** (update forçado, `https://sxnraku.github.io/min-version.json`): só subir para uma
   versão **já LIVE em produção**. As de teste (24+) NÃO estão live — deixar em 13.

## Notas
- `smoke:all` corre com `tsx`. Deteta regressões cedo — corre-o sempre no fim.
- Provas europeias (`src/core/europe/`) e mercado internacional são deriváveis: NÃO são gravados no save, re-materializam-se na leitura.
