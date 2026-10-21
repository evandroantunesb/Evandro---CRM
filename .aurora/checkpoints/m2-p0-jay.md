# Checkpoint m2-p0 — Jay (Backend)

Objetivo: contrato "estimativa financeira incompleta" + correção do caminho "conta em R$" + rascunho SQL + hipótese Fio B isolada.
Branch: aurora/m2-p0-jay · SHA de base (pai): a81f4542302ff001d1fb5de77ed1994c9d4b1af1 · Estado: pronto para integração (NÃO validado tecnicamente: sem node_modules no worktree).

## Arquivos
- NOVO src/lib/estimativa-financeira.ts (contrato exato do pedido; sem fórmula)
- src/lib/calculo-reproduzivel.ts: `ResultadoLinha` ganhou `incompleta?: true`; exporta `MENSAGEM_ESTIMATIVA_INCOMPLETA`; sem consumo em kWh, `linhaDeCalculo` devolve `{ok:false, incompleta:true, mensagem}` em vez de fatura ÷ tarifa base.
- src/lib/calculo-servidor.ts: retorno tipado como `ResultadoLinha`.
- NOVO src/lib/fio-b-hipotese.ts (HIPÓTESE EM TESTE, isolado, não importado por ninguém; `calcularFioBHipotese`, `METODO_FIO_B_HIPOTESE`)
- NOVO .aurora/propostas-sql/m2-p0-fio-b.sql (rascunho, não aplicado)
- calculadora.ts, database.types.ts, telas, testes: intactos.

## Consumidores afetados (grep)
- src/lib/negocios-gravacao.ts (arquivo NÃO permitido a mim): criarNegocio (l.235) trata `!montado.ok` como aviso "calculo" (kit salvo, ok); salvarKitComCliente (l.396-405) trata `!montado.ok` como erro "Nada foi alterado" — com `incompleta` o kit NÃO é salvo. Para o pedido (salvar kit e devolver aviso) é preciso transferir negocios-gravacao.ts: se `montado.incompleta`, seguir sem upsert de cálculo e devolver a mensagem como aviso (e decidir o que fazer com cálculo antigo existente: ficaria desatualizado).
- Testes: tests/calculo-reproduzivel.test.ts (l.100-114, 193-216 usam fatura sem kWh e esperam consumo = fatura/tarifa; l.315 espera ERRO_CONSUMO para fatura 0,004) e tests/calculadora-persistencia-db.test.ts precisam ser atualizados por Kara.

## Decisões
- Sem tarifa efetiva na entrada de `linhaDeCalculo`, conta em R$ sem kWh é sempre incompleta; nenhuma coluna nova usada.
- fio-b-hipotese: autoconsumo > consumo ou > geração = erro explícito; `premissas.autoconsumoInstantaneo` = "zero_conservador" quando 0/omitido, "informado" quando > 0 (desvio da letra do pedido, que só cita zero_conservador: confirmar). Arredondamento half-away-from-zero em 2 casas via toPrecision(15) (aproxima numeric do Postgres).

## Comandos
- git rev-parse/branch/status e grep: ok.
- NÃO rodado: pnpm typecheck, pnpm lint, vitest (worktree sem node_modules; não instalei). Nenhum teste escrito (Kara). Nenhuma migration/Supabase/commit/push.

## Dúvidas para Nora
1. Transferir negocios-gravacao.ts para tratar `incompleta` (item acima)?
2. Valor de `premissas.autoconsumoInstantaneo` quando informado > 0.
3. Exclusion constraint de vigência (btree_gist) comentada no SQL: incluir?

Próximo passo: Nora verifica typecheck/lint em cópia limpa; Kara escreve testes dos contratos e ajusta os testes citados.

## Atualização (decisões de Nora)
- negocios-gravacao.ts transferido e alterado SÓ para `incompleta`. Diff exato (3 pontos, em salvarKitComCliente):
  1. l.405: `if (!montado.ok)` -> `if (!montado.ok && !montado.incompleta)` (incompleta não aborta; sem upsert, pois o upsert exige `montado?.ok`).
  2. mensagem de erro da estrutura do telhado: `montado ?` -> `montado?.ok ?` ("Kit e cálculo salvos" só quando houve cálculo).
  3. Antes do `return` final, bloco novo: se `montado && !montado.ok` => `{ok:true, negocioId, mensagem: "Itens do kit salvos. <MENSAGEM_ESTIMATIVA_INCOMPLETA>" + (calculoAtual ? " O cálculo anterior foi mantido e pode estar desatualizado." : "")}`.
  Cálculo já salvo não é apagado nem alterado. criarNegocio inalterado (aviso "calculo").
- premissas.autoconsumoInstantaneo aprovado como está. Exclusion constraint segue COMENTADA no SQL (btree_gist + decisão do Evandro).
- Asserções que quebram (Kara ajusta; mudança de requisito aprovada: conta em R$ sem tarifa efetiva não gera consumo; agora `linhaDeCalculo` devolve ok:false/incompleta):
  - tests/calculo-reproduzivel.test.ts: l.100-105 (1000/0,90 => 1111,11); l.193-201 (fatura 1000, tarifa 0,95231 => 1050,09); l.203-209 (1000,005/0,5 => 2000,02); l.211-217 (999,995/0,7 => 1428,57); l.315-317 (fatura 0,004 esperava ERRO_CONSUMO, agora vem a mensagem de estimativa incompleta). Todas usam consumoMedioKwh null + fatura. `consumo informado vence a fatura` (l.113) continua válido.
  - tests/calculadora-persistencia-db.test.ts: CASOS l.339, 343, 348, 349 (consumo null + fatura; esperam consumoGravado derivado). Suíte -db (Supabase local; não rodei).
  - Verificar: tests/negocios-gravacao*.test.ts, negocios-acoes-db.test.ts (grep só achou fatura junto de consumo informado; provável sem impacto).
- Também sem teste: salvarKitComCliente com incompleta (kit salvo, sem upsert, aviso, cálculo anterior mantido).
- Não rodado: typecheck/lint/vitest (sem node_modules).
