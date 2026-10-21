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

## ACHADO A1 (pendente de decisão do Evandro)
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

## Correção pós-typecheck (M2-Q1)
- tests/calculadora-persistencia-db.test.ts: gravarPercentual passou a montar o update com tipo explícito (Database parametros_calculadora Update, escolhido por coluna), sem any/as. Nenhuma assertion alterada.
- pnpm typecheck: exit 0. rodar-db.sh: 78 testes passaram. Lint e build não rodados.
