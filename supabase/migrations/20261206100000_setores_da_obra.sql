-- Onboarding, subprojeto 4a: setores da obra (desenho em docs/superpowers/specs/2026-11-11-obra-solo-e-setores-design.md,
-- seção "4a"; plano em docs/superpowers/plans/2026-11-11-setores-da-obra.md; decisões do Evandro de 11/11/2026).
--
-- O que faz:
--  * `empresa_telas.setores_desligados`: os setores que a empresa PRO não tem. Só Engenharia e Administrativo desligam;
--    Compras e Operacional nunca (o check recusa). Sem escolha = todos ligados, como hoje. Mesma linha, RLS (só o admin
--    grava), auditoria e autor das telas.
--  * A tela Engenharia deixa de ser chave de tela: a chave é o setor (desligar o setor esconde a tela). Quem já tinha a
--    tela Engenharia desligada passa a ter o setor desligado (o autor da última mudança é mantido).
--  * `setores_da_obra(empresa)`: os fluxos que uma obra nova recebe. Vale só para obras novas: nenhuma obra existente
--    ganha ou perde fluxo. O Solo, nesta etapa, recebe os setores como o PRO (a obra do Solo vem na 4b).
--  * `garantir_obra` cria só os fluxos de `setores_da_obra`.
--  * `calcular_entrega_contratada`: o número configurado (`entrega_contratada`, padrão 51 dias úteis) menos os dias das
--    etapas dos setores que a obra não recebe (mínimo 1). Padrão sem Engenharia: 51 − (7 + 15 + 7 + 5) = 17.
--  * `cronograma_obra` pula as etapas de setor que a obra não tem (`ordem` continua o índice original).
-- Contas a pagar e NF do cliente não dependem do fluxo Administrativo: continuam com admin e gestor.

set lock_timeout = '5s';

alter table public.empresa_telas
  add column setores_desligados text[] not null default '{}'
    constraint empresa_telas_setores_desligados_check check (setores_desligados <@ array['engenharia', 'administrativo']::text[]);

-- A tela Engenharia desligada vira o setor Engenharia desligado. O gatilho que grava o autor fica parado só neste
-- update (a migration não tem usuário logado e apagaria quem fez a última mudança).
alter table public.empresa_telas disable trigger empresa_telas_preparar;
update public.empresa_telas
  set setores_desligados = array['engenharia'],
      desligadas = array_remove(desligadas, 'engenharia')
  where 'engenharia' = any (desligadas);
alter table public.empresa_telas enable trigger empresa_telas_preparar;

alter table public.empresa_telas drop constraint empresa_telas_desligadas_check;
alter table public.empresa_telas add constraint empresa_telas_desligadas_check
  check (desligadas <@ array['painel', 'leads', 'forecast', 'obras', 'gamificacao', 'eletroposto', 'captura']::text[]);

-- Setores que uma obra nova da empresa recebe, na ordem compras, engenharia, operacional, administrativo.
create or replace function public.setores_da_obra(p_empresa_id uuid)
returns public.setor_obra[]
language sql stable security definer set search_path = ''
as $$
  select array_agg(s.setor order by s.ordem)
  from unnest(array['compras', 'engenharia', 'operacional', 'administrativo']::public.setor_obra[]) with ordinality as s(setor, ordem)
  where not exists (
    select 1 from public.empresa_telas t
    where t.empresa_id = p_empresa_id and s.setor::text = any (t.setores_desligados)
  );
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

-- Entrega contratada: o número configurado menos as etapas dos setores que a obra nova não recebe (mínimo 1 dia útil).
create or replace function public.calcular_entrega_contratada(p_empresa_id uuid, p_chegada timestamptz)
returns date
language sql stable security definer set search_path = ''
as $$
  select public.somar_dias_uteis(
    p_empresa_id,
    (p_chegada at time zone 'America/Sao_Paulo')::date,
    greatest(1, p.dias_uteis - coalesce((
      select sum(e.dias_uteis)
      from public.obra_prazos_etapas e
      where e.empresa_id = p_empresa_id
        and e.chave <> 'entrega_contratada'
        and public.setor_etapa_obra(e.chave) <> all (public.setores_da_obra(p_empresa_id))
    ), 0)::integer)
  )
  from public.obra_prazos_etapas p
  where p.empresa_id = p_empresa_id and p.chave = 'entrega_contratada';
$$;
revoke all on function public.calcular_entrega_contratada(uuid, timestamptz) from public, anon, authenticated, service_role;

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
