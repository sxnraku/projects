# Football Legacy — o jogo por dentro

Jogo de gestão de futebol em português, da **RakuLabs**. Assumes um clube, geres
plantel, tática, contratos, dinheiro e instalações, e tentas construir uma
carreira ao longo de várias épocas — subir divisões, ganhar títulos, chegar à
Europa e não ser despedido pelo caminho.

> **Versão deste documento:** 1.0.31 (versionCode 37) · React Native / Expo SDK 54 ·
> Android (`com.rakulabs.footballlegacy`) · pt-PT · pt-BR · en

---

## Índice

1. [O que é o jogo](#1-o-que-é-o-jogo)
2. [O mundo](#2-o-mundo)
3. [A época, semana a semana](#3-a-época-semana-a-semana)
4. [Jogadores](#4-jogadores)
5. [Tática e o jogo em si](#5-tática-e-o-jogo-em-si)
6. [Dinheiro](#6-dinheiro)
7. [Mercado e contratos](#7-mercado-e-contratos)
8. [Plantel: relação, treino, academia, empréstimos, olheiros](#8-plantel-relação-treino-academia-empréstimos-olheiros)
9. [Competições](#9-competições)
10. [Carreira e direção](#10-carreira-e-direção)
11. [Os ecrãs, um a um](#11-os-ecrãs-um-a-um)
12. [Som e vibração](#12-som-e-vibração)
13. [Monetização](#13-monetização)
14. [Como está construído (para quem mexe no código)](#14-como-está-construído)

---

## 1. O que é o jogo

És treinador **e** gestor. Numa semana típica: vês a caixa de entrada, decides
propostas, ajustas o onze, avanças a jornada, vês o jogo ao vivo (com golos
animados e substituições a meio) e recebes o balanço financeiro da semana.

O jogo é de **decisões com consequência**: cada reforço pesa no saldo, cada
promessa a um jogador é cobrada, e uma época má tira-te confiança da direção até
seres despedido.

**Não há microtransações obrigatórias.** Há anúncios opcionais com recompensa e
uma compra única que os remove — nada fica bloqueado atrás de dinheiro real.

---

## 2. O mundo

O mundo tem **dois níveis**, para caber num telemóvel sem deixar de parecer vivo:

**País ativo — simulação pesada.** Onde jogas. Três divisões:

| Divisão | Clubes | Jornadas |
|---|---|---|
| Primeira Divisão | 18 | 34 |
| Segunda Divisão | 18 | 34 |
| Terceira Divisão | 20 | 38 |

**56 clubes** e **~1 232 jogadores** com nome, idade, 15 atributos, contrato,
salário, forma, moral e valor de mercado — todos simulados a sério.

**Resto do mundo — simulação barata.** **1 085 equipas** de **55 países** com
uma "força" cada. Os campeonatos deles correm por placar rápido (Poisson): há
classificações, campeões e evolução, mas sem plantéis carregados na memória.
Quando enfrentas um clube estrangeiro na Europa, o plantel dele é **materializado
a sério** nesse momento e removido no fim da campanha.

Isto significa que dá para abrir o **Mundo** e ver a Premier League, a Serie A ou
o campeonato marroquino a correr em paralelo com a tua época — e contratar lá,
se mandares um olheiro ao país.

---

## 3. A época, semana a semana

Uma jornada = uma semana. Ao carregares em **Jogar**:

1. **Bloqueios** — se tiveres propostas, pedidos ou uma crise financeira por
   decidir, o jogo não avança. Diz-te exatamente o que falta.
2. **Jogos** — a tua liga joga a jornada; as outras divisões e o mundo também.
3. **Fadiga e lesões** — quem jogou perde forma física; há risco de lesão.
4. **Finanças** — bilheteira (depende da forma da equipa!), patrocínios, TV,
   merchandising, menos salários, manutenção e equipa técnica.
5. **Treino** — todo o plantel evolui (ou não) conforme foco, idade e potencial.
6. **Mercado** — propostas por jogadores teus, pedidos de aumento, cláusulas
   pagas por outros clubes, avisos de fim de contrato.
7. **Balanço** — modal de fecho com o resultado, a bilheteira, o que entrou e
   saiu, quem evoluiu, quem se lesionou e quem exige alguma coisa.

Se for **semana europeia**, a liga fica em pausa e joga-se a Europa. Se o teu
clube não estiver em prova, o jogo diz-te isso à frente: *"Pausa para a Europa"*
e mostra o **próximo jogo do campeonato** para não haver confusão.

No fim da época: subidas e descidas, prémios de classificação, contratos a
expirar, reforma de veteranos, entrada de juniores da academia e a nova
qualificação europeia.

---

## 4. Jogadores

**15 atributos**, em três famílias:

| Físicos | Técnicos | Mentais |
|---|---|---|
| Velocidade | Finalização | Posicionamento |
| Resistência | Passe | Compostura |
| Força | Drible | Trabalho de equipa |
| Agilidade | Desarme | Visão |
| | Cabeceamento | |
| | Guarda-redes | |

**Overall (0-100)** é calculado a partir dos atributos com **pesos por posição** —
o mesmo jogador vale mais a médio do que a lateral se tiver visão e passe.

**Potencial** é o teto. Um jovem de 17 anos com potencial 88 pode lá chegar; a
partir dos ~26 anos o potencial que não foi cumprido **desvanece** (deixa de
haver "eterna promessa" com 30 anos e potencial 95).

**Curva de idade:** pico ~24 anos, crescimento até aos 28 (a partir dos 24 já
travado), e depois declínio. Isto reflete-se diretamente no valor de mercado.

**Condição:** forma física (0-100), moral, estado (disponível / lesionado /
suspenso), forma recente, nota média da época, confiança contigo.

---

## 5. Tática e o jogo em si

### 12 formações, nenhuma repetida

Agrupadas em gaveta por linha defensiva:

| Linha de 4 | Linha de 3 | Linha de 5 |
|---|---|---|
| 4-4-2 · 4-4-2 losango · 4-4-1-1 · 4-3-3 · 4-3-3 recuado · 4-3-1-2 · 4-2-3-1 · 4-1-3-2 | 3-5-2 · 3-4-3 | 5-3-2 · 5-4-1 |

Cada uma tem um conjunto de posições **realmente diferente** — há trinco a sério
(4-1-3-2), médio ofensivo a sério (4-2-3-1) e alas puros (3-4-3). Trocar de
formação **preserva** as instruções (pressão, linha defensiva, criatividade,
mentalidade, ritmo) e recalcula o onze.

### Instruções

- **Mentalidade:** defensiva · equilibrada · ofensiva
- **Ritmo:** lento · normal · rápido
- **Pressão**, **linha defensiva** e **criatividade** em escala 1-10
- **Capitão** e **marcador de penáltis**

### O jogo

O motor simula o jogo inteiro de forma **determinística** (mesma seed → mesmo
jogo) e depois o ecrã **reproduz** minuto a minuto:

- placar ao vivo, relógio, barra de progresso, 1x / 2x / 4x, pausa, saltar p/ fim
- **remates, defesas, cartões, lesões** na timeline
- **golos animados** — um clip curto do lance, com o marcador e o minuto
- **substituições ao vivo** (até 3) e ajuste de mentalidade/ritmo, ao intervalo
  ou a qualquer minuto — o jogo é **re-simulado a partir desse minuto**, por isso
  as tuas mudanças contam mesmo
- pós-jogo: xG, posse, homem do jogo, marcadores e assistências

**Segunda hipótese:** depois de uma derrota no campeonato, podes ver um anúncio
para repetir o jogo — uma vez por jogo.

---

## 6. Dinheiro

> **Mudou na 1.0.31.** Antes havia "saldo" e "orçamento de transferências" como
> dois montes independentes que chegavam a divergir. Agora há **um saldo só**.

### Um saldo, três destinos

```
SALDO TOTAL
 ├─ Reserva salarial   10 semanas de despesa corrente (máx. metade da caixa)
 ├─ Transferências     70% do que sobra   ← é a "verba"
 └─ Obras              os outros 30%      ← instalações
```

A barra aparece no painel inicial e no ecrã do Clube. As fatias realinham-se
sozinhas a cada movimento de dinheiro — a verba nunca pode ser maior do que a
caixa que existe.

### O saldo nunca fica negativo

Nenhuma despesa voluntária passa se deixar o clube no vermelho: passe, prémio de
assinatura, taxa de opção de empréstimo, obra nas instalações, compra
internacional. Se não há dinheiro, o jogo diz-te de quanto precisas e quanto
tens.

### Quando os salários não dão

A semana que não fecha produz um **buraco** (o que ficou por pagar), e não uma
dívida a apodrecer:

1. **Aviso, 3 semanas antes** — quando a caixa dá para menos de 3 semanas de
   despesa, recebes alerta no balanço e no painel. Aqui ainda dá para cortar
   salários ou vender por vontade própria.
2. **Dilema de crise** — se a semana não fecha mesmo, abre-se um item na caixa
   de entrada com **4 candidatos à venda** (suplentes primeiro, titulares só em
   último recurso). **Bloqueia o avanço** até decidires. A direção **nunca**
   vende um jogador teu por sua conta.
3. **Reputação** — uma semana por pagar custa 1 ponto, mas **nunca abaixo de 75%
   da mediana da tua divisão**. Um emblema da 1ª divisão continua a ser da 1ª.

Nos clubes da IA a direção resolve sozinha (vende o mais valioso fora do onze) —
é o que mantém o mundo coerente.

### Receitas e despesas

| Entra | Sai |
|---|---|
| Bilheteira (afluência sobe com vitórias, cai com derrotas) | Salários |
| Patrocínios | Manutenção das instalações |
| Direitos de TV | Equipa técnica |
| Merchandising | |
| Prémios de classificação, Taça e Europa | |

**Teto salarial da divisão** — um clube da 3ª não pode pagar ordenados de 1ª,
mesmo com dinheiro. **Reset anual** — a direção absorve o excesso de caixa acima
do teto de liquidez, para o dinheiro não se acumular até deixar de ser restrição.

---

## 7. Mercado e contratos

### Valor de mercado

Curva **íngreme e realista**, no espírito do modo carreira do EA FC:

| Overall | Valor aproximado |
|---|---|
| 70 | ~3,8 M€ |
| 80 | ~24,7 M€ |
| 85 | ~64,3 M€ |
| 90 | ~167 M€ |

A idade multiplica: um 97 com 18 anos vale mais (~468 M€) do que o mesmo 97 com
27 (~318 M€). E tudo escala com o **prestígio do país e da divisão** — em ligas
fracas os mesmos números não aparecem.

### Estatuto

Um jogador só assina com um clube ao nível dele. Se o teu clube estiver abaixo do
estatuto dele, ou recusa, ou exige um **prémio de assinatura** que cresce com a
diferença. Acima de uma certa distância, nem com dinheiro.

### Cláusulas de contrato

Ao negociar (contratação ou renovação):

- **Cláusula de rescisão** — mais baixa, ele aceita menos salário; mas qualquer
  clube a pode pagar e levá-lo sem negociação
- **% de futura venda** — pedes uma fatia da próxima venda; recebes menos hoje
- **Prémio por golo** e **prémio por jogo** — troca salário fixo por variável

### Propostas recebidas

Clubes da IA fazem propostas pelos teus jogadores. **Só clubes que conseguem
mesmo pagar** — verba *e* caixa. Podes aceitar, recusar ou **contrapropor** um
valor mais alto (o comprador pode ir embora). Ao aceitar, podes exigir a % de
futura venda.

Jogadores na lista de transferências recebem ofertas muito mais depressa e a
preço mais justo.

### Janelas

Mercado de verão e de inverno, com jornadas definidas. Fora delas ninguém
contrata — nem pelo painel do Mundo.

### Mercado internacional

Manda um **olheiro a um país** (custa do saldo, escala com o teu escalão) e o
mercado desse país abre-se para ti.

---

## 8. Plantel: relação, treino, academia, empréstimos, olheiros

### Conversas e promessas

- **Elogiar** quem está bem sobe moral e confiança; elogiar quem está mal soa a
  gozo e sai caro
- **Criticar** quem está mal é justo (acorda-o, sobe a forma); criticar quem está
  bem queima a relação
- **Promessas** — mais minutos, ou um reforço à altura. A moral sobe logo; falhar
  o prazo **queima mais** do que cumprir dá. Uma promessa em aberto de cada vez.

### Treino

Quatro focos: **físico**, **técnico**, **tático** (mentais) e **recuperação**. O
nível do centro de treino acelera a evolução. Também dá para **reconverter** um
jogador para outra posição.

### Academia

Entrada anual de juniores. A qualidade depende da reputação do clube e do nível
da academia — mas com **teto**: a academia forma talento em bruto, não craques já
feitos. O potencial é que fica em aberto. Também podes **recrutar** candidatos
avulso, pagando uma taxa.

### Empréstimos

- **Dar** jovens (≤21, suplentes) para ganharem minutos e saírem da folha
- **Receber** até 3 ao mesmo tempo, com as mesmas regras de estatuto de uma
  contratação
- **Opção de compra** — pagas uma taxa hoje e travas o preço; se ele crescer,
  compras a preço de saldo

### Olheiros

Missões que revelam o **potencial** de um alvo com precisão crescente. O nível da
estrutura de scouting encurta a banda de incerteza.

---

## 9. Competições

### Campeonato

Três divisões com subidas e descidas. Classificação com desempates, prémios por
posição, prémio de subida.

### Taça

Eliminatória a jogo único, intercalada com o campeonato. Prémio para o vencedor e
troféu no palmarés.

### Provas europeias — formato suíço (36 equipas)

Três provas: **Liga dos Campeões**, **Liga Europa** e **Liga Conferência**.
Qualificas-te pela classificação no campeonato e pela Taça.

**Fase de liga:** tabela única de 36, 8 jornadas (6 na Conferência), adversários
de 4 potes. **Corte:** 1º-8º direto aos oitavos · 9º-24º play-off · 25º-36º fora.
**Eliminatórias** a duas mãos (prolongamento e penáltis), **final** a um jogo.

Os teus jogos europeus são **jogáveis a sério** — motor completo, plantel real do
adversário carregado do país dele, golos animados, substituições. Os outros 34
jogos da jornada resolvem-se por placar rápido.

**Supertaça Europeia** no arranque da época: campeão da Champions vs campeão da
Liga Europa.

**Prémios:**

| | Entrada | Vitória | Oitavos | Quartos | Meias | Final | Campeão |
|---|---|---|---|---|---|---|---|
| Champions | 8 M€ | 1,5 M€ | 4 M€ | 6 M€ | 9 M€ | 12 M€ | **25 M€** |
| Liga Europa | 3,5 M€ | 0,7 M€ | 1,8 M€ | 2,8 M€ | 4 M€ | 5,5 M€ | **11 M€** |
| Conferência | 1,5 M€ | 0,3 M€ | 0,8 M€ | 1,3 M€ | 1,9 M€ | 2,6 M€ | **5 M€** |

Supertaça: 4 M€. Qualificar-se para a Europa passa a ser um objetivo económico
central.

---

## 10. Carreira e direção

A direção dá-te um **objetivo** por época — ganhar o título, ficar na primeira
metade, ou evitar a despromoção — calibrado pela reputação do clube face aos
adversários.

A **confiança** (0-100%) sobe e desce com os resultados. Se cair a pique, és
despedido — e a carreira continua: recebes **ofertas de outros clubes** e escolhes
para onde vais.

**Reputação do clube** evolui por época: título vale 6 pontos, e **títulos
seguidos valem mais** (6 → 9 → 12 → 15). Descer custa 6. No meio da tabela o
efeito é pequeno. Um clube que domina uma década torna-se mesmo uma potência.

**Palmarés** guarda todos os troféus com a época em que foram ganhos.

---

## 11. Os ecrãs, um a um

### Barra superior (sempre visível)
Escudo, nome do clube, **estrelas de reputação** (0,5 a 5, com meias estrelas
desenhadas a sério), época/jornada, e pastilhas de energia média do plantel,
lesionados e saldo.

### 🏠 Início — o painel
O centro do jogo, em cartões:

- **Caixa de entrada** — propostas, pedidos de aumento/saída, avisos de renovação,
  dilema de crise. Aceitar/recusar sem sair do ecrã
- **Próximo jogo** — os dois escudos, jornada, casa/fora, estrelas e forma do
  adversário, link para espreitar o plantel dele; ou o **banner de noite europeia**
- **Força por zona** — defesa / meio / ataque em 0-100
- **3 luzes de verificação** — onze pronto? contas em ordem? algo por decidir?
- **Botão Jogar**
- **Classificação** resumida
- **Finanças** — saldo total, a barra das três fatias, salários semanais
- **Notícias**
- **Fim de época** — resumo, mensagem da direção, juniores que subiram

### 👥 Plantel
Lista com foto gerada, posição, overall, idade, forma física, moral, contrato,
salário e valor. Filtros por posição, ordenação, avisos de contrato a acabar.
Toca num jogador para a ficha completa.

### 📋 Tática
Campo com o onze, banco, gaveta das 12 formações, mentalidade, ritmo, pressão,
linha defensiva, criatividade, capitão e marcador de penáltis. Onze automático
com um toque.

### 💱 Mercado
Três separadores: **Mercado**, **Olheiros**, **Empréstimos**. Verba de
transferências e valores comprometidos, filtros por posição, OVR mínimo e
"ao meu alcance". Cada alvo mostra valor, salário pedido e se precisa de prémio
de assinatura. Ao fazer proposta: passe, salário, duração e cláusulas.

### 🏆 Liga
Classificação completa com forma recente, calendário, marcadores, e entrada para
a **Taça**, para a **Europa** e para o **Mundo**.

### 🛡️ Clube
Escudo e identidade, números de carreira, **finanças detalhadas** (saldo, fluxo
semanal, a repartição em três fatias, quantas semanas a caixa aguenta, receitas e
despesas linha a linha), **instalações** (estádio, treino, academia, médico,
scouting — 5 níveis cada), **direção** (objetivo, confiança, pedir dinheiro uma
vez por época), **cópia na nuvem**, **troféus**, **idioma**, **som e vibração**.

### Ficha do jogador
Atributos em barras, histórico, contrato e cláusulas, estatísticas da época,
separador **Conversar** (elogiar/criticar/prometer), renovar, listar para venda,
emprestar, vender.

### Ecrã de jogo
Ver secção [5](#5-tática-e-o-jogo-em-si).

### Outros
**Academia**, **Treino**, **Mundo** (todas as ligas do planeta), **Europa**
(tabela de 36, os meus jogos, quadro das eliminatórias, as outras provas,
Supertaça), **Onboarding** (escolher clube), **Tutorial**.

---

## 12. Som e vibração

Doze sons gerados por síntese, feitos para serem **discretos** e não irritar:
apito inicial, apito final, falta, golo nosso, golo sofrido, bancada, ambiente de
estádio em ciclo, toque na bola, remate, bola na rede, toque de interface e
troféu.

Nas **Definições do Clube** controlas: som ligado/desligado, **volume em 5
passos**, e vibração ligada/desligada — separadamente. Fica gravado no save.

---

## 13. Monetização

- **Anúncios intersticiais** entre jornadas, com espaçamento
- **Anúncios com recompensa**, máximo **3 por dia de jogo**:
  - **Bónus de patrocínio** — dinheiro para o clube (escala com a divisão)
  - **Recuperação do plantel** — repõe a forma física de todos
  - **Melhoria grátis** de uma instalação, de 5 em 5 jornadas
  - **Segunda hipótese** — repetir um jogo perdido
- **Compra única premium** — remove todos os anúncios. Nada mais fica bloqueado.

---

## 14. Como está construído

### Estrutura

```
src/core/**        Lógica de jogo. TypeScript puro, determinístico, SEM React nem IO.
src/state/         Store Zustand — chama o core e notifica a UI.
src/persistence/   Save em SQLite (tabelas tipadas + blobs JSON).
src/ui/            Tema, i18n, som, componentes visuais (Face, GoalClip, ...).
src/native/        Fronteira nativa: anúncios, atualização forçada, nuvem.
app/**             Ecrãs (expo-router).
```

### Regras de arquitetura

- **Determinismo total.** Mesma seed → mesmo mundo, mesmos jogos, mesmos
  sorteios. Nada de `Math.random` nem `Date.now` dentro de `src/core`.
- **Núcleo puro.** `src/core` não importa React nem nada de nativo — é isso que
  permite correr o jogo inteiro em Node nos testes.
- **i18n a sério.** A UI nunca escreve texto fixo: traduz chaves. pt-PT é a base,
  pt-BR herda e sobrepõe o que muda, en é independente.
- **Escalas.** Internamente os atributos são 0-20; ao ecrã vão 0-100.
- **Um só sítio para o dinheiro.** Todo o movimento passa por `moveMoney()`.

### Módulos do núcleo

| Módulo | O que faz |
|---|---|
| `models` | Tipos e regras base: jogador, clube, tática, finanças, inbox |
| `engine` | Motor de jogo, força de equipa, fadiga, RNG por seed |
| `economy` | Valor de mercado, salários, cláusulas, transferências, divisões, insolvência, instalações, prestígio |
| `game` | Avanço de semana, inbox, mercado, empréstimos, academia, olheiros, juniores, IA dos plantéis, mundo de fundo |
| `season` | Calendário, classificações, subidas/descidas, janelas |
| `training` | Evolução, foco de treino, reconversão |
| `cup` | Taça nacional |
| `europe` | Qualificação, sorteio suíço, fase de liga, eliminatórias, Supertaça, coeficientes |
| `career` | Objetivos, confiança, despedimento, ofertas, palmarés, definições |
| `news` | Notícias do mundo |
| `i18n` | Os três idiomas |

### Verificação

Antes de qualquer coisa ser dada por feita:

```bash
npx tsc --noEmit -p tsconfig.core.json   # núcleo
npx tsc --noEmit -p tsconfig.json        # app
npm run smoke:all                        # 19 suites, tem de imprimir "TODOS OS TESTES PASSARAM"
```

As suites cobrem modelos, motor, época, economia, jogo, persistência,
monetização, carreira, mundo, inbox, finanças, divisões, jornada, olheiros,
academia, contratos, **fluxo completo (5 épocas × 3 seeds)** e Europa.

O teste de fluxo verifica invariantes que já foram bugs reais: nenhum jogador sai
do plantel sem aviso, o onze nunca aponta para quem já saiu, nunca há dois jogos
na mesma semana, a Europa termina antes do fecho da época, o teto salarial
aguenta, **nenhum clube fica com saldo negativo** e **a verba nunca passa a
caixa**.

### Publicação

Build local com Gradle (`:app:bundleRelease`, arm64-v8a + armeabi-v7a, assinatura
injetada), verificação do `.aab` (`jarsigner -verify`, SHA-256 da chave de
upload, Hermes comprimido nas duas arquiteturas) e arquivo em `_backup/`.

---

*Football Legacy · RakuLabs*
