-- Onboarding, subprojeto 4b: obra do Solo (desenho em docs/superpowers/specs/2026-11-11-obra-solo-e-setores-design.md,
-- seção "4b"; plano em docs/superpowers/plans/2026-11-11-obra-solo.md; decisões do Evandro de 11/11/2026, rulings
-- confirmados no mesmo dia).
--
-- O que faz:
--  * `obra_checklist`: 10 etapas por obra do Solo (contrato, entrada, projeto e ART, material comprado, protocolo,
--    material entregue, instalação, vistoria, conexão e medidor, entrega). Resolvida = feita ou "não se aplica"
--    (com motivo, só da etapa 3 à 9). Contrato e entrada nascem feitas nas datas reais e não desmarcam. Data de feita
--    no futuro é recusada. Quem vê a obra lê; só o admin escreve (no Solo há uma pessoa só), por funções que gravam
--    no histórico da obra (`checklist_alterado`).
--  * A obra nova do Solo nasce sem setores (`setores_da_obra` devolve vazio) e com `obras.link_cliente` (token
--    aleatório, trocável por `gerar_link_cliente_obra`). Obra do PRO não tem checklist nem link.
--  * As obras do Solo que já existem ganham o checklist (contrato e entrada pelas datas reais, o resto pendente) e o
--    link; os fluxos de setor que elas têm ficam como estão. Empresa que vira Solo depois não ganha checklist nas obras
--    antigas (pendência registrada).
--  * Data da assinatura: o evento `contrato.assinado` do negócio; sem ele (mesma transação), a última alteração do
--    contrato.

set lock_timeout = '5s';

create type public.etapa_checklist_obra as enum (
  'contrato', 'entrada', 'projeto_art', 'material_comprado', 'protocolo',
  'material_entregue', 'instalacao', 'vistoria', 'conexao', 'entrega'
);

create table public.obra_checklist (
  obra_id uuid not null references public.obras (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  etapa public.etapa_checklist_obra not null,
  feita_em date,
  nao_se_aplica_motivo text check (nao_se_aplica_motivo is null or length(btrim(nao_se_aplica_motivo)) between 1 and 500),
  prevista_para date,
  anotacao text check (anotacao is null or length(anotacao) <= 1000),
  marcada_por uuid references public.empresa_membros (id) on delete set null,
  marcada_em timestamptz,
  primary key (obra_id, etapa),
  check (not (feita_em is not null and nao_se_aplica_motivo is not null)),
  check (nao_se_aplica_motivo is null or etapa not in ('contrato', 'entrada', 'entrega'))
);
create index obra_checklist_empresa_idx on public.obra_checklist (empresa_id);

alter table public.obra_checklist enable row level security;
create policy "quem vê a obra lê o checklist" on public.obra_checklist for select to authenticated
  using (public.pode_ver_obra(obra_id));
revoke all on public.obra_checklist from anon;
revoke insert, update, delete, truncate, references, trigger on public.obra_checklist from authenticated;

alter table public.obras add column link_cliente text unique;

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo = any (array[
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada', 'participante_atribuido',
  'participante_encerrado', 'fluxo_alterado', 'marco_alterado', 'fixacao_definida', 'checklist_engenharia_aplicado',
  'documento_engenharia_enviado', 'item_engenharia_alterado', 'protocolo_engenharia_registrado',
  'protocolo_engenharia_atualizado', 'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada',
  'engenharia_concluida_excecao', 'passo_engenharia_registrado', 'enquadramento_engenharia_salvo',
  'entrega_contratada_ajustada', 'entrega_material_prevista', 'orcamento_ajustado', 'custo_lancado', 'custo_estornado',
  'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida',
  'escalonamento_aberto', 'escalonamento_fechado', 'obra_rede_engenharia', 'conta_pagar_lancada', 'conta_paga',
  'conta_cancelada', 'conta_estornada', 'nf_fornecedor_anexada', 'nf_cliente_anexada', 'pedido_compra_criado',
  'pedido_compra_editado', 'pedido_compra_cancelado', 'pedido_compra_faturado', 'pedido_compra_recebido',
  'pedido_compra_nf_desfeita', 'orcamento_compra_anexado', 'orcamento_compra_editado', 'orcamento_compra_descartado',
  'arquivo_compra_anexado', 'documento_cliente_compra_anexado', 'checklist_alterado'
]::text[]));

-- A empresa está no plano Solo (lê `planos_empresa` direto: `produto_da_empresa` responde só a membros).
create or replace function public.empresa_e_solo(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.planos_empresa p where p.empresa_id = p_empresa_id and p.produto = 'solo');
$$;
revoke all on function public.empresa_e_solo(uuid) from public, anon, authenticated, service_role;

