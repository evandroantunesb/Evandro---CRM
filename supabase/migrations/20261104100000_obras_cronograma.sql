-- Obras OPR, PR 1: prazos das etapas, entrega contratada, "material entregue" e o cronograma calculado.
--
-- Decisões do Evandro (02/11/2026), com o desenho aprovado "Obras — Apresentação":
--  * Sete etapas em sequência: chegada e projeto, homologação, compra, entrega do material, instalação, vistoria e
--    conexão. Cada uma tem um prazo padrão em dias úteis que o admin ou o gestor edita (`obra_prazos_etapas`).
--  * Entrega contratada = chegada da obra + N dias úteis (N também em `obra_prazos_etapas`). Fica gravada na obra ao
--    nascer e o admin ou o gestor ajusta com motivo, registrado no histórico.
--  * Compras passa a terminar em "material entregue" (depois de "faturado pelo fornecedor"). Compras informa a
--    previsão de entrega do material; sem ela, vale o prazo padrão da etapa.
--  * Obras já em "faturado": com a instalação já iniciada, o material foi entregue — a migração marca "material
--    entregue" na data em que a instalação começou e registra no histórico que a data foi deduzida. Sem instalação,
--    Compras volta a esperar a entrega.
--  * A tarefa automática "Agendar instalação" continua nascendo em "faturado" (nada muda na regra padrão).
--  * O previsto corre em cascata: etapa que atrasa empurra as seguintes; atraso só herdado vem com a etapa causadora.
--
-- Depende de: somar_dias_uteis, dias_uteis_entre, hoje_brasilia (20261030160000), gravar_status_fluxo_obra
-- (20261030120000), alterar_status_fluxo_obra (20261030140000), preparar_escrita_obra, registrar_historico_obra,
-- pode_ver_obra, pode_ver_obra_operacao (20261102100000), obra_historico_tipo_check (20261101120000).

-- ---------------------------------------------------------------------------
-- Status "material entregue" em Compras
-- ---------------------------------------------------------------------------

alter table public.obra_fluxos drop constraint obra_fluxos_status_valido;
alter table public.obra_fluxos add constraint obra_fluxos_status_valido check (
  (setor = 'compras' and status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'material_entregue'))
  or (setor = 'engenharia' and status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
  or (setor = 'operacional' and status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
);

alter table public.tarefas_automaticas_regras drop constraint tarefas_automaticas_regras_gatilho_valido;
alter table public.tarefas_automaticas_regras add constraint tarefas_automaticas_regras_gatilho_valido check (
  (gatilho_setor = 'compras' and gatilho_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'material_entregue'))
  or (gatilho_setor = 'engenharia' and gatilho_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
  or (gatilho_setor = 'operacional' and gatilho_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
);

create or replace function public.gravar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text, p_aut text, p_origem text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fluxo public.obra_fluxos;
  v_inicial text := case p_setor when 'compras' then 'a_comprar' when 'engenharia' then 'a_iniciar' else 'aguardando_liberacao' end;
  v_final text := case p_setor when 'compras' then 'material_entregue' else 'concluido' end;
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
revoke all on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) to authenticated;

-- Histórico: ajuste da entrega contratada e previsão do material.
alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao',
  'passo_engenharia_registrado', 'enquadramento_engenharia_salvo',
  'entrega_contratada_ajustada', 'entrega_material_prevista'
));

