# 🚀 Football Legacy — Guia de Lançamento

Estado do código: **pronto**. Este guia cobre o que falta fazer *fora* do código
(contas, uploads, formulários) para pôr a app na Play Store.

---

## ✅ Já feito

| Item | Estado |
|---|---|
| Código verificado | 10/10 suites de testes · typechecks limpos |
| Expo SDK | 54 (RN 0.81.5 · React 19.1) |
| `expo-doctor` | 18/18 checks OK |
| Nome | Football Legacy |
| Versão | 1.0.0 |
| Ícone / splash / adaptive icon | `assets/` |
| Política de privacidade | `docs/index.html` (pronta a alojar) |
| Textos da loja | `docs/STORE_LISTING.md` |
| `app-ads.txt` | `docs/app-ads.txt` |
| AdMob (App ID + 3 blocos) | `app.json` + `src/native/adConfig.ts` |
| Perfis de build | `eas.json` (produção → `.aab`) |

### Identificadores
- **AdMob App ID (Android):** `ca-app-pub-7583056430043166~9482078235`
- **Blocos:** banner `5220087950` · intersticial `7131247068` · premiado `5686871674`
- **Package Android:** `com.rakulabs.footballlegacy`
  ⚠️ **Permanente após o primeiro upload** na Play Console — a partir daí não
  pode ser alterado (mudá-lo criaria uma app nova, perdendo instalações e
  avaliações). Confirma que é este o que queres antes de submeter.

### Segurança dos anúncios (importante)
`src/native/adConfig.ts` usa `USE_TEST_ADS = __DEV__`:
- `expo start` (dev) → **anúncios de teste** — podes tocar à vontade
- build EAS de produção → **anúncios reais** — receita normal

**Nunca** mudes para `false` fixo: tocar nos teus próprios anúncios reais leva a
Google a **banir a conta AdMob** (perdes toda a receita).

---

## 📋 Passos até à loja

### 1. Contas (~1h · taxa única 25 USD)
- [ ] Conta [Play Console](https://play.google.com/console) — 25 USD (uma vez)
- [ ] Criar a app **Football Legacy** na consola

### 2. Alojar política de privacidade + `app-ads.txt`
A Play Store **exige** URL público da política. O AdMob precisa do `app-ads.txt`
para autorizar quem vende os teus anúncios (sem ele perdes receita).

Via **GitHub Pages** (grátis):
- [ ] Settings → Pages → branch `main`, pasta `/docs`
- [ ] Confirmar que abre a política em `https://<user>.github.io/<repo>/`
- [ ] Confirmar `https://<user>.github.io/<repo>/app-ads.txt`
- [ ] Colar o URL da política na **Play Console** e no **AdMob** (Definições da app)

### 3. Build de produção
```bash
cd projectS
npm i -g eas-cli        # se ainda não tiveres
eas login
eas build:configure     # associa o projeto EAS (só na 1ª vez)
eas build -p android --profile production
```
No fim recebes o link do **`.aab`**. A chave de assinatura fica gerida pelo EAS
(vê-la com `eas credentials` — **não a percas**, sem ela não podes atualizar a app).

### 4. Screenshots reais (obrigatório)
A Play Store exige **≥2 screenshots** reais. Instala o build no telemóvel e tira:
- [ ] Dashboard (próximo jogo + classificação)
- [ ] Jogo ao vivo (marcador + lances)
- [ ] Tática (campo com o onze)
- [ ] Plantel ou Mercado

### 5. Preencher a Play Console
- [ ] Upload do `.aab` → **Teste interno** primeiro (nunca direto para produção)
- [ ] Descrições: copiar de `docs/STORE_LISTING.md`
- [ ] Ícone 512×512 + feature graphic 1024×500 (`assets/store/`)
- [ ] **Classificação de conteúdo** (questionário)
- [ ] **Segurança dos dados**: declarar que mostra **anúncios (AdMob)** e que os
      dados do jogo ficam **só no dispositivo** (SQLite local, sem servidor)
- [ ] Público-alvo e conteúdo
- [ ] Submeter para revisão (1-7 dias)

### 6. Depois do lançamento
- [ ] Ligar a app do AdMob à ficha da Play Store (melhora o preenchimento)
- [ ] Vigiar crashes na Play Console (Android Vitals)
- [ ] **Premium** (remover anúncios): a lógica já existe (`setPremium`) — falta
      ligar o Google Play Billing para o tornar uma compra real

---

## Comandos úteis

```bash
npm run smoke:all                    # 10 suites de testes
npm run typecheck                    # typecheck do core
npx tsc --noEmit -p tsconfig.json    # typecheck da app
npx expo-doctor                      # diagnóstico do projeto
npx expo start                       # dev (anúncios de teste)

eas build -p android --profile preview      # APK instalável (teste)
eas build -p android --profile production   # AAB para a loja
```
