# Checkpoint de integração M2 — Nora (Team Leader)

- Objetivo: rodada M2 (M2-F1 percentuais, M2-B1 cálculo reproduzível, M2-Q1 cobertura), integrada em um worktree e validada. Fora desta rodada: proposta PDF, Fio B (fórmula/regras), decisões de produto.
- Worktree de integração: R:/wt-m2-int · Branch: aurora/m2-integracao · SHA de base / commit pai: d960703a59afcfdb651882432b3d3721e9ebea03 (origin/main, merge da #212). Sem commit: alterações locais integradas por patch revisado.
- Estado: **validado tecnicamente** para a versão descrita abaixo (ver "Verificações"). Publicação (commit, push normal e PR em Draft) autorizada pelo Evandro em 2026-10-21; este arquivo vai no mesmo commit do código. O aceite funcional é do Evandro.

## Branches ativas desta entrega
Esta branch (aurora/m2-integracao) é a única com commit e push; o SHA enviado é conferido por `git ls-remote` após o push e informado na PR (um commit não contém o próprio SHA). As branches dos agentes são locais, sem commit, e já estão integradas aqui; não precisam ser enviadas.
| Responsável | Worktree | Branch | SHA enviado ao remoto | Estado |
|---|---|---|---|---|
| Kevin (frontend) | R:/wt-m2-f1 | aurora/m2-f1-percentual-ui | nenhum (branch local, base d960703, sem commit) | pronto para integração; já integrado |
| Jay (backend) | R:/wt-m2-b1 | aurora/m2-b1-reprodutibilidade | nenhum (local, base d960703, sem commit) | pronto para integração; já integrado |
| Kara (QA) | R:/wt-m2-q1 | aurora/m2-q1-cobertura | nenhum (local, base d960703, sem commit) | fase 1 integrada; fase 2 feita direto em wt-m2-int |
| Nora (integração) | R:/wt-m2-int | aurora/m2-integracao | nenhum (local) | validado tecnicamente (local) |
Ordem de integração aplicada: Kevin → Jay → testes da Kara (fase 1) → Kara (fase 2, editando só os próprios testes em wt-m2-int) → correção do typecheck devolvida à Kara.

## Arquivos da versão integrada
- Modificados: src/app/(app)/configuracoes/calculadora/formularios.tsx (Kevin); src/lib/calculo-servidor.ts (Jay).
- Novos (código): src/lib/percentual-exibicao.ts (Kevin); src/lib/calculo-reproduzivel.ts (Jay).
- Novos (testes, Kara): tests/percentual-exibicao.test.ts; tests/calculo-reproduzivel.test.ts; tests/calculadora-persistencia-db.test.ts.
- Checkpoints: m2-f1-kevin.md, m2-b1-jay.md, m2-q1-kara.md, m2-integracao-nora.md.

## Problema na integração e correção
- `pnpm typecheck`: TS2345 em tests/calculadora-persistencia-db.test.ts(52,73) (`update({ [coluna]: fracao })` com chave calculada de tipo união). Devolvido à Kara; corrigido com objeto `Update` tipado, sem `any`/`as`, sem mexer em assertion. Contrato do Jay e do Kevin inalterados.

## Banco descartável usado
Stack Supabase `aurora-m2-q1` (containers supabase_*_aurora-m2-q1), API http://127.0.0.1:57321, Postgres 127.0.0.1:57322, 85 migrations da main (inclui 20261021100000_negocio_consumo_estimado). Workdir: R:/raion-crm/descartavel/aurora-m2-db. NÃO é o banco local existente (evandro---crm, 543xx). Sem db:reset. Script: .aurora/tmp/rodar-db.sh (local, ignorado).

## Verificações (todas na versão acima; sequência estrita; logs em .aurora/logs, locais)
Ver o relatório de revisão (RELATORIO-REVISAO.md do pacote). Resumo: typecheck ok; lint completo 0 erros/3 avisos preexistentes; testes puros afetados 127/127; DB: calculadora-db 6/6, negocios-gravacao-db 22/22, calculadora-persistencia-db 78/78; suíte completa oficial no banco descartável 1608/1610 (2 falhas preexistentes de CRLF, reproduzidas em base limpa); build ok (com variáveis do stack descartável).

## Pendências
- Decisão do Evandro: achado A1 (limites de quantidade de módulos: consumo digitado vs gravado, 1190,404 → 17 vs 16 módulos) e achados 1–7 do Jay (escalas tarifa_kwh/kit_preco/valor_fatura etc.).
- Conflito conhecido a resolver quando a branch wip/consumo-estimado-persistencia for unida: calculo-servidor.ts (regra "consumo obrigatório, sem fatura ÷ tarifa" deve ir para `problemaDaEntrada`/`linhaDeCalculo`).
- 2 testes "regressões de tela" de tests/negocios-gravacao.test.ts falham no Windows (CRLF) também na main: preexistente; o CI (Linux) é a referência.
- Troca de computador: pronta somente depois que o SHA da branch aurora/m2-integracao for verificado no remoto (conferência feita por Nora após o push). Os worktrees dos agentes (wt-m2-f1, -b1, -q1) têm só cópias já integradas.
- Decisão do Evandro: #209 e o PR da persistência (wip/consumo-estimado-persistencia), que conflita com a extração do Jay.
- Do Evandro: e2e/visual e aceitação funcional da calculadora.

## Nota final da rodada (2026-10-21, troca de computador)
- Remoto conferido: aurora/m2-integracao = 58100d3abb8a8525716445374e8b3378e6e25ea2, igual ao local e head do PR #213 (Draft). wt-m2-int limpa, sem nada sem commit. wip/consumo-estimado-persistencia = 4b4e506e9d704e09ff56e6d5dcdaaecdafa41f1c no remoto. A main não mudou nesta rodada.
- Retomada no notebook: `git fetch` e fast-forward em aurora/m2-integracao (já em dia, 58100d3). Neste notebook foi preciso `safe.directory` para o repositório e para R:/wt-m2-int (dono do disco R: diferente do usuário).
- CI do PR #213 no push 07459d9 (conferido no notebook com gh, login feito em 2026-10-21): verificar pass (3m57s), Vercel pass, Vercel Preview Comments pass. O CI do push 58100d3 estava pendente na última checagem em outro ambiente.
- Banco descartável aurora-m2-q1 parado; volumes mantidos. Stacks evandro---crm e restore-* não foram tocados. Não versionados e fora do notebook: logs (.aurora/logs), scripts de .aurora/tmp e o db.env do banco descartável; para testes de banco é preciso recriar o stack local.
- As 2 falhas de CRLF em tests/negocios-gravacao.test.ts são só do Windows e preexistentes.

## Próximo passo exato
Revisão do Evandro na PR em Draft. Nada de merge sem autorização específica. Decisões pendentes: A1 (módulos), conflito com a wip, achados 1–7 do Jay, aplicar a migration 20261021100000 em produção (workflow com confirmação aplicar-16b49d8, ação do Evandro).
