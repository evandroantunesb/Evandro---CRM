-- Compras P4c: desconto sobre o preço sugerido pelo mesmo fluxo de aprovação do desconto à vista
-- (20261102200000_descontos_aprovacao.sql; decisões do Evandro de 09/11 e 10/11/2026; quadros `P4Desconto` e
-- `P4AprovarDesconto` do canvas "Raion — Nova interface").
--
-- O que faz:
--  * O desconto passa a ser medido do preço final que o cliente paga contra a referência do negócio: o maior entre o
--    preço sugerido pela tabela (`negocio_precificacao.preco_sugerido`, P4b) e o valor do negócio. Quem confere é o
--    app (emissão da proposta e geração do contrato), com o mesmo limite (`limite_desconto_membro`) e o mesmo pedido
--    aprovado de antes. Sem configuração nova.
--  * `descontos_solicitacoes.preco_sugerido`: retrato do sugerido no momento do pedido (nulo = sem sugerido), para
--    mostrar o pedido em reais e o resumo do gestor. Gravado pelo banco em `solicitar_desconto`.
--  * `cancelar_desconto`: quem pediu cancela o próprio pedido pendente. Não mexe no valor do negócio.
--  * `descontos_para_aprovar`: os pedidos pendentes que quem está logado pode decidir (Início do gestor e do admin).
-- O que NÃO faz: não muda o valor do negócio na recusa nem no cancelamento (decisão de 10/11/2026), nem os limites.

set lock_timeout = '5s';

alter table public.descontos_solicitacoes
  add column preco_sugerido numeric(12, 2) check (preco_sugerido is null or preco_sugerido > 0);

-- Corpo de 20261102200000_descontos_aprovacao.sql; muda só o retrato do sugerido no pedido.
create or replace function public.solicitar_desconto(p_negocio_id uuid, p_percentual numeric, p_motivo text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_eu uuid;
  v_limite numeric;
  v_pedido public.descontos_solicitacoes;
  v_nome text;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  v_eu := case when found then public.meu_membro_id(v_negocio.empresa_id) end;
  if v_eu is null or not public.pode_ver_negocio(p_negocio_id) or not public.tem_papel(v_negocio.empresa_id, '{admin,gestor,vendedor}') then
    raise exception 'Você não pode pedir desconto neste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if p_percentual is null or p_percentual <= 0 or p_percentual > 100 then
    raise exception 'Informe um desconto entre 0 e 100%%.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Explique o motivo do desconto.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_limite := public.limite_desconto_membro(v_eu);
  if p_percentual <= v_limite then
    raise exception using
      message = format('Esse desconto está dentro do seu limite (%s%%): não precisa de aprovação.', replace(trim_scale(v_limite)::text, '.', ',')),
      errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.descontos_solicitacoes
    set status = 'cancelado', decidido_por = v_eu, decidido_em = now(), motivo_decisao = 'Substituído por um pedido novo.'
    where negocio_id = p_negocio_id and status = 'pendente';

  insert into public.descontos_solicitacoes (empresa_id, negocio_id, solicitado_por, percentual, motivo, preco_sugerido)
  values (
    v_negocio.empresa_id, p_negocio_id, v_eu, round(p_percentual, 2), trim(p_motivo),
    (select pp.preco_sugerido from public.negocio_precificacao pp where pp.negocio_id = p_negocio_id and pp.preco_sugerido > 0)
  )
  returning * into v_pedido;

  select coalesce(nullif(trim(p.nome), ''), 'Alguém da equipe') into v_nome
    from public.empresa_membros m left join public.perfis p on p.id = m.user_id where m.id = v_eu;
  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  select v_negocio.empresa_id, m.id, 'desconto_solicitado',
         left(format('%s pediu %s%% de desconto em "%s".', v_nome, replace(trim_scale(v_pedido.percentual)::text, '.', ','), v_negocio.titulo), 500),
         format('/negocios/%s?aba=proposta#desconto', p_negocio_id)
  from public.empresa_membros m
  where m.empresa_id = v_negocio.empresa_id and public.pode_decidir_desconto(m.id, v_pedido);

  return v_pedido.id;
end;
$$;
revoke all on function public.solicitar_desconto(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.solicitar_desconto(uuid, numeric, text) to authenticated;

/** Quem pediu cancela o próprio pedido pendente. O valor do negócio não muda. */
create or replace function public.cancelar_desconto(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pedido public.descontos_solicitacoes;
  v_eu uuid;
begin
  select * into v_pedido from public.descontos_solicitacoes where id = p_id for update;
  v_eu := case when found then public.meu_membro_id(v_pedido.empresa_id) end;
  -- Mesma resposta para "não existe", "sem permissão" e "pedido de outra pessoa".
  if v_eu is null or v_eu is distinct from v_pedido.solicitado_por or not public.pode_ver_negocio(v_pedido.negocio_id) then
    raise exception 'Pedido de desconto não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_pedido.status <> 'pendente' then
    raise exception 'Este pedido já foi decidido ou cancelado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.descontos_solicitacoes
    set status = 'cancelado', decidido_por = v_eu, decidido_em = now(), motivo_decisao = 'Cancelado por quem pediu.'
    where id = p_id;
end;
$$;
revoke all on function public.cancelar_desconto(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_desconto(uuid) to authenticated;

/** Pedidos pendentes desta empresa que quem está logado pode decidir, do mais antigo para o mais novo. */
create or replace function public.descontos_para_aprovar(p_empresa_id uuid)
returns table (id uuid, negocio_id uuid, titulo text, solicitante text, percentual numeric, preco_sugerido numeric, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.negocio_id, n.titulo, coalesce(nullif(trim(p.nome), ''), 'Alguém da equipe'), s.percentual, s.preco_sugerido, s.created_at
  from public.descontos_solicitacoes s
  join public.negocios n on n.id = s.negocio_id
  join public.empresa_membros m on m.id = s.solicitado_por
  left join public.perfis p on p.id = m.user_id
  where s.empresa_id = p_empresa_id
    and s.status = 'pendente'
    and public.pode_ver_negocio(s.negocio_id)
    and public.pode_decidir_desconto(public.meu_membro_id(p_empresa_id), s)
  order by s.created_at;
$$;
revoke all on function public.descontos_para_aprovar(uuid) from public, anon, authenticated;
grant execute on function public.descontos_para_aprovar(uuid) to authenticated;

reset lock_timeout;
