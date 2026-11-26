-- Concessionárias, entrega 2 (item 6 do roadmap; desenho em docs/superpowers/specs/2026-11-23-concessionarias-design.md,
-- plano em docs/superpowers/plans/2026-11-25-concessionarias-cadastro.md).
--
--  * `concessionarias`: cadastro por empresa (RLS; só o admin cria e edita; ninguém apaga). Cada uma aponta para uma
--    distribuidora da ANEEL (sigla de `tarifas_gd_aneel.distribuidora`).
--  * Toda empresa, atual e nova, recebe a "Copel" (COPEL-DIS). Toda obra existente passa a apontar para ela.
--  * Obra nova: `garantir_obra` grava a concessionária achada pela distribuidora do negócio (regras 5, 6 e 6a):
--    texto que bate com os nomes aceitos da ANEEL ou com o nome cadastrado; vazio com uma única concessionária na
--    empresa usa essa; nos outros casos, a obra fica sem concessionária.
--  * `definir_concessionaria_obra`: a Engenharia corrige (histórico `concessionaria_obra_alterada`). A troca do
--    checklist pela regra 7 fica para a entrega 3, quando o modelo do checklist passa a ser por concessionária.
--  * `aplicar_checklist_engenharia` recusa obra sem concessionária.

-- ---------------------------------------------------------------------------
-- Cadastro
-- ---------------------------------------------------------------------------

create table public.concessionarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 60),
  distribuidora text not null check (length(btrim(distribuidora)) between 2 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, distribuidora)
);
create unique index concessionarias_nome_unico on public.concessionarias (empresa_id, lower(btrim(nome)));
comment on table public.concessionarias is
  'Concessionárias da empresa (entrega 2 do item 6). distribuidora = sigla da ANEEL, como em tarifas_gd_aneel.distribuidora.';

create or replace function public.proteger_concessionaria()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da concessionária não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_concessionaria() from public, anon, authenticated, service_role;
create trigger concessionarias_proteger before update on public.concessionarias
  for each row execute function public.proteger_concessionaria();
create trigger concessionarias_updated_at before update on public.concessionarias
  for each row execute function public.tocar_updated_at();
create trigger auditar_concessionarias after insert or update or delete on public.concessionarias
  for each row execute function public.auditar();

alter table public.concessionarias enable row level security;
create policy "ver concessionárias" on public.concessionarias for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria concessionária" on public.concessionarias for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita concessionária" on public.concessionarias for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
revoke delete, truncate on public.concessionarias from anon, authenticated;
revoke all on public.concessionarias from anon;

