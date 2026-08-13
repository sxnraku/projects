# Football Legacy — o jogo por dentro

Jogo de gestão de futebol em português, da **RakuLabs**. Assumes um clube, geres
plantel, tática, contratos, dinheiro e instalações, e tentas construir uma
carreira ao longo de várias épocas — subir divisões, ganhar títulos, chegar à
Europa e não ser despedido pelo caminho.

> **Versão deste documento:** 1.0.36 (versionCode 42) · React Native / Expo SDK 54 ·
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
10. [Carreira, direção, adeptos e imprensa](#10-carreira-direção-adeptos-e-imprensa)
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
3. **Fadiga, lesões e cartões** — quem jogou perde forma física; há risco de
   lesão; os amarelos somam e ao 5.º há castigo.
4. **Finanças** — bilheteira (depende da forma da equipa **e do humor dos
   adeptos**), patrocínios, TV, merchandising, menos salários, manutenção e
   equipa técnica.
5. **Treino** — todo o plantel evolui (ou não) conforme foco, idade e potencial.
6. **Mercado** — propostas por jogadores teus, pedidos de aumento, cláusulas
   pagas por outros clubes, avisos de fim de contrato.
7. **Imprensa** — quando há assunto, um jornalista faz-te uma pergunta e a tua
   resposta tem consequências (ver secção [10](#10-carreira-direção-adeptos-e-imprensa)).
8. **Balanço** — modal de fecho com o resultado, a bilheteira, o que entrou e
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

### Disciplina — os amarelos acumulam

Um cartão amarelo já não morre no jogo em que aparece:

- **5 amarelos = 1 jogo de castigo.** E aos 10, e aos 15 — o contador é o total
  da época, nunca é zerado.
- **Vermelho = 1 jogo de castigo**, e os amarelos desse jogo **não contam** (quem
  já foi expulso não leva o castigo duas vezes pelo mesmo jogo).
- Aos **4 amarelos** o jogador aparece assinalado no plantel: está em risco, e o
  próximo cartão tira-o. Dá para o poupar de propósito num jogo fácil.

Isto muda a gestão da semana: um médio agressivo a 4 amarelos antes do dérbi é
uma decisão a sério, não um detalhe.

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

### Relatório do adversário

Antes de cada jogo tens um relatório de olheiro sobre quem vais defrontar:
defesa, meio e ataque deles **comparados com os teus**. Não é uma escala
absoluta — de nada serve saber que o ataque deles é "forte" se o teu é mais; o
que interessa é se te passa por cima. Com a estrutura de scouting no **nível 3 ou
acima** vês também números concretos e o **jogador mais perigoso** deles.

E podes preparar o jogo contra eles, com duas instruções:

| Instrução | O que faz | O que custa |
|---|---|---|
| **Marcar o craque** | corta 45% do peso do melhor jogador deles | tira 3% ao teu meio-campo |
| **Fechar as alas** | −30% nos cantos e −18% no jogo aéreo deles | tira 2% ao teu ataque |

Os dois números foram **medidos** ao longo de centenas de jogos simulados, não
estimados. "Fechar as alas" chegou a ser uma armadilha — custava mais golos do
que evitava — e foi recalibrada até valer mesmo a pena contra quem cruza bem.

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

### Palestra ao intervalo

Aos 45' falas ao balneário. Quatro tons — **elogiar**, **acalmar**, **exigir** ou
**explodir** — e o que dizes só vale pelo que o marcador diz:

| | A ganhar por muito | A ganhar | Empatado | A perder | A levar uma sova |
|---|---|---|---|---|---|
| **Elogiar** | ✅ ótimo | ✅ bom | ~ | ⚠ mau | ❌ péssimo |
| **Acalmar** | ~ | ~ | ~ | ~ | ~ |
| **Exigir** | ⚠ mau | ~ | ✅ bom | ✅ ótimo | ✅ bom |
| **Explodir** | ❌ péssimo | ❌ mau | ~ | ✅ bom | ✅ ótimo |

Elogiar quem está a perder por 4 é gozo. Explodir com quem vai a ganhar por 3
desfaz o que estava feito. **Acalmar** nunca é errado — e nunca é ótimo.

O plantel também conta: jogadores de **compostura** alta reagem menos (aos
elogios e às bocas), e uma equipa de moral baixa leva **40% mais** com uma
palestra negativa.

O efeito é imediato na segunda parte. Já a **moral** só é lançada na semana
seguinte — de propósito: a moral entra no cálculo da força da equipa, e como cada
substituição re-simula o jogo desde o minuto 1, aplicá-la logo reescrevia a
primeira parte que já viste acontecer.

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

### Prémios individuais

No fim de cada época há **quatro prémios por divisão**, não só na tua:

| Prémio | Quem ganha |
|---|---|
| **Melhor jogador** | melhor nota média da época |
| **Melhor jovem** | o mesmo, até aos 21 anos |
| **Melhor marcador** | mais golos |
| **Melhor treinador** | o do clube campeão |

Exige **12 jogos** no mínimo — senão um suplente com dois jogos bons ganhava a
quem carregou a época inteira. Os empates desfazem-se por ordem fixa, para o
resultado ser sempre o mesmo com a mesma seed.

Ganhar entra no palmarés do jogador e é notícia. Ter o melhor marcador da liga no
plantel também o torna mais caro de segurar.

---

## 10. Carreira, direção, adeptos e imprensa

### Direção

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

### Adeptos

A bancada tem **humor próprio**, de 0 a 100, e não é o mesmo que a confiança da
direção. A direção olha para a tabela; os adeptos olham para o que esperavam.

**O que os move:** o resultado **face à expectativa**. Ganhar em casa ao último
classificado quase não conta; ganhar fora ao campeão vale muito. Os **dérbis
pesam quase o dobro**. Contratações e vendas também mexem — vender o melhor
jogador do plantel custa caro, e o que custa depende do peso que ele tinha.

**O que isso faz ao jogo, a sério:**

| Humor | Efeito |
|---|---|
| **Euforia** (≥78) | estádio a 115% da média, apoio em casa no máximo, moral a subir |
| Normal (~55) | tudo neutro |
| **Contestação** (<30) | estádio a 78%, bilheteira a cair, moral a descer |

O apoio em casa entra **no motor de jogo** como vantagem caseira — não é um
número decorativo. O peso foi calibrado por medição: a diferença entre um estádio
em euforia e um em contestação vale cerca de **4 pontos por época**, sem alterar
a média de golos por jogo.

Se a contestação durar **3 jornadas**, a paciência acaba e a direção começa a
ouvir a rua. Ao mudares de clube, o humor faz reset — os adeptos novos ainda não
têm opinião sobre ti.

### Conferências de imprensa

Os jornalistas aparecem quando há assunto: véspera de jogo, dérbi, série de
vitórias, série sem ganhar, derrota pesada, contestação nas bancadas, mercado,
luta pelo título, luta pela manutenção.

Respondes num de quatro tons — **calma**, **defender o plantel**, **bravata** ou
**apontar o dedo** — e cada um paga em moedas diferentes: moral do balneário,
confiança da direção e humor dos adeptos.

A **bravata** é a única que é uma aposta a sério. Prometes ganhar o próximo jogo
do campeonato:

| | Moral | Confiança | Adeptos |
|---|---|---|---|
| **Cumpres** | +3 | +4 | **+9** |
| **Falhas** | −5 | −5 | **−12** |

Falhar custa mais do que cumprir rende. É de propósito: se prometer fosse grátis,
prometia-se sempre.

Cada assunto tem **três redações da pergunta** e **duas de cada resposta**, e a
redação muda com a época e a jornada — a mesma situação não te dá o mesmo texto
duas vezes seguidas.

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
transferências e valores comprometidos, filtros por posição, OVR mínimo,
"ao meu alcance" e **intervalo de preço**. Cada alvo mostra valor, salário pedido
e se precisa de prémio de assinatura. Ao fazer proposta: passe, salário, duração
e cláusulas.

O **intervalo de preço** é independente do dinheiro que tens: com 20 M€ na conta
podes procurar só jogadores até 5 M€, para montar um plantel em vez de gastar
tudo num nome. O filtro "ao meu alcance" continua lá, à parte, para quem quiser o
comportamento antigo.

### 🏆 Liga
Classificação completa com forma recente, calendário, marcadores, e entrada para
a **Taça**, para a **Europa** e para o **Mundo**.

### 🛡️ Clube
Escudo e identidade, números de carreira, **finanças detalhadas** (saldo, fluxo
semanal, a repartição em três fatias, quantas semanas a caixa aguenta, receitas e
despesas linha a linha), **instalações** (estádio, treino, academia, médico,
scouting — 5 níveis cada), **direção** (objetivo, confiança, pedir dinheiro uma
vez por época), **cópia na nuvem**, **troféus**, **idioma**, **som e vibração**,
**Premium** e **política de privacidade**.

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

### Ecrãs que aparecem sozinhos
**Conferência de imprensa** (quando há assunto, no fecho da semana),
**palestra ao intervalo** (aos 45' de cada jogo teu) e **relatório do adversário**
(a partir do cartão do próximo jogo).

---

## 12. Som e vibração

Doze sons. Os **cinco momentos que se ouvem de verdade** são gravações reais; o
resto continua sintetizado, que para um clique ou um passe chega e sobra.

| Gravação real | Momento |
|---|---|
| `whistle.mp3` | apito inicial |
| `whistle_end.mp3` | apito final |
| `net.mp3` | bola a bater na rede |
| `celebration.wav` | festejo do golo |
| `stadium.mp3` | cama de ambiente, em ciclo durante o jogo |

Sintetizados (`scripts/gen-sounds.js`): falta, golo sofrido, bancada, toque na
bola, remate, toque de interface e troféu.

**Os volumes foram medidos, não estimados.** Cada gravação teve o RMS comparado
com o do som sintetizado que substituiu — sem isso ficavam todos errados. O
estádio, por exemplo, tem um RMS de 0,037 contra 0,159 do antigo: ao ganho
anterior era uma cama que não se ouvia.

Dois pormenores que dão a diferença:

- **A celebração toca duas vezes seguidas.** A gravação tem 0,71 s, que soa a
  fim-de-lance e não a golo; duas cópias coladas dão ~1,4 s, que é a duração a
  que o ouvido reconhece uma bancada a festejar.
- **A celebração fica a 0,8 e não a 1.** Soa por cima do estádio e da rede — a
  folga é o que evita saturar quando os três se sobrepõem no golo.

Os ficheiros de origem estão em `_backup/sons-originais/` (não em `assets/`, para
não irem para o telemóvel sem serem usados). ⚠ O Android trata os recursos `raw`
pelo nome **sem extensão**: `goal.mp3` e `goal.wav` são o mesmo recurso e o build
falha. Foi por isso que `goal.mp3` passou a chamar-se `net.mp3`.

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

### Premium — como funciona por dentro

Compra real pela **Google Play Billing** (`expo-iap`), produto `premium_no_ads`,
não consumível. Quatro decisões que decidem se isto vive ou gera reembolsos:

- **O restauro corre sozinho em cada arranque.** Quem paga, desinstala e
  reinstala recupera sem pagar outra vez. É a queixa nº1 deste tipo de produto.
- **A loja é a fonte da verdade.** O que está gravado no dispositivo é só cache
  para o jogo abrir depressa.
- **`finishTransaction` é chamado sempre.** Uma compra não reconhecida em 3 dias
  é reembolsada e revogada pela Google, automaticamente.
- **A linha só aparece se a loja responder.** Sem Play Services, ou enquanto o
  produto não estiver ativo na Play Console, não há linha nenhuma — em vez de um
  botão que falha. Desistir da compra **não** mostra erro.

Nada disto bloqueia o jogo: loja em baixo, sem rede ou módulo em falta, o jogo
abre na mesma, apenas com anúncios. Ver `docs/PREMIUM.md`.

### Consentimento e privacidade

O consentimento obrigatório é o dos **anúncios** (UMP/GDPR): o formulário da
Google aparece sozinho na primeira abertura a quem está na UE, tratado em
`src/native/ads.ts`. A política de privacidade está acessível nas Definições.
**Não há ecrã de "aceito" a bloquear o jogo** — não é exigido, e só acrescentaria
atrito à primeira impressão.

---

## 14. Como está construído

### Estrutura

```
src/core/**        Lógica de jogo. TypeScript puro, determinístico, SEM React nem IO.
src/state/         Store Zustand — chama o core e notifica a UI.
src/persistence/   Save em SQLite (tabelas tipadas + blobs JSON).
src/ui/            Tema, i18n, som, componentes visuais (Face, GoalClip, ...).
src/native/        Fronteira nativa: anúncios, compras, atualização forçada, nuvem.
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
| `game` | Avanço de semana, inbox, mercado, empréstimos, academia, olheiros, juniores, IA dos plantéis, mundo de fundo, **disciplina, adeptos, imprensa, palestra ao intervalo, relatório do adversário, prémios individuais** |
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
npm run smoke:all                        # 25 suites, tem de imprimir "TODOS OS TESTES PASSARAM"
npm run e2e:all                          # 13 fluxos no browser, com a app a sério
```

As suites cobrem modelos, motor, época, economia, jogo, persistência, SQLite,
monetização, carreira, mundo, inbox, finanças, divisões, jornada, olheiros,
academia, contratos, táticas, moral, plano de jogo, **fluxo completo (5 épocas ×
3 seeds)** e Europa.

O teste de fluxo verifica invariantes que já foram bugs reais: nenhum jogador sai
do plantel sem aviso, o onze nunca aponta para quem já saiu, nunca há dois jogos
na mesma semana, a Europa termina antes do fecho da época, o teto salarial
aguenta, **nenhum clube fica com saldo negativo** e **a verba nunca passa a
caixa**.

Os **E2E** exportam a app para web e conduzem-na com Playwright (carreira nova,
tutorial guiado, separadores, emblema, tática, manual, adeptos, disciplina,
imprensa, adversário, palestra ao intervalo, jogo). São o único teste que apanha
erros de **render** — os smoke tests só cobrem lógica. `npm run e2e:headed` corre
o mesmo com o browser à vista.

### Publicação

Build local com Gradle (`:app:bundleRelease`, arm64-v8a + armeabi-v7a, assinatura
injetada), verificação do `.aab` (`jarsigner -verify`, SHA-256 da chave de
upload, Hermes comprimido nas duas arquiteturas) e arquivo em `_backup/`.

---

*Football Legacy · RakuLabs*
