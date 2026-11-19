-- Agenda operacional (item 4 do roadmap; decisões do Evandro em 18/11/2026; plano em
-- docs/superpowers/plans/2026-11-18-agenda-operacional.md). Só no PRO.
--
--  1. `equipes_instalacao`: equipes terceirizadas da empresa (não acessam o Raion). Não se apagam: ficam inativas.
--  2. `obra_instalacoes`: o agendamento da instalação (equipe do cadastro ou digitada, início, término, observação).
--     Só `agendar_instalacao_obra` escreve; tudo vai para o histórico da obra.
--  3. `sugerir_termino_instalacao`: 3 dias úteis contando o início.
--  4. `cronograma_obra`: a previsão da Instalação segue a agenda.
--  5. `agenda_operacional` e `feriados_periodo`: instalações, vistorias, entregas do material e entregas contratadas
--     de um período, e os feriados (com nome) para a tela.
--
-- Depende de: preparar_escrita_obra, gravar_status_fluxo_obra, registrar_historico_obra, empresa_e_solo, dia_util,
-- somar_dias_uteis, hoje_brasilia, pode_ver_obra, pode_ver_obra_operacao, tem_papel, meu_membro_id, tocar_updated_at.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Equipes de instalação
-- ---------------------------------------------------------------------------

/** Admin, gestor ou quem atua no setor Operacional da empresa. */
create or replace function public.pode_gerir_equipes_instalacao(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_papel(p_empresa_id, '{admin,gestor}')
      or (public.tem_papel(p_empresa_id, '{operacao}') and exists (
            select 1 from public.membro_setores_obra s
            where s.empresa_id = p_empresa_id and s.membro_id = public.meu_membro_id(p_empresa_id) and s.setor = 'operacional'));
$$;
revoke all on function public.pode_gerir_equipes_instalacao(uuid) from public, anon, authenticated;
grant execute on function public.pode_gerir_equipes_instalacao(uuid) to authenticated;

create table public.equipes_instalacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  telefone text check (char_length(telefone) <= 30),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index equipes_instalacao_nome_unico on public.equipes_instalacao (empresa_id, lower(btrim(nome)));
create trigger equipes_instalacao_updated_at before update on public.equipes_instalacao
  for each row execute function public.tocar_updated_at();

alter table public.equipes_instalacao enable row level security;
revoke all on table public.equipes_instalacao from public, anon, authenticated;
grant select, insert on table public.equipes_instalacao to authenticated;
grant update (nome, telefone, ativa) on table public.equipes_instalacao to authenticated;

create policy "ver equipes de instalacao" on public.equipes_instalacao for select to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor,operacao}'));
create policy "criar equipe de instalacao" on public.equipes_instalacao for insert to authenticated
  with check (public.pode_gerir_equipes_instalacao(empresa_id));
create policy "editar equipe de instalacao" on public.equipes_instalacao for update to authenticated
  using (public.pode_gerir_equipes_instalacao(empresa_id))
  with check (public.pode_gerir_equipes_instalacao(empresa_id));

-- ---------------------------------------------------------------------------
-- 2. Agendamento da instalação
-- ---------------------------------------------------------------------------

create table public.obra_instalacoes (
  obra_id uuid primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  equipe_id uuid,
  equipe_nome text not null check (char_length(btrim(equipe_nome)) between 2 and 80),
  equipe_telefone text check (char_length(equipe_telefone) <= 30),
  inicio date not null,
  termino date not null,
  observacao text check (char_length(observacao) <= 500),
  agendado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (termino >= inicio),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, equipe_id) references public.equipes_instalacao (empresa_id, id)
);
create index on public.obra_instalacoes (empresa_id, inicio);
create index on public.obra_instalacoes (empresa_id, equipe_id);
create index on public.obra_instalacoes (agendado_por);

