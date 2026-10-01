-- Perfis de gamificação (item 7 da spec de fechamento, Evandro 2026-10-01):
-- separa "perfil de gamificação" (em qual ranking/pontuação a pessoa compete)
-- de `papel` (permissão de acesso, já existente). Gestor/admin não têm perfil
-- de gamificação — ficam fora do ranking comercial por padrão.
--
-- As 3 decisões do Opus, confirmadas pelo Evandro em 2026-10-01:
--   1. Bônus com atraso (ex. handoff.won, que só paga quando o negócio fecha,
--      às vezes semanas depois do SDR já ter virado closer): paga conforme o
--      perfil registrado no evento causal/origem (aqui, o aceite do closer),
--      nunca recalculado pelo cargo atual. Por isso `handoffs` ganha
--      `perfil_sdr_credito`, preenchido no aceite, e `registrar_negocio()`
--      usa esse valor (não o perfil atual do SDR) ao emitir `handoff.won`.
--   2. Troca de perfil no meio do período: aparece nos dois rankings, cada um
--      só com a fração de pontos ganha naquele perfil — é o que
--      `profile_at_event` permite naturalmente (nunca recalculado).
--   3. Gestor/admin mantêm o saldo de moedas já acumulado ao sair do ranking
--      comercial (não zera); só saem da disputa dali pra frente. Resgate de
--      loja nunca soma no ranking (ele nunca passa por
--      `aplicar_regras_gamificacao`, então nunca tem `profile_at_event`) —
--      corrige de tabela o bug que o diagnóstico do Opus encontrou.
--
-- `profile_at_event` é a fonte da verdade, gravado em `eventos` e copiado pro
-- `point_ledger` no momento do lançamento — nunca recalculado depois.

-- ---------------------------------------------------------------------------
-- 1. Enum + colunas
-- ---------------------------------------------------------------------------

create type public.perfil_gamificacao as enum ('sdr', 'closer', 'cs_farmer');

-- Perfil de gamificação do membro hoje. Null = não participa do ranking
-- comercial (uso típico: admin/gestor). Deliberadamente separado de `papel`
-- (permissão) — um `vendedor` só compete como `closer` se o admin marcar.
alter table public.empresa_membros add column perfil_gamificacao public.perfil_gamificacao;

-- Regra de pontos pode valer só pra um perfil (ex.: "contrato assinado" só
-- pra closer) ou, se null, pra qualquer perfil (ex.: regras legadas de
-- nota/tarefa, que não diferenciam SDR de closer).
alter table public.gamification_rules add column perfil_aplicavel public.perfil_gamificacao;

-- Perfil do beneficiário no momento em que o evento aconteceu. Preenchido
-- normalmente pelo próprio gatilho que resolve o beneficiário (ver
-- aplicar_regras_gamificacao abaixo); só é passado explicitamente na
-- inserção do evento quando o beneficiário do crédito não é quem está ativo
-- "agora" — caso do bônus com atraso (decisão 1).
alter table public.eventos add column profile_at_event public.perfil_gamificacao;

-- Extrato grava o perfil no momento do lançamento — histórico nunca muda
-- com uma promoção/troca de perfil posterior (decisão 2).
alter table public.point_ledger add column profile_at_event public.perfil_gamificacao;

-- Snapshot do perfil do SDR de origem, tirado no aceite (o evento causal da
-- relação SDR→closer) — usado depois por handoff.won, que só dispara quando
-- o negócio fecha, possivelmente após o SDR já ter trocado de perfil
-- (decisão 1).
alter table public.handoffs add column perfil_sdr_credito public.perfil_gamificacao;

-- ---------------------------------------------------------------------------
-- 2. aceitar_handoff(): snapshot do perfil do SDR no momento do aceite.
-- ---------------------------------------------------------------------------

-- Corpo idêntico ao da migration anterior (20261001170000) — só acrescenta
-- o snapshot de perfil_sdr_credito no aceite. A regra de quem pode
-- aceitar/devolver (hoje só para_membro_id) é escopo da próxima PR
-- ("Fechamento do handoff SDR → Closer", item 6 da spec), não desta.
create or replace function public.aceitar_handoff(p_handoff_id uuid)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
  v_perfil_sdr public.perfil_gamificacao;
