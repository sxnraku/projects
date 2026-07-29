# Football Legacy — Plano Técnico: Liga Online

> Documento de planeamento para um futuro update. Descreve visão, arquitetura,
> modelo de dados, faseamento e riscos de integrar uma **liga online forte** de
> treinadores reais. Não é para implementar já — é o mapa para quando avançarmos.

**Estado atual do jogo (baseline):** 100% offline, single-player. Toda a lógica em
`/src/core` (TypeScript puro, zero React, determinística por seed). Estado guardado
localmente em `expo-sqlite`. Sem contas, sem backend, sem rede (só AdMob).

---

## 1. Visão — que tipo de "online"?

**Recomendado: Liga assíncrona de treinadores reais.**
16–20 managers humanos partilham uma liga. Cada um gere o seu clube (táticas,
plantel, transferências). As jornadas são **simuladas no servidor** num horário
fixo (ex.: todos os dias às 20h, ou 3×/semana). Entre jornadas, os managers têm
um prazo (*deadline*) para definir táticas e mexer no mercado.

Porque este modelo:
- **Encaixa no jogo atual** (gestão por jornadas, já é "turn-based").
- **Não exige tempo real** — cada um joga quando quiser antes do deadline.
- **Escala barato** (a simulação corre em lote, não precisa de servidores de jogo ao vivo).
- **Social e competitivo** — classificação real, rivalidades, mercado entre humanos.

**Alternativas consideradas (fora do MVP):**
| Modelo | Prós | Contras |
|---|---|---|
| PvP em tempo real (2 managers, jogo ao vivo) | emoção | infra cara, matchmaking, latência, motor teria de ser "ao vivo" |
| Ligas privadas com amigos (código de convite) | viral, baixa moderação | precisa das mesmas fundações da liga pública |
| Torneios/mata-mata | eventos, retenção | camada extra sobre a liga base |

→ **Ligas privadas com amigos** deve ser a **Fase 3** (reaproveita tudo o resto).

---

## 2. Princípio-chave: reutilizar o `/src/core` no servidor 🔑

A maior vantagem da arquitetura atual: o motor de simulação é **TS puro e
determinístico**. Isso permite correr **exatamente o mesmo código** no servidor
(Node.js) que corre no telemóvel.

Implicações:
- **Sem reescrever o motor.** `simulateMatch`, `advanceWeek`, economia, etc. correm
  no servidor tal como no cliente.
- **Server-authoritative de graça:** o servidor simula, o cliente só mostra. Impossível
  fazer batota no resultado.
- **Paridade offline/online garantida:** mesma bola, mesma física, mesmas regras.

Ação técnica: extrair `/src/core` para um **pacote partilhado** (monorepo ou package
npm privado) consumido tanto pelo app Expo como pelo backend Node.

```
football-legacy/
├── packages/
│   ├── core/        ← /src/core de hoje (motor puro, partilhado)
│   ├── app/         ← Expo/React Native (cliente)
│   └── server/      ← Node/TS (backend online) — importa @fl/core
```

---

## 3. Arquitetura de alto nível

```
┌─────────────┐     HTTPS/REST + WebSocket     ┌──────────────────────┐
│  App (Expo) │ ◄────────────────────────────► │   API (Node + @fl/core) │
│  cliente    │                                 │  - auth, ligas, mercado │
└─────────────┘                                 │  - valida ações          │
      │ offline: SQLite local (inalterado)      └──────────┬───────────────┘
      │                                                     │
      │                                          ┌──────────▼───────────┐
      │                                          │  Job scheduler        │
      │                                          │  (simula jornadas)    │
      │                                          │  usa @fl/core          │
      │                                          └──────────┬───────────┘
      │                                                     │
      │                                          ┌──────────▼───────────┐
      │                                          │ Postgres  +  Redis    │
      │                                          │ (estado)   (filas/cache)│
      │                                          └──────────────────────┘
```

**Componentes novos:**
- **Auth** — contas de utilizador (email/Google/Apple + anónimo→registado).
- **API** — REST para ações; WebSocket/SSE para atualizações ao vivo (resultados, mercado).
- **Job scheduler** — corre a simulação da jornada no deadline (ex.: BullMQ/cron).
- **Base de dados** — Postgres (relacional, transações no mercado).
- **Cache/filas** — Redis (sessões, rate limiting, filas de simulação, realtime).

---

## 4. Modelo de dados (servidor, Postgres)

Tabelas principais (esboço):

