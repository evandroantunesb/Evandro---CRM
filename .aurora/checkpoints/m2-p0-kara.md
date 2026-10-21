# Checkpoint Kara (QA) - m2-p0

- Objetivo: testes puros (dados FICTICIOS) da estimativa financeira incompleta, da formula-hipotese do Fio B e ajuste das asserções afetadas pela mudança de requisito (conta em R$ sem kWh = incompleta).
- Worktree: R:/wt-p0b-kara · branch aurora/m2-p0-kara · base a81f4542302ff001d1fb5de77ed1994c9d4b1af1. Sem commit.
- Concluido: tests/estimativa-financeira.test.ts, tests/fio-b-hipotese.test.ts (escritos contra as assinaturas lidas em R:/wt-p0b-jay), edicoes em tests/calculo-reproduzivel.test.ts e tests/calculadora-persistencia-db.test.ts.
- NAO executado: nada (modulos do Jay nao existem neste worktree; sem Docker/Supabase). Nora roda na versao integrada: `pnpm exec vitest run tests/estimativa-financeira.test.ts tests/fio-b-hipotese.test.ts tests/calculo-reproduzivel.test.ts`. A suite `calculadora-persistencia-db` exige Supabase local (nao rodada).

## Asserções alteradas (mudança de requisito aprovada pelo Evandro; nenhuma outra afrouxada)
tests/calculo-reproduzivel.test.ts (import de MENSAGEM_ESTIMATIVA_INCOMPLETA adicionado):
1. "consumo estimado por fatura / tarifa: 1000 / 0,90 grava 1111,11" — antes: consumo_medio_kwh 1111,11 derivado. Depois: `linhaDeCalculo` devolve exatamente `{ok:false, incompleta:true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA}` e sem `linha`. Motivo: nao deriva consumo de fatura/tarifa base.
2. "fatura 1000 com tarifa 0,95231: consumo 1050,09 ..." — antes: consumo null, derivado 1050,09. Depois: consumo INFORMADO 1050,09; mantidas as asserções de tarifa 0,9523, fatura 1000, consumo 1050,09, oraculo e reproducao.
3. "fatura com casas excedentes..." (1000,005 / tarifa 0,5) — antes: consumo null, derivado 2000,02. Depois: consumo informado 1500; fatura gravada 1000,01 mantida; consumo 1500 (nao derivado).
4. "fatura 999,995 -> 1000..." (tarifa 0,7) — antes: derivado 1428,57. Depois: consumo informado 1300; fatura 1000 mantida; consumo 1300.
5. Novo it.each (fatura 1000/0,95231; 1000,005/0,5; 999,995/0,7 sem kWh) => incompleta (preserva os cenarios antigos como incompleta).
6. "fatura 0,004 com tarifa 1 ... devolve o erro de consumo" — antes: ERRO_CONSUMO. Depois: `{ok:false, incompleta:true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA}` e mensagem != ERRO_CONSUMO.
7. Novo: com consumo null + fatura, potencia/tarifa/preco invalidos ainda dao ERRO_POTENCIA/ERRO_TARIFA/ERRO_PRECO (incompleta so com entrada valida). Assume a ordem do codigo do Jay (checagem de incompleta apos preco).
Nao alterados: "sem consumo nem fatura" (ERRO_ENTRADA), erros de consumo informado 0/0,004, ordem dos erros, "consumo informado vence a fatura".

tests/calculadora-persistencia-db.test.ts (nao rodado; so os CASOS com consumo null):
- "tarifa 0,95 e fatura 1055,55 (consumo 1111,11)": consumo null -> 1111,11 informado; expectativas (consumoGravado 1111,11, contaSemSolarGravada 1055,55) iguais.
- "fatura 1000 e tarifa 0,90 (consumo 1111,11)": consumo null -> 1111,11; expectativas iguais.
- "fatura 1000 e tarifa 0,95231 (consumo 1050,09)": consumo null -> 1050,09; expectativas iguais.
- "potência 5,505, preço 20000,005 e fatura 1000,005 com tarifa 0,5": consumo null -> 2000,02; expectativas iguais.
Motivo: com consumo null o `linhaDeCalculo` agora devolve incompleta e o teste lancaria erro. Usar o mesmo consumo antes derivado preserva todos os valores esperados.
Pendente: outros trechos do db test que usem consumo null nao foram varridos alem do grep (Nora ve ao rodar com Docker).

## Duvidas / premissas
fio-b-hipotese (assinatura lida do codigo do Jay): N entra pronto (`custoEnergiaCompensadaRsKwh`); T=0 e erro; energias arredondadas a 2 casas (K=85,37, nao-compensada 9,63 assertados exatos); N==T com C<=D e erro (validacao T>N precede a formula).
estimativa-financeira:
1. Ordem estavel: assumi a ordem da lista do contrato; confere com o codigo lido.
2. Pendencias isoladas assertam lista EXATA.
3. `enquadramento_ausente` nao vem com `percentual_legal_indisponivel` no codigo do Jay; nao assertado.
4. Strings so com espacos tratadas como vazias.
5. `parametrosFioB: null` assertado so contendo `fio_b_ausente` (o codigo tambem emite distribuidora_ausente e base_tributaria_divergente).
- Proximo passo: Nora executa na versao integrada e devolve falhas.