alter table public.obra_instalacoes enable row level security;
revoke all on table public.obra_instalacoes from public, anon, authenticated;
grant select on table public.obra_instalacoes to authenticated;
create policy "ver instalacao da obra" on public.obra_instalacoes for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));

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
  'arquivo_compra_anexado', 'documento_cliente_compra_anexado', 'checklist_alterado', 'instalacao_agendamento'
]));

/** Término sugerido: 3 dias úteis contando o início (início em dia não útil não conta). Só para quem é da empresa. */
create or replace function public.sugerir_termino_instalacao(p_empresa_id uuid, p_inicio date)
returns date
language sql stable security definer set search_path = ''
as $$
  select case
    when p_inicio is null or public.meu_membro_id(p_empresa_id) is null then null
    when public.dia_util(p_empresa_id, p_inicio) then public.somar_dias_uteis(p_empresa_id, p_inicio, 2)
    else public.somar_dias_uteis(p_empresa_id, p_inicio, 3)
  end;
$$;
revoke all on function public.sugerir_termino_instalacao(uuid, date) from public, anon, authenticated;
grant execute on function public.sugerir_termino_instalacao(uuid, date) to authenticated;

/*
 * Agenda, reagenda (com motivo, quando as datas mudam) ou troca a equipe da instalação. Escreve quem escreve no
 * Operacional da obra (admin, gestor, coordenador ou quem atua nele). Equipe: do cadastro (`p_equipe_id`, ativa ou a
 * mesma de antes) ou digitada (`p_equipe_nome`, só nesta obra).
 */
create or replace function public.agendar_instalacao_obra(
  p_obra_id uuid,
  p_equipe_id uuid,
  p_equipe_nome text,
  p_equipe_telefone text,
  p_inicio date,
  p_termino date,
  p_observacao text,
  p_motivo text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_emp uuid;
  v_status text;
  v_antes public.obra_instalacoes;
  v_equipe public.equipes_instalacao;
  v_nome text;
  v_telefone text;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_hoje date := public.hoje_brasilia();
  v_acao text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'operacional', true);
  select o.empresa_id into v_emp from public.obras o where o.id = p_obra_id;
  if public.empresa_e_solo(v_emp) then
    raise exception 'A agenda de instalação é do plano PRO.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select f.status into v_status from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'operacional';
  if v_status is null or v_status not in ('liberada_agendamento', 'agendada') then
    raise exception 'A instalação só é agendada com o Operacional em "Liberada para agendamento" ou "Agendada".' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_inicio is null or p_termino is null or p_termino < p_inicio then
    raise exception 'Informe o início e um término igual ou depois do início.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_inicio < v_hoje - 30 or p_inicio > v_hoje + 365 or p_termino > p_inicio + 60 then
    raise exception 'Datas fora do intervalo aceito (início de 30 dias atrás a 1 ano à frente; até 60 dias de instalação).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obs is not null and char_length(v_obs) > 500 then
    raise exception 'A observação passou de 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_antes from public.obra_instalacoes a where a.obra_id = p_obra_id for update;

  if p_equipe_id is not null then
    select * into v_equipe from public.equipes_instalacao e where e.id = p_equipe_id and e.empresa_id = v_emp;
    if not found or (not v_equipe.ativa and p_equipe_id is distinct from v_antes.equipe_id) then
      raise exception 'Escolha uma equipe ativa do cadastro.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_nome := v_equipe.nome;
    v_telefone := v_equipe.telefone;
  else
    v_nome := nullif(btrim(coalesce(p_equipe_nome, '')), '');
    v_telefone := nullif(btrim(coalesce(p_equipe_telefone, '')), '');
    if v_nome is null or char_length(v_nome) < 2 or char_length(v_nome) > 80 then
      raise exception 'Informe o nome da equipe (de 2 a 80 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_telefone is not null and char_length(v_telefone) > 30 then
      raise exception 'Telefone da equipe muito longo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if v_antes.obra_id is null then
    v_acao := 'agendada';
  elsif v_antes.inicio <> p_inicio or v_antes.termino <> p_termino then
    if v_motivo is null or char_length(v_motivo) < 3 or char_length(v_motivo) > 300 then
      raise exception 'Informe o motivo do reagendamento (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_acao := 'reagendada';
  elsif v_antes.equipe_id is distinct from p_equipe_id or v_antes.equipe_nome is distinct from v_nome
        or v_antes.equipe_telefone is distinct from v_telefone then
    v_acao := 'equipe_trocada';
  elsif v_antes.observacao is distinct from v_obs then
    v_acao := 'observacao';
  else
    return;
  end if;

  insert into public.obra_instalacoes (obra_id, empresa_id, equipe_id, equipe_nome, equipe_telefone, inicio, termino, observacao, agendado_por)
  values (p_obra_id, v_emp, p_equipe_id, v_nome, v_telefone, p_inicio, p_termino, v_obs, public.meu_membro_id(v_emp))
  on conflict (obra_id) do update
    set equipe_id = excluded.equipe_id, equipe_nome = excluded.equipe_nome, equipe_telefone = excluded.equipe_telefone,
        inicio = excluded.inicio, termino = excluded.termino, observacao = excluded.observacao,
        agendado_por = excluded.agendado_por, updated_at = now();

  perform public.registrar_historico_obra(p_obra_id, 'instalacao_agendamento', 'operacional', jsonb_strip_nulls(jsonb_build_object(
    'acao', v_acao,
    'equipe', v_nome,
    'inicio', p_inicio,
    'termino', p_termino,
    'inicio_antes', case when v_acao = 'reagendada' then v_antes.inicio end,
    'termino_antes', case when v_acao = 'reagendada' then v_antes.termino end,
    'equipe_antes', case when v_acao = 'equipe_trocada' then v_antes.equipe_nome end,
    'motivo', case when v_acao = 'reagendada' then v_motivo end,
    'autorizacao', v_aut
  )));

  if v_status = 'liberada_agendamento' then
    perform public.gravar_status_fluxo_obra(p_obra_id, 'operacional', 'agendada', v_aut, 'agendamento');
  end if;
