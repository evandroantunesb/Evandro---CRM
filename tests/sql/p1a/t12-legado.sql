-- v6 (conjunto P1a-0 + P1a-1, fail-closed: cada resultado é conferido): mesmo teste da v4, com os IDs fixos trocados por marcadores {{...}} que o
-- executor (executar-testes.sh) preenche com o cenário do banco local (cenario.sql).
\set ON_ERROR_STOP 1
begin;
\i /tmp/p1v10-assercoes.sql
\i /tmp/p1v10-01.sql
\i /tmp/p1v10-02.sql
\i /tmp/p1v10-emissao-fechada.sql
select set_config('request.jwt.claims', json_build_object('sub', '{{VENDEDOR_LEGADO}}', 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
\echo '--- reconstrução de proposta legada (ação explícita)'
select numero, tipo, origem, situacao, recursos_status, documento -> 'emissao' ->> 'rotulo' as rotulo,
       pg_temp.confere(numero = 1 and tipo = 'preliminar' and origem = 'legado_reconstruida' and situacao = 'vigente'
                       and documento -> 'emissao' ->> 'rotulo' like 'Reconstruída em % Não é cópia fiel%', 'reconstrução preliminar rotulada') as confere
from public.reconstruir_proposta_legada('{{NEG_LEGADO}}');
\echo '--- a proposta legada (tabela propostas) não foi alterada'
reset role;
select token is not null as token_legado_intacto, updated_at < now() - interval '1 second' as nao_tocada from public.propostas where negocio_id = '{{NEG_LEGADO}}';
select pg_temp.confere(count(*) = 1 and bool_and(token is not null and updated_at < now() - interval '1 second'), 'proposta legada intacta')
  from public.propostas where negocio_id = '{{NEG_LEGADO}}';
rollback;
\echo '--- ROLLBACK feito'
