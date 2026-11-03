-- Obras OPR, PR 3: gestor vê todas as obras, justificativa de atraso e escalonamentos.
--
-- Decisões do Evandro (02/11/2026), com os desenhos aprovados "Obras — Completa" e "Obras — Apresentação":
--  * O gestor vê todas as obras da empresa, com valores (antes: só as da equipe dele). Vale para toda leitura que
--    passa por `pode_ver_obra` e `pode_ver_valor_vendido_obra` (ficha, custos, cronograma, Completa, Apresentação).
--    Vendedor e SDR continuam só com as próprias vendas.
--  * Justificativa de atraso: admin ou gestor pede a justificativa de uma etapa com atraso próprio ao responsável
--    principal do setor da etapa, com 2 dias úteis para responder. Pedir de novo uma justificativa pendente é
--    "cobrar": renova o prazo. Responde quem foi pedido, o admin ou quem coordena o setor. Atraso só herdado
--    (em cascata) não pede justificativa: o motivo é calculado pelo sistema.
--  * Escalonamento: gestor, admin e quem atua no Operacional da obra abrem (título e, se quiser, o valor fora do
--    programado) e fecham (com a resolução). Quem vê: quem vê os custos da obra.
--  * Nenhum valor em dinheiro vai para `obra_historico` (ADR Pedido + Obra): o valor do escalonamento fica só na
--    tabela, com auditoria.
--
-- Depende de: pode_ver_responsavel, pode_ver_custos_obra, autorizacao_setor_obra, registrar_historico_obra,
-- cronograma_obra, somar_dias_uteis, hoje_brasilia, tem_papel, meu_membro_id, auditar,
-- obra_historico_tipo_check (20261105100000).

-- ---------------------------------------------------------------------------
-- Gestor vê todas as obras da empresa
-- ---------------------------------------------------------------------------

create or replace function public.pode_ver_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{gestor}')
        or public.pode_ver_responsavel(o.empresa_id, o.vendedor_id)
        or (o.sdr_id is not null and o.sdr_id = public.meu_membro_id(o.empresa_id))
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

-- Valor vendido: admin, gestor e o vendedor da venda. SDR não.
create or replace function public.pode_ver_valor_vendido_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{gestor}')
        or public.pode_ver_responsavel(o.empresa_id, o.vendedor_id)
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Histórico: novos tipos (sem valores)
-- ---------------------------------------------------------------------------

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao',
  'passo_engenharia_registrado', 'enquadramento_engenharia_salvo',
  'entrega_contratada_ajustada', 'entrega_material_prevista',
  'orcamento_ajustado', 'custo_lancado', 'custo_estornado',
  'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida',
  'escalonamento_aberto', 'escalonamento_fechado'
));

-- ---------------------------------------------------------------------------
-- Justificativa de atraso
-- ---------------------------------------------------------------------------

-- Setor dono de cada etapa do cronograma (o mesmo de `SETOR_ETAPA` em src/lib/obras/cronograma.ts).
create or replace function public.setor_etapa_obra(p_etapa text)
returns public.setor_obra
language sql immutable set search_path = ''
as $$
  select case p_etapa
    when 'projeto' then 'engenharia'
    when 'homologacao' then 'engenharia'
    when 'compra' then 'compras'
    when 'entrega_material' then 'compras'
    when 'instalacao' then 'operacional'
    when 'vistoria' then 'engenharia'
    when 'conexao' then 'engenharia'
  end::public.setor_obra;
$$;
revoke all on function public.setor_etapa_obra(text) from public, anon, authenticated, service_role;

create table public.obra_justificativas_atraso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  etapa text not null check (etapa in ('projeto', 'homologacao', 'compra', 'entrega_material', 'instalacao', 'vistoria', 'conexao')),
  pedido_a uuid not null,
  pedido_por uuid,
  pedido_em timestamptz not null default now(),
  cobrado_em timestamptz,
  prazo date not null,
  texto text check (texto is null or length(btrim(texto)) between 3 and 500),
  respondido_por uuid,
  respondido_em timestamptz,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_justificativas_resposta check ((texto is null) = (respondido_em is null))
);
create index on public.obra_justificativas_atraso (obra_id, etapa, pedido_em);
-- No máximo uma justificativa pendente por etapa.
create unique index obra_justificativas_uma_pendente on public.obra_justificativas_atraso (obra_id, etapa) where respondido_em is null;
create trigger auditar_obra_justificativas_atraso after insert or update or delete on public.obra_justificativas_atraso
  for each row execute function public.auditar();