-- Dia (Brasília) em que o contrato do negócio foi assinado.
create or replace function public.data_assinatura_contrato(p_negocio_id uuid, p_reserva timestamptz)
returns date
language sql stable security definer set search_path = ''
as $$
  select (coalesce(
    (select min(e.created_at) from public.eventos e where e.tipo = 'contrato.assinado' and e.entidade_id = p_negocio_id),
    p_reserva
  ) at time zone 'America/Sao_Paulo')::date;
$$;
revoke all on function public.data_assinatura_contrato(uuid, timestamptz) from public, anon, authenticated, service_role;

-- Setores de uma obra nova: o Solo não tem setores; no PRO, sem os que a empresa desligou.
create or replace function public.setores_da_obra(p_empresa_id uuid)
returns public.setor_obra[]
language sql stable security definer set search_path = ''
as $$
  select case when public.empresa_e_solo(p_empresa_id) then '{}'::public.setor_obra[] else (
    select coalesce(array_agg(s.setor order by s.ordem), '{}')
    from unnest(array['compras', 'engenharia', 'operacional', 'administrativo']::public.setor_obra[]) with ordinality as s(setor, ordem)
    where not exists (
      select 1 from public.empresa_telas t
      where t.empresa_id = p_empresa_id and s.setor::text = any (t.setores_desligados)
    )
  ) end;
$$;
revoke all on function public.setores_da_obra(uuid) from public, anon, authenticated, service_role;

create or replace function public.garantir_obra(p_negocio_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_contrato public.contratos;
  v_conf public.confirmacoes_pagamento;
  v_obra_id uuid;
  v_numero integer;
  v_vendedor uuid;
  v_sdr uuid;
  v_tec jsonb;
  v_com jsonb;
  v_solo boolean;
  v_assinatura date;
begin
  -- Trava o negócio: serializa sinais simultâneos (ganho, assinatura, pagamento).
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found or v_negocio.status <> 'ganho' then
    return null;
  end if;

  select id into v_obra_id from public.obras where negocio_id = p_negocio_id;
  if found then
    return v_obra_id;
  end if;

  select * into v_contrato from public.contratos where negocio_id = p_negocio_id and status = 'assinado';
  if not found then
    return null;
  end if;

  select * into v_conf from public.confirmacoes_pagamento where contrato_id = v_contrato.id and estornado_em is null;
  if not found then
    return null;
  end if;

  -- Vendedor = responsável congelado na assinatura; SDR = origem do handoff (write-once).
  v_vendedor := coalesce(v_contrato.responsavel_assinatura_id, v_negocio.responsavel_id);
  select h.de_membro_id into v_sdr from public.handoffs h where h.id = v_negocio.handoff_origem_id;
  if v_sdr = v_vendedor then
    v_sdr := null;
  end if;

  v_solo := public.empresa_e_solo(v_negocio.empresa_id);

  v_tec := public.obra_snapshot_tecnico(p_negocio_id);
  v_com := public.obra_snapshot_comercial(p_negocio_id);

  -- Numeração por empresa sem coluna editável: trava por empresa + maior número + 1.
  -- Obras nunca são apagadas, então não há reuso de número.
  perform pg_advisory_xact_lock(hashtextextended('obras_numero:' || v_negocio.empresa_id::text, 0));
  select coalesce(max(numero), 0) + 1 into v_numero from public.obras where empresa_id = v_negocio.empresa_id;

  insert into public.obras (
    empresa_id, numero, negocio_id, contrato_id, confirmacao_pagamento_id, vendedor_id, sdr_id,
    cliente_nome, cidade, uf, potencia_kwp, tipo_ligacao, unidade_consumidora, snapshot, link_cliente
  )
  values (
    v_negocio.empresa_id, v_numero, v_negocio.id, v_contrato.id, v_conf.id, v_vendedor, v_sdr,
    v_tec #>> '{cliente,nome}', v_tec #>> '{cliente,cidade}', v_tec #>> '{cliente,uf}',
    (v_tec #>> '{calculo,potencia_kwp}')::numeric, (v_tec #>> '{calculo,tipo_ligacao}')::public.tipo_ligacao,
    v_tec #>> '{negocio,unidade_consumidora}', v_tec - 'cliente',
    case when v_solo then gen_random_uuid()::text end
  )
  on conflict (negocio_id) do nothing
  returning id into v_obra_id;

  if v_obra_id is null then
    -- Defesa extra: outra transação criou primeiro.
    select id into v_obra_id from public.obras where negocio_id = p_negocio_id;
    return v_obra_id;
  end if;

  -- Dados pessoais: só em obra_cliente, fora do alcance da API.
  insert into public.obra_cliente (obra_id, empresa_id, dados)
    values (v_obra_id, v_negocio.empresa_id, coalesce(v_tec -> 'cliente', '{}'::jsonb));

  insert into public.obra_dados_comerciais (obra_id, empresa_id, valor_vendido, snapshot)
    values (v_obra_id, v_negocio.empresa_id, v_negocio.valor, v_com);

  -- Só os setores que a empresa tem quando a obra nasce: Engenharia e Administrativo podem estar desligados.
  insert into public.obra_fluxos (obra_id, empresa_id, setor, status)
  select v_obra_id, v_negocio.empresa_id, s.setor,
         case s.setor
           when 'compras' then 'a_comprar'
           when 'engenharia' then 'a_iniciar'
           when 'operacional' then 'aguardando_liberacao'
           when 'administrativo' then 'pagando_fornecedores'
         end
  from unnest(public.setores_da_obra(v_negocio.empresa_id)) as s(setor);

  -- Obra do Solo: checklist de 10 etapas; contrato e entrada já feitas nas datas reais (Brasília).
  if v_solo then
    v_assinatura := public.data_assinatura_contrato(v_negocio.id, v_contrato.updated_at);
    insert into public.obra_checklist (obra_id, empresa_id, etapa, feita_em)
    select v_obra_id, v_negocio.empresa_id, e.etapa,
           case e.etapa
             when 'contrato' then v_assinatura
             when 'entrada' then (v_conf.confirmado_em at time zone 'America/Sao_Paulo')::date
           end
    from unnest(enum_range(null::public.etapa_checklist_obra)) as e(etapa);
  end if;

  insert into public.obra_marcos (obra_id, empresa_id, marco) values
    (v_obra_id, v_negocio.empresa_id, 'nf_cliente'),
    (v_obra_id, v_negocio.empresa_id, 'garantia');

  if v_vendedor is not null then
    insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, criado_por_user_id)
      values (v_obra_id, v_negocio.empresa_id, v_vendedor, 'comercial', 'vendedor', true, (select auth.uid()));
  end if;
  if v_sdr is not null then
    insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, criado_por_user_id)
      values (v_obra_id, v_negocio.empresa_id, v_sdr, 'comercial', 'sdr', false, (select auth.uid()));
  end if;

  perform public.registrar_historico_obra(v_obra_id, 'obra_criada', null, jsonb_build_object(
    'negocio_id', v_negocio.id,
    'negocio_numero', v_negocio.numero,
    'contrato_id', v_contrato.id,
    'confirmacao_pagamento_id', v_conf.id
  ));

  return v_obra_id;
