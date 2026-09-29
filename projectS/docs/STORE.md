# Loja (Premium, pacotes de dinheiro, VIP)

Catálogo em `src/monetization/catalog.ts` (fonte única dos IDs e valores).
Compra nativa em `src/native/purchases.ts` (stub web em `purchases.web.ts`).
Ecrã em `app/store.tsx`, aberto a partir de Definições → Loja.

## Play Console (criado a 29/09/2026)

| Produto | Tipo | ID | Preço base |
|---|---|---|---|
| Premium sem anúncios | único (não consumível) | `premium_no_ads` | 2,99 € |
| Pacote de Dinheiro Pequeno (+1 M) | único (consumível) | `cash_small` | 0,99 € |
| Pacote de Dinheiro Médio (+4 M) | único (consumível) | `cash_medium` | 2,99 € |
| Pacote de Dinheiro Grande (+10 M) | único (consumível) | `cash_large` | 5,99 € |
| Football Legacy VIP | subscrição | `vip` | — |
| ↳ plano mensal | renovação automática | `monthly` | 3,99 € |
| ↳ plano anual | renovação automática | `yearly` | 29,99 € |

Os IDs nunca mais podem ser alterados nem reutilizados. As opções de compra dos
produtos únicos chamam-se `buy`. Se mudares um valor em `catalog.ts`, muda também
a descrição do produto na Play Console (ela diz "1/4/10 milhões").

## Regras que o código cumpre

- **Dinheiro só entra quando a loja confirma**, e o token só é consumido DEPOIS
  de creditar. Se a app morrer entre as duas, `claimPendingCash` (arranque)
  credita e consome — nunca se perde dinheiro pago, nunca se credita sem cobrar.
  Só credita a uma carreira já criada (não ao mundo em branco do onboarding).
- **VIP = sem anúncios + bónus diário ×2 + 5 bónus/dia sem vídeo.** É revalidado
  na loja em cada arranque, nos dois sentidos. Se a loja não responder, mantém-se
  a cache (nunca se revoga por falha de rede).
- **Premium comprado nunca é revogado** por o VIP expirar
  (`premium = premiumOwned || vip`).
- Web/emulador sem Play Services: a linha "Loja" não aparece.

## Testar (obrigatório antes de publicar)

1. Play Console → Configuração → **Testes de licença**: mete o teu email.
2. A app tem de vir da Play Store (canal de testes fechado), não de `adb`.
3. Tentar: cada pacote (o saldo sobe e pode comprar-se outra vez), VIP mensal
   (sem anúncios, bónus diário a dobrar), cancelar o VIP e reabrir a app.

## Por fazer (fora do código)

- Publicar uma versão nova com este código (subir versionCode nos 4 ficheiros,
  ver `CLAUDE.md`). Os produtos existem, mas só funcionam com um build que os use.
- Declaração de dados e política de subscrições/reembolsos na Play Console.