- **users** — `id, email, auth_provider, display_name, created_at, reputation, banned`
- **online_leagues** — `id, name, tier, season, status(open|running|ended), sim_schedule, max_managers, is_private, invite_code`
- **league_members** — `user_id, league_id, club_id, joined_at, is_active, bot_controlled`
- **online_clubs** — `id, league_id, name, colors, budget, wage_budget, reputation` (clube gerido por um humano na liga)
- **online_players** — `id, club_id, attributes(jsonb), value, wage, contract_until` (plantel do clube online)
- **online_fixtures** — `id, league_id, round, home_club, away_club, kickoff_at, result(jsonb|null), seed`
- **tactics_submissions** — `user_id, league_id, round, lineup(jsonb), tactic(jsonb), submitted_at`
- **transfers** — `id, league_id, from_club, to_club, player_id, fee, status(pending|accepted|rejected|expired), deadline`
- **market_listings** — jogadores livres / listados para venda
- **standings** — materializada/derivada dos fixtures

Notas:
- Guardar atributos de jogadores em `jsonb` reaproveita os tipos do `@fl/core`.
- Cada fixture tem uma **seed** fixa → simulação reprodutível e auditável.

---

## 5. Fluxos principais

1. **Registo/Login** → conta (permitir "jogar como convidado" e migrar depois).
2. **Entrar numa liga** → matchmaking (junta-te à próxima liga a formar) OU criar/entrar em liga privada por código.
3. **Draft/atribuição de clube** → cada manager recebe/escolhe um clube (plantel gerado pelo `@fl/core`, equilibrado).
4. **Ciclo de jornada:**
   - Janela aberta: define onze, tática, faz propostas de transferência.
   - **Deadline** (ex.: 20h): servidor congela submissões.
   - **Simulação:** o scheduler corre `@fl/core` para todos os jogos da jornada (server-authoritative).
   - **Publicação:** resultados + classificação + notícias enviados via WebSocket; push notification.
5. **Fim de época** → promoções/despromoções entre ligas online, prémios, reset.

---

## 6. Simulação server-authoritative (o coração)

```
No deadline da jornada:
  1. Buscar todas as tactics_submissions da ronda (faltas → última tática ou auto-pick).
  2. Para cada fixture:
       resultado = simulateMatch(homeTactic, awayTactic, players, fixture.seed)   // @fl/core
       gravar result (jsonb) + eventos
  3. Aplicar economia: bilheteira, prémios, folha salarial (@fl/core).
  4. Recalcular standings.
  5. Resolver transferências pendentes cujo deadline passou.
  6. Emitir eventos realtime + push.
```

Vantagens: barato (batch), justo (ninguém vê o motor), auditável (seed guardada).

**Managers inativos:** se um humano não submete tática, usa a última válida ou
`autoPickLineup`. Se ficar inativo N jornadas → **substituído por bot** (o mesmo core
que joga a IA offline) para não estragar a liga dos outros.

---

## 7. Mercado entre managers

- **Propostas humano→humano:** reaproveita a lógica de `evaluateOffer`/`reachability`
  do core, mas o "vendedor" é outro jogador real → a proposta fica **pendente** até
  ele aceitar/recusar (ou expira no deadline).
- **Agentes livres / leilões:** jogadores sem dono; lance mais alto no deadline leva.
- **Tetos:** orçamento e teto salarial da divisão validados **no servidor** (nunca confiar no cliente).
- **Transações atómicas** (Postgres) para não duplicar dinheiro/jogadores.

---

## 8. Anti-cheat, fairness e moderação

- **Servidor autoritativo** em tudo (resultado, dinheiro, transferências).
- **Validação server-side** de cada ação (orçamento, limites de plantel, regras).
- **Rate limiting** (Redis) contra spam de propostas/pedidos.
- **Deteção de multi-conta / conluio** (ex.: transferências a preços absurdos entre 2 contas para oferecer jogadores) — heurísticas + flags.
- **Moderação:** nomes de clube/manager filtrados; reportar/banir.
- **Determinismo auditável:** qualquer resultado pode ser re-simulado a partir da seed.

---

## 9. Monetização (mantendo "sem pay-to-win" — é a marca!)

- ✅ **Passe de época** (cosmético + progressão, não vantagem competitiva).
- ✅ **Cosméticos:** emblemas, kits, nome de estádio, molduras de perfil.
- ✅ **Ligas premium / entrada em torneios** com prémios cosméticos.
- ✅ **Remover anúncios** (já existe premium).
- ❌ **Nunca:** comprar dinheiro do jogo, jogadores, ou vantagem nas ligas competitivas.
  Isto destruiria a integridade da liga e a mensagem "no pay-to-win".

