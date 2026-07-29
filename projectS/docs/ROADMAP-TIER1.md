# Football Legacy — Roadmap Tier 1 (grandes melhorias)

Registo das mudanças planeadas e do progresso. Atualizado à medida que se implementa.

## Verificação inicial (pedida antes de mexer)

- **Golos por jogador guardados?** Parcial. O marcador de cada golo fica no evento
  `GOAL` (`playerId`) e o `MatchResult` persiste no calendário/Taça → o marcador
  **é guardado**. Mas **não havia contagem agregada por jogador** nem lista de
  melhores marcadores. → Resolvido no bloco "Estatísticas de partida".
- **2 amarelos → vermelho?** **Não.** O tipo `RED_CARD` existia no modelo mas
  **nunca era gerado**; os amarelos iam para um jogador aleatório **sem memória**.
  Sem **assistências** também. → Resolvido no bloco "Estatísticas de partida".

## Blocos

### 0. Nome "P. Apelido" (curto)
Mostrar inicial do primeiro nome + apelido (ex.: `P. Diddy`) onde só aparecia o
apelido, para diferenciar homónimos. Ficheiros: `src/ui/format.ts` (helper
`shortName`), aplicar em Plantel, Tática, Mercado, Partida. **[status: FEITO ✅]**

### 1. Estatísticas de partida (notas + assistências + homem do jogo + cartões)
- Por jogador na partida: golos, assistências, amarelos, **2º amarelo → vermelho**
  (expulso; a equipa perde força o resto do jogo), **nota 0–10**, **homem do jogo**.
- Evento novo `ASSIST`; `RED_CARD` passa a ser gerado.
- Agregado de época por jogador (golos/assistências) → base para "melhores marcadores".
- Notas alimentam forma/moral.
- Ficheiros: `models/match.ts`, `models/player.ts` (stats de época), `engine/matchEngine.ts`,
  `game/advance.ts` (agregação + forma/moral), UI `app/match.tsx`. **[status: FEITO ✅]**

### 2. Substituições + ajuste ao intervalo (partida ao vivo)
- No ecrã da partida: banco visível, trocar jogador (repõe frescura ao suplente),
  mudar mentalidade/ritmo ao intervalo. Máx. 3 substituições.
- O motor precisa de saber quem esteve em campo (fadiga só a esses).
- Ficheiros: `models/tactic.ts`/`match.ts`, `engine/matchEngine.ts`, `app/match.tsx`,
  store. **[status: FEITO ✅]**

### 3. Interações com a direção
- Pedir aumento de orçamento de transferências (hipótese ligada à confiança/época).
- Objetivos passam a incluir Taça e saúde financeira; mensagens da direção.
- Ficheiros: `core/career/career.ts`, `game/advance.ts`, `app/club.tsx` ou `index.tsx`.
  **[status: FEITO ✅]**

### 4. Empréstimos (dar e receber)
- Emprestar jovens (o clube-mãe paga parte do salário; regressa no fim da época)
  e receber por empréstimo. Recall opcional. IA faz/aceita empréstimos.
- Ficheiros: `models/player.ts` (campos de empréstimo), `economy/`, `game/offers.ts`
  + `inbox.ts`, `game/advance.ts` (regresso ao fim da época), UI Mercado/Jogador.
  **[status: FEITO ✅]**

### 5. Save na nuvem (Google Play Games)
- **Risco:** módulo NATIVO + configuração na Play Console (OAuth, Play Games
  Services). Pode esbarrar no limite de 260 chars do Windows (como o
  in-app-updates) → talvez só viável em build EAS cloud. A avaliar antes de
  prometer. Alternativa interim: exportar/importar save em ficheiro/QR.
  **[status: a avaliar]**

## Registo de implementação

### ✅ Bloco 0 — Nome "J. Apelido" (FEITO)
- `src/core/models/player.ts`: novo `shortName(player)` = inicial + apelido (ex.: `J. Oliveira`).
- Aplicado em Plantel, Tática (marcadores + seletor), Mercado (alvo, pendente, olheiros), Partida.
- Verificado: typecheck app+core limpo.

### ✅ Bloco 1 — Estatísticas de partida (FEITO + verificado offline)
- `models/match.ts`: evento `ASSIST`; `MatchResult` ganha `playerStats` (golos, assistências,
  amarelos, `red`, `rating`) e `motm`.
- `models/player.ts`: `PlayerCondition` ganha `seasonGoals`/`seasonAssists` (opcionais → persistem
  no blob JSON, **sem mudar schema**; reiniciam no rollover).
