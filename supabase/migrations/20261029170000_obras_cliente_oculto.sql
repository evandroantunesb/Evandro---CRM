-- Obras: dados pessoais do cliente fora do alcance da API.
--
-- Decisão do Evandro (29/10/2026): nada de dado pessoal pode chegar ao navegador; tudo fica no servidor.
-- Até aqui, `obras.snapshot` guardava o bloco `cliente` (CPF/CNPJ, e-mail, telefones, endereço) e a policy
-- "ver obras" deixava admin, gestor, vendedor e SDR da venda lerem esse bloco direto pela API, embora a
-- interface não o mostrasse.
--
-- O que faz:
--  * `obra_cliente`: uma linha por obra com o bloco `cliente` congelado na criação. RLS ligada SEM nenhuma
--    policy e sem concessão para anon/authenticated: ninguém lê pela API. Escrita revogada inclusive para
--    service_role. Só funções `security definer` leem e gravam.
--  * Move o bloco `cliente` das obras existentes para `obra_cliente` e o retira de `obras.snapshot`.
--  * Trava no banco: `obras.snapshot` não pode mais conter `cliente`.
--  * `garantir_obra`: grava o snapshot técnico sem `cliente` e o bloco em `obra_cliente`.
--  * `marcar_venda_alterada_obra`: compara com o snapshot remontado (técnico + cliente), então o aviso
--    "dados da venda mudaram" continua igual, inclusive para mudança no contato.
--  * `obras_operacao`: lê os dados pessoais de `obra_cliente`, com a mesma matriz por setor de antes.
-- O que NÃO faz: não muda quem vê a obra, o valor vendido, a lista, os fluxos, os marcos, a fixação nem a
-- matriz de dados pessoais da operação. `obras.cliente_nome`, `cidade` e `uf` continuam como colunas.
-- Depende de: obras, obra_snapshot_tecnico, obra_snapshot_comercial, registrar_historico_obra,
-- pode_ver_obra_operacao, meu_membro_id (já existentes).

set lock_timeout = '3s';

create table public.obra_cliente (
  obra_id uuid primary key,
  empresa_id uuid not null,
  dados jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);

alter table public.obra_cliente enable row level security;
-- Sem policy: nenhuma linha visível pela API, para nenhum papel.
revoke all on public.obra_cliente from public, anon, authenticated;
revoke insert, update, delete, truncate on public.obra_cliente from service_role;

-- Obras existentes: copia o bloco e o retira do snapshot.
insert into public.obra_cliente (obra_id, empresa_id, dados)
select o.id, o.empresa_id, o.snapshot -> 'cliente'
from public.obras o
where o.snapshot ? 'cliente'
on conflict (obra_id) do nothing;

update public.obras set snapshot = snapshot - 'cliente' where snapshot ? 'cliente';

alter table public.obras add constraint obras_snapshot_sem_cliente check (not (snapshot ? 'cliente'));

-- ---------------------------------------------------------------------------
-- Criação da obra (igual à de 20261006220000_obras_base.sql, salvo o destino do bloco `cliente`)
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
-- Aviso "Dados da venda mudaram": compara com o snapshot remontado (técnico + cliente)
-- ---------------------------------------------------------------------------

create or replace function public.marcar_venda_alterada_obra(p_negocio_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_comercial jsonb;
  v_cliente jsonb;
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
  select dados into v_cliente from public.obra_cliente where obra_id = v_obra.id;
  v_muda_tecnico := public.obra_snapshot_tecnico(p_negocio_id)
    is distinct from (v_obra.snapshot || jsonb_build_object('cliente', v_cliente));
  v_muda_comercial := public.obra_snapshot_comercial(p_negocio_id) is distinct from v_comercial;
  if not (v_muda_tecnico or v_muda_comercial) then
    return;
  end if;

  update public.obras set venda_alterada_em = now() where id = v_obra.id;
  perform public.registrar_historico_obra(v_obra.id, 'venda_alterada', null,
    jsonb_build_object('tecnico', v_muda_tecnico, 'comercial', v_muda_comercial));
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura da operação (igual à de 20261007200000_obras_acesso_operacao.sql, salvo a origem dos dados
-- pessoais, que agora é obra_cliente)
-- ---------------------------------------------------------------------------

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
  cliente_documento text
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id, o.empresa_id, o.numero, o.cliente_nome, o.cidade, o.uf, o.potencia_kwp,
    o.tipo_ligacao, o.unidade_consumidora,
    o.snapshot - 'cliente',
    o.snapshot_versao, o.pausada_em, o.pausa_motivo, o.cancelada_em, o.cancelamento_motivo,
    o.alerta_pagamento_estornado_em, o.venda_alterada_em, o.created_at, o.updated_at,
    case when a.operacional or a.engenharia then cl.dados ->> 'endereco' end,
    case when a.operacional then cl.dados ->> 'telefone' end,
    case when a.operacional then cl.dados ->> 'telefone2' end,
    case when a.engenharia then cl.dados ->> 'documento' end
  from public.obras o
  left join public.obra_cliente cl on cl.obra_id = o.id
  -- Setores em que EU sou participante ativo desta obra.
  cross join lateral (
    select
      coalesce(bool_or(p.setor = 'operacional'), false) as operacional,
      coalesce(bool_or(p.setor = 'engenharia'), false) as engenharia
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

-- `create or replace` mantém as concessões; repetidas aqui para ficar explícito.
revoke all on function public.garantir_obra(uuid) from public, anon, authenticated, service_role;
revoke all on function public.marcar_venda_alterada_obra(uuid) from public, anon, authenticated, service_role;
revoke all on function public.obras_operacao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.obras_operacao(uuid) to authenticated;

reset lock_timeout;
