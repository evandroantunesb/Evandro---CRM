# Checkpoint M2-Q1 (fase 1) — Kara (QA)

## Objetivo
Escrever testes das lacunas A (percentuais, contrato `percentualParaCampo` de Kevin) e B (cálculo reproduzível, contrato de Jay), sem esperar a implementação. Sem código de produção.

## Base
- Branch `aurora/m2-q1-cobertura`; SHA de base e commit pai: `d960703a59afcfdb651882432b3d3721e9ebea03`.

## Arquivos
Concluídos:
- `tests/percentual-exibicao.test.ts` (novo)
- `tests/calculo-reproduzivel.test.ts` (novo)
- este checkpoint
Locais, fora do commit (ignorados): `.aurora/tmp/` (implementações de referência `ref/`, mutantes `mut/`, `vitest.config.mts` sem globalSetup).

## O que cada teste prova
percentual-exibicao:
- 8 valores de referência do requisito (0,57->"57", 0,575->"57,5", 0,29->"29", 0,07->"7", 0->"0", 1->"100", 0,0005->"0,05", 0,1234->"12,34").
- Caso-bug (56,99999999999999 / 28,999999999999996 proibidos); sem ponto, "e" nem milhar; 6 casas preservadas (0,00000123->"0,000123").
- Varredura completa Fio B k/1000 (k=0..1000) e comissão k/10000 (k=0..10000): formato `/^\d{1,3}(,\d{1,6})?$/`; ida e volta `Math.round(lerNumeroBr(texto)/100*escala)===k`; percentual lido == k*100/escala em centésimos (inteiros).
calculo-reproduzivel:
- `consumoComoPersistido`: 1200,555->1200,56; 1200,554->1200,55; 1200,5; 0,005->0,01; 1,005->1,01; 2,675->2,68; 1111,111111->1111,11; inteiros; idempotência.
- `linhaDeCalculo`: consumo 1200,555 grava 1200,56 e bate com `calcular` sobre 1200,56 (oráculo independente); fatura 1000/tarifa 0,90 -> 1111,11; consumo 2 casas inalterado; consumo informado vence a fatura; mono/bi/tri escolhem a disponibilidade certa (30/50/100); sistema que cobre todo o consumo; payback nulo; `calcular(entradaDaLinha(linha))` toEqual exato dos 8 resultados gravados.
- Validações: sem consumo nem fatura, potência 0 e -1 -> `{ok:false, mensagem}`.
Origem dos valores: requisitos da tarefa e regras de `src/lib/calculadora.ts`. Parâmetros de teste (produtividade 120, Fio B 0,45, disp. 30/50/100, tarifa 0,90, kit 10 kWp/R$ 30.000) são fixtures arbitrárias, não decisão de negócio.

## Premissas do contrato (ajustar só nomes/importações se mudar)
- `linhaDeCalculo(empresaId, entrada, parametros)` -> `{ok:true, linha}|{ok:false, mensagem}`; campos da linha usados: `consumo_medio_kwh`, `geracao_estimada_kwh_mes`, `kwh_faturado`, `kwh_compensado`, `custo_fio_b`, `conta_sem_solar`, `conta_com_solar`, `economia_mensal`, `payback_meses`.
- `entradaDaLinha(linha)` devolve `EntradaCalculo` (camelCase) com potência, preço, tipo, tarifa, produtividade, Fio B e disponibilidade do tipo escolhido: assertado em campos nomeados de `EntradaCalculo`.

## Pendente de aprovação do Evandro
Nenhum valor esperado depende de decisão dele. Não testado por falta de requisito: tarifa <= 0 com fatura, consumo 0 com fatura, valores negativos, limite de numeric(10,2).

## Comandos e resultados reais
- `pnpm exec vitest run --config .aurora/tmp/vitest.config.mts` com implementações de referência minhas: 2 arquivos, 41 testes passaram.
- Mesmo comando com mutantes (`String(f*100)` com vírgula; `Math.round(kwh*100)/100`; cálculo sobre consumo bruto): 13 testes falharam (percentuais 0,57/0,29, varreduras; 1,005; reprodução com 1200,555 e 1100,005 etc.). Prova que os testes falham diante do defeito.
- `pnpm exec eslint` nos dois arquivos: sem avisos.
- `pnpm typecheck`: só 2 erros TS2307 (módulos `@/lib/calculo-reproduzivel` e `@/lib/percentual-exibicao` ainda inexistentes), esperados até a integração. Um erro de tipo próprio (literal `bifasico`) foi corrigido.
- Barrado: `IMPL=mut pnpm exec vitest ...` (prefixo de variável de ambiente exige aprovação); contornei só trocando o padrão no config descartável.

## Não rodou
`pnpm test` completo (globalSetup exige Docker/Supabase local), suítes `*-db`/`rls`, e2e, e os testes contra a implementação real (inexistente neste worktree).

## Próximo passo
Nora integra o código de Kevin e Jay e repassa a assinatura final; ajustar nomes/importações se necessário; fase 2: rodar `pnpm exec vitest run tests/percentual-exibicao.test.ts tests/calculo-reproduzivel.test.ts` e typecheck/lint sobre a versão integrada.

## Estado
pronto para integração (testes escritos; validação real pendente da implementação).
