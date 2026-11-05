-- Setor Administrativo na obra (PR A1, aprovado pelo Evandro em 05/11/2026). O valor do enum nasce em
-- 20261119100000_setor_administrativo_enum.sql.
--
-- O Administrativo paga os fornecedores da obra e cuida da nota fiscal do cliente. A obra só nasce com o pagamento do
-- cliente já confirmado (garantir_obra), então o setor começa em "pagando fornecedores":
--   pagando_fornecedores → fornecedores_pagos → concluido
-- Nada aqui exige nota fiscal anexada: o concluído é decisão do setor (contas a pagar e anexos ficam na PR A2).
--
-- O que muda:
--  1. Status válidos do setor (obra_fluxos e gatilho das tarefas automáticas) e as RPCs de status.
--  2. Toda obra nova nasce com o fluxo do Administrativo; as existentes recebem o fluxo (em andamento →
--     pagando_fornecedores; concluídas ou canceladas → concluido).
--  3. O admin pode dar o setor a um membro `operacao` (coordenar ou executar), como os outros três.
--  4. Marco "NF do cliente" passa a ser do Administrativo; "garantia" continua do Operacional. A obra concluída
--     (regra do app) passa a exigir os 4 setores no fim e os 2 marcos resolvidos ("não se aplica" resolve).
--  5. Dados pessoais do cliente para participante ativo do Administrativo: endereço e CPF/CNPJ (sem telefone).
--  6. Tarefas de setor (manuais e automáticas) aceitam o Administrativo; duas regras automáticas padrão novas.
--  7. Confirmação do pagamento do cliente: quem atua no Operacional OU no Administrativo (confirma_pagamento_cliente).
--     `atua_no_operacional` fica intacta enquanto o app anterior a esta PR estiver no ar (remover depois).
-- Gerais, sem lista de setores (continuam como estão): autorizacao_setor_obra, preparar_escrita_obra,
-- atribuir/encerrar participante, parado/aguardando, membro_atua_no_setor, membros_do_setor, pode_ver_obra_operacao.
-- Custos da obra continuam só do Operacional nesta PR (o Administrativo entra junto das contas a pagar, na A2).

-- ---------------------------------------------------------------------------
-- 1. Status
-- ---------------------------------------------------------------------------