- `engine/matchEngine.ts`: reescrito — marcador por jogador, **assistências** (peso passe+visão),
  **2º amarelo → vermelho** (expulsa, tira dos conjuntos, enfraquece a equipa e recalcula ritmos),
  **notas 0–10** e **homem do jogo**.
- `game/advance.ts`: agrega golos/assistências de época (todas as divisões + Taça); reinicia no rollover.
- `app/match.tsx`: cartão pós-jogo com Homem do jogo + Marcadores + Assistências; ícone ASSIST.
- i18n: `match.motm/scorers/assists/ratings` (pt-PT + en).
- **Verificação:** smoke dedicado (300 jogos): soma golos/jogador == golos da partida; assist ≤ golos;
  notas 3–10; MOTM válido; 72 expulsões todas com 2 amarelos + evento RED_CARD; agregação 0→12.
  Todos os **15 smokes** passam. Corrigido teste frágil de promoção (ordenava só por pontos; agora usa
  `sortStandings`) — a promoção em si estava correta.

### 🔴 FIX CRÍTICO do save (v19) — a confirmar no dispositivo
O diagnóstico apanhou na v17 um erro real: `save:ERRO ... NativeDatabase.execAsync has been
rejected`. Causa: `openDb()` sem guarda de concorrência — no arranque, `Promise.all([restore(),
loadPrefs()])` chamava-o em paralelo → duas aberturas + `initSchema` da MESMA base → base
bloqueada → todas as gravações seguintes rejeitadas. **Fix:** `openDb` agora é uma **promessa
partilhada (singleton)** em `app/db.ts` — todos os chamadores esperam pela MESMA abertura.
Diagnóstico reativado na v19 para confirmar. ⚠️ **A v18 tinha este bug silenciado** (removi a linha
cedo demais) — não subir a v18.

### ✅ Bloco 3 — Interações com a direção (FEITO + verificado)
- `core/career/career.ts`: `requestTransferBudget(career, finance, tier, season)` — 1×/época,
  concede se confiança ≥ 40, valor cresce com confiança e escalão, custa 3 de confiança.
  `CareerState.lastBudgetRequestSeason`.
- `state/gameStore.ts`: ações `requestBudget()` / `budgetRequestUsed()`.
- `app/(tabs)/club.tsx`: painel "Direção" (confiança, objetivo, botão pedir orçamento + Toast).
- i18n `board.budget.*`, `club.board.*` (pt-PT + en).
- Verificado: teste offline (concede/recusa/1×época/1ª>3ª); typecheck core+app limpo.

### ✅ Bloco 4 — Empréstimos (FEITO + verificado)
- `models/player.ts`: `PlayerCondition.loanOwnerId`/`loanUntil` (opcionais, blob JSON, sem schema).
- `core/game/loans.ts` (novo): `loanOutCandidates`, `loanInMarket` (≤21, suplentes),
  `loanOut` (empresta ao clube de menor reputação), `loanIn`, `returnExpiredLoans` (regresso no
  rollover). Jogador MOVE de plantel; salário passa para o clube de acolhimento.
- `game/advance.ts`: `returnExpiredLoans` chamado no rollover (após incremento da época).
- `game/index.ts`: exporta `loans`.
- `state/gameStore.ts`: `loanOutList`/`loanInList`/`doLoanOut`/`doLoanIn`.
- `app/(tabs)/market.tsx`: 3ª aba **Empréstimos** (Receber / Emprestar) com Toast.
- i18n `loan.*` (pt-PT + en).
- Verificado: teste offline (out sai da folha; in entra; ambos regressam ao dono no fim da época);
  15/15 smokes; typecheck limpo.

### ✅ Bloco 2 — Substituições + ajuste ao intervalo (FEITO + verificado)
Abordagem contida (SEM refatorar `advanceWeek`): a partida joga-se normal; ao **intervalo**, se
o jogador mexer, **re-simula-se só a 2ª parte**.
- `engine/matchEngine.ts`: reescrito com contexto `Sim` + `simulateMinutes(from,to)`. `simulateMatch`
  aceita `halftime?: { side, tactic }` — ao 46' troca a tática desse lado (subs + mentalidade/ritmo),
  mantendo golos/remates/cartões acumulados. **Sem `halftime`, resultado byte-idêntico ao anterior**
  (mesma ordem de RNG → smokes deterministas intactos).
- `game/replay.ts`: `applyHalftime(state, fixtureId, lineup, mentality, tempo)` — reverte o
  resultado antigo da tabela, re-simula com a MESMA seed da jornada (`rngSeed ^ round*1000003` →
  1ª parte idêntica), reaplica. Só jogos de LIGA (Taça → null, UI segue).
