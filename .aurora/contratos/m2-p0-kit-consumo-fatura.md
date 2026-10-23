# Contrato — kWh e fatura do kit (M2 P0, Nora, 22/10/2026) — FINAL

Escopo: só `salvarKitComCliente` (servidor) e o editor do kit (ficha do negócio). Sem schema, migration ou RLS. Desenho de propostas fora daqui.

## Regra (servidor e tela usam a mesma)
"Vazio" = campo ausente ou só espaços (`lerNumeroBr` devolve null). Número malformado continua sendo erro de validação (sem mudança).

| Campo do kit | Preenchido | Vazio |
| --- | --- | --- |
| `consumoMedioKwh` | substitui `negocios.consumo_medio_kwh` | mantém `negocios.consumo_medio_kwh` (pode ser null) |
| `valorFaturaMedio` | substitui `negocios.valor_conta_energia` | mantém `negocios.valor_conta_energia` (pode ser null) |

Valor efetivo = valor do campo ?? valor gravado no negócio. O valor efetivo (e nunca o campo cru) é usado em: `montarLinhaCalculo`, `pendenciasDaEntrada`, `update` de `negocios`. Na tela: prévia (`calcular`), sugestão de módulos e lista de pendências.

Fonte do "valor gravado" na tela: props `consumoMedioKwhPadrao` e `valorFaturaMedioPadrao` (= `negocios.consumo_medio_kwh` / `negocios.valor_conta_energia`, já passadas por `page.tsx`). Não usar o cálculo legado como valor gravado.

Limpeza explícita: só em "Dados do negócio" (`editarNegocioComCliente`), onde vazio = null. Sem mudança nessa ação.

Saída de `salvarKitComCliente`: forma e mensagens inalteradas (`{ ok, negocioId, pendencias?, mensagem }`); as pendências refletem os valores efetivos.

## Textos da tela (exatos)
Abaixo do campo "Consumo médio (kWh/mês)":
- campo vazio E `consumoMedioKwhPadrao != null` → `<p data-testid="kit-consumo-salvo">`:
  `Campo vazio: ao salvar, vale o consumo já salvo no negócio ({formatarNumeroBr(v)} kWh/mês). Para apagar, use “Dados do negócio”.`
- caso contrário → texto atual, sem mudança: `O kit é salvo mesmo sem o consumo em kWh. Só o valor da conta em R$ não é usado como consumo.`

Abaixo do campo "Valor médio da fatura (R$, opcional)":
- campo vazio E `valorFaturaMedioPadrao != null` → `<p data-testid="kit-fatura-salva">`:
  `Campo vazio: ao salvar, vale a fatura já salva no negócio ({formatarMoeda(v)}). Para apagar, use “Dados do negócio”.`
  (`formatarMoeda` gera "R$ 300,00" com espaço não separável após "R$".)
- caso contrário → nada.

Mesma classe visual do texto de ajuda atual (`-mt-2 text-xs text-zinc-400`).

## Donos (arquivos exclusivos)
- Jay (Backend): `src/lib/negocios-gravacao.ts` (só `salvarKitComCliente`).
- Kevin (Frontend): `src/app/(app)/negocios/[id]/kit-personalizado.tsx`.
- Kara (QA): `tests/negocios-gravacao-db.test.ts` e o novo `e2e/11-kit-consumo-fatura-salvos.spec.ts`.
- Nora: este contrato, checkpoint, integração e validação.