alter table public.obra_fluxos drop constraint obra_fluxos_status_valido;
alter table public.obra_fluxos add constraint obra_fluxos_status_valido check (
  (setor = 'compras' and status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'material_entregue'))
  or (setor = 'engenharia' and status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
  or (setor = 'operacional' and status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  or (setor = 'administrativo' and status in ('pagando_fornecedores', 'fornecedores_pagos', 'concluido'))
);

alter table public.tarefas_automaticas_regras drop constraint tarefas_automaticas_regras_gatilho_valido;
alter table public.tarefas_automaticas_regras add constraint tarefas_automaticas_regras_gatilho_valido check (
  (gatilho_setor = 'compras' and gatilho_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'material_entregue'))
  or (gatilho_setor = 'engenharia' and gatilho_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
  or (gatilho_setor = 'operacional' and gatilho_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  or (gatilho_setor = 'administrativo' and gatilho_status in ('pagando_fornecedores', 'fornecedores_pagos', 'concluido'))
);

-- Corpos de 20261104100000_obras_cronograma.sql. Status inicial explícito por setor (antes o Operacional vinha do
-- `else`) e o Administrativo na lista de status aceitos.
create or replace function public.gravar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text, p_aut text, p_origem text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fluxo public.obra_fluxos;
  v_inicial text := case p_setor
    when 'compras' then 'a_comprar' when 'engenharia' then 'a_iniciar'
    when 'operacional' then 'aguardando_liberacao' when 'administrativo' then 'pagando_fornecedores' end;
  v_final text := case p_setor when 'compras' then 'material_entregue' else 'concluido' end; -- os outros três terminam em concluido
begin
  select * into v_fluxo from public.obra_fluxos where obra_id = p_obra_id and setor = p_setor for update;
  if not found then
    raise exception 'Fluxo do setor não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_fluxo.status = p_status then
    return;
  end if;

  update public.obra_fluxos
  set status = p_status,
      status_desde = now(),
      iniciado_em = case when v_fluxo.iniciado_em is null and p_status <> v_inicial then now() else v_fluxo.iniciado_em end,
      concluido_em = case when p_status = v_final then now() else null end
  where obra_id = p_obra_id and setor = p_setor;

  perform public.registrar_historico_obra(p_obra_id, 'fluxo_alterado', p_setor, jsonb_build_object(
    'campo', 'status',
    'de', v_fluxo.status,
    'para', p_status,
    'autorizacao', p_aut,
    'origem', p_origem
  ));
end;
$$;

create or replace function public.alterar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_atual text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, true);
  if p_status is null or not (
    (p_setor = 'compras' and p_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'material_entregue'))
    or (p_setor = 'engenharia' and p_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
    or (p_setor = 'operacional' and p_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
    or (p_setor = 'administrativo' and p_status in ('pagando_fornecedores', 'fornecedores_pagos', 'concluido'))
  ) then
    raise exception 'Status inválido para este setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_setor = 'engenharia' then
    select status into v_atual from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia';
    -- G3: sair do projeto exige protocolo.
    if p_status not in ('a_iniciar', 'projeto_em_elaboracao') and v_atual in ('a_iniciar', 'projeto_em_elaboracao') and not exists (
      select 1 from public.obra_engenharia_protocolos p
      where p.obra_id = p_obra_id and p.status not in ('cancelado', 'indeferido')
    ) then
      raise exception 'Registre o protocolo da concessionária antes de avançar a Engenharia.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- G6: concluir exige vistoria aprovada com conexão confirmada.
    if p_status = 'concluido' and v_atual is distinct from 'concluido' and not exists (
      select 1 from public.obra_engenharia_vistorias v
      where v.obra_id = p_obra_id and v.status = 'aprovada' and v.conexao_confirmada_em is not null
    ) then
      raise exception 'Para concluir a Engenharia, registre a vistoria aprovada e a conexão confirmada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  perform public.gravar_status_fluxo_obra(p_obra_id, p_setor, p_status, v_aut, 'manual');
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. Obras novas e existentes
-- ---------------------------------------------------------------------------

-- Corpo de 20261029170000_obras_cliente_oculto.sql + o fluxo do Administrativo.
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

  v_tec := public.obra_snapshot_tecnico(p_negocio_id);
  v_com := public.obra_snapshot_comercial(p_negocio_id);

  -- Numeração por empresa sem coluna editável: trava por empresa + maior número + 1.
  -- Obras nunca são apagadas, então não há reuso de número.
  perform pg_advisory_xact_lock(hashtextextended('obras_numero:' || v_negocio.empresa_id::text, 0));
  select coalesce(max(numero), 0) + 1 into v_numero from public.obras where empresa_id = v_negocio.empresa_id;

  insert into public.obras (
    empresa_id, numero, negocio_id, contrato_id, confirmacao_pagamento_id, vendedor_id, sdr_id,
    cliente_nome, cidade, uf, potencia_kwp, tipo_ligacao, unidade_consumidora, snapshot
  )
  values (
    v_negocio.empresa_id, v_numero, v_negocio.id, v_contrato.id, v_conf.id, v_vendedor, v_sdr,
    v_tec #>> '{cliente,nome}', v_tec #>> '{cliente,cidade}', v_tec #>> '{cliente,uf}',
    (v_tec #>> '{calculo,potencia_kwp}')::numeric, (v_tec #>> '{calculo,tipo_ligacao}')::public.tipo_ligacao,
    v_tec #>> '{negocio,unidade_consumidora}', v_tec - 'cliente'
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

  insert into public.obra_fluxos (obra_id, empresa_id, setor, status) values
    (v_obra_id, v_negocio.empresa_id, 'compras', 'a_comprar'),
    (v_obra_id, v_negocio.empresa_id, 'engenharia', 'a_iniciar'),
    (v_obra_id, v_negocio.empresa_id, 'operacional', 'aguardando_liberacao'),
    (v_obra_id, v_negocio.empresa_id, 'administrativo', 'pagando_fornecedores');

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


-- Obras existentes. Concluída = a regra do app até esta PR (Compras, Engenharia e Operacional no fim e os 2 marcos
-- resolvidos); cancelada também entra concluída. A data é a da conclusão (ou do cancelamento) já registrada.
insert into public.obra_fluxos (obra_id, empresa_id, setor, status, status_desde, iniciado_em, concluido_em)
select o.id, o.empresa_id, 'administrativo',
       case when f.fim is null then 'pagando_fornecedores' else 'concluido' end,
       coalesce(f.fim, now()), f.fim, f.fim
from public.obras o
cross join lateral (
  select case
    when o.cancelada_em is not null then o.cancelada_em
    when (select count(*) from public.obra_fluxos x
          where x.obra_id = o.id
            and ((x.setor = 'compras' and x.status = 'material_entregue')
                 or (x.setor in ('engenharia', 'operacional') and x.status = 'concluido'))) = 3
     and (select count(*) from public.obra_marcos m
          where m.obra_id = o.id and m.status in ('concluido', 'nao_se_aplica')) = 2
      then coalesce(
        greatest(
          (select max(x.concluido_em) from public.obra_fluxos x where x.obra_id = o.id),
          (select max(m.concluido_em) from public.obra_marcos m where m.obra_id = o.id)
        ),
        o.updated_at)
  end as fim
) f
where not exists (select 1 from public.obra_fluxos x where x.obra_id = o.id and x.setor = 'administrativo');

-- ---------------------------------------------------------------------------
-- 3. Setores do membro
-- ---------------------------------------------------------------------------

-- Corpo de 20261008100000_obras_escrita_operacao.sql + 'administrativo' na lista aceita.
create or replace function public.definir_setores_membro(p_membro_id uuid, p_setores jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_papel public.papel_membro;
  v_ativo boolean;
  v_item jsonb;
  v_setor text;
  v_capacidade text;
  v_vistos text[] := '{}';
  v_antigo record;
  v_cap_antes public.capacidade_obra;
  v_autor_membro uuid;
  v_autor_contexto jsonb;
begin
  -- Trava a linha do membro: não desativa/muda de papel no meio da operação.
  select m.empresa_id, m.papel, m.ativo into v_empresa, v_papel, v_ativo
  from public.empresa_membros m where m.id = p_membro_id for update;

  -- Mesma resposta para "não existe" e "não sou admin dessa empresa": não revela vínculos de outras empresas.
  if v_empresa is null or not public.tem_papel(v_empresa, '{admin}') then
    raise exception 'Você não tem acesso a este colaborador.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not v_ativo then
    raise exception 'O colaborador precisa estar ativo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_papel <> 'operacao' then
    raise exception 'Só colaboradores com o papel Operação têm setores de obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_setores is null or jsonb_typeof(p_setores) <> 'array' then
    raise exception 'Informe a lista de setores.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  for v_item in select * from jsonb_array_elements(p_setores) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_setor := v_item ->> 'setor';
    v_capacidade := v_item ->> 'capacidade';
    if v_setor is null or v_setor not in ('compras', 'engenharia', 'operacional', 'administrativo') then
      raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_capacidade is null or v_capacidade not in ('executar', 'coordenar') then
      raise exception 'Capacidade inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_setor = any (v_vistos) then
      raise exception 'Setor repetido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_vistos := v_vistos || v_setor;
  end loop;

  -- Autor real (o admin que chama), com o papel deste momento.
  v_autor_membro := public.meu_membro_id(v_empresa);
  v_autor_contexto := jsonb_build_object('papel', 'admin');

  -- Setores retirados: remove, audita e encerra as participações daquele setor.
  for v_antigo in
    delete from public.membro_setores_obra
    where empresa_id = v_empresa and membro_id = p_membro_id
      and setor::text <> all (v_vistos)
    returning setor, capacidade
  loop
    insert into public.membro_setores_obra_historico
      (empresa_id, membro_id, setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id, autor_contexto)
    values (v_empresa, p_membro_id, v_antigo.setor, v_antigo.capacidade, null, (select auth.uid()), v_autor_membro, v_autor_contexto);
    perform public.encerrar_participacoes_operacionais(p_membro_id, v_antigo.setor, 'setor_removido',
      'Setor retirado do colaborador');
  end loop;

  -- Setores mantidos/novos: grava (como na 3b-2) e audita só o que mudou.
  for v_item in select * from jsonb_array_elements(p_setores) loop
    select s.capacidade into v_cap_antes
    from public.membro_setores_obra s
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.setor = (v_item ->> 'setor')::public.setor_obra;

    insert into public.membro_setores_obra (empresa_id, membro_id, setor, capacidade, definido_por_user_id)
    values (v_empresa, p_membro_id, (v_item ->> 'setor')::public.setor_obra,
            (v_item ->> 'capacidade')::public.capacidade_obra, (select auth.uid()))
    on conflict (empresa_id, membro_id, setor) do update
      set capacidade = excluded.capacidade, definido_por_user_id = excluded.definido_por_user_id;

    if v_cap_antes is distinct from (v_item ->> 'capacidade')::public.capacidade_obra then
      insert into public.membro_setores_obra_historico
        (empresa_id, membro_id, setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id, autor_contexto)
      values (v_empresa, p_membro_id, (v_item ->> 'setor')::public.setor_obra, v_cap_antes,
              (v_item ->> 'capacidade')::public.capacidade_obra, (select auth.uid()), v_autor_membro, v_autor_contexto);
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Marcos: NF do cliente é do Administrativo
-- ---------------------------------------------------------------------------

-- Corpo de 20261008100000_obras_escrita_operacao.sql; o setor vem do marco (antes, sempre o Operacional).
create or replace function public.atualizar_marco_obra(p_obra_id uuid, p_marco public.marco_obra, p_status public.status_marco_obra, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_marco public.obra_marcos;
  v_motivo text;
  -- NF do cliente é do Administrativo; garantia continua do Operacional.
  v_setor public.setor_obra := case p_marco when 'nf_cliente' then 'administrativo' when 'garantia' then 'operacional' end;
begin
  if p_marco is null or p_status is null then
    raise exception 'Informe o marco e o status.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_aut := public.preparar_escrita_obra(p_obra_id, v_setor, true);
  v_motivo := case when p_status = 'nao_se_aplica' then nullif(trim(p_motivo), '') end;
  if p_status = 'nao_se_aplica' and v_motivo is null then
    raise exception 'Informe por que o marco não se aplica.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_marco from public.obra_marcos where obra_id = p_obra_id and marco = p_marco for update;
  if not found then
    raise exception 'Marco não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_marco.status = p_status and v_marco.motivo is not distinct from v_motivo then
    return;
  end if;

  update public.obra_marcos
  set status = p_status,
      motivo = v_motivo,
      concluido_em = case when p_status = 'concluido' then now() end,
      concluido_por_membro_id = case when p_status = 'concluido' then public.meu_membro_id(v_marco.empresa_id) end
  where obra_id = p_obra_id and marco = p_marco;

  perform public.registrar_historico_obra(p_obra_id, 'marco_alterado', v_setor, jsonb_build_object(
    'marco', p_marco,
    'de', jsonb_build_object('status', v_marco.status, 'motivo', v_marco.motivo),
    'para', jsonb_build_object('status', p_status, 'motivo', v_motivo),
    'autorizacao', v_aut
  ));
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. Dados do cliente para o Administrativo (endereço e CPF/CNPJ, para a nota fiscal)
-- ---------------------------------------------------------------------------

-- Corpo de 20261029190000_dados_cliente_contrato.sql (mesmo retorno) + participante ativo do Administrativo.
create or replace function public.obras_operacao(p_obra_id uuid default null)
returns table (
  obra_id uuid,
  empresa_id uuid,
  numero integer,
  cliente_nome text,
  cidade text,
  uf text,
  potencia_kwp numeric,
  tipo_ligacao public.tipo_ligacao,
  unidade_consumidora text,
  snapshot jsonb,
  snapshot_versao integer,
  pausada_em timestamptz,
  pausa_motivo text,
  cancelada_em timestamptz,
  cancelamento_motivo text,
  alerta_pagamento_estornado_em timestamptz,
  venda_alterada_em timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  cliente_endereco text,
  cliente_telefone text,
  cliente_telefone2 text,
  cliente_documento text,
  cliente_rg text,
  cliente_data_nascimento date,
  cliente_email text,
  cliente_inscricao_estadual text
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id, o.empresa_id, o.numero, o.cliente_nome, o.cidade, o.uf, o.potencia_kwp,
    o.tipo_ligacao, o.unidade_consumidora,
    o.snapshot - 'cliente',
    o.snapshot_versao, o.pausada_em, o.pausa_motivo, o.cancelada_em, o.cancelamento_motivo,
    o.alerta_pagamento_estornado_em, o.venda_alterada_em, o.created_at, o.updated_at,
    case when a.operacional or a.engenharia or a.compras or a.administrativo then cl.dados ->> 'endereco' end,
    case when a.operacional or a.engenharia then cl.dados ->> 'telefone' end,
    case when a.operacional or a.engenharia then cl.dados ->> 'telefone2' end,
    case when a.engenharia or a.administrativo then cl.dados ->> 'documento' end,
    case when a.engenharia then cl.dados ->> 'rg' end,
    case when a.engenharia then (cl.dados ->> 'data_nascimento')::date end,
    case when a.engenharia then cl.dados ->> 'email' end,
    case when a.engenharia then cl.dados ->> 'inscricao_estadual' end
  from public.obras o
  left join public.obra_cliente cl on cl.obra_id = o.id
  -- Setores em que EU sou participante ativo desta obra.
  cross join lateral (
    select
      coalesce(bool_or(p.setor = 'operacional'), false) as operacional,
      coalesce(bool_or(p.setor = 'engenharia'), false) as engenharia,
      coalesce(bool_or(p.setor = 'compras'), false) as compras,
      coalesce(bool_or(p.setor = 'administrativo'), false) as administrativo
    from public.obra_participantes p
    where p.obra_id = o.id
      and p.empresa_id = o.empresa_id
      and p.membro_id = public.meu_membro_id(o.empresa_id)
      and p.fim is null
  ) a
  where o.empresa_id in (
      select m.empresa_id from public.empresa_membros m
      where m.user_id = (select auth.uid()) and m.ativo and m.papel = 'operacao'
    )
    and (p_obra_id is null or o.id = p_obra_id)
    and public.pode_ver_obra_operacao(o.id)
  order by o.created_at desc, o.numero desc;
$$;



-- ---------------------------------------------------------------------------
-- 6. Tarefas de setor
-- ---------------------------------------------------------------------------

-- Corpo de 20261029210000_tarefas_setor.sql + o Administrativo.
create or replace function public.criar_tarefa_setor(
  p_setor public.setor_obra,
  p_titulo text,
  p_prazo date,
  p_obra_id uuid default null,
  p_negocio_id uuid default null,
  p_descricao text default null,
  p_responsavel_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_eu uuid;
  v_pode boolean;
  v_aut text;
  v_id uuid;
begin
  if num_nonnulls(p_obra_id, p_negocio_id) <> 1 then
    raise exception 'Informe a obra ou o negócio da tarefa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_setor is null or p_setor = 'comercial' then
    raise exception 'Escolha Compras, Engenharia, Operacional ou Administrativo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_titulo, ''))) < 2 then
    raise exception 'Informe o título da tarefa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_prazo is null or p_prazo < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O prazo não pode ser no passado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_obra_id is not null then
    select o.empresa_id into v_empresa from public.obras o where o.id = p_obra_id and o.cancelada_em is null;
    -- Na obra: admin, quem atua em algum setor dela, ou o comercial que já vê a obra.
    v_pode := v_empresa is not null and (
      public.tem_papel(v_empresa, '{admin}')
      or exists (
        select 1 from unnest(array['compras', 'engenharia', 'operacional', 'administrativo']::public.setor_obra[]) s
        where public.autorizacao_setor_obra(p_obra_id, s) is not null
      )
      or (public.tem_acesso_comercial(v_empresa) and public.pode_ver_obra(p_obra_id))
    );
  else
    select n.empresa_id into v_empresa from public.negocios n where n.id = p_negocio_id and n.arquivado_em is null;
    -- No negócio: quem tem acesso comercial e vê o negócio.
    v_pode := v_empresa is not null and public.tem_acesso_comercial(v_empresa) and public.pode_ver_negocio(p_negocio_id);
  end if;
  if not coalesce(v_pode, false) then
    raise exception 'Você não pode criar tarefa aqui.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  v_eu := public.meu_membro_id(v_empresa);
  if p_responsavel_id is not null then
    -- Escolher a pessoa: admin ou coordenador do setor; a pessoa precisa atuar no setor.
    v_aut := case
      when public.tem_papel(v_empresa, '{admin}') then 'admin'
      when exists (
        select 1 from public.membro_setores_obra s
        where s.empresa_id = v_empresa and s.membro_id = v_eu and s.setor = p_setor and s.capacidade = 'coordenar'
      ) then 'coordenar'
      when p_responsavel_id = v_eu then 'executar'
    end;
    if v_aut is null then
      raise exception 'Só o coordenador do setor ou o admin escolhe o responsável.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
    if not public.membro_atua_no_setor(v_empresa, p_responsavel_id, p_setor) then
      raise exception 'O responsável precisa atuar nesse setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  insert into public.tarefas_setor (empresa_id, obra_id, negocio_id, setor, titulo, descricao, prazo, responsavel_id, criado_por)
  values (v_empresa, p_obra_id, p_negocio_id, p_setor, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), p_prazo, p_responsavel_id, v_eu)
  returning id into v_id;

  perform public.registrar_historico_tarefa_setor(v_id, v_empresa, 'criada',
    jsonb_build_object('setor', p_setor, 'responsavel_id', p_responsavel_id, 'prazo', p_prazo));
  return v_id;
end;
$$;

-- Corpo de 20261031100000_tarefas_automaticas.sql + o rótulo do Administrativo.
create or replace function public.notificar_tarefa_setor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tarefas_setor;
  v_setor text;
  v_link_pedido text;
  v_para uuid;
  v_tipo text;
  v_mensagem text;
  v_link text;
begin
  select * into t from public.tarefas_setor where id = new.tarefa_id;
  if not found then
    return null;
  end if;
  v_setor := case t.setor when 'compras' then 'Compras' when 'engenharia' then 'Engenharia' when 'operacional' then 'Operacional' when 'administrativo' then 'Administrativo' else 'O setor' end;
  v_link_pedido := case when t.negocio_id is not null then '/negocios/' || t.negocio_id || '?aba=atividades' else '/obras/' || t.obra_id end;

  if new.tipo = 'concluida' then
    v_para := t.criado_por;
    v_tipo := 'tarefa_setor_concluida';
    v_mensagem := v_setor || ' concluiu: ' || t.titulo;
    v_link := v_link_pedido;
  elsif new.tipo = 'cancelada' then
    v_para := t.criado_por;
    v_tipo := 'tarefa_setor_cancelada';
    v_mensagem := 'Pedido cancelado (' || v_setor || '): ' || t.titulo || ' — ' || coalesce(t.motivo_cancelamento, '');
    v_link := v_link_pedido;
  elsif new.tipo = 'atribuida' or (new.tipo = 'criada' and t.origem = 'automatica') then
    v_para := t.responsavel_id;
    v_tipo := 'tarefa_setor_atribuida';
    v_mensagem := 'Tarefa de ' || v_setor || ' atribuída a você: ' || t.titulo;
    v_link := '/tarefas/setores?ver=minhas';
  elsif new.tipo = 'reaberta' then
    v_para := t.responsavel_id;
    v_tipo := 'tarefa_setor_reaberta';
    v_mensagem := 'Tarefa reaberta: ' || t.titulo;
    v_link := '/tarefas/setores?ver=minhas';
  else
    return null;
  end if;

  -- Ninguém é avisado da própria ação; quem saiu da empresa ou ficou inativo não recebe.
  if v_para is null or v_para is not distinct from new.autor_membro_id then
    return null;
  end if;
  if not exists (select 1 from public.empresa_membros m where m.id = v_para and m.empresa_id = t.empresa_id and m.ativo) then
    return null;
  end if;

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  values (t.empresa_id, v_para, v_tipo, left(v_mensagem, 500), v_link);
  return null;
end;
$$;


-- Regras padrão de empresas novas: as duas de 30/10/2026 + as duas do Administrativo (05/11/2026).
create or replace function public.inserir_tarefas_automaticas_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.tarefas_automaticas_regras (empresa_id, gatilho_setor, gatilho_status, setor, titulo) values
    (p_empresa_id, 'operacional', 'instalacao_concluida', 'engenharia', 'Cadastro do cliente no app e pedido de vistoria'),
    (p_empresa_id, 'compras', 'faturado_fornecedor', 'operacional', 'Agendar instalação com o cliente'),
    (p_empresa_id, 'compras', 'faturado_fornecedor', 'administrativo', 'Pagar fornecedor'),
    (p_empresa_id, 'operacional', 'instalacao_concluida', 'administrativo', 'Emitir nota fiscal do cliente')
  on conflict (empresa_id, gatilho_setor, gatilho_status, setor, lower(btrim(titulo))) do nothing;
$$;
revoke all on function public.inserir_tarefas_automaticas_padrao(uuid) from public, anon, authenticated, service_role;

-- Empresas existentes: só as duas regras novas (as antigas podem ter sido editadas ou desativadas pela empresa).
insert into public.tarefas_automaticas_regras (empresa_id, gatilho_setor, gatilho_status, setor, titulo)
select e.id, r.gatilho_setor::public.setor_obra, r.gatilho_status, 'administrativo', r.titulo
from public.empresas e
cross join (values
  ('compras', 'faturado_fornecedor', 'Pagar fornecedor'),
  ('operacional', 'instalacao_concluida', 'Emitir nota fiscal do cliente')
) as r (gatilho_setor, gatilho_status, titulo)
on conflict (empresa_id, gatilho_setor, gatilho_status, setor, lower(btrim(titulo))) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Confirmação do pagamento do cliente: Operacional ou Administrativo
-- ---------------------------------------------------------------------------

-- Quem chama atua no Operacional ou no Administrativo da empresa (coordenando ou executando).
create or replace function public.confirma_pagamento_cliente(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    public.membro_atua_no_setor(p_empresa_id, public.meu_membro_id(p_empresa_id), 'operacional')
      or public.membro_atua_no_setor(p_empresa_id, public.meu_membro_id(p_empresa_id), 'administrativo'),
    false);
$$;
revoke all on function public.confirma_pagamento_cliente(uuid) from public, anon;
grant execute on function public.confirma_pagamento_cliente(uuid) to authenticated;

-- Corpos de 20261113100000_aviso_pagamento_vendedor.sql com confirma_pagamento_cliente no lugar de atua_no_operacional
-- e as mensagens citando os dois setores.

create or replace function public.pode_ver_comprovante_pagamento(p_caminho text, p_dono text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.avisos_pagamento a
      where a.comprovante_caminho = p_caminho
        and (public.pode_ver_negocio(a.negocio_id) or (a.situacao = 'aberto' and public.confirma_pagamento_cliente(a.empresa_id)))
    )
    or (p_dono = (select auth.uid())::text
        and public.pode_informar_pagamento(public.contrato_da_pasta_comprovante(p_caminho)));
$$;

create or replace function public.devolver_aviso_pagamento(p_aviso_id uuid, p_motivo text)
returns public.avisos_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_aviso public.avisos_pagamento;
  v_ator uuid := (select auth.uid());
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_contato_id uuid;
begin
  select * into v_aviso from public.avisos_pagamento where id = p_aviso_id;
  if not found
     or not ((public.tem_papel(v_aviso.empresa_id, '{admin,gestor}') and public.pode_ver_negocio(v_aviso.negocio_id))
             or public.confirma_pagamento_cliente(v_aviso.empresa_id)) then
    raise exception 'Só gestor, admin, o Operacional ou o Administrativo pode devolver o aviso de pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null then
    raise exception 'Informe por que o pagamento não foi confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'O motivo passa de 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform 1 from public.contratos where id = v_aviso.contrato_id for update;
  select * into v_aviso from public.avisos_pagamento where id = p_aviso_id for update;
  if v_aviso.situacao <> 'aberto' then
    raise exception 'Este aviso já foi encerrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.avisos_pagamento
    set situacao = 'devolvido', encerrado_por_membro_id = public.meu_membro_id(v_aviso.empresa_id),
        encerrado_por_user_id = v_ator, encerrado_em = now(), motivo_devolucao = v_motivo
    where id = p_aviso_id
    returning * into v_aviso;

  select contato_id into v_contato_id from public.negocios where id = v_aviso.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
  values (v_aviso.empresa_id, v_aviso.negocio_id, v_contato_id, 'pagamento_aviso_devolvido', v_ator,
          jsonb_build_object('contrato_id', v_aviso.contrato_id, 'aviso_id', v_aviso.id, 'motivo', v_motivo));

  perform public.notificar_aviso_pagamento(v_aviso, 'pagamento_aviso_devolvido');
  return v_aviso;
end;
$$;

create or replace function public.pagamentos_a_confirmar(p_empresa_id uuid)
returns table (
  aviso_id uuid, contrato_id uuid, negocio_id uuid, negocio_numero integer, cliente_nome text, cidade text, uf text,
  valor numeric, condicao text, data_pagamento date, observacao text, comprovante_caminho text, comprovante_nome text,
  informado_por_membro_id uuid, informado_em timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with eu as (
    select public.tem_papel(p_empresa_id, '{admin,gestor}') as gestao, public.confirma_pagamento_cliente(p_empresa_id) as setor_confirma
  )
  select a.id, a.contrato_id, a.negocio_id, n.numero, ct.nome, ct.cidade, ct.uf, n.valor,
         c.condicao_pagamento ->> 'descricao', a.data_pagamento, a.observacao, a.comprovante_caminho,
         a.comprovante_nome, a.informado_por_membro_id, a.informado_em
  from public.avisos_pagamento a
  cross join eu
  join public.contratos c on c.id = a.contrato_id
  join public.negocios n on n.id = a.negocio_id
  left join public.contatos ct on ct.id = n.contato_id
  where a.empresa_id = p_empresa_id
    and a.situacao = 'aberto'
    and c.status = 'assinado'
    and (eu.setor_confirma or (eu.gestao and public.pode_ver_negocio(a.negocio_id)))
  order by a.informado_em;
$$;

create or replace function public.confirmar_pagamento(p_contrato_id uuid)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_empresa uuid;
  v_contato_id uuid;
  v_ator uuid := (select auth.uid());
  v_meu_membro_id uuid;
  v_benef_user uuid;
  v_evento_id bigint;
  v_conf public.confirmacoes_pagamento;
  v_aviso public.avisos_pagamento;
begin
  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select empresa_id into v_empresa from public.negocios where id = v_contrato.negocio_id;

  select * into v_aviso from public.avisos_pagamento
    where contrato_id = p_contrato_id and situacao = 'aberto' for update;

  if public.tem_papel(v_empresa, '{admin,gestor}') then
    if not public.pode_ver_negocio(v_contrato.negocio_id) then
      raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  elsif public.confirma_pagamento_cliente(v_empresa) then
    if v_aviso.id is null then
      raise exception 'O Operacional e o Administrativo confirmam só pagamento informado pelo vendedor.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  else
    raise exception 'Só gestor, admin, o Operacional ou o Administrativo pode confirmar pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_empresa);

  if v_contrato.status <> 'assinado' then
    raise exception 'Só é possível confirmar pagamento de contrato assinado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if exists (select 1 from public.confirmacoes_pagamento where contrato_id = p_contrato_id and estornado_em is null) then
    raise exception 'Pagamento deste contrato já está confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Beneficiário: closer congelado no momento da assinatura (`responsavel_assinatura_id`,
  -- ver trigger `travar_contrato_com_pagamento`), nunca `negocios.responsavel_id` atual —
  -- o negócio pode ter trocado de responsável entre a assinatura e o pagamento.
  if v_contrato.responsavel_assinatura_id is null then
    raise exception 'Contrato sem responsável registrado na assinatura: não é possível determinar o beneficiário.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- O beneficiário precisa ser membro da empresa do negócio (protege também dado legado).
  select user_id into v_benef_user from public.empresa_membros
    where id = v_contrato.responsavel_assinatura_id and empresa_id = v_empresa;
  if v_benef_user is null then
    raise exception 'Responsável da assinatura inválido para crédito.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (v_empresa, 'pagamento.confirmado', v_ator, v_benef_user, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id), v_contrato.perfil_assinatura)
    returning id into v_evento_id;

  insert into public.confirmacoes_pagamento
    (empresa_id, contrato_id, negocio_id, confirmado_por_membro_id, confirmado_por_user_id,
     beneficiario_membro_id, beneficiario_user_id, evento_confirmacao_id)
    values (v_empresa, v_contrato.id, v_contrato.negocio_id, v_meu_membro_id, v_ator,
            v_contrato.responsavel_assinatura_id, v_benef_user, v_evento_id)
    returning * into v_conf;

  select contato_id into v_contato_id from public.negocios where id = v_contrato.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_empresa, v_contrato.negocio_id, v_contato_id, 'pagamento_confirmado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id));

  if v_aviso.id is not null then
    update public.avisos_pagamento
      set situacao = 'confirmado', encerrado_por_membro_id = v_meu_membro_id, encerrado_por_user_id = v_ator,
          encerrado_em = now(), confirmacao_id = v_conf.id
      where id = v_aviso.id
      returning * into v_aviso;
    perform public.notificar_aviso_pagamento(v_aviso, 'pagamento_aviso_confirmado');
  end if;

  return v_conf;
end;
$$;
