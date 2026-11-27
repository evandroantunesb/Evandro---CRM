-- Cartão com a taxa ao mês pré-configurada pela empresa (pedido do Evandro nos testes de 27/11/2026, item 7; prévia
-- aprovada em https://claude.ai/artifact/P9E58jbUjeUyme9nNR3fvA).
--
-- O que faz:
--  * `condicoes_pagamento_preferencias.cartao_taxa_mensal`: taxa ao mês (%, 0 a 10) que a empresa definiu para o
--    cartão. Nula = parcela a parcela (como antes): vale a taxa de cada parcela em `taxas_parcelamento`. Preenchida =
--    a parcela do cartão sai pela tabela Price com essa taxa (1x sem juros); as parcelas oferecidas continuam em
--    `taxas_parcelamento`, com a taxa total equivalente calculada pelo app.
--  * `salvar_taxas_cartao(empresa, taxa_mensal, taxas)`: grava as parcelas do cartão e a taxa ao mês de uma vez (tudo
--    ou nada), com as mesmas políticas de quem chama. Lista vazia = o vendedor informa a taxa na emissão.
-- O que NÃO faz: não muda o boleto nem as propostas já emitidas.
-- Depende de: condicoes_pagamento_preferencias, taxas_parcelamento e salvar_taxas_parcelamento (20261102180000).

set lock_timeout = '3s';

alter table public.condicoes_pagamento_preferencias
  add column cartao_taxa_mensal numeric(4, 2) check (cartao_taxa_mensal between 0 and 10);

comment on column public.condicoes_pagamento_preferencias.cartao_taxa_mensal is
  'Taxa ao mês (%) do cartão pré-configurada pela empresa; nula = taxa de cada parcela em taxas_parcelamento.';

/**
 * Troca as parcelas do cartão da empresa por `p_taxas` ([{parcelas, taxa}]) e grava a taxa ao mês (nula = parcela a
 * parcela). Lista vazia apaga a tabela do cartão e a taxa ao mês: o vendedor informa a taxa na emissão.
 * security invoker: as políticas de quem chama valem; se algo falhar, nada muda.
 */
create or replace function public.salvar_taxas_cartao(p_empresa_id uuid, p_taxa_mensal numeric, p_taxas jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_taxa numeric := case when jsonb_array_length(coalesce(p_taxas, '[]'::jsonb)) = 0 then null else p_taxa_mensal end;
begin
  if not public.tem_papel(p_empresa_id, '{admin,gestor}') then
    raise exception 'Só admin ou gestor configura o parcelamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if jsonb_typeof(p_taxas) is distinct from 'array' then
    raise exception 'Lista de parcelas inválida.' using errcode = 'invalid_parameter_value';
  end if;

  perform public.salvar_taxas_parcelamento(p_empresa_id, 'cartao', p_taxas);

  insert into public.condicoes_pagamento_preferencias as c (empresa_id, cartao_taxa_mensal)
  values (p_empresa_id, v_taxa)
  on conflict (empresa_id) do update set cartao_taxa_mensal = excluded.cartao_taxa_mensal
  where c.cartao_taxa_mensal is distinct from excluded.cartao_taxa_mensal;
end;
$$;
revoke all on function public.salvar_taxas_cartao(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_taxas_cartao(uuid, numeric, jsonb) to authenticated;

reset lock_timeout;