-- Obras já em "faturado". Com a instalação iniciada (em instalação ou depois), o material foi entregue: Compras passa a
-- "material entregue" na data em que a instalação começou. A data é deduzida, e o histórico diz isso (`ocorrido_em`
-- guarda a data deduzida; `created_at` é o momento da migração). As demais deixam de contar como concluídas.
with entregue as (
  select f.obra_id,
         coalesce(
           (select min(h.created_at) from public.obra_historico h
             where h.obra_id = f.obra_id and h.tipo = 'fluxo_alterado' and h.setor = 'operacional'
               and h.dados ->> 'para' in ('em_instalacao', 'instalacao_concluida', 'concluido')),
           op.iniciado_em, op.status_desde
         ) as quando
  from public.obra_fluxos f
  join public.obra_fluxos op on op.obra_id = f.obra_id and op.setor = 'operacional'
  where f.setor = 'compras' and f.status = 'faturado_fornecedor'
    and op.status in ('em_instalacao', 'instalacao_concluida', 'concluido')
),
marcadas as (
  update public.obra_fluxos f
  set status = 'material_entregue', status_desde = e.quando, concluido_em = e.quando
  from entregue e
  where f.obra_id = e.obra_id and f.setor = 'compras'
  returning f.obra_id, f.empresa_id, e.quando
)
insert into public.obra_historico (obra_id, empresa_id, setor, tipo, dados)
select m.obra_id, m.empresa_id, 'compras', 'fluxo_alterado', jsonb_build_object(
  'campo', 'status',
  'de', 'faturado_fornecedor',
  'para', 'material_entregue',
  'origem', 'migracao',
  'data_deduzida', true,
  'ocorrido_em', (m.quando at time zone 'America/Sao_Paulo')::date,
  'motivo', 'Instalação já iniciada: material entregue até a data em que a instalação começou.'
)
from marcadas m;

update public.obra_fluxos set concluido_em = null
where setor = 'compras' and status = 'faturado_fornecedor' and concluido_em is not null;

-- ---------------------------------------------------------------------------
-- Prazos das etapas (dias úteis), editáveis pelo admin e pelo gestor
-- ---------------------------------------------------------------------------

create table public.obra_prazos_etapas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  chave text not null check (chave in (
    'projeto', 'homologacao', 'compra', 'entrega_material', 'instalacao', 'vistoria', 'conexao', 'entrega_contratada'
  )),
  dias_uteis integer not null check (dias_uteis between 1 and 365),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, chave)
);
create trigger obra_prazos_etapas_updated_at before update on public.obra_prazos_etapas
  for each row execute function public.tocar_updated_at();
create trigger auditar_obra_prazos_etapas after insert or update or delete on public.obra_prazos_etapas
  for each row execute function public.auditar();

alter table public.obra_prazos_etapas enable row level security;
create policy "ver prazos das etapas da obra" on public.obra_prazos_etapas for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin e gestor editam prazos das etapas" on public.obra_prazos_etapas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
-- As linhas nascem com a empresa; só os dias mudam.
revoke all on public.obra_prazos_etapas from anon, authenticated, service_role;
grant select on public.obra_prazos_etapas to authenticated, service_role;
grant update (dias_uteis) on public.obra_prazos_etapas to authenticated;

create or replace function public.inserir_prazos_etapas_obra_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.obra_prazos_etapas (empresa_id, chave, dias_uteis) values
    (p_empresa_id, 'projeto', 7),
    (p_empresa_id, 'homologacao', 15),
    (p_empresa_id, 'compra', 5),
    (p_empresa_id, 'entrega_material', 7),
    (p_empresa_id, 'instalacao', 5),
    (p_empresa_id, 'vistoria', 7),
    (p_empresa_id, 'conexao', 5),
    (p_empresa_id, 'entrega_contratada', 51)
  on conflict (empresa_id, chave) do nothing;
