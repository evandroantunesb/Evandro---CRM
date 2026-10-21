# Checkpoint M2-Q1 (fases 1 e 2) — Kara (QA)

## Objetivo
Fase 1: testes das lacunas A (percentuais, `percentualParaCampo`) e B (cálculo reproduzível). Fase 2: validar a versão INTEGRADA e ampliar a cobertura, com o Postgres real (banco descartável `aurora-m2-q1`, 573xx). Sem código de produção.

## Base
- Worktree de integração `R:/wt-m2-int`, branch `aurora/m2-integracao`, SHA de base `d960703a59afcfdb651882432b3d3721e9ebea03`; alterações de Kevin e Jay por patch, sem commit.

## Arquivos (meus)
- `tests/percentual-exibicao.test.ts` (ampliado: zero, menores valores, limites, não finitos, textos do formulário, estabilidade)
- `tests/calculo-reproduzivel.test.ts` (ampliado: bloco "ACHADO A1" de limites de módulos)
- `tests/calculadora-persistencia-db.test.ts` (novo, suíte de banco)
- este checkpoint
Locais, ignorados pelo Git: `.aurora/tmp/mut/` e `.aurora/tmp/vitest.mut-*.config.mts` (mutantes e configs de mutação).

## O que cada teste prova e de onde vem o esperado
- Percentuais: valores esperados vêm do requisito (0,57 -> "57", etc.) e das colunas (migrations `20260926000100_calculadora.sql`: Fio B numeric(4,3), `20260926051000_custos_internos.sql`: comissão numeric(5,4), check 0..1). Regra de entrada de `editarParametros`: `lerNumeroBr(texto)/100`, vazio = 0.
- Banco (percentuais): ciclo gravar -> ler -> `percentualParaCampo` -> regravar sem editar, para 14 textos de Fio B e 12 de comissão, mais varredura (Fio B a cada 3 milésimos + extremos; comissão a cada 101 + extremos). Valores arredondados pelo Postgres (half away from zero) confirmados no banco real: Fio B "0,05" -> 0,001 -> "0,1"; "0,04" -> 0; "0,15" -> 0,002; "57,55" -> 0,576; comissão "0,005" -> 0,0001; "12,345" -> 0,1235. Isso é do banco, não do helper. Banco recusa 100,1% e negativos (23514).
- Consumo (banco): `consumoComoPersistido(bruto) === valor lido` para 18 valores em `calculos_solares` e 22 em `negocios` (inclui 0,004, 0,0049, 1e-7, 0 e 99999999,99).
- Reprodução: 8 casos (incluindo tarifa 0,90 com 1500,005 -> conta_sem_solar 1350,01; 800,125 -> 720,12; tarifa 0,95 com fatura 1055,55 -> 1111,11 e 1055,55): linha gravada == linha gerada campo a campo; `calcular(entradaDaLinha(lida))` toEqual exato dos 8 resultados lidos; refazer `linhaDeCalculo` a partir da linha lida devolve a mesma linha, regravar e reler mantém tudo.
- Fixtures (produtividade 120, Fio B 0,45, disponibilidade 30/50/100, kits, tarifas) são arbitrárias, não decisão de negócio.

## ACHADO A1 (HISTÓRICO: DECIDIDO em D1, ver seção "M2-Q2" no fim; o texto abaixo descreve o comportamento anterior)
Produtividade 120 kWh/kWp/mês, módulo 620 W: 16 módulos cobrem exatamente 1190,4 kWh. Consumo digitado 1190,404 -> `sugerirQuantidadeModulos` = 17; `consumoComoPersistido(1190,404)` = 1190,40 -> refeito do dado gravado = 16. Diverge em todo limite k (74,4 x k, varredura k=1..40) para consumo em (limite, limite + 0,005) quando o limite tem até 2 casas. Abaixo do limite (1190,396 -> 1190,40) e acima de +0,005 (1190,405 -> 1190,41) não diverge. O teste caracteriza o comportamento atual sem afirmar o correto. Decisão do Evandro: dimensionar com o consumo digitado ou com o consumo como persistido (ou aceitar a diferença de sub-kWh).