alter table public.obra_justificativas_atraso enable row level security;
create policy "ver justificativas de atraso" on public.obra_justificativas_atraso for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
-- Só as funções escrevem.
revoke all on public.obra_justificativas_atraso from anon, authenticated, service_role;
grant select on public.obra_justificativas_atraso to authenticated, service_role;

-- Admin ou gestor pede (ou cobra, se já pendente) a justificativa de uma etapa com atraso próprio.
create or replace function public.pedir_justificativa_atraso(p_obra_id uuid, p_etapa text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_atraso integer;
  v_setor public.setor_obra := public.setor_etapa_obra(p_etapa);
  v_responsavel uuid;
  v_prazo date;
  v_id uuid;
begin
  select * into v_obra from public.obras where id = p_obra_id for update;
  if not found or not public.tem_papel(v_obra.empresa_id, '{admin,gestor}') then
    raise exception 'Só admin ou gestor pede justificativa de atraso.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_setor is null then
    raise exception 'Etapa inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select c.atraso_proprio into v_atraso from public.cronograma_obra(p_obra_id) c where c.etapa = p_etapa;
  if coalesce(v_atraso, 0) <= 0 then
    raise exception 'Esta etapa não tem atraso próprio: o motivo do atraso em cascata é calculado pelo sistema.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_prazo := public.somar_dias_uteis(v_obra.empresa_id, public.hoje_brasilia(), 2);

  -- Já pendente: cobrar renova o prazo.
  update public.obra_justificativas_atraso set cobrado_em = now(), prazo = v_prazo
  where obra_id = p_obra_id and etapa = p_etapa and respondido_em is null
  returning id into v_id;
  if found then
    perform public.registrar_historico_obra(p_obra_id, 'justificativa_atraso_cobrada', v_setor, jsonb_build_object('etapa', p_etapa));
    return v_id;
  end if;

  select p.membro_id into v_responsavel from public.obra_participantes p
  where p.obra_id = p_obra_id and p.setor = v_setor and p.principal and p.fim is null
  limit 1;
  if v_responsavel is null then
    raise exception 'O setor desta etapa ainda não tem responsável principal na obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_justificativas_atraso (empresa_id, obra_id, etapa, pedido_a, pedido_por, prazo)
  values (v_obra.empresa_id, p_obra_id, p_etapa, v_responsavel, public.meu_membro_id(v_obra.empresa_id), v_prazo)
  returning id into v_id;
  perform public.registrar_historico_obra(p_obra_id, 'justificativa_atraso_pedida', v_setor, jsonb_build_object('etapa', p_etapa));
  return v_id;
end;
$$;
revoke all on function public.pedir_justificativa_atraso(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.pedir_justificativa_atraso(uuid, text) to authenticated;

-- Responde quem foi pedido, o admin ou quem coordena o setor da etapa.
create or replace function public.responder_justificativa_atraso(p_justificativa_id uuid, p_texto text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_just public.obra_justificativas_atraso;
  v_setor public.setor_obra;
  v_aut text;
  v_texto text := nullif(btrim(p_texto), '');
begin
  select * into v_just from public.obra_justificativas_atraso where id = p_justificativa_id for update;
  if found then
    v_setor := public.setor_etapa_obra(v_just.etapa);
    v_aut := public.autorizacao_setor_obra(v_just.obra_id, v_setor);
  end if;
  -- coalesce: sem vínculo na empresa, meu_membro_id é null e a comparação também; null nunca autoriza.
  if not found or not coalesce(
    v_just.pedido_a = public.meu_membro_id(v_just.empresa_id) or v_aut in ('admin', 'coordenar'), false
  ) then
    raise exception 'Só quem recebeu o pedido responde esta justificativa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_just.respondido_em is not null then
    raise exception 'Esta justificativa já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_texto is null or length(v_texto) < 3 or length(v_texto) > 500 then
    raise exception 'Explique o atraso (de 3 a 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.obra_justificativas_atraso
  set texto = v_texto, respondido_em = now(), respondido_por = public.meu_membro_id(v_just.empresa_id)
  where id = p_justificativa_id;
  perform public.registrar_historico_obra(v_just.obra_id, 'justificativa_atraso_respondida', v_setor, jsonb_build_object('etapa', v_just.etapa));
end;
$$;
revoke all on function public.responder_justificativa_atraso(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.responder_justificativa_atraso(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Escalonamentos
-- ---------------------------------------------------------------------------

-- Abre e fecha: admin, gestor ou quem atua no Operacional da obra.
create or replace function public.pode_escalonar_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{gestor}') or public.autorizacao_setor_obra(o.id, 'operacional') is not null
    from public.obras o where o.id = p_obra_id
  ), false);
$$;
revoke all on function public.pode_escalonar_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_escalonar_obra(uuid) to authenticated;

create table public.obra_escalonamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  titulo text not null check (length(btrim(titulo)) between 3 and 200),
  -- Valor fora do programado (opcional).
  valor numeric(12, 2) check (valor is null or valor > 0),
  aberto_por uuid,
  aberto_em timestamptz not null default now(),
  resolucao text check (resolucao is null or length(btrim(resolucao)) between 3 and 500),
  fechado_por uuid,
  fechado_em timestamptz,
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_escalonamentos_fechamento check ((resolucao is null) = (fechado_em is null))
);
create index on public.obra_escalonamentos (empresa_id, aberto_em) where fechado_em is null;
create index on public.obra_escalonamentos (obra_id, aberto_em);
create trigger auditar_obra_escalonamentos after insert or update or delete on public.obra_escalonamentos
  for each row execute function public.auditar();

alter table public.obra_escalonamentos enable row level security;
create policy "ver escalonamentos da obra" on public.obra_escalonamentos for select to authenticated
  using (public.pode_ver_custos_obra(obra_id));
-- Só as funções escrevem.
revoke all on public.obra_escalonamentos from anon, authenticated, service_role;
grant select on public.obra_escalonamentos to authenticated, service_role;

create or replace function public.abrir_escalonamento_obra(p_obra_id uuid, p_titulo text, p_valor numeric default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_titulo text := nullif(btrim(p_titulo), '');
  v_id uuid;
begin
  select * into v_obra from public.obras where id = p_obra_id for update;
  if not found or not public.pode_escalonar_obra(p_obra_id) then
    raise exception 'Só gestor, admin ou o Operacional da obra abre escalonamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_titulo is null or length(v_titulo) < 3 or length(v_titulo) > 200 then
    raise exception 'Descreva o que precisa de decisão (de 3 a 200 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_valor is not null and round(p_valor, 2) <= 0 then
    raise exception 'O valor fora do programado deve ser maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_escalonamentos (empresa_id, obra_id, titulo, valor, aberto_por)
  values (v_obra.empresa_id, p_obra_id, v_titulo, round(p_valor, 2), public.meu_membro_id(v_obra.empresa_id))
  returning id into v_id;
  perform public.registrar_historico_obra(p_obra_id, 'escalonamento_aberto', null, jsonb_build_object('escalonamento_id', v_id));
  return v_id;
end;
$$;
revoke all on function public.abrir_escalonamento_obra(uuid, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.abrir_escalonamento_obra(uuid, text, numeric) to authenticated;

create or replace function public.fechar_escalonamento_obra(p_escalonamento_id uuid, p_resolucao text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_esc public.obra_escalonamentos;
  v_resolucao text := nullif(btrim(p_resolucao), '');
begin
  select * into v_esc from public.obra_escalonamentos where id = p_escalonamento_id for update;
  if not found or not public.pode_escalonar_obra(v_esc.obra_id) then
    raise exception 'Só gestor, admin ou o Operacional da obra fecha escalonamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_esc.fechado_em is not null then
    raise exception 'Este escalonamento já foi fechado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_resolucao is null or length(v_resolucao) < 3 or length(v_resolucao) > 500 then
    raise exception 'Registre a decisão tomada (de 3 a 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.obra_escalonamentos
  set resolucao = v_resolucao, fechado_em = now(), fechado_por = public.meu_membro_id(v_esc.empresa_id)
  where id = p_escalonamento_id;
  perform public.registrar_historico_obra(v_esc.obra_id, 'escalonamento_fechado', null, jsonb_build_object('escalonamento_id', v_esc.id));
end;
$$;
revoke all on function public.fechar_escalonamento_obra(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.fechar_escalonamento_obra(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Prazos para o semáforo e o progresso (várias obras de uma vez)
-- ---------------------------------------------------------------------------

-- Por obra, a partir de `cronograma_obra` (que não devolve nada a quem não vê a obra), em dias úteis da empresa:
--  * etapa_atual: a primeira em andamento; sem nenhuma, a primeira a iniciar; tudo concluído, null;
--  * atraso_entrega: dias úteis da entrega prevista depois da contratada (0 = no prazo ou antes);
--  * maior_atraso / maior_atraso_etapa: o maior atraso de etapa e a etapa dele;
--  * vence_em / vence_etapa: o prazo mais próximo ainda não vencido (fim previsto da etapa em andamento ou a entrega
--    contratada, com vence_etapa null), em dias úteis a partir de hoje;
--  * progresso: dias úteis previstos das etapas concluídas, mais o já corrido da etapa em andamento (até o prazo dela),
--    sobre o total previsto; 100 só com todas concluídas;
--  * etapas_concluidas: as etapas já concluídas (encerram as categorias de custo);
--  * concluida_em: fim real da última etapa, com todas concluídas.
create or replace function public.prazos_obras(p_obra_ids uuid[])
returns table (
  obra_id uuid,
  etapa_atual text,
  entrega_contratada date,
  entrega_prevista date,
  atraso_entrega integer,
  maior_atraso integer,
  maior_atraso_etapa text,
  vence_em integer,
  vence_etapa text,
  progresso integer,
  etapas_concluidas text[],
  concluida_em date
)
-- security definer: usa os auxiliares de dias úteis (fechados para o cliente); quem vê o quê continua sendo
-- `cronograma_obra`, que roda com a identidade de quem chama e não devolve linha de obra que ela não vê.
language sql stable security definer set search_path = ''
as $$
  with c as (
    select x.id as obra_id, o.empresa_id, c.*,
           public.dias_uteis_entre(o.empresa_id, c.previsto_inicio, c.previsto_fim) as prazo
    from unnest(p_obra_ids) x(id)
    join public.obras o on o.id = x.id
    cross join lateral public.cronograma_obra(x.id) c
  ),
  hoje as (select public.hoje_brasilia() as d),
  prazos as (
    select c.obra_id, c.etapa, public.prazo_dias_restantes(c.empresa_id, c.previsto_fim, (select d from hoje)) as dias
    from c where c.situacao = 'andamento'
    union all
    select distinct on (c.obra_id) c.obra_id, null, public.prazo_dias_restantes(c.empresa_id, c.entrega_contratada, (select d from hoje))
    from c where exists (select 1 from c c2 where c2.obra_id = c.obra_id and c2.situacao <> 'concluida')
  ),
  vence as (
    select distinct on (p.obra_id) p.obra_id, p.dias, p.etapa
    from prazos p where p.dias >= 0
    order by p.obra_id, p.dias, p.etapa nulls last
  ),
  resumo as (
    select c.obra_id,
           (array_agg(c.etapa order by c.ordem) filter (where c.situacao = 'andamento'))[1] as andamento,
           (array_agg(c.etapa order by c.ordem) filter (where c.situacao not in ('andamento', 'concluida')))[1] as pendente,
           bool_and(c.situacao = 'concluida') as tudo,
           coalesce(array_agg(c.etapa order by c.ordem) filter (where c.situacao = 'concluida'), '{}') as concluidas,
           max(c.entrega_contratada) as contratada,
           (array_agg(c.previsao_fim order by c.ordem desc))[1] as prevista,
           (array_agg(c.real_fim order by c.ordem desc))[1] as ultima_real,
           max(c.empresa_id::text)::uuid as empresa_id,
           greatest(max(c.atraso_dias), 0) as maior_atraso,
           (array_agg(c.etapa order by c.atraso_dias desc, c.ordem) filter (where c.atraso_dias > 0))[1] as maior_atraso_etapa,
           sum(c.prazo) as total,
           sum(case when c.situacao = 'concluida' then c.prazo
                    when c.situacao = 'andamento' then least(c.prazo, coalesce(c.dias_na_etapa, 0))
                    else 0 end) as feito
    from c group by c.obra_id
  )
  select r.obra_id,
         coalesce(r.andamento, r.pendente),
         r.contratada,
         r.prevista,
         case when r.prevista > r.contratada then public.dias_uteis_entre(r.empresa_id, r.contratada, r.prevista) else 0 end,
         r.maior_atraso,
         r.maior_atraso_etapa,
         v.dias,
         v.etapa,
         case when r.tudo then 100
              when coalesce(r.total, 0) = 0 then 0
              else least(99, floor(100.0 * r.feito / r.total))::int end,
         r.concluidas,
         case when r.tudo then r.ultima_real end
  from resumo r
  left join vence v on v.obra_id = r.obra_id;
$$;
revoke all on function public.prazos_obras(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.prazos_obras(uuid[]) to authenticated;