$$;
revoke all on function public.inserir_prazos_etapas_obra_padrao(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_prazos_etapas_obra_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_prazos_etapas_obra_padrao(new.id);
  return null;
end;
$$;
revoke all on function public.criar_prazos_etapas_obra_empresa() from public, anon, authenticated, service_role;
create trigger empresas_prazos_etapas_obra after insert on public.empresas
  for each row execute function public.criar_prazos_etapas_obra_empresa();

select public.inserir_prazos_etapas_obra_padrao(id) from public.empresas;

-- ---------------------------------------------------------------------------
-- Entrega contratada e previsão do material
-- ---------------------------------------------------------------------------

alter table public.obras
  add column entrega_contratada date,
  add column entrega_material_prevista date;

-- Chegada da obra (dia em Brasília) + N dias úteis da empresa.
create or replace function public.calcular_entrega_contratada(p_empresa_id uuid, p_chegada timestamptz)
returns date
language sql stable security definer set search_path = ''
as $$
  select public.somar_dias_uteis(p_empresa_id, (p_chegada at time zone 'America/Sao_Paulo')::date, p.dias_uteis)
  from public.obra_prazos_etapas p
  where p.empresa_id = p_empresa_id and p.chave = 'entrega_contratada';
$$;
revoke all on function public.calcular_entrega_contratada(uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.definir_entrega_contratada_obra()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.entrega_contratada := coalesce(new.entrega_contratada, public.calcular_entrega_contratada(new.empresa_id, coalesce(new.created_at, now())));
  return new;
end;
$$;
revoke all on function public.definir_entrega_contratada_obra() from public, anon, authenticated, service_role;
create trigger obras_entrega_contratada before insert on public.obras
  for each row execute function public.definir_entrega_contratada_obra();

update public.obras set entrega_contratada = public.calcular_entrega_contratada(empresa_id, created_at)
where entrega_contratada is null;
alter table public.obras alter column entrega_contratada set not null;

-- Admin ou gestor ajusta a entrega contratada, sempre com motivo.
create or replace function public.ajustar_entrega_contratada_obra(p_obra_id uuid, p_data date, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  select * into v_obra from public.obras where id = p_obra_id for update;
  if not found or not public.tem_papel(v_obra.empresa_id, '{admin,gestor}') then
    raise exception 'Só admin ou gestor ajusta a entrega contratada.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data is null then
    raise exception 'Informe a nova data de entrega.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'Explique o motivo do ajuste (de 3 a 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data = v_obra.entrega_contratada then
    return;
  end if;

  update public.obras set entrega_contratada = p_data where id = p_obra_id;
  perform public.registrar_historico_obra(p_obra_id, 'entrega_contratada_ajustada', null, jsonb_build_object(
    'de', v_obra.entrega_contratada, 'para', p_data, 'motivo', v_motivo
  ));
end;
$$;
revoke all on function public.ajustar_entrega_contratada_obra(uuid, date, text) from public, anon, authenticated, service_role;
grant execute on function public.ajustar_entrega_contratada_obra(uuid, date, text) to authenticated;

-- Compras informa (ou limpa) a previsão de entrega do material. Mesma permissão dos status de Compras.
create or replace function public.definir_entrega_material_prevista(p_obra_id uuid, p_data date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_antes date;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'compras', true);
  select entrega_material_prevista into v_antes from public.obras where id = p_obra_id;
  if v_antes is not distinct from p_data then
    return;
  end if;
  update public.obras set entrega_material_prevista = p_data where id = p_obra_id;
  perform public.registrar_historico_obra(p_obra_id, 'entrega_material_prevista', 'compras', jsonb_build_object(
    'de', v_antes, 'para', p_data, 'autorizacao', v_aut
  ));
end;
$$;
revoke all on function public.definir_entrega_material_prevista(uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.definir_entrega_material_prevista(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Cronograma calculado
-- ---------------------------------------------------------------------------

-- As sete etapas da obra, em ordem, com:
--  * previsto: a linha de base, da chegada da obra somando o prazo de cada etapa;
--  * real: o que já aconteceu (histórico dos setores e datas da Engenharia);
--  * previsão: o real quando existe; senão, em cascata a partir do fim previsto da etapa anterior (nunca antes de hoje);
--  * dias úteis na etapa (até o fim real, ou até hoje se em andamento);
--  * atraso (dias úteis, negativo = adiantado) do fim previsto até o fim da previsão, quanto dele é da própria etapa e,
--    quando é só herdado, a etapa que o causou.
-- Cada linha repete a entrega contratada e a previsão do material da obra (quem só vê pela Operação não lê a
-- tabela `obras`).
-- Quem não vê a obra recebe zero linhas.
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
    v_dias := (select p.dias_uteis from public.obra_prazos_etapas p where p.empresa_id = v_emp and p.chave = v_etapas[i]);
    -- Fim registrado sem início: a etapa começou, no máximo, quando terminou.
    if v_fim[i] is not null and v_ini[i] is null then
      v_ini[i] := least(v_fim[i], greatest(v_ant_fim, v_chegada));
    end if;

    v_p_ini := v_p_fim;
    v_p_fim := public.somar_dias_uteis(v_emp, v_p_ini, v_dias);

    v_f_ini := coalesce(v_ini[i], greatest(v_ant_fim, v_hoje));
    if v_fim[i] is not null then
      v_f_fim := greatest(v_fim[i], v_f_ini);
      situacao := 'concluida';
    else
      v_f_fim := case
        when v_etapas[i] = 'entrega_material' and v_obra.entrega_material_prevista is not null then v_obra.entrega_material_prevista
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