begin
  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or v_meu_membro_id <> v_handoff.para_membro_id then
    raise exception 'Só o vendedor pra quem a oportunidade foi enviada pode aceitar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select perfil_gamificacao into v_perfil_sdr from public.empresa_membros where id = v_handoff.de_membro_id;

  update public.handoffs
    set status = 'aceito', respondido_por = v_meu_membro_id, respondido_em = now(), perfil_sdr_credito = v_perfil_sdr
    where id = p_handoff_id
    returning * into v_handoff;

  update public.negocios set responsavel_id = v_handoff.para_membro_id where id = v_handoff.negocio_id;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_handoff.empresa_id, v_handoff.negocio_id, v_handoff.contato_id, 'handoff_aceito', v_ator,
            jsonb_build_object('handoff_id', v_handoff.id, 'de_membro_id', v_handoff.de_membro_id));
  insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
    values (v_handoff.empresa_id, 'handoff.aceito', v_ator, 'negocio', v_handoff.negocio_id,
            jsonb_build_object('handoff_id', v_handoff.id, 'de_membro_id', v_handoff.de_membro_id));

  return v_handoff;
end;
$$;

-- devolver_handoff() não muda de comportamento (sem perfil envolvido — a
-- oportunidade volta pro SDR, nada pontua); redefinida só porque
-- create or replace exige o corpo completo.
create or replace function public.devolver_handoff(p_handoff_id uuid, p_motivo text)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
  v_motivo text := nullif(trim(p_motivo), '');
begin
  if v_motivo is null then
    raise exception 'Informe o motivo da devolução.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or v_meu_membro_id <> v_handoff.para_membro_id then
    raise exception 'Só o vendedor pra quem a oportunidade foi enviada pode devolver.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.handoffs
    set status = 'devolvido', respondido_por = v_meu_membro_id, respondido_em = now(), motivo_devolucao = v_motivo
    where id = p_handoff_id
    returning * into v_handoff;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_handoff.empresa_id, v_handoff.negocio_id, v_handoff.contato_id, 'handoff_devolvido', v_ator,
            jsonb_build_object('handoff_id', v_handoff.id, 'motivo', v_motivo));
  insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
    values (v_handoff.empresa_id, 'handoff.devolvido', v_ator, 'negocio', v_handoff.negocio_id,
            jsonb_build_object('handoff_id', v_handoff.id, 'motivo', v_motivo));

  return v_handoff;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. registrar_negocio(): mesmo corpo acumulado (103→104→105→106), só muda a
--    emissão de handoff.won pra usar o perfil gravado no aceite em vez do
--    perfil atual do SDR (decisão 1).
-- ---------------------------------------------------------------------------