-- A Copel com o nome curto que a tela usa; empresas novas recebem a mesma (regra 2: modelo pronto).
create or replace function public.inserir_concessionaria_copel(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.concessionarias (empresa_id, nome, distribuidora)
  values (p_empresa_id, 'Copel', 'COPEL-DIS')
  on conflict (empresa_id, distribuidora) do nothing;
$$;
revoke all on function public.inserir_concessionaria_copel(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_concessionaria_copel_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_concessionaria_copel(new.id);
  return null;
end;
$$;
revoke all on function public.criar_concessionaria_copel_empresa() from public, anon, authenticated, service_role;
create trigger empresas_concessionaria_copel after insert on public.empresas
  for each row execute function public.criar_concessionaria_copel_empresa();

select public.inserir_concessionaria_copel(id) from public.empresas;

-- ---------------------------------------------------------------------------
-- Concessionária da obra
-- ---------------------------------------------------------------------------

alter table public.obras add column concessionaria_id uuid;
alter table public.obras add constraint obras_concessionaria_fk
  foreign key (empresa_id, concessionaria_id) references public.concessionarias (empresa_id, id);
create index obras_concessionaria_idx on public.obras (empresa_id, concessionaria_id) where concessionaria_id is not null;
comment on column public.obras.concessionaria_id is
  'Concessionária da obra (herdada do negócio na criação; a Engenharia corrige). Nula = sem cadastro: o checklist não é aplicado.';

-- Obras atuais: todas na Copel da empresa (regra 4), sem mexer no updated_at que as telas mostram.
alter table public.obras disable trigger obras_updated_at;
update public.obras o set concessionaria_id = c.id
from public.concessionarias c
where c.empresa_id = o.empresa_id and c.distribuidora = 'COPEL-DIS' and o.concessionaria_id is null;
alter table public.obras enable trigger obras_updated_at;

-- Mesma forma de `normalizarNome` (src/lib/tarifa-gd.ts), que a calculadora usa com `nomes_aceitos`: sem acento,
-- minúsculas, espaços colapsados e sem espaço nas pontas.
create or replace function public.normalizar_nome_distribuidora(p text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select btrim(regexp_replace(lower(regexp_replace(normalize(p, NFD), '[̀-ͯ]', '', 'g')), '\s+', ' ', 'g'));
$$;
revoke all on function public.normalizar_nome_distribuidora(text) from public, anon, authenticated, service_role;
grant execute on function public.normalizar_nome_distribuidora(text) to authenticated, service_role;

-- Concessionária da empresa para a distribuidora informada no negócio (texto livre). Vazia: a única da empresa, se
-- houver só uma (regra 6a). Preenchida: a que tem a sigla de uma distribuidora da ANEEL com esse nome aceito, ou o
-- mesmo nome cadastrado. Senão (ou se mais de uma casar), nula (regra 6).
create or replace function public.concessionaria_do_negocio(p_empresa_id uuid, p_distribuidora text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_nome text := public.normalizar_nome_distribuidora(coalesce(p_distribuidora, ''));
  v_ids uuid[];
begin
  if v_nome = '' then
    select array_agg(c.id) into v_ids from public.concessionarias c where c.empresa_id = p_empresa_id;
  else
    select array_agg(c.id) into v_ids
    from public.concessionarias c
    where c.empresa_id = p_empresa_id
      and (public.normalizar_nome_distribuidora(c.nome) = v_nome
        or exists (select 1 from public.tarifas_gd_aneel t where t.distribuidora = c.distribuidora and v_nome = any (t.nomes_aceitos)));
  end if;
  return case when cardinality(v_ids) = 1 then v_ids[1] end;
end;
$$;
revoke all on function public.concessionaria_do_negocio(uuid, text) from public, anon, authenticated, service_role;

-- `garantir_obra` (versão de 20261207100000_obra_solo.sql) com a concessionária da obra.
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
    cliente_nome, cidade, uf, potencia_kwp, tipo_ligacao, unidade_consumidora, snapshot, link_cliente, concessionaria_id
  )
  values (
    v_negocio.empresa_id, v_numero, v_negocio.id, v_contrato.id, v_conf.id, v_vendedor, v_sdr,
    v_tec #>> '{cliente,nome}', v_tec #>> '{cliente,cidade}', v_tec #>> '{cliente,uf}',
    (v_tec #>> '{calculo,potencia_kwp}')::numeric, (v_tec #>> '{calculo,tipo_ligacao}')::public.tipo_ligacao,
    v_tec #>> '{negocio,unidade_consumidora}', v_tec - 'cliente',
    case when v_solo then gen_random_uuid()::text end,
    public.concessionaria_do_negocio(v_negocio.empresa_id, v_negocio.qualif_distribuidora)
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


-- ---------------------------------------------------------------------------
-- Correção pela Engenharia
-- ---------------------------------------------------------------------------

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
  'arquivo_compra_anexado', 'documento_cliente_compra_anexado', 'checklist_alterado', 'instalacao_agendamento',
  'concessionaria_obra_alterada'
]));

create or replace function public.definir_concessionaria_obra(p_obra_id uuid, p_concessionaria_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_obra public.obras;
  v_nova public.concessionarias;
  v_antiga text;
begin
  select * into v_obra from public.obras where id = p_obra_id;
  -- Mesma resposta para "não existe" e "de outra empresa": não revela dados de outras empresas.
  select * into v_nova from public.concessionarias where id = p_concessionaria_id and empresa_id = v_obra.empresa_id;
  if not found then
    raise exception 'Concessionária não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obra.concessionaria_id is not distinct from v_nova.id then
    return;
  end if;
  select nome into v_antiga from public.concessionarias where id = v_obra.concessionaria_id;
  update public.obras set concessionaria_id = v_nova.id where id = p_obra_id;
  perform public.registrar_historico_obra(p_obra_id, 'concessionaria_obra_alterada', 'engenharia',
    jsonb_build_object('de', v_antiga, 'para', v_nova.nome, 'autorizacao', v_aut));
end;
$$;
revoke all on function public.definir_concessionaria_obra(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.definir_concessionaria_obra(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Checklist só com concessionária (versão de 20261101120000_engenharia_enquadramento.sql)
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_checklist_engenharia(p_obra_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_enq jsonb := public.enquadramento_obra_json(p_obra_id);
  v_novos integer;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  if (select concessionaria_id from public.obras where id = p_obra_id) is null then
    raise exception 'Escolha a concessionária da obra antes de aplicar o checklist.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
  select v_empresa, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
  from public.engenharia_checklist_modelo m
  where m.empresa_id = v_empresa and m.ativo and public.item_vale_no_enquadramento(m.condicoes, v_enq)
  on conflict (obra_id, modelo_id) do nothing;
  get diagnostics v_novos = row_count;
  if v_novos > 0 then
    perform public.registrar_historico_obra(p_obra_id, 'checklist_engenharia_aplicado', 'engenharia',
      jsonb_build_object('itens', v_novos, 'autorizacao', v_aut));
  end if;
  return v_novos;
end;
$$;

revoke all on function public.aplicar_checklist_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.aplicar_checklist_engenharia(uuid) to authenticated;
