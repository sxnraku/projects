# Premium (sem anúncios) — o que falta para ser a sério

O botão que existia nas Definições **foi retirado**. Ele chamava
`setPremium(true)` e mais nada: não havia compra, não havia pagamento, e o
estado vivia só em memória — fechavas a app e voltavam os anúncios. Um botão
que promete tirar publicidade e não cobra nada é pior do que não existir, e
numa app publicada é risco de política da Play Store.

O que já está feito no jogo, e continua a funcionar:

- `monetizationStore.setPremium(boolean)` — a porta de entrada.
- `monetization.ts` já respeita o premium: `if (m.premium) return false` corta
  intersticiais e banners. **Não é preciso mexer em nada disto.**

Falta a única coisa que não se pode escrever daqui: o produto na Play Console e
a biblioteca de compras.

---

## 1. Play Console (tens de ser tu — 15 minutos)

A app **tem de ter pelo menos uma versão enviada** (temos: a v41), senão o menu
de produtos nem aparece.

1. Play Console → a app → **Monetizar** → **Produtos** → **Produtos de aplicação**.
2. **Criar produto**. Preenche:
   - **ID do produto**: `premium_no_ads`
     ⚠ Isto **nunca mais pode ser mudado**, nem apagado e recriado com o mesmo
     nome. Escolhe-o com cuidado.
   - **Nome**: `Football Legacy Premium`
   - **Descrição**: `Remove todos os anúncios do jogo, para sempre.`
   - **Preço**: sugiro 2,99 € (a Google fica com 15% até 1M USD/ano).
3. **Ativar** o produto. Fica "Ativo", não "Rascunho" — em rascunho a app não o
   consegue ler e a compra falha com um erro que não explica nada.
4. Play Console → **Configuração** → **Testes de licença**: mete o teu email.
   Sem isto, testar custa dinheiro a sério a cada tentativa.
5. A conta de teste tem de estar num **canal de testes** (o teu teste fechado
   serve) e ter a app instalada **a partir da Play Store**, não por `adb`.
   Instalada por fora, a compra falha sempre.

## 2. Declaração de dados (obrigatória)

Play Console → **Política** → **Segurança dos dados**. Já mostras anúncios
(AdMob), por isso tens de declarar recolha de **ID do dispositivo** e
**dados de utilização** para publicidade. Se não declarares, a atualização é
rejeitada — e isto não tem nada a ver com o premium, é dívida que já existe.

## 3. Código — **JÁ FEITO**

Instalado: **`expo-iap` 5.3.0** (módulo Expo; a `expo-in-app-purchases` foi
descontinuada e a `react-native-iap` v16 exigia mais uma dependência nativa).

Ficheiros:

- `src/native/purchases.ts` — ligação à loja, compra, restauro e preço.
- `src/native/purchases.web.ts` — stub para o browser (os testes E2E correm sem
  tocar em nada nativo).
- `app/(tabs)/club.tsx` → `PremiumRow` — a linha nas Definições.
- `app/_layout.tsx` — **restauro automático em cada arranque**.

Decisões que valem a pena saber:

- **Restaurar corre sozinho**, sempre, no arranque. Quem paga, desinstala e
  reinstala recupera o Premium sem pagar outra vez. Sem isto, são reembolsos.
- **A loja é a fonte da verdade.** O que está gravado no dispositivo é só cache
  para o jogo abrir depressa.
- **`finishTransaction` é chamado sempre.** Uma compra não reconhecida em 3 dias
  é reembolsada e revogada pela Google, automaticamente.
- **A linha só aparece se a loja responder.** Num emulador sem Play Services, ou
  enquanto o produto não estiver ativo, não há linha nenhuma — em vez de um
  botão que não faz nada.
- **Nada bloqueia o jogo.** Loja em baixo, sem rede, módulo em falta: o jogo abre
  na mesma, apenas com anúncios.
- Desistir da compra **não** mostra erro; só falhas verdadeiras.

O `versionCode` **42** já leva a permissão `com.android.vending.BILLING`
declarada — confirmei no manifesto do bundle.

## Estado atual

| | |
|---|---|
| Botão falso | **removido** |
| `monetization.ts` respeita `premium` | ✅ já respeitava |
| Biblioteca de compras | ✅ `expo-iap` instalada e ligada |
| Fluxo de compra + restauro | ✅ escrito e a compilar no AAB v42 |
| **Produto na Play Console** | ❌ **falta — só tu podes fazer** |

**Falta só o passo 1.** Enquanto `premium_no_ads` não existir e não estiver
ATIVO na Play Console, a linha do Premium não aparece nas Definições (é o
comportamento correto: mais vale não haver botão do que haver um que falha).

Assim que o criares, instala a app a partir de um canal de testes com a tua
conta de teste de licença e a linha aparece sozinha, com o preço vindo da loja.
