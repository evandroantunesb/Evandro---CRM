-- CONTRAÇÃO: o cliente autenticado deixa de gravar `calculos_solares` (M2 P0, calculadora GD II; Evandro, 23/10/2026).
--
-- Fecha a brecha do financeiro forjado: as policies "criar cálculo"/"editar cálculo" deixavam qualquer membro que vê o
-- negócio gravar, pelo PostgREST, qualquer coluna (economia, contas, método, percentual, fonte, autoria, `completo`).
-- Provado em .aurora/revisao/calc-gd2/logs/19*.log; testes negativos em tests/calculo-gravacao-confiavel-db.test.ts.
--
-- ORDEM DE IMPLANTAÇÃO: aplicar SÓ depois que a versão do app que grava pelo servidor (src/lib/calculo-gravacao.ts,
-- RPC `autorizar_gravacao_calculo` da migration 20261023220000) estiver servindo todo o tráfego. A versão anterior do
-- app grava direto com o cliente do usuário: com esta migration aplicada, ela deixaria de salvar o cálculo.
-- Reversão de emergência (reabre a brecha): .aurora/revisao/calc-gd2/integracao/reverter-20261023240000.sql.
--
-- SELECT e DELETE continuam como estavam (DELETE grava histórico com autoria: migration 20261023230000).
-- REFERENCES, TRIGGER e MAINTAIN (PG 17) também saem: vinham só dos privilégios padrão do Supabase, nenhuma FK aponta
-- para esta tabela, os gatilhos são do `postgres` (executá-los não exige o privilégio TRIGGER) e o app não roda DDL nem
-- manutenção (VACUUM, ANALYZE, REINDEX, CLUSTER, LOCK TABLE) com esses papéis. Ficam só SELECT e DELETE.

drop policy "criar cálculo" on public.calculos_solares;
drop policy "editar cálculo" on public.calculos_solares;
revoke insert, update, truncate, references, trigger, maintain on public.calculos_solares from anon, authenticated;