end;
$$;
revoke all on function public.agendar_instalacao_obra(uuid, uuid, text, text, date, date, text, text) from public, anon, authenticated;
grant execute on function public.agendar_instalacao_obra(uuid, uuid, text, text, date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cronograma: previsão da Instalação pela agenda (corpo de 20261206100000 com as linhas da agenda)
-- ---------------------------------------------------------------------------

create or replace function public.cronograma_obra(p_obra_id uuid)
returns table (
  ordem integer,
  etapa text,
  previsto_inicio date,
  previsto_fim date,
  real_inicio date,
  real_fim date,
  previsao_inicio date,
  previsao_fim date,
  situacao text,
  dias_na_etapa integer,
  atraso_dias integer,
  atraso_proprio integer,
  causa_etapa text,
  entrega_contratada date,
  entrega_material_prevista date
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_emp uuid;
  v_hoje date := public.hoje_brasilia();
  v_chegada date;
  v_compras public.obra_fluxos;
  v_eng public.obra_fluxos;
  v_etapas text[] := array['projeto', 'homologacao', 'compra', 'entrega_material', 'instalacao', 'vistoria', 'conexao'];
  v_ini date[] := array[null, null, null, null, null, null, null]::date[];
  v_fim date[] := array[null, null, null, null, null, null, null]::date[];
  v_dias integer;
  v_p_ini date;
  v_p_fim date;
  v_f_ini date;
  v_f_fim date;
  v_ant_fim date;
  v_herdado integer;
  v_causa text;
  v_agenda public.obra_instalacoes;
  i integer;
begin
  if not (public.pode_ver_obra(p_obra_id) or public.pode_ver_obra_operacao(p_obra_id)) then
    return;
  end if;
  select * into v_obra from public.obras where id = p_obra_id;
  v_emp := v_obra.empresa_id;
  v_chegada := (v_obra.created_at at time zone 'America/Sao_Paulo')::date;
  select * into v_compras from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras';
  select * into v_eng from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'engenharia';
  select * into v_agenda from public.obra_instalacoes a where a.obra_id = p_obra_id;

  -- 1. Chegada e projeto: da chegada ao protocolo na concessionária.
  v_ini[1] := v_chegada;
  v_fim[1] := (select min(p.protocolado_em) from public.obra_engenharia_protocolos p where p.obra_id = p_obra_id and p.status <> 'cancelado');
  -- 2. Homologação: do protocolo à aprovação.
  v_ini[2] := v_fim[1];
  v_fim[2] := (select min(e.ocorrido_em) from public.obra_engenharia_protocolo_eventos e where e.obra_id = p_obra_id and e.tipo = 'aprovado');
  -- 3. Compra: do início de Compras ao faturamento pelo fornecedor.
  v_ini[3] := (v_compras.iniciado_em at time zone 'America/Sao_Paulo')::date;
  v_fim[3] := (
    select min(coalesce((h.dados ->> 'ocorrido_em')::date, (h.created_at at time zone 'America/Sao_Paulo')::date))
    from public.obra_historico h
    where h.obra_id = p_obra_id and h.tipo = 'fluxo_alterado' and h.setor = 'compras'
      and h.dados ->> 'campo' = 'status' and h.dados ->> 'para' in ('faturado_fornecedor', 'material_entregue')
  );
  -- 4. Entrega do material: do faturamento à entrega.
  v_ini[4] := v_fim[3];
  v_fim[4] := case when v_compras.status = 'material_entregue' then (v_compras.concluido_em at time zone 'America/Sao_Paulo')::date end;
  -- 5. Instalação: do início da instalação à conclusão.
  select min(case when h.dados ->> 'para' in ('em_instalacao', 'instalacao_concluida', 'concluido') then (h.created_at at time zone 'America/Sao_Paulo')::date end),
         min(case when h.dados ->> 'para' in ('instalacao_concluida', 'concluido') then (h.created_at at time zone 'America/Sao_Paulo')::date end)
  into v_p_ini, v_p_fim
  from public.obra_historico h
  where h.obra_id = p_obra_id and h.tipo = 'fluxo_alterado' and h.setor = 'operacional' and h.dados ->> 'campo' = 'status';
  v_ini[5] := v_p_ini;
  v_fim[5] := v_p_fim;
  -- 6. Vistoria: do pedido à aprovação.
  v_ini[6] := (select min(v.solicitada_em) from public.obra_engenharia_vistorias v where v.obra_id = p_obra_id and v.status <> 'cancelada');
  v_fim[6] := (select min(e.ocorrido_em) from public.obra_engenharia_vistoria_eventos e where e.obra_id = p_obra_id and e.tipo = 'aprovada');
  -- 7. Conexão: da vistoria aprovada à conexão confirmada (ou à Engenharia concluída sem conexão).
  v_ini[7] := v_fim[6];
  v_fim[7] := coalesce(
    (select max(v.conexao_confirmada_em) from public.obra_engenharia_vistorias v where v.obra_id = p_obra_id and v.status = 'aprovada'),
    case when v_eng.status = 'concluido' then (v_eng.concluido_em at time zone 'America/Sao_Paulo')::date end
  );

  v_p_fim := v_chegada;
  v_ant_fim := v_chegada;
  v_causa := null;
  for i in 1..7 loop
    -- Etapa de um setor que esta obra não tem (desligado quando ela nasceu) fica fora; `ordem` segue o índice original.
    if not exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = public.setor_etapa_obra(v_etapas[i])) then
      continue;
    end if;
    v_dias := (select p.dias_uteis from public.obra_prazos_etapas p where p.empresa_id = v_emp and p.chave = v_etapas[i]);
    -- Fim registrado sem início: a etapa começou, no máximo, quando terminou.
    if v_fim[i] is not null and v_ini[i] is null then
      v_ini[i] := least(v_fim[i], greatest(v_ant_fim, v_chegada));
    end if;

    v_p_ini := v_p_fim;
    v_p_fim := public.somar_dias_uteis(v_emp, v_p_ini, v_dias);

    v_f_ini := coalesce(v_ini[i], greatest(v_ant_fim, v_hoje));
    -- Instalação agendada (20261217100000): a previsão segue as datas da agenda até a instalação começar.
    if v_etapas[i] = 'instalacao' and v_ini[i] is null and v_fim[i] is null and v_agenda.obra_id is not null then
      v_f_ini := v_agenda.inicio;
    end if;
    if v_fim[i] is not null then
      v_f_fim := greatest(v_fim[i], v_f_ini);
      situacao := 'concluida';
    else
      v_f_fim := case
        when v_etapas[i] = 'entrega_material' and v_obra.entrega_material_prevista is not null then v_obra.entrega_material_prevista
        when v_etapas[i] = 'instalacao' and v_agenda.obra_id is not null then v_agenda.termino
        else public.somar_dias_uteis(v_emp, v_f_ini, v_dias)
      end;
      v_f_fim := greatest(v_f_fim, v_f_ini, case when v_ini[i] is not null then v_hoje end);
      situacao := case when v_ini[i] is not null then 'andamento' else 'a_iniciar' end;
    end if;

    ordem := i;
    etapa := v_etapas[i];
    previsto_inicio := v_p_ini;
    previsto_fim := v_p_fim;
    real_inicio := v_ini[i];
    real_fim := v_fim[i];
    previsao_inicio := v_f_ini;
    previsao_fim := v_f_fim;
    dias_na_etapa := case when v_ini[i] is not null then public.dias_uteis_entre(v_emp, v_ini[i], coalesce(v_fim[i], greatest(v_hoje, v_ini[i]))) end;
    atraso_dias := case when v_f_fim >= v_p_fim then public.dias_uteis_entre(v_emp, v_p_fim, v_f_fim)
                        else -public.dias_uteis_entre(v_emp, v_f_fim, v_p_fim) end;
    v_herdado := case when v_f_ini >= v_p_ini then public.dias_uteis_entre(v_emp, v_p_ini, v_f_ini)
                      else -public.dias_uteis_entre(v_emp, v_f_ini, v_p_ini) end;
    atraso_proprio := atraso_dias - v_herdado;
    causa_etapa := case when atraso_dias > 0 and atraso_proprio <= 0 then v_causa end;
    entrega_contratada := v_obra.entrega_contratada;
    entrega_material_prevista := v_obra.entrega_material_prevista;
    if atraso_proprio > 0 then
      v_causa := v_etapas[i];
    end if;
    return next;
    v_ant_fim := v_f_fim;
  end loop;
end;
$$;
revoke all on function public.cronograma_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cronograma_obra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Agenda do período
-- ---------------------------------------------------------------------------

/*
 * Eventos de `p_de` a `p_ate` (até 62 dias) das obras não canceladas que quem chama vê (setores, admin, gestor; o
 * vendedor só as dele). Instalação: do início ao término agendados. Vistoria: data agendada. Entrega do material:
 * prevista, enquanto Compras não registrou a entrega. Entrega contratada: enquanto o Operacional não concluiu; alerta
 * quando a previsão do cronograma passa da data.
 */
create or replace function public.agenda_operacional(p_empresa_id uuid, p_de date, p_ate date)
returns table (
  tipo text,
  obra_id uuid,
  obra_numero integer,
  cliente_nome text,
  inicio date,
  fim date,
  detalhe text,
  equipe_id uuid,
  situacao text,
  alerta boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.meu_membro_id(p_empresa_id) is null or p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then
    return;
  end if;

  return query
  with visiveis as (
    select o.id, o.numero, o.cliente_nome, o.entrega_material_prevista, o.entrega_contratada
    from public.obras o
    where o.empresa_id = p_empresa_id and o.cancelada_em is null
      and (public.pode_ver_obra(o.id) or public.pode_ver_obra_operacao(o.id))
  )
  select 'instalacao'::text, v.id, v.numero, v.cliente_nome, a.inicio, a.termino, a.equipe_nome, a.equipe_id,
         (select f.status from public.obra_fluxos f where f.obra_id = v.id and f.setor = 'operacional'), false
  from visiveis v join public.obra_instalacoes a on a.obra_id = v.id
  where a.inicio <= p_ate and a.termino >= p_de
  union all
  select 'vistoria'::text, v.id, v.numero, v.cliente_nome, vi.agendada_para, vi.agendada_para, null::text, null::uuid, vi.status, false
  from visiveis v join public.obra_engenharia_vistorias vi on vi.obra_id = v.id
  where vi.agendada_para between p_de and p_ate and vi.status <> 'cancelada'
  union all
  select 'entrega_material'::text, v.id, v.numero, v.cliente_nome, v.entrega_material_prevista, v.entrega_material_prevista,
         null::text, null::uuid, f.status, false
  from visiveis v join public.obra_fluxos f on f.obra_id = v.id and f.setor = 'compras'
  where v.entrega_material_prevista between p_de and p_ate and f.status <> 'material_entregue'
  union all
  select 'entrega_contratada'::text, v.id, v.numero, v.cliente_nome, v.entrega_contratada, v.entrega_contratada,
         null::text, null::uuid, f.status,
         coalesce((select c.previsao_fim from public.cronograma_obra(v.id) c order by c.ordem desc limit 1) > v.entrega_contratada, false)
  from visiveis v join public.obra_fluxos f on f.obra_id = v.id and f.setor = 'operacional'
  where v.entrega_contratada between p_de and p_ate and f.status <> 'concluido';
end;
$$;
revoke all on function public.agenda_operacional(uuid, date, date) from public, anon, authenticated;
grant execute on function public.agenda_operacional(uuid, date, date) to authenticated;

/** Feriados do período (nacionais pela mesma regra de `feriado_nacional` e os da empresa), com o nome, para a Agenda. */
create or replace function public.feriados_periodo(p_empresa_id uuid, p_de date, p_ate date)
returns table (data date, nome text)
language sql stable security definer set search_path = ''
as $$
  select d::date,
         coalesce(
           (select f.nome from public.empresa_feriados f where f.empresa_id = p_empresa_id and f.data = d::date limit 1),
           case
             when to_char(d, 'MM-DD') = '01-01' then 'Confraternização Universal'
             when to_char(d, 'MM-DD') = '04-21' then 'Tiradentes'
             when to_char(d, 'MM-DD') = '05-01' then 'Dia do Trabalho'
             when to_char(d, 'MM-DD') = '09-07' then 'Independência'
             when to_char(d, 'MM-DD') = '10-12' then 'Nossa Senhora Aparecida'
             when to_char(d, 'MM-DD') = '11-02' then 'Finados'
             when to_char(d, 'MM-DD') = '11-15' then 'Proclamação da República'
             when to_char(d, 'MM-DD') = '11-20' then 'Consciência Negra'
             when to_char(d, 'MM-DD') = '12-25' then 'Natal'
             when d::date = public.data_pascoa(extract(year from d)::int) - 2 then 'Sexta-feira Santa'
             when d::date = public.data_pascoa(extract(year from d)::int) + 60 then 'Corpus Christi'
             else 'Carnaval'
           end
         )
  from generate_series(p_de, p_ate, interval '1 day') d
  where public.meu_membro_id(p_empresa_id) is not null
    and p_ate >= p_de and p_ate - p_de <= 62
    and (public.feriado_nacional(d::date)
         or exists (select 1 from public.empresa_feriados f where f.empresa_id = p_empresa_id and f.data = d::date))
  order by 1;
$$;
revoke all on function public.feriados_periodo(uuid, date, date) from public, anon, authenticated;
grant execute on function public.feriados_periodo(uuid, date, date) to authenticated;

reset lock_timeout;