## Comandos e resultados reais
- `pnpm exec vitest run --config .aurora/tmp/vitest.puro.config.mts tests/calculadora.test.ts tests/numeros-br.test.ts tests/percentual-exibicao.test.ts tests/calculo-reproduzivel.test.ts`: 4 arquivos, 127 testes passaram.
- `bash .aurora/tmp/rodar-db.sh tests/calculadora-persistencia-db.test.ts` (stack descartável): 1 arquivo, 78 testes passaram (8,5 s).
- Mutação (cópias em `.aurora/tmp/mut/`, nunca src/**): percentual-a (`String(f*100)` com vírgula): 11 falhas; percentual-b (corta para 2 casas): 1 falha (6 casas legítimas); calculo-a (`Math.round(x*100)/100`): 1 falha (1,005); calculo-b (cálculo sobre consumo bruto): 5 falhas. Todos falham, logo os testes puros conseguem falhar.

## Não rodou
- Mutação sobre a suíte de banco: `rodar-db.sh` usa a config oficial (sem alias), então a suíte de banco não foi exercitada contra mutantes. Registrado como "mutação não executada" para ela.
- typecheck, lint, build (Nora executa), `pnpm test` completo, e2e, rls.

## Barreiras de comando
- `sed ... > arquivo` foi barrado (composto); contornei escrevendo os mutantes com Write.

## Próximo passo
Nora roda typecheck/lint/build em sequência; Evandro decide o achado A1. Nada foi commitado.

## Estado
Pronto para integração (testes puros e de banco passam sobre a versão integrada; typecheck/lint/build não rodados por mim).

## M2-Q2 (decisões D1 a D3 de Nora, autorizada pelo Evandro) — versão integrada
Base: worktree `R:/wt-m2-int`, branch `aurora/m2-integracao`, SHA pai `46d495f19b0a43583d97578a4a62ae425dab725e` + patch de Jay (M2-B2) sem commit. Nada commitado.

Arquivos meus: `tests/calculo-reproduzivel.test.ts`, `tests/consumo-persistido.test.ts` (novo), `tests/calculadora-persistencia-db.test.ts`, este checkpoint. Locais (ignorados): `.aurora/tmp/mut/{calculadora-i,calculo-ii,consumo-iii}.ts` e `.aurora/tmp/vitest.mut-q2*.config.mts`.

Decisões registradas nos testes:
- D1 (A1 decidido): `dimensionarSistema` normaliza com `consumoComoPersistido`. Esperados (prod. 120, módulo 620 W): 1190,396/1190,40/1190,404 -> 16; 1190,405/1190,41 -> 17; 0,004 -> null; 0,005 -> 1 módulo. Varredura k=1..40 com 13 deltas em milésimos (-10..+10) em torno de L = 74400*k/1000: `direto === via persistido === oráculo inteiro` (centésimos = floor((n+5)/10); módulos = max(1, ceil(centésimos/7440))).
- D2: `linhaDeCalculo` grava tarifa (4 casas), potência/preço/fatura (2 casas) normalizados; esperados à mão (0,123456 -> 0,1235; 0,95231 -> 0,9523; fatura 1000 com 0,95231 -> consumo 1050,09, a tarifa bruta daria 1050,08; 5,505 -> 5,51; 20000,005 -> 20000,01; 999,995 -> 1000; fatura 1000,005 com tarifa 0,5 -> 2000,02). 6 mensagens de erro e a ordem (1 entrada, 2 potência, 3 tarifa, 4 preço, 5 consumo, 6 parâmetros), com pares de conflito.
- D3: `tests/consumo-persistido.test.ts` com casas 0/2/4 (half away from zero decimal), simetria, nunca -0, idempotência, NaN/±Infinity, 1e-7 -> 0, RangeError (-1, 1,5, NaN, Infinity, -0,5).
- Banco: valorComoPersistido === valor lido para tarifa (0,123456; 0,95231; 0,00005; 1,23455), potência (5,505; 6,1; 0,005), preço (20000,005; 19999,995), fatura (1000,005; 999,995); 23514 para tarifa 0,00004 e potência 0,004; 4 casos novos de reprodução completa (tarifa 0,123456 e 0,95231 com consumo 800; fatura 1000 com 0,95231; potência/preço/fatura/tarifa excedentes juntos).

Resultados reais:
- Puros: `pnpm exec vitest run --config .aurora/tmp/vitest.puro.config.mts tests/calculo-reproduzivel.test.ts tests/consumo-persistido.test.ts tests/percentual-exibicao.test.ts tests/calculadora.test.ts tests/numeros-br.test.ts`: 5 arquivos, 231 passaram + 3 "expected fail" (it.fails, achados abaixo).
- Banco (descartável aurora-m2-q1): `bash .aurora/tmp/rodar-db.sh tests/calculadora-persistencia-db.test.ts`: 95 passaram.
- Mutação (cópias em `.aurora/tmp/mut/`, nunca src/**): (i) dimensionarSistema sem normalizar: 4 falhas; (ii) linhaDeCalculo sem normalizar a tarifa: 7 falhas; (iii) `Math.round(x*100)/100` em valorComoPersistido: 17 falhas (inclui 2 pontos da varredura, k=7 x=520,805 e k=32 x=2380,805). Todos detectados.

Achados (defeitos no código de Jay; não corrigi), ambos marcados com `it.fails` para manter a suíte verde e avisar quando corrigidos:
1. `valorComoPersistido(-0, casas)` devolve -0 (atalho `fracao.length <= casas` retorna `valor`); contrato D3 diz "nunca -0". Reprodução: `Object.is(valorComoPersistido(-0, 2), -0) === true`.
2. `dimensionarSistema(+Infinity, 120, 620)` devolve quantidadeModulos Infinity; o comentário novo diz que consumo não finito devolve null. Não é regressão de D1 (já era assim). Decisão de contrato pendente.

Não rodou: mutação sobre a suíte de banco (rodar-db.sh usa config oficial); typecheck, lint, build (Nora); `pnpm test` completo, e2e, rls.

Estado: pronto para integração, com os 2 achados acima abertos; typecheck/lint/build não rodados por mim.

## M2-Q2 ajuste final: achados resolvidos
- Os 2 achados (valorComoPersistido(-0) e dimensionarSistema com não finito) foram corrigidos por Jay. Os 3 `it.fails` (1 em calculo-reproduzivel, 2 em consumo-persistido) viraram `it`, sem mudar expectativas. Nenhum `it.fails` resta em tests/.
- Puros (5 arquivos): 234 passaram, 0 falhas. Banco descartável aurora-m2-q1: 95 passaram.
- Observação: o teste convertido em calculo-reproduzivel verifica `sugerirQuantidadeModulos(+Infinity, ...)`; não afirma diretamente `dimensionarSistema` (cobertura indireta pela tabela de entradas inválidas só com valores finitos). Não rodei typecheck, lint, build.
- Estado: pronto para integração. Nada commitado.

## M2-Q2 complemento: dimensionarSistema com entrada não finita
- tests/calculo-reproduzivel.test.ts: it.each com 7 casos (consumo +Inf/-Inf/NaN, produtividade +Inf/NaN, módulo +Inf/NaN) -> null, mais 1 contraste (1200,120,620 -> 17 módulos).
- Puros (3 arquivos): 164 passaram. Mutante sem Number.isFinite (.aurora/tmp/mut/calculadora-q2b.ts): os 3 casos +Infinity novos falham; -Inf e NaN seguem passando (já barrados por `!(x > 0)`), como esperado. Nada commitado; typecheck/lint/build/banco não rodados.

## Correção pós-typecheck (M2-Q1)
- tests/calculadora-persistencia-db.test.ts: gravarPercentual passou a montar o update com tipo explícito (Database parametros_calculadora Update, escolhido por coluna), sem any/as. Nenhuma assertion alterada.
- pnpm typecheck: exit 0. rodar-db.sh: 78 testes passaram. Lint e build não rodados.
