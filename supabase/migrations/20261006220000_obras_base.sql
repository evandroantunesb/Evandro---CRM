-- Operação / Obras — PR 1: base no banco (sem interface).
-- Arquitetura aprovada pelo Evandro em 2026-10-06 (raion_crm_operacao_obras_v2.md).
--
-- Uma venda gera uma única Obra quando os 3 sinais independentes estão presentes:
--   negócio ganho + contrato assinado + pagamento confirmado (não estornado).
-- Os sinais chegam em qualquer ordem; quem fecha o último dispara `garantir_obra()`,
-- idempotente. SEM backfill: só transições novas (→ ganho, → assinado, nova confirmação)
-- criam Obra; vendas antigas que já cumprem os 3 sinais ficam para um backfill controlado
-- (dry-run → relatório → aprovação explícita) depois da V1.
--
-- Esta PR cria: obras, obra_dados_comerciais, obra_fluxos, obra_marcos,
-- obra_participantes e obra_historico, o gatilho de criação, os avisos (estorno e
-- "dados da venda mudaram") e a RLS de leitura para admin, gestor, vendedor e SDR.
-- Setores, papel `operacional` e capacidades entram na PR de permissões.
--
-- Regras:
-- - Nada é apagado. Nenhuma escrita direta: só funções `security definer` escrevem
--   (insert/update/delete revogados até de service_role, mesmo padrão de handoffs e
--   confirmacoes_pagamento).
-- - Dado sensível em tabela própria: RLS não esconde coluna. O valor vendido fica em
--   `obra_dados_comerciais`; o snapshot técnico em `obras` não tem preço.
-- - Histórico grava o autor real (auth.uid() + membro + papel naquele momento), nunca
--   um gestor calculado depois.
-- - A Obra não gera eventos nem pontos de gamificação.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.setor_obra as enum ('comercial', 'compras', 'engenharia', 'operacional');
create type public.funcao_participante_obra as enum ('vendedor', 'sdr', 'responsavel', 'apoio', 'substituto');
create type public.marco_obra as enum ('nf_cliente', 'garantia');
create type public.status_marco_obra as enum ('pendente', 'concluido', 'nao_se_aplica');
create type public.aguardando_obra as enum ('cliente', 'fornecedor', 'concessionaria', 'transportadora', 'equipe_campo');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.obras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Sequência própria por empresa (a tela mostra também o nº do negócio).
  numero integer not null check (numero > 0),
  -- FKs sem ação (no action): impedem apagar negócio/contrato/confirmação de uma Obra,
  -- mas não travam a exclusão em cascata da empresa inteira.
  negocio_id uuid not null unique references public.negocios (id),
  contrato_id uuid not null references public.contratos (id),
  confirmacao_pagamento_id uuid not null references public.confirmacoes_pagamento (id),
  -- Fatos da venda congelados na criação: vendedor da assinatura e SDR de origem.
  -- Sem FK de propósito (mesmo padrão de eventos.ator_id): o fato não pode ser
  -- reescrito por `on delete set null`.
  vendedor_id uuid,
  sdr_id uuid,
  -- Colunas-chave do snapshot técnico (lista e filtros).
  cliente_nome text not null,
  cidade text,
  uf text,
  potencia_kwp numeric(8, 2),
  tipo_ligacao public.tipo_ligacao,
  unidade_consumidora text,
  -- Snapshot técnico, SEM preço (preço fica em obra_dados_comerciais).
  snapshot jsonb not null,
  snapshot_versao integer not null default 1 check (snapshot_versao > 0),
  pausada_em timestamptz,
  pausa_motivo text,
  cancelada_em timestamptz,
  cancelamento_motivo text,
  alerta_pagamento_estornado_em timestamptz,
  venda_alterada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero),
  unique (empresa_id, id),
  constraint obras_pausa_com_motivo check (pausada_em is null or nullif(trim(pausa_motivo), '') is not null),
  constraint obras_cancelamento_com_motivo check (cancelada_em is null or nullif(trim(cancelamento_motivo), '') is not null)
);
create index on public.obras (empresa_id, created_at desc);
create index on public.obras (vendedor_id);
create index on public.obras (sdr_id);