---

## 10. Impacto no cliente atual (app Expo)

- **Offline mantém-se 100% igual** (é um modo à parte). Zero regressão.
- Novo **ecrã de modo** na tela inicial: *Carreira (offline)* vs *Liga Online*.
- **Auth** (login/registo) — só necessário para o online.
- **Camada de sync/API** (`/src/net`) — cliente fino: mostra estado do servidor, envia ações.
- Reutiliza os ecrãs existentes (plantel, tática, mercado, liga) com dados vindos da API em vez do save local.
- **Push notifications** (expo-notifications) para "jornada simulada", "proposta recebida", "deadline em 1h".

---

## 11. Plano faseado

| Fase | Entrega | Objetivo |
|---|---|---|
| **0 — Fundações** | Monorepo (`@fl/core` partilhado), backend Node, Postgres, auth, CI | Base técnica sem features visíveis |
| **1 — Liga assíncrona (MVP)** | 1 liga pública, atribuição de clube, ciclo de jornada, simulação server-side, classificação, push | Provar o loop online |
| **2 — Mercado online** | Transferências humano↔humano, agentes livres, tetos validados | Profundidade e interação |
| **3 — Social** | Ligas privadas (código), chat/mural, rivalidades, perfis | Retenção e viralidade |
| **4 — Competitivo/escala** | Múltiplas divisões online, promoção/despromoção, época com prémios, ranking global, bots de substituição | Longevidade e escala |

**MVP jogável = Fase 0 + 1.** Só isso já é "uma liga online" real.

---

## 12. Stack recomendada (concreta)

- **Backend:** Node.js + TypeScript (reutiliza `@fl/core`), framework Fastify ou NestJS.
- **BD:** PostgreSQL (Supabase ou Neon para arrancar rápido — dão auth + Postgres gerido).
- **Realtime:** WebSocket (ou Supabase Realtime / SSE).
- **Filas/agendamento:** BullMQ + Redis (Upstash) para simular jornadas.
- **Auth:** Supabase Auth ou Clerk (email + Google + Apple + anónimo).
- **Push:** Expo Notifications.
- **Hosting:** Railway/Render/Fly.io para arrancar; escalar depois.
- **Observabilidade:** logs estruturados + Sentry.

> Atalho para MVP: **Supabase** dá auth + Postgres + realtime num só sítio, cortando
> muito boilerplate na Fase 0/1.

---

## 13. Riscos e desafios

| Risco | Mitigação |
|---|---|
| **Custo de servidor** com o crescimento | simulação em batch (barata); tier grátis no início; monetização cosmética |
| **Managers que abandonam** a meio da época | substituição por bot; ligas de duração curta (ex.: época de 4 semanas) |
| **Ligas a meio-encher** (poucos jogadores) | preencher vagas com bots até haver humanos; matchmaking por fuso/horário |
| **Fairness / conluio** no mercado | validação server-side + deteção de multi-conta |
| **Moderação** (nomes, chat) | filtros + reportar/banir; começar sem chat livre |
| **Complexidade** vs equipa pequena | faseamento rígido; MVP mínimo primeiro |
| **Migração de saves** offline→online | não migrar; online começa do zero (mais justo) |

---

## 14. Pré-requisitos técnicos antes de começar

1. **Refatorar para monorepo** e extrair `@fl/core` como pacote isolado e testado
   (já é puro — falta só empacotar). Garantir que **não importa nada de React/Expo**.
2. Cobrir o core com **testes de determinismo** (mesma seed → mesmo resultado) — já há smokes, reforçar.
3. Definir **contrato da API** (OpenAPI) cedo.
4. Decidir **auth** e **BD gerida** (Supabase encurta caminho).

---

## 15. Resumo executivo

O jogo está **surpreendentemente bem posicionado** para online porque o motor é
puro e determinístico — o mesmo código corre no servidor, dando simulação justa e
à prova de batota **sem reescrever nada**. O caminho é: extrair o core para um
pacote partilhado, montar um backend fino que o corre em lote nas jornadas, e
construir por cima uma liga assíncrona de treinadores reais. Offline mantém-se
intacto. Monetização fica cosmética para proteger a marca "no pay-to-win".

**Próximo passo quando avançarmos:** Fase 0 (monorepo + `@fl/core` + backend + auth).
