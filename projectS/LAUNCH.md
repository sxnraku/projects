# 🚀 Guia de Lançamento — Gestor de Futebol

Estado do projeto: **pronto a compilar para a Play Store.** Falta apenas o que só
tu podes fazer (contas, IDs reais, política online). Segue por ordem.

---

## 0. Pré-requisitos (uma vez)
- [ ] Conta **Google Play Console** — taxa única de 25 USD:
      https://play.google.com/console
- [ ] Conta **Google AdMob** (grátis): https://admob.google.com
- [ ] `npm install -g eas-cli` e `eas login` (conta Expo grátis)

## 1. Criar os anúncios no AdMob
- [ ] Cria a app no AdMob (Android) → copia o **App ID** (`ca-app-pub-…~…`).
- [ ] Cria 3 ad units: **Interstitial**, **Rewarded**, **Banner** →
      copia os 3 **Ad Unit IDs** (`ca-app-pub-…/…`).

## 2. Colar os IDs reais (2 ficheiros)
- [ ] `src/native/adConfig.ts` → preenche `PROD` e muda `USE_TEST_ADS = false`.
- [ ] `app.json` → em `"react-native-google-mobile-ads"` põe o teu `androidAppId`
      (e `iosAppId` se fores para iOS).

## 3. Política de privacidade (obrigatória — a Play rejeita sem isto)
- [ ] Edita `docs/PRIVACY_POLICY.md` (data, nome, email).
- [ ] Aloja numa página pública. Opção fácil e grátis: **GitHub Pages**
      (cria um repo, ativa Pages, cola o conteúdo num `index.html`/`.md`).
- [ ] Guarda o URL — vais precisar dele na Play Console e podes pô-lo no ecrã
      Definições da app.

## 4. Build de teste (APK) e jogar no telemóvel
```bash
eas build -p android --profile preview
```
- [ ] Instala o APK no teu Android e joga uma época inteira.
- [ ] Confirma: onboarding, save persiste entre sessões, anúncios de teste
      aparecem, consentimento GDPR aparece (se estiveres na UE).

## 5. Build de produção (.aab para a Play Store)
```bash
eas build -p android --profile production
```
- [ ] Gera o ficheiro **.aab** (Android App Bundle).

## 6. Publicar na Play Console
- [ ] Cria a app na Play Console (nome, idioma padrão Português).
- [ ] Preenche a ficha com os textos de `docs/STORE_LISTING.md`.
- [ ] Carrega ícone 512×512, gráfico de destaque 1024×500 e capturas de ecrã.
- [ ] Preenche **Data Safety** (ver `docs/STORE_LISTING.md`), classificação de
      conteúdo, público-alvo, e cola o link da política de privacidade.
- [ ] Declara "Contém anúncios" e "Compras na aplicação".
- [ ] Carrega o `.aab` num **teste interno** primeiro; testa; depois promove
      para **produção**.

## 7. Compra "Remover anúncios" (opcional, mas recomendado)
A lógica premium já existe e persiste (`setPremium` + prefs). Falta ligar o
faturamento real:
- [ ] Cria um produto de compra única na Play Console (ex.: `remove_ads`).
- [ ] Integra `react-native-iap` ou **RevenueCat** e, na compra confirmada,
      chama `useMonetizationStore.getState().setPremium(true)`.
- [ ] (Hoje o botão em Definições ativa premium diretamente — bom para testar,
      trocar pelo fluxo de compra antes de produção.)

---

## Notas técnicas
- **Versão:** 1.0.0 (`app.json`), `versionCode` 1 (`app.json > android`).
  Incrementa o `versionCode` a cada envio para a Play.
- **Package:** `com.gestorfutebol.app` (muda em `app.json` se quiseres o teu).
- **Save:** SQLite local (`gestor_futebol_v4.db`), migração por ficheiro.
- **Robustez de anúncios:** todos têm timeout — rede má nunca bloqueia o jogo;
  sem SDK (Expo Go) os rewarded são simulados.
- **Qualidade:** 10 suites de testes (`npm run smoke:all`) + 2 typechecks
  (`npm run typecheck` e `npx tsc -p tsconfig.json`).

## Comandos úteis
```bash
npm run smoke:all                 # todos os testes de lógica
npm run typecheck                 # typecheck do núcleo (Node)
npx tsc --noEmit -p tsconfig.json # typecheck da app (React Native)
npx expo start --web              # testar no browser (sem save)
npx expo start                    # testar no telemóvel via Expo Go (QR)
node scripts/gen-assets.js        # regenerar ícone/splash
```