end;
$$;

revoke all on function public.garantir_obra(uuid) from public, anon, authenticated, service_role;

-- Confere que a obra tem checklist (é do Solo) e que quem chama é o admin da empresa; devolve a empresa.
create or replace function public.exigir_admin_obra_solo(p_obra_id uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select o.empresa_id into v_empresa from public.obras o
  where o.id = p_obra_id and exists (select 1 from public.obra_checklist c where c.obra_id = o.id);
  if v_empresa is null or not public.tem_papel(v_empresa, '{admin}') then
    raise exception 'Só o admin da empresa altera o checklist da obra.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  return v_empresa;
end;
$$;
revoke all on function public.exigir_admin_obra_solo(uuid) from public, anon, authenticated, service_role;

-- Marca (com a data; vazia = hoje) ou desmarca uma etapa. Marcar tira o "não se aplica".
create or replace function public.marcar_etapa_obra(p_obra_id uuid, p_etapa public.etapa_checklist_obra, p_feita boolean, p_data date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := public.exigir_admin_obra_solo(p_obra_id);
  v_data date := coalesce(p_data, public.hoje_brasilia());
begin
  if not p_feita and p_etapa in ('contrato', 'entrada') then
    raise exception 'Esta etapa não pode ser desmarcada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_feita and v_data > public.hoje_brasilia() then
    raise exception 'A data da etapa não pode ser no futuro.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.obra_checklist
    set feita_em = case when p_feita then v_data end,
        nao_se_aplica_motivo = case when p_feita then null else nao_se_aplica_motivo end,
        marcada_por = public.meu_membro_id(v_empresa),
        marcada_em = now()
  where obra_id = p_obra_id and etapa = p_etapa;
  perform public.registrar_historico_obra(p_obra_id, 'checklist_alterado', null, jsonb_build_object(
    'etapa', p_etapa, 'acao', case when p_feita then 'feita' else 'desmarcada' end, 'data', case when p_feita then v_data end));
end;
$$;
revoke all on function public.marcar_etapa_obra(uuid, public.etapa_checklist_obra, boolean, date) from public, anon, authenticated, service_role;
grant execute on function public.marcar_etapa_obra(uuid, public.etapa_checklist_obra, boolean, date) to authenticated;

-- Data prevista da etapa (nula apaga).
create or replace function public.prever_etapa_obra(p_obra_id uuid, p_etapa public.etapa_checklist_obra, p_data date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exigir_admin_obra_solo(p_obra_id);
  update public.obra_checklist set prevista_para = p_data where obra_id = p_obra_id and etapa = p_etapa;
  perform public.registrar_historico_obra(p_obra_id, 'checklist_alterado', null,
    jsonb_build_object('etapa', p_etapa, 'acao', 'prevista', 'data', p_data));
end;
$$;
revoke all on function public.prever_etapa_obra(uuid, public.etapa_checklist_obra, date) from public, anon, authenticated, service_role;
grant execute on function public.prever_etapa_obra(uuid, public.etapa_checklist_obra, date) to authenticated;

-- Anotação interna da etapa ("Só você vê"); vazia apaga. O texto não vai para o histórico.
create or replace function public.anotar_etapa_obra(p_obra_id uuid, p_etapa public.etapa_checklist_obra, p_texto text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exigir_admin_obra_solo(p_obra_id);
  update public.obra_checklist set anotacao = nullif(btrim(p_texto), '') where obra_id = p_obra_id and etapa = p_etapa;
  perform public.registrar_historico_obra(p_obra_id, 'checklist_alterado', null, jsonb_build_object('etapa', p_etapa, 'acao', 'anotada'));
end;
$$;
revoke all on function public.anotar_etapa_obra(uuid, public.etapa_checklist_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.anotar_etapa_obra(uuid, public.etapa_checklist_obra, text) to authenticated;

-- "Não se aplica" com motivo (só da etapa 3 à 9; tira a data de feita). Motivo nulo desfaz.
create or replace function public.etapa_nao_se_aplica_obra(p_obra_id uuid, p_etapa public.etapa_checklist_obra, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := public.exigir_admin_obra_solo(p_obra_id);
begin
  if p_motivo is not null then
    if p_etapa in ('contrato', 'entrada', 'entrega') then
      raise exception 'Esta etapa sempre se aplica.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if btrim(p_motivo) = '' then
      raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;
  update public.obra_checklist
    set nao_se_aplica_motivo = nullif(btrim(p_motivo), ''),
        feita_em = case when p_motivo is null then feita_em end,
        marcada_por = public.meu_membro_id(v_empresa),
        marcada_em = now()
  where obra_id = p_obra_id and etapa = p_etapa;
  perform public.registrar_historico_obra(p_obra_id, 'checklist_alterado', null, jsonb_build_object(
    'etapa', p_etapa, 'acao', case when p_motivo is null then 'aplica_de_novo' else 'nao_se_aplica' end));
end;
$$;
revoke all on function public.etapa_nao_se_aplica_obra(uuid, public.etapa_checklist_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.etapa_nao_se_aplica_obra(uuid, public.etapa_checklist_obra, text) to authenticated;

-- Troca o link do cliente: o antigo deixa de valer.
create or replace function public.gerar_link_cliente_obra(p_obra_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_link text := gen_random_uuid()::text;
begin
  perform public.exigir_admin_obra_solo(p_obra_id);
  update public.obras set link_cliente = v_link where id = p_obra_id;
  perform public.registrar_historico_obra(p_obra_id, 'checklist_alterado', null, jsonb_build_object('acao', 'link_trocado'));
  return v_link;
end;
$$;
revoke all on function public.gerar_link_cliente_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.gerar_link_cliente_obra(uuid) to authenticated;

-- Obras do Solo que já existem: checklist (contrato e entrada pelas datas reais) e link.
insert into public.obra_checklist (obra_id, empresa_id, etapa, feita_em)
select o.id, o.empresa_id, e.etapa,
       case e.etapa
         when 'contrato' then public.data_assinatura_contrato(o.negocio_id, c.updated_at)
         when 'entrada' then (cp.confirmado_em at time zone 'America/Sao_Paulo')::date
       end
from public.obras o
join public.contratos c on c.id = o.contrato_id
left join public.confirmacoes_pagamento cp on cp.id = o.confirmacao_pagamento_id
cross join unnest(enum_range(null::public.etapa_checklist_obra)) as e(etapa)
where public.empresa_e_solo(o.empresa_id)
  and not exists (select 1 from public.obra_checklist x where x.obra_id = o.id);

update public.obras o set link_cliente = gen_random_uuid()::text
where o.link_cliente is null and exists (select 1 from public.obra_checklist x where x.obra_id = o.id);