-- Valor vendido e condição comercial: tabela própria com RLS própria.
-- Margem e comissão não ficam aqui.
create table public.obra_dados_comerciais (
  obra_id uuid primary key,
  empresa_id uuid not null,
  valor_vendido numeric(14, 2),
  snapshot jsonb not null,
  snapshot_versao integer not null default 1 check (snapshot_versao > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);

-- Uma linha por Obra e setor operacional; andamento independente (paralelo).
-- O responsável não fica aqui: é o participante principal do setor.
create table public.obra_fluxos (
  obra_id uuid not null,
  empresa_id uuid not null,
  setor public.setor_obra not null check (setor <> 'comercial'),
  status text not null,
  status_desde timestamptz not null default now(),
  parado boolean not null default false,
  parado_motivo text,
  aguardando public.aguardando_obra,
  aguardando_desde timestamptz,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (obra_id, setor),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_fluxos_status_valido check (
    (setor = 'compras' and status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'concluido'))
    or (setor = 'engenharia' and status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
    or (setor = 'operacional' and status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  ),
  constraint obra_fluxos_parado_com_motivo check (not parado or nullif(trim(parado_motivo), '') is not null),
  constraint obra_fluxos_aguardando_completo check ((aguardando is null) = (aguardando_desde is null))
);

-- Marcos fixos do Operacional (não são etapas).
create table public.obra_marcos (
  obra_id uuid not null,
  empresa_id uuid not null,
  marco public.marco_obra not null,
  status public.status_marco_obra not null default 'pendente',
  motivo text,
  concluido_em timestamptz,
  concluido_por_membro_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (obra_id, marco),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_marcos_nao_se_aplica_com_motivo check (status <> 'nao_se_aplica' or nullif(trim(motivo), '') is not null)
);

-- Quem atua na Obra. Vários por setor; no máximo 1 principal ativo por obra + setor.
-- Troca nunca sobrescreve: encerra (fim) e cria outro registro (substitui_id).
create table public.obra_participantes (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null,
  empresa_id uuid not null,
  membro_id uuid not null references public.empresa_membros (id),
  setor public.setor_obra not null,
  funcao public.funcao_participante_obra not null,
  principal boolean not null default false,
  inicio timestamptz not null default now(),
  fim timestamptz,
  substitui_id uuid references public.obra_participantes (id),
  criado_por_user_id uuid,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_participantes_periodo check (fim is null or fim >= inicio)
);
create unique index obra_participantes_um_principal_ativo
  on public.obra_participantes (obra_id, setor) where principal and fim is null;
create unique index obra_participantes_sem_duplicata_ativa
  on public.obra_participantes (obra_id, membro_id, setor, funcao) where fim is null;
create index on public.obra_participantes (membro_id) where fim is null;

-- Auditoria imutável. Autor real gravado no momento da ação; sem FK nas colunas de autor
-- (um `on delete set null` reescreveria o fato).
create table public.obra_historico (
  id bigint generated always as identity primary key,
  obra_id uuid not null,
  empresa_id uuid not null,
  setor public.setor_obra,
  tipo text not null check (tipo in ('obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada')),
  dados jsonb not null default '{}'::jsonb,
  autor_user_id uuid,
  autor_membro_id uuid,
  autor_contexto jsonb,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);
create index on public.obra_historico (obra_id, created_at desc);

create trigger obras_updated_at before update on public.obras
  for each row execute function public.tocar_updated_at();
create trigger obra_dados_comerciais_updated_at before update on public.obra_dados_comerciais
  for each row execute function public.tocar_updated_at();
create trigger obra_fluxos_updated_at before update on public.obra_fluxos
  for each row execute function public.tocar_updated_at();
create trigger obra_marcos_updated_at before update on public.obra_marcos
  for each row execute function public.tocar_updated_at();

-- Histórico: nem as funções alteram ou apagam. DELETE só em cascata (empresa inteira).
create or replace function public.proteger_obra_historico()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'O histórico da obra não pode ser alterado nem apagado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
end;
$$;

create trigger obra_historico_imutavel
  before update or delete on public.obra_historico
  for each row execute function public.proteger_obra_historico();

-- ---------------------------------------------------------------------------
-- Snapshots da venda (internos: rodam como dono e ignoram RLS — nunca expostos)
-- ---------------------------------------------------------------------------

-- Técnico: o que Engenharia/Operação/Compras precisam. Sem nenhum valor em dinheiro.
create or replace function public.obra_snapshot_tecnico(p_negocio_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'negocio', jsonb_build_object(
      'numero', n.numero,
      'titulo', n.titulo,
      'status', n.status,
      'unidade_consumidora', n.unidade_consumidora,
      'distribuidora', n.qualif_distribuidora,
      'tipo_telhado', n.tipo_telhado,
      'estrutura_telhado', n.estrutura_telhado,
      'padrao_cliente', n.padrao_cliente,
      'consumo_medio_kwh', n.consumo_medio_kwh
    ),
    'contrato_status', (select c.status from public.contratos c where c.negocio_id = n.id),
    'cliente', jsonb_build_object(
      'nome', ct.nome,
      'tipo', ct.tipo,
      'documento', ct.documento,
      'telefone', ct.telefone,
      'telefone2', ct.telefone2,
      'email', ct.email,
      'endereco', ct.endereco,
      'cidade', ct.cidade,
      'uf', ct.uf
    ),
    'calculo', (
      select jsonb_build_object(
        'kit_nome', cs.kit_nome,
        'potencia_kwp', cs.kit_potencia_kwp,
        'tipo_ligacao', cs.tipo_ligacao,
        'consumo_medio_kwh', cs.consumo_medio_kwh,
        'disponibilidade_kwh', cs.disponibilidade_kwh,
        'produtividade_kwh_kwp_mes', cs.produtividade_kwh_kwp_mes,
        'geracao_estimada_kwh_mes', cs.geracao_estimada_kwh_mes
      )
      from public.calculos_solares cs where cs.negocio_id = n.id
    ),
    'kit', coalesce((
      select jsonb_agg(
        jsonb_build_object('tipo', k.tipo, 'descricao', k.descricao, 'potencia_w', k.potencia_w, 'quantidade', k.quantidade)
        order by k.ordem, k.tipo, k.descricao, k.potencia_w, k.quantidade
      )
      from public.kit_componentes k where k.negocio_id = n.id
    ), '[]'::jsonb)
  )
  from public.negocios n
  join public.contatos ct on ct.id = n.contato_id
  where n.id = p_negocio_id;
$$;

-- Comercial: valores em dinheiro da venda. Vai só para obra_dados_comerciais.
create or replace function public.obra_snapshot_comercial(p_negocio_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'valor', n.valor,
    'valor_conta_energia', n.valor_conta_energia,
    'calculo', (
      select jsonb_build_object(
        'kit_preco', cs.kit_preco,
        'tarifa_kwh', cs.tarifa_kwh,
        'valor_fatura_medio', cs.valor_fatura_medio,
        'conta_sem_solar', cs.conta_sem_solar,
        'conta_com_solar', cs.conta_com_solar,
        'economia_mensal', cs.economia_mensal,
        'payback_meses', cs.payback_meses,
        'custo_fio_b', cs.custo_fio_b,
        'percentual_fio_b', cs.percentual_fio_b
      )
      from public.calculos_solares cs where cs.negocio_id = n.id
    )
  )
  from public.negocios n
  where n.id = p_negocio_id;
$$;

-- ---------------------------------------------------------------------------
-- Histórico (interno)
-- ---------------------------------------------------------------------------

-- Autor = quem executou a ação agora (auth.uid()), com o papel daquele momento.
-- Sem auth.uid() (script/serviço), o autor fica nulo — nunca é inferido.
create or replace function public.registrar_historico_obra(p_obra_id uuid, p_tipo text, p_setor public.setor_obra, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  insert into public.obra_historico (obra_id, empresa_id, setor, tipo, dados, autor_user_id, autor_membro_id, autor_contexto)
  select o.id, o.empresa_id, p_setor, p_tipo, coalesce(p_dados, '{}'::jsonb), v_user, m.id,
         case when m.id is null then null else jsonb_build_object('papel', m.papel) end
  from public.obras o
  left join public.empresa_membros m on m.empresa_id = o.empresa_id and m.user_id = v_user
  where o.id = p_obra_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Criação idempotente
-- ---------------------------------------------------------------------------

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
    v_tec #>> '{negocio,unidade_consumidora}', v_tec
  )
  on conflict (negocio_id) do nothing
  returning id into v_obra_id;

  if v_obra_id is null then
    -- Defesa extra: outra transação criou primeiro.
    select id into v_obra_id from public.obras where negocio_id = p_negocio_id;
    return v_obra_id;
  end if;

  insert into public.obra_dados_comerciais (obra_id, empresa_id, valor_vendido, snapshot)
    values (v_obra_id, v_negocio.empresa_id, v_negocio.valor, v_com);

  insert into public.obra_fluxos (obra_id, empresa_id, setor, status) values
    (v_obra_id, v_negocio.empresa_id, 'compras', 'a_comprar'),
    (v_obra_id, v_negocio.empresa_id, 'engenharia', 'a_iniciar'),
    (v_obra_id, v_negocio.empresa_id, 'operacional', 'aguardando_liberacao');

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

-- ---------------------------------------------------------------------------
-- Gatilhos de criação: só transições novas (sem backfill acidental)
-- ---------------------------------------------------------------------------

create or replace function public.obra_ao_ganhar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.garantir_obra(new.id);
  return null;
end;
$$;

-- Sem lista de colunas: a etapa que marca ganho troca o status num gatilho BEFORE.
create trigger negocios_garantir_obra
  after update on public.negocios
  for each row when (new.status = 'ganho' and old.status is distinct from 'ganho')
  execute function public.obra_ao_ganhar_negocio();

create or replace function public.obra_ao_assinar_contrato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.garantir_obra(new.negocio_id);
  return null;
end;
$$;

create trigger contratos_garantir_obra
  after update on public.contratos
  for each row when (new.status = 'assinado' and old.status is distinct from 'assinado')
  execute function public.obra_ao_assinar_contrato();

-- Nova confirmação: cria a Obra ou, se ela já existe com aviso de estorno, limpa o aviso.
-- `obras.confirmacao_pagamento_id` continua sendo a confirmação original (fato da criação);
-- a nova fica registrada no histórico.
create or replace function public.obra_ao_confirmar_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
begin
  select * into v_obra from public.obras where negocio_id = new.negocio_id for update;
  if not found then
    perform public.garantir_obra(new.negocio_id);
  elsif v_obra.alerta_pagamento_estornado_em is not null then
    update public.obras set alerta_pagamento_estornado_em = null where id = v_obra.id;
    perform public.registrar_historico_obra(v_obra.id, 'pagamento_reconfirmado', null,
      jsonb_build_object('confirmacao_pagamento_id', new.id));
  end if;
  return null;
end;
$$;

create trigger confirmacoes_pagamento_garantir_obra
  after insert on public.confirmacoes_pagamento
  for each row execute function public.obra_ao_confirmar_pagamento();

-- Estorno: nunca apaga a Obra; liga o aviso e registra no histórico.
create or replace function public.obra_ao_estornar_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
begin
  select * into v_obra from public.obras where negocio_id = new.negocio_id for update;
  if not found then
    return null;
  end if;
  if not exists (
    select 1 from public.confirmacoes_pagamento where negocio_id = new.negocio_id and estornado_em is null
  ) then
    update public.obras set alerta_pagamento_estornado_em = coalesce(alerta_pagamento_estornado_em, now()) where id = v_obra.id;
  end if;
  perform public.registrar_historico_obra(v_obra.id, 'pagamento_estornado', null,
    jsonb_build_object('confirmacao_pagamento_id', new.id, 'motivo', new.motivo_estorno));
  return null;
end;
$$;

create trigger confirmacoes_pagamento_estorno_obra
  after update on public.confirmacoes_pagamento
  for each row when (old.estornado_em is null and new.estornado_em is not null)
  execute function public.obra_ao_estornar_pagamento();

-- ---------------------------------------------------------------------------
-- Aviso "Dados da venda mudaram"
-- ---------------------------------------------------------------------------

-- Compara os snapshots guardados com os dados atuais da venda. Só liga o aviso (uma vez);
-- quem atualiza a Obra é a ação "Atualizar dados da obra" (PR futura), com nova versão.
create or replace function public.marcar_venda_alterada_obra(p_negocio_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_comercial jsonb;
  v_muda_tecnico boolean;
  v_muda_comercial boolean;
begin
  if p_negocio_id is null then
    return;
  end if;
  select * into v_obra from public.obras where negocio_id = p_negocio_id for update;
  if not found or v_obra.venda_alterada_em is not null then
    return;
  end if;

  select snapshot into v_comercial from public.obra_dados_comerciais where obra_id = v_obra.id;
  v_muda_tecnico := public.obra_snapshot_tecnico(p_negocio_id) is distinct from v_obra.snapshot;
  v_muda_comercial := public.obra_snapshot_comercial(p_negocio_id) is distinct from v_comercial;
  if not (v_muda_tecnico or v_muda_comercial) then
    return;
  end if;

  update public.obras set venda_alterada_em = now() where id = v_obra.id;
  perform public.registrar_historico_obra(v_obra.id, 'venda_alterada', null,
    jsonb_build_object('tecnico', v_muda_tecnico, 'comercial', v_muda_comercial));
end;
$$;

-- Gatilho adiado (roda no commit): compara o estado final da transação. Assim, salvar o kit
-- inteiro (apaga e recria os itens) com os mesmos dados não gera aviso falso.
create or replace function public.obra_verificar_venda_alterada()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio_id uuid;
begin
  if tg_table_name = 'contatos' then
    for v_negocio_id in
      select o.negocio_id from public.obras o join public.negocios n on n.id = o.negocio_id where n.contato_id = new.id
    loop
      perform public.marcar_venda_alterada_obra(v_negocio_id);
    end loop;
  elsif tg_table_name = 'negocios' then
    perform public.marcar_venda_alterada_obra(new.id);
  else
    if tg_op <> 'INSERT' then
      perform public.marcar_venda_alterada_obra(old.negocio_id);
    end if;
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.negocio_id is distinct from old.negocio_id) then
      perform public.marcar_venda_alterada_obra(new.negocio_id);
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger negocios_obra_venda_alterada
  after update on public.negocios
  deferrable initially deferred
  for each row execute function public.obra_verificar_venda_alterada();

create constraint trigger contatos_obra_venda_alterada
  after update on public.contatos
  deferrable initially deferred
  for each row execute function public.obra_verificar_venda_alterada();

create constraint trigger contratos_obra_venda_alterada
  after update on public.contratos
  deferrable initially deferred
  for each row execute function public.obra_verificar_venda_alterada();

create constraint trigger calculos_solares_obra_venda_alterada
  after insert or update or delete on public.calculos_solares
  deferrable initially deferred
  for each row execute function public.obra_verificar_venda_alterada();

create constraint trigger kit_componentes_obra_venda_alterada
  after insert or update or delete on public.kit_componentes
  deferrable initially deferred
  for each row execute function public.obra_verificar_venda_alterada();

-- ---------------------------------------------------------------------------
-- Permissões de leitura
-- ---------------------------------------------------------------------------

-- Quem vê a Obra (nesta PR; setores entram na PR de permissões):
-- admin; vendedor da venda e gestor da equipe dele (mesma regra do negócio, via
-- pode_ver_responsavel); SDR de origem (só ele, sem ampliar para a equipe).
create or replace function public.pode_ver_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.pode_ver_responsavel(o.empresa_id, o.vendedor_id)
        or (o.sdr_id is not null and o.sdr_id = public.meu_membro_id(o.empresa_id))
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

-- Valor vendido: admin, vendedor da venda e gestor da equipe dele. SDR não.
-- (Operacional, para faturamento, entra na PR de permissões.)
create or replace function public.pode_ver_valor_vendido_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.pode_ver_responsavel(o.empresa_id, o.vendedor_id)
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

alter table public.obras enable row level security;
alter table public.obra_dados_comerciais enable row level security;
alter table public.obra_fluxos enable row level security;
alter table public.obra_marcos enable row level security;
alter table public.obra_participantes enable row level security;
alter table public.obra_historico enable row level security;

create policy "ver obras" on public.obras for select to authenticated
  using (public.pode_ver_obra(id));
create policy "ver valor vendido da obra" on public.obra_dados_comerciais for select to authenticated
  using (public.pode_ver_valor_vendido_obra(obra_id));
create policy "ver fluxos da obra" on public.obra_fluxos for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "ver marcos da obra" on public.obra_marcos for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "ver participantes da obra" on public.obra_participantes for select to authenticated
  using (public.pode_ver_obra(obra_id));
create policy "ver historico da obra" on public.obra_historico for select to authenticated
  using (public.pode_ver_obra(obra_id));

-- Ninguém escreve direto (nem service_role): só as funções acima, que rodam como dono.
revoke all on public.obras, public.obra_dados_comerciais, public.obra_fluxos, public.obra_marcos,
  public.obra_participantes, public.obra_historico from anon;
revoke insert, update, delete, truncate on public.obras, public.obra_dados_comerciais, public.obra_fluxos,
  public.obra_marcos, public.obra_participantes, public.obra_historico from authenticated, service_role;

-- Funções internas: ignoram RLS, então não podem ser chamadas por clientes.
-- `garantir_obra` também fica fechada para service_role: criar Obra para venda antiga
-- é backfill e exige aprovação explícita.
revoke all on function public.obra_snapshot_tecnico(uuid) from public, anon, authenticated, service_role;
revoke all on function public.obra_snapshot_comercial(uuid) from public, anon, authenticated, service_role;
revoke all on function public.registrar_historico_obra(uuid, text, public.setor_obra, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.garantir_obra(uuid) from public, anon, authenticated, service_role;
revoke all on function public.marcar_venda_alterada_obra(uuid) from public, anon, authenticated, service_role;
revoke all on function public.obra_ao_ganhar_negocio() from public, anon, authenticated, service_role;
revoke all on function public.obra_ao_assinar_contrato() from public, anon, authenticated, service_role;
revoke all on function public.obra_ao_confirmar_pagamento() from public, anon, authenticated, service_role;
revoke all on function public.obra_ao_estornar_pagamento() from public, anon, authenticated, service_role;
revoke all on function public.obra_verificar_venda_alterada() from public, anon, authenticated, service_role;
revoke all on function public.proteger_obra_historico() from public, anon, authenticated, service_role;