- `state/gameStore.ts`: ação `applyHalftime(lineup, mentality, tempo)`.
- `app/match.tsx`: ao 45' pausa e abre painel de INTERVALO (mentalidade/ritmo segmentados + até 3
  substituições do banco); "Aplicar e continuar" re-simula a 2ª parte; "Continuar sem mudar" segue.
- i18n `match.ht.*` (pt-PT + en).
- **Verificação:** motor (HT tática igual = idêntico; 1ª parte sempre igual; 2ª muda; suplente ganha
  ficha); fluxo store (classificação reflete R2, pontos/GF/GA coerentes, tabela J=V+E+D); 15/15 smokes.
- **Simplificações conhecidas (v1):** o ajuste afeta o RESULTADO/classificação, não re-deriva
  fadiga/moral/lesões pós-jogo (já aplicadas ao onze inicial). Taça: sem painel de intervalo.

### ⏳ Pendente
- Nada pendente do Tier 1 — todos os blocos (0-5) FEITOS. Ver secções abaixo.

### Versões
- **v19 / código 19** = fix do save + diagnóstico + nomes + estatísticas de partida (Blocos 0,1).
  Bloco 3 já está em código mas ENTRA no próximo build. Não empacotar limpo até: (a) save confirmado
  no dispositivo, (b) blocos 4 e 2 prontos.

## Rework de empréstimos (mecânica reforçada)
- **`core/game/loans.ts`**: `loanBuyPrice(player)` = marketValue×1.15 (mín 50k, arred. 1k);
  `ReturnedLoan {playerId, playerName, ownerId, ownerName, price}`; `terminateLoan(state, id)`
  (dispensa recebido / chama cedido de volta, limpa flags + transferListed); `buyReturnedPlayer(
  state, id, price)` (paga ao dono, transfere passe, funds-gated → `loan.err.funds`);
  `returnExpiredLoans` agora **retorna `ReturnedLoan[]`** (só dos recebidos que jogavam pelo clube).
- **`core/game/inbox.ts`** + **`state/gameStore.ts`** (`setListed`): jogador emprestado (recebido)
  NÃO pode ir para a lista de transferências (passe não é nosso) — guarda no core e na store.
- **`core/game/advance.ts`**: `SeasonSummary.returnedLoans`; capturado no rollover.
- **`state/gameStore.ts`**: `doTerminateLoan`, `returnedLoansPending`, `buyReturnedLoan`,
  `dismissReturnedLoan`, estado `returnedLoans` (preenchido no rollover a partir do summary).
- **`app/(tabs)/market.tsx`** LoansPanel: secção "Empréstimos ativos" (salário pago + Dispensar);
  receber por empréstimo exige **ver anúncio** (`showRewarded`) e mostra salário/OVR; botão ▶.
- **`app/(tabs)/index.tsx`**: `ReturnedLoansModal` no fim de época — comprar passe ou deixar ir.
- **`app/(tabs)/squad.tsx`**: crachá `loan.badge` (EMP/LOAN) nos recebidos.
- **`app/player/[id].tsx`**: separador Vender de um emprestado mostra origem+salário e botão Dispensar
  (sem opção de listar).
- i18n `loan.active.*`, `loan.from`, `loan.wageLabel`, `loan.in.ad*`, `loan.dispense.*`, `loan.buy.*`,
  `loan.err.notLoan/funds` (pt-PT + en; pt-BR herda).
- **Verificação:** offline (loanIn→terminate→rollover→returnedLoans→buyReturnedPlayer, funds-gate
  confirmado: 3ª div sem verba recusa, 1ª div compra); tsc core+app limpos; 15/15 smokes.

## Save na nuvem (Bloco 5) — LIGADO (fluxo nativo)
- Cliente OAuth **Android** criado (SHA-1 da chave Google Play). Fluxo nativo por
  **reversed-client-id** → não precisa de cliente Web.
- `src/native/cloudConfig.ts`: `ANDROID_CLIENT_ID` preenchido; `REVERSED_CLIENT_ID`
  derivado; `cloudConfigured = ANDROID_CLIENT_ID.length > 0`.
- `plugins/withGoogleAuthScheme.js`: config plugin que injeta o intent-filter
  (VIEW + DEFAULT + BROWSABLE, data scheme = reversed client id) na `.MainActivity`.
  Registado em `app.json → plugins`. Se o client id mudar, mudar nos dois sítios.
- **Verificação:** `expo config --type introspect` mostra o scheme na MainActivity;
  tsc app limpo. **Login real só testa no AAB assinado/instalado** (Expo Go não).