create or replace function public.registrar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_tipo text;
  v_sdr_user_id uuid;
  v_sdr_perfil public.perfil_gamificacao;
  v_responsavel_user_id uuid;
  v_marca_negociacao boolean;
  v_telefone text;
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

    select marca_negociacao into v_marca_negociacao from public.etapas where id = new.etapa_id;
    if v_marca_negociacao and new.responsavel_id is not null then
      select user_id into v_responsavel_user_id from public.empresa_membros where id = new.responsavel_id;
      if v_responsavel_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
          values (new.empresa_id, 'deal.negotiation_started', v_responsavel_user_id, 'negocio', new.id, '{}'::jsonb);
      end if;
    end if;

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

    select marca_negociacao into v_marca_negociacao from public.etapas where id = new.etapa_id;
    if v_marca_negociacao and new.responsavel_id is not null and not exists (
      select 1 from public.eventos
      where empresa_id = new.empresa_id and tipo = 'deal.negotiation_started' and entidade_id = new.id
    ) then
      select user_id into v_responsavel_user_id from public.empresa_membros where id = new.responsavel_id;
      if v_responsavel_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
          values (new.empresa_id, 'deal.negotiation_started', v_responsavel_user_id, 'negocio', new.id, '{}'::jsonb);
      end if;
    end if;
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

  if (new.qualif_objetivo is distinct from old.qualif_objetivo or new.qualif_e_decisor is distinct from old.qualif_e_decisor)
     and not exists (
       select 1 from public.eventos
       where empresa_id = new.empresa_id and tipo = 'deal.qualified' and entidade_id = new.id
     )
  then
    select telefone into v_telefone from public.contatos where id = new.contato_id;
    if nullif(trim(v_telefone), '') is not null and nullif(trim(new.qualif_objetivo), '') is not null and new.qualif_e_decisor is not null then
      insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
        values (new.empresa_id, 'deal.qualified', v_ator, 'negocio', new.id, '{}'::jsonb);
    end if;
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
      select p.user_id, h.perfil_sdr_credito into v_sdr_user_id, v_sdr_perfil
        from public.handoffs h
        join public.empresa_membros p on p.id = h.de_membro_id
        where h.negocio_id = new.id
        order by h.created_at desc
        limit 1;
      if v_sdr_user_id is not null and not exists (
        select 1 from public.eventos
        where empresa_id = new.empresa_id and tipo = 'handoff.won' and entidade_id = new.id
      ) then
        -- profile_at_event vem do perfil gravado no aceite (decisão 1 do
        -- Evandro: bônus com atraso paga pelo perfil de origem, não pelo
        -- perfil atual do SDR).
        insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
          values (new.empresa_id, 'handoff.won', v_ator, v_sdr_user_id, 'negocio', new.id,
                  jsonb_build_object('valor', new.valor), v_sdr_perfil);
      end if;
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. aplicar_regras_gamificacao(): resolve o perfil do beneficiário (ou usa
--    o perfil já gravado explicitamente no evento, caso do bônus com
--    atraso), filtra regras por perfil e grava profile_at_event no extrato.
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_regras_gamificacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_beneficiario uuid := coalesce(new.beneficiario_id, new.ator_id);
  v_membro_id uuid;
  v_perfil_membro public.perfil_gamificacao;
  v_perfil public.perfil_gamificacao;
  v_regra record;
  v_qtd integer;
  v_desde timestamptz;
begin
  if v_beneficiario is null then
    return new;
  end if;

  select id, perfil_gamificacao into v_membro_id, v_perfil_membro from public.empresa_membros
    where empresa_id = new.empresa_id and user_id = v_beneficiario and ativo
    limit 1;
  if v_membro_id is null then
    return new;
  end if;

  -- Eventos imediatos (a maioria) não trazem profile_at_event pré-definido —
  -- usa o perfil atual do beneficiário. Só o bônus com atraso (handoff.won)
  -- chega com profile_at_event já resolvido no evento de origem, e esse
  -- valor prevalece (nunca recalculado pelo cargo atual).
  v_perfil := coalesce(new.profile_at_event, v_perfil_membro);

  for v_regra in
    select * from public.gamification_rules
    where empresa_id = new.empresa_id and evento_tipo = new.tipo and ativa
      and (perfil_aplicavel is null or perfil_aplicavel = v_perfil)
  loop
    if not public.avaliar_condicao_regra(new.payload, v_regra.condicao) then
      continue;
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
      (empresa_id, membro_id, regra_id, evento_id, pontos, descricao, referencia_tipo, referencia_id, profile_at_event)
      values (new.empresa_id, v_membro_id, v_regra.id, new.id, v_regra.pontos, v_regra.nome, new.entidade, new.entidade_id, v_perfil);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ranking separado por perfil (também fecha o bug que o diagnóstico do
--    Opus encontrou: resgate de loja nunca passa por aplicar_regras_
--    gamificacao, então nunca tem profile_at_event — e agora o ranking só
--    soma linhas com profile_at_event preenchido, então resgates já saem
--    naturalmente de fora).
-- ---------------------------------------------------------------------------

drop function if exists public.ranking_gamificacao(uuid, timestamptz);

create or replace function public.ranking_gamificacao(p_empresa_id uuid, p_perfil public.perfil_gamificacao, p_desde timestamptz default null)
returns table (membro_id uuid, total_pontos bigint)
language sql stable security definer set search_path = ''
as $$
  select l.membro_id, sum(l.pontos)::bigint as total_pontos
  from public.point_ledger l
  where l.empresa_id = p_empresa_id
    and l.profile_at_event = p_perfil
    and not l.estornado
    and (p_desde is null or l.created_at >= p_desde)
    and public.membro_ativo(p_empresa_id)
  group by l.membro_id
  order by total_pontos desc;
$$;

revoke all on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz) from public;
grant execute on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz) to authenticated;
