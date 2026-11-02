-- Condições de pagamento — condição escolhida no contrato (PR 4 do plano; decisões do Evandro em 02/11/2026).
--
-- O que faz:
--  * `condicoes_pagamento_preferencias` ganha, por modalidade, o que o valor do negócio passa a ser quando o vendedor
--    registra a condição escolhida pelo cliente: 'preco' (preço do sistema da proposta) ou 'total_cliente' (o que o
--    cliente paga na condição). Padrão: à vista e Personalizado = total_cliente; parcelado e financiamento = preco.
--  * `contratos` guarda a condição registrada (`condicao_pagamento`, cópia do que veio da proposta emitida), quando e
--    por quem. Só muda com o contrato em rascunho; quando e por quem são gravados pelo banco.
--  * `gerar_contrato_com_condicao`: grava o texto do contrato, a condição e o novo valor do negócio na mesma
--    transação (tudo ou nada). Negócio ganho: o valor muda só por `corrigir_valor_negocio` (admin ou gestor, com
--    motivo, registra `deal.value_corrected`); fora disso, como a edição comum do valor. security invoker: valem a RLS
--    e as travas de quem chama; não dá a ninguém um poder que já não tivesse.
-- O que NÃO faz: não mexe em eventos, pontos, metas nem comissões além do que a correção de valor existente já faz.
-- Depende de: condicoes_pagamento_preferencias (20261102180000), corrigir_valor_negocio, meu_membro_id.

set lock_timeout = '5s';

alter table public.condicoes_pagamento_preferencias
  add column valor_negocio_avista text not null default 'total_cliente' check (valor_negocio_avista in ('preco', 'total_cliente')),
  add column valor_negocio_parcelado text not null default 'preco' check (valor_negocio_parcelado in ('preco', 'total_cliente')),
  add column valor_negocio_financiamento text not null default 'preco' check (valor_negocio_financiamento in ('preco', 'total_cliente')),
  add column valor_negocio_personalizado text not null default 'total_cliente' check (valor_negocio_personalizado in ('preco', 'total_cliente'));

alter table public.contratos
  add column condicao_pagamento jsonb check (condicao_pagamento is null or jsonb_typeof(condicao_pagamento) = 'object'),
  add column condicao_registrada_em timestamptz,
  add column condicao_registrada_por uuid references public.empresa_membros (id) on delete set null;
create index on public.contratos (condicao_registrada_por);

-- A condição só muda com o contrato em rascunho; quando e por quem vêm sempre do banco.
create or replace function public.preparar_condicao_contrato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.condicao_pagamento is not distinct from old.condicao_pagamento then
    new.condicao_registrada_em := old.condicao_registrada_em;
    new.condicao_registrada_por := old.condicao_registrada_por;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'rascunho' then
    raise exception 'A condição de pagamento só muda com o contrato em rascunho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if new.condicao_pagamento is null then
    new.condicao_registrada_em := null;
    new.condicao_registrada_por := null;
  else
    new.condicao_registrada_em := now();
    new.condicao_registrada_por := public.meu_membro_id(new.empresa_id);
  end if;
  return new;
end;
$$;
revoke all on function public.preparar_condicao_contrato() from public, anon, authenticated;

create trigger contratos_condicao_pagamento before insert or update on public.contratos
  for each row execute function public.preparar_condicao_contrato();

/**
 * Gera (ou regera, em rascunho) o contrato com a condição escolhida e ajusta o valor do negócio, tudo ou nada.
 * `p_condicao` nulo = contrato sem condição (proposta antiga ou sem proposta): o valor não muda. O texto e o valor
 * vêm do app, montados da proposta emitida; a RLS e as travas de quem chama decidem se pode gravar.
 */
create or replace function public.gerar_contrato_com_condicao(
  p_negocio_id uuid,
  p_conteudo text,
  p_condicao jsonb,
  p_valor numeric,
  p_motivo text
)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_eu uuid;
  v_gravados integer;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_eu := public.meu_membro_id(v_negocio.empresa_id);

  if p_condicao is not null and p_valor is not null and p_valor is distinct from v_negocio.valor then
    if p_valor <= 0 then
      raise exception 'Valor do negócio inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_negocio.status = 'ganho' then
      -- Só admin ou gestor; registra a correção para metas e comissões.
      perform public.corrigir_valor_negocio(p_negocio_id, p_valor, p_motivo);
    else
      update public.negocios set valor = p_valor where id = p_negocio_id;
      get diagnostics v_gravados = row_count;
      if v_gravados <> 1 then
        raise exception 'Sem permissão para mudar o valor deste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
      end if;
    end if;
  end if;

  insert into public.contratos (empresa_id, negocio_id, conteudo, condicao_pagamento, criado_por, atualizado_por)
  values (v_negocio.empresa_id, p_negocio_id, p_conteudo, p_condicao, v_eu, v_eu)
  on conflict (negocio_id) do update
    set conteudo = excluded.conteudo, condicao_pagamento = excluded.condicao_pagamento, atualizado_por = excluded.atualizado_por
    where public.contratos.status = 'rascunho';
  get diagnostics v_gravados = row_count;
  if v_gravados <> 1 then
    raise exception 'Este contrato já saiu do rascunho: o texto não muda mais automaticamente.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.gerar_contrato_com_condicao(uuid, text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.gerar_contrato_com_condicao(uuid, text, jsonb, numeric, text) to authenticated;

reset lock_timeout;
