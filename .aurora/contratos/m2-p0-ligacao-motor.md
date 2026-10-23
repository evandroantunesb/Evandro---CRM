# Ponto exato de ligação do cálculo financeiro ao motor (`calcular`)

Estado: mapa para depois do aceite (ver `m2-p0-decisao-fio-b-copel.md`). Nada disto foi ligado. Nora, 22/10/2026, worktree `R:/wt-m2-p0-calc`.

## Já pronto nesta rodada (trabalho independente)

- Migration `20261023200000_calculos_estimativa_incompleta.sql`: `calculos_solares.estado_financeiro` (`legado`/`incompleto`/`completo`), `pendencias`, `metodo_calculo`; financeiros anuláveis; CHECK de coerência (incompleto = financeiros e payback nulos + pendências; completo = números + método).
- `linhaDeCalculo` devolve o resultado técnico `incompleto` e os dois salvamentos (criar negócio, salvar kit) gravam. Linha `legado` nunca é substituída por resultado incompleto.
- Vigência: motivo `incompleta` (bloqueia proposta antiga e preço; o contrato ignora). Ficha: "Resultado técnico salvo (sem economia)", recolhido.

## Onde a regra entra (em ordem)

1. **Dados oficiais** — tabela `parametros_fio_b` (rascunho `.aurora/propostas-sql/m2-p0-fio-b.sql`, parte 1) com a linha da Copel: `fio_b_rs_kwh` 0,214536, `base_tributaria` `sem_tributos`, `origem` `oficial_aneel`, fonte/linha da ANEEL, vigência 2026-06-24 a 2027-06-23. Admin cadastra. O vendedor nunca digita.
2. **Leitura no servidor** — `src/lib/calculo-servidor.ts:32` (`montarLinhaCalculo`): além de `parametros_calculadora`, ler `parametros_fio_b` vigente na data do cálculo e o enquadramento do negócio; passar para `linhaDeCalculo`.
3. **Entrada do motor** — `src/lib/calculo-reproduzivel.ts:163` (`linhaDeCalculo` chama `calcular`): preencher `dadosEstimativa` (`enquadramento`, `parametrosFioB`, `tarifaBaseBaseTributaria`, `dataReferencia`). Hoje é omitido, por isso tudo sai incompleto.
4. **Motor** — `src/lib/calculadora.ts:87` (`calcular`): hoje devolve sempre `incompleta` (linha 102). Novo ramo: se `avaliarCompletude` não tiver pendências, chamar `calcularFioBHipotese` (`src/lib/fio-b-hipotese.ts:74`) com `T`, `D` (pelo `tipoLigacao`), `N = percentualLegalFioB(enq) × fioB` e montar `estado: "completa"` via `fecharEconomia` (`calculadora.ts`). Mapeamento: `kwhCompensado = K`, `kwhFaturado = C − K`, `custoFioB = K × N`, contas e economia do módulo.
5. **Trava da fórmula** — `src/lib/estimativa-financeira.ts:166`: a pendência `formula_nao_validada` é sempre acrescentada; sai com o aceite. `percentualLegalFioB` (linha 66) passa a usar o ANO da data de referência (2026 = 0,60; 2027 = 0,75), e a componente vem da vigência da mesma data (fora dela, `fio_b_vigencia_fora`). Payback indisponível no P0 (contrato, seção 4). Tarifa com base declarada (seção 5) e desatualização R6.2/R6.3 (seção 6).
6. **Gravação** — `calculo-reproduzivel.ts:211` (ramo `ok: true`): já grava `estado_financeiro: "completo"`; falta `metodo_calculo` (o banco recusa sem ele) e o retrato do Fio B usado (rascunho, parte 2: distribuidora, enquadramento, Fio B, base, origem, fonte, vigência, percentual legal).
7. **Prévia do vendedor** — `src/app/(app)/negocios/[id]/kit-personalizado.tsx:420` e `src/app/(app)/negocios/novo/formulario.tsx:307` chamam `calcular` no navegador: receber os mesmos `dadosEstimativa` por props do servidor. Fio B automático, só em "Detalhes técnicos" (recolhido).
8. **Leitores do estado `completo`** — vigência (`calculo-vigencia.ts`), ficha, preço (`atualizarPrecoCalculoComCliente`), proposta: liberar só `completo`; `legado` e `incompleta` continuam bloqueados.

## Teste depois do aceite

prévia → salvar → reabrir → proposta, no banco descartável, com a linha da Copel cadastrada e os quatro casos da decisão como oráculo.
