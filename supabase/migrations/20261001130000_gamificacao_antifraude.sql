-- Fase A da reformulação antifraude da gamificação (spec enviada pelo Evandro
-- em 2026-10-01, RAION_GAMIFICACAO_REGRAS_E_DIRECAO_VISUAL.md): infraestrutura
-- genérica reaproveitável pelas regras novas que vêm nas próximas entregas.
--
-- 1. `gamification_rules.unica_por_negocio`: quando marcado, o motor só
--    credita a regra uma vez por negócio (ex.: "entrou em negociação" não
--    pode pontuar de novo só porque o card saiu da etapa e voltou).
-- 2. `estornar_lancamentos_evento`: estorna automaticamente os lançamentos de
--    um negócio ligados a um conjunto de tipos de evento — hoje usado pra
--    reverter os pontos de "negócio ganho"/"handoff ganho" quando o negócio
--    deixa de estar ganho (reaberto ou marcado perdido). As próximas regras
--    (contrato assinado, pagamento confirmado) reaproveitam a mesma função
--    quando esses eventos existirem.
--
-- As 4 regras antigas que a nova tabela de pontos zera (negócio criado,
-- etapa avançada genérica, tarefa concluída genérica, nota registrada) são
-- dado de empresa, não código — o Evandro ajusta/desativa em Configurações >
-- Gamificação; nenhuma migration mexe nisso.

alter table public.gamification_rules add column unica_por_negocio boolean not null default false;

-- ---------------------------------------------------------------------------
-- Motor de regras: respeita unica_por_negocio além do teto por dia/mês.
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_regras_gamificacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro_id uuid;
  v_regra record;
  v_qtd integer;
  v_desde timestamptz;
begin
  if new.ator_id is null then
    return new;
  end if;

  select id into v_membro_id from public.empresa_membros
    where empresa_id = new.empresa_id and user_id = new.ator_id and ativo
    limit 1;
  if v_membro_id is null then
    return new;
  end if;

  for v_regra in
    select * from public.gamification_rules
    where empresa_id = new.empresa_id and evento_tipo = new.tipo and ativa
  loop
    if not public.avaliar_condicao_regra(new.payload, v_regra.condicao) then
      continue;
    end if;

    if v_regra.unica_por_negocio and new.entidade = 'negocio' then
      if exists (
        select 1 from public.point_ledger
          where regra_id = v_regra.id and referencia_tipo = 'negocio' and referencia_id = new.entidade_id and not estornado
      ) then
        continue;
      end if;
    end if;

    if v_regra.limite_periodo is not null then
      v_desde := case v_regra.limite_periodo
        when 'dia' then date_trunc('day', now())
        when 'mes' then date_trunc('month', now())
      end;
      select count(*) into v_qtd from public.point_ledger
        where regra_id = v_regra.id and membro_id = v_membro_id
          and not estornado and created_at >= v_desde;
      if v_qtd >= v_regra.limite_quantidade then
        continue;
      end if;
    end if;

    insert into public.point_ledger
      (empresa_id, membro_id, regra_id, evento_id, pontos, descricao, referencia_tipo, referencia_id)
      values (new.empresa_id, v_membro_id, v_regra.id, new.id, v_regra.pontos, v_regra.nome, new.entidade, new.entidade_id);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estorno automático por tipo de evento.
-- ---------------------------------------------------------------------------

create or replace function public.estornar_lancamentos_evento(p_entidade_id uuid, p_eventos_tipo text[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.point_ledger pl
    set estornado = true, estornado_em = now()
    from public.gamification_rules gr
    where pl.regra_id = gr.id
      and gr.evento_tipo = any(p_eventos_tipo)
      and pl.referencia_tipo = 'negocio'
      and pl.referencia_id = p_entidade_id
      and not pl.estornado;
end;
$$;

-- ---------------------------------------------------------------------------
-- registrar_negocio(): mesmo corpo da migration anterior (20260930140000),
-- só acrescentando o estorno automático quando o negócio deixa de ser ganho.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_tipo text;
  v_sdr_user_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.historico_etapas (empresa_id, negocio_id, etapa_id, movido_por)
      values (new.empresa_id, new.id, new.etapa_id, v_ator);
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'negocio_criado', v_ator,
              jsonb_build_object('etapa_id', new.etapa_id, 'origem_id', new.origem_id, 'responsavel_id', new.responsavel_id, 'valor', new.valor));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.created', v_ator, 'negocio', new.id,
              jsonb_build_object('origem_id', new.origem_id, 'responsavel_id', new.responsavel_id, 'valor', new.valor));
    return null;
  end if;

  if new.etapa_id is distinct from old.etapa_id then
    update public.historico_etapas set saiu_em = now()
      where negocio_id = new.id and saiu_em is null;
    insert into public.historico_etapas (empresa_id, negocio_id, etapa_id, movido_por)
      values (new.empresa_id, new.id, new.etapa_id, v_ator);
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'etapa_alterada', v_ator,
              jsonb_build_object('de', old.etapa_id, 'para', new.etapa_id));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.stage_changed', v_ator, 'negocio', new.id,
              jsonb_build_object('de', old.etapa_id, 'para', new.etapa_id, 'responsavel_id', new.responsavel_id));
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'responsavel_alterado', v_ator,
              jsonb_build_object('de', old.responsavel_id, 'para', new.responsavel_id));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.owner_changed', v_ator, 'negocio', new.id,
              jsonb_build_object('de', old.responsavel_id, 'para', new.responsavel_id));
  end if;

  if new.origem_id is distinct from old.origem_id then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'origem_alterada', v_ator,
              jsonb_build_object('de', old.origem_id, 'para', new.origem_id));
  end if;

  if new.valor is distinct from old.valor then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'valor_alterado', v_ator,
              jsonb_build_object('de', old.valor, 'para', new.valor));
  end if;

  if new.qualif_possui_conta_energia and not coalesce(old.qualif_possui_conta_energia, false)
     and not exists (
       select 1 from public.eventos
       where empresa_id = new.empresa_id and tipo = 'deal.energy_bill_received' and entidade_id = new.id
     )
  then
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.energy_bill_received', v_ator, 'negocio', new.id, '{}'::jsonb);
  end if;

  if new.status is distinct from old.status then
    v_tipo := case new.status when 'ganho' then 'negocio_ganho' when 'perdido' then 'negocio_perdido' else 'negocio_reaberto' end;
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, v_tipo, v_ator,
              jsonb_build_object('valor', new.valor));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id,
              case new.status when 'ganho' then 'deal.won' when 'perdido' then 'deal.lost' else 'deal.reopened' end,
              v_ator, 'negocio', new.id,
              jsonb_build_object('valor', new.valor, 'responsavel_id', new.responsavel_id));

    if old.status = 'ganho' then
      perform public.estornar_lancamentos_evento(new.id, array['deal.won', 'handoff.won']);
    end if;

    if new.status = 'ganho' then
      select p.user_id into v_sdr_user_id
        from public.handoffs h
        join public.empresa_membros p on p.id = h.de_membro_id
        where h.negocio_id = new.id
        order by h.created_at desc
        limit 1;
      if v_sdr_user_id is not null and not exists (
        select 1 from public.eventos
        where empresa_id = new.empresa_id and tipo = 'handoff.won' and entidade_id = new.id
      ) then
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
          values (new.empresa_id, 'handoff.won', v_sdr_user_id, 'negocio', new.id,
                  jsonb_build_object('valor', new.valor));
      end if;
    end if;
  end if;

  return null;
end;
$$;
