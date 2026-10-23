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

## M2-B3 (integração, 2026-10-21) — conta SEM solar com piso
- src/lib/fio-b-hipotese.ts: `contaSemSolar = max(C, D) × T`; novo campo `paybackDisponivel` (economiaMensal > 0); cabeçalho atualizado. Fórmula com solar mantida (piso sobre o faturamento total, incl. K×N).
- Contrato final: .aurora/contratos/m2-p0-conta-solar.md.
- Resultados: typecheck ok; lint 0 erros (3 warnings preexistentes); vitest fio-b-hipotese + estimativa-financeira: 128 passam, 1 falha (tests/fio-b-hipotese.test.ts:66, "consumo < custo de disponibilidade" espera contaSemSolar 20 = C×T; agora 30 = piso). Teste de Kara a atualizar (não editado por mim).
- Não rodado: suítes -db, build; texto oficial do art. 655-I (baseei-me no checkpoint de Nora).
- Sem commit/push.
- Decisão de Nora (21/10): economiaMensal = arredondar2(arredondar2(sem) − arredondar2(com)); contas iguais exibidas => economia 0 e payback indisponível (resposta à dúvida 2 do Jay).

## M2-B4 (2026-10-21) - vigencia do calculo salvo
- Novo src/lib/calculo-vigencia.ts (calculoDesatualizado, potenciaDoKitKwp, mensagens); pdf-dados.ts com flag desatualizado (overloads, tipo DadosSistemaPropostaDesatualizado); gerarLinkProposta recusa calculo desatualizado.
- Contrato: .aurora/contratos/m2-p0-calculo-vigencia.md (regra, falsos positivos, tabela de consumidores, o que o Kevin ajusta).
- Resultados: typecheck ok; vitest (fio-b-hipotese, estimativa-financeira, calculo-reproduzivel) 233 passam; propostas-pdf-dados 2 passam; lint: 2 erros so em .aurora/tmp/arred-compara*.ts (scratch, nao meu) + 3 warnings preexistentes.
- Nao rodado: suites -db, build. Sem commit/push.
- Pendencias: contratos-geracao e atualizarPrecoCalculoComCliente nao tratam vigencia; falso positivo do consumo do formulario do kit (ver contrato).

## M2-B5 (2026-10-21) - decisoes de Nora sobre vigencia
- calculoDesatualizado agora SO compara potencia do kit atual (2 casas) x kit_potencia_kwp; assinatura sem consumoMedioKwhNegocio e sem consumo_medio_kwh. Chamadores ajustados (gerarLinkProposta; pdf-dados so teve comentario).
- Novas constantes: MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO, MENSAGEM_PRECO_CALCULO_DESATUALIZADO; mensagens existentes sem "ou o consumo".
- Guarda em gerarContratoComCliente (apos a guarda de preco, antes de gerar/gravar) e em atualizarPrecoCalculoComCliente (antes de qualquer update).
- Resultados: typecheck ok; lint 0 erros (3 warnings preexistentes); vitest puro 3 arquivos, 164 passam. Nao rodado: suites -db, build. Sem commit/push.

## M2-B8 (2026-10-21) - implementacao da solucao minima do diagnostico B7
Objetivo: motor sem formula (estimativa sempre incompleta), gravacao, vigencia com `legado`/`naoVerificavel`, proposta bloqueada, contratos de texto. Branch aurora/m2-p0-integracao, base 2780a53, sem commit.
Concluido (src/lib): calculadora.ts (uniao `calcular`, `fecharEconomia`, cobranca antiga removida), estimativa-financeira.ts (`avaliarEstimativa`, `formula_nao_validada`, mensagens), calculo-reproduzivel.ts (`ResultadoLinha` com pendencias), calculo-servidor.ts (comentario), negocios-gravacao.ts, calculo-vigencia.ts, acoes/propostas.ts, contratos-geracao.ts, propostas/pdf-dados.ts, propostas/pdf-tipos.ts (anulaveis), NOVO propostas/emissao-preservada.ts. Contratos: NOVO m2-p0-motor-estimativa.md; corrigidos m2-p0-arredondamento-economia.md e m2-p0-calculo-vigencia.md.
Decisoes: ver as 9 de Nora (checkpoint m2-p0-fio-b-nora.md). Escolhas minhas: `formula_nao_validada` sempre na lista; motivo extra `parametros_financeiros` (separa do `parametros`=produtividade para o contrato ignorar); `legado` primeiro na prioridade; `calculoDesatualizado` leniente (compat de src/app, devolve true para legado).
Resultados: typecheck FALHA so em src/app (kit-personalizado.tsx, formulario.tsx), src/lib/propostas/pdf.tsx, src/lib/pdf-proposta.tsx e tests (calculadora, calculo-preco); eslint dos arquivos alterados sem avisos; vitest puro (5 arquivos): estimativa-financeira e fio-b-hipotese passam; calculadora (4), calculo-reproduzivel (26) e calculo-vigencia (6) falham por mudanca de requisito (motor incompleto/legado).
Nao rodado: suites -db, build, e2e. Sem commit/push.
Proximo passo: Kevin troca os usos em src/app e renderers; Kara reescreve os testes listados no relatorio.

