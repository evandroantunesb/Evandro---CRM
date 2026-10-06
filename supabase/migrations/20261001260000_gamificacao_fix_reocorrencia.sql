-- Corretiva pedida pelo Evandro em 2026-10-02, antes da separação XP x moedas.
-- Dois bugs encontrados em revisão (Opus):
--
-- 1. `unica_por_negocio` parou de funcionar. A coluna e a tela de Configurações >
--    Gamificação continuam vivas (`20261001130000_gamificacao_antifraude.sql`), mas o
--    motor (`aplicar_regras_gamificacao()`) perdeu a checagem em duas redefinições
--    seguidas: `20261001170000_gamificacao_aceite_closer.sql` (separou beneficiário de
--    ator e não recopiou o bloco) e `20261001190000_gamificacao_perfis.sql` (perfis),
--    sem nenhuma reintrodução depois. Hoje o checkbox na UI é um no-op silencioso.
--
-- 2. Dois eventos usam uma guarda própria ("evento já existe", `not exists (select 1
--    from eventos ...)`) que confunde "o fato já ocorreu alguma vez" com "existe
--    crédito válido agora": `handoff.won` (`registrar_negocio()`,
--    `20261001230000_gamificacao_handoff_won_causal.sql`) e `handoff.contrato_assinado`
--    (`registrar_contrato()`, `20261001220000_gamificacao_contrato_sdr.sql`). Os dois
--    são pareados com `estornar_lancamentos_evento`, que só mexe em `point_ledger`
--    (marca `estornado`), nunca em `eventos` — a linha do evento original nunca some.
--    Resultado: depois de um estorno (negócio reaberto/perdido, contrato sai de
--    assinado), o evento nunca mais credita de novo, mesmo numa reocorrência
--    legítima (reabre e fecha ganho de novo; reassina o contrato).
--
-- Por que o fix é centralizado no motor, não um guard por evento: os pares
-- `deal.won`/`contrato.assinado` (irmãos de `handoff.won`/`handoff.contrato_assinado`
-- no mesmo par de estorno) e `pagamento.confirmado` (que SEMPRE insere um evento novo
-- em `confirmar_pagamento()`, sem guarda nenhuma) já dependem só do motor pra impedir
-- pontuação duplicada enquanto o crédito está ativo — prova de que o padrão correto já
-- existe no sistema e os dois guards extras são a exceção indevida, não a regra.
-- Restaurar `unica_por_negocio` no motor (checando `point_ledger` com `not estornado`,
-- igual à implementação original) resolve os dois bugs ao mesmo tempo: bloqueia
-- repetição/farm enquanto o crédito está ativo (bug 1) e libera nova pontuação assim
-- que o crédito anterior é formalmente estornado (bug 2) — sem distinguir "eventos
-- permanentes" (`deal.negotiation_started`, `deal.qualified`, `deal.energy_bill_received`,
-- `deal.first_contact_done`, `handoff.created`) dos reversíveis: nenhum deles tem
-- `estornar_lancamentos_evento` apontando pra eles, então o `not exists` que já têm
-- continua correto e intocado nesta PR (confirmado por auditoria completa de todos os
-- `estornar_lancamentos_evento`/`estornar_lancamentos_do_evento` do projeto antes de
-- codar).
--
-- Nenhum lançamento antigo é apagado ou alterado aqui: o motor só passa a enxergar
-- "existe crédito ativo" via `point_ledger.estornado`, exatamente como já fazia pro
-- teto de `limite_periodo`/`limite_quantidade` logo abaixo no mesmo loop.

-- ---------------------------------------------------------------------------
-- 1. Motor: restaura a checagem de unica_por_negocio (mesma lógica da versão
--    original, antes de ser derrubada), preservando perfis/profile_at_event da
--    #gamificacao-perfis sem nenhuma outra mudança de comportamento.
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

    -- "Crédito ativo", não "fato já ocorreu alguma vez": um estorno (ver
    -- estornar_lancamentos_evento/estornar_lancamentos_do_evento) marca
    -- point_ledger.estornado = true sem jamais apagar a linha nem o evento de
    -- origem, então uma reocorrência legítima depois do estorno volta a
    -- pontuar normalmente — só repetição/farm enquanto o crédito anterior
    -- segue ativo é bloqueada.
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
      (empresa_id, membro_id, regra_id, evento_id, pontos, descricao, referencia_tipo, referencia_id, profile_at_event)
      values (new.empresa_id, v_membro_id, v_regra.id, new.id, v_regra.pontos, v_regra.nome, new.entidade, new.entidade_id, v_perfil);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. registrar_negocio(): remove a guarda "evento já existe" de handoff.won —
--    idêntico ao irmão deal.won no mesmo par de estorno, que nunca teve essa
--    guarda e já reocorre corretamente hoje. Resto da função intocado.
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
      -- Mesma referência causal write-once da #110 (handoff_origem_id, nunca
      -- recalculada). A guarda "evento já existe" que havia aqui foi removida:
      -- quem impede pontuação duplicada enquanto o crédito está ativo é o
      -- motor (unica_por_negocio em aplicar_regras_gamificacao), que também é
      -- o único jeito de permitir uma reocorrência legítima depois do estorno
      -- em old.status = 'ganho' acima.
      select p.user_id, h.perfil_sdr_credito into v_sdr_user_id, v_sdr_perfil
        from public.handoffs h
        join public.empresa_membros p on p.id = h.de_membro_id
        where h.id = new.handoff_origem_id;
      if v_sdr_user_id is not null then
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
-- 3. registrar_contrato(): remove a guarda "evento já existe" de
--    handoff.contrato_assinado — idêntico ao irmão contrato.assinado no mesmo
--    par de estorno, que nunca teve essa guarda. Resto da função intocado.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_contrato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_empresa_id uuid;
  v_responsavel_id uuid;
  v_responsavel_user_id uuid;
  v_handoff_origem_id uuid;
  v_sdr_user_id uuid;
  v_sdr_perfil public.perfil_gamificacao;
begin
  if new.status is distinct from old.status then
    select empresa_id, responsavel_id, handoff_origem_id into v_empresa_id, v_responsavel_id, v_handoff_origem_id
      from public.negocios where id = new.negocio_id;

    if new.status = 'assinado' and v_responsavel_id is not null then
      select user_id into v_responsavel_user_id from public.empresa_membros where id = v_responsavel_id;
      if v_responsavel_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
          values (v_empresa_id, 'contrato.assinado', v_responsavel_user_id, 'negocio', new.negocio_id, '{}'::jsonb);
      end if;
    end if;

    -- Guarda "evento já existe" removida (motor cuida da reocorrência via
    -- unica_por_negocio, igual ao par contrato.assinado/handoff.contrato_assinado
    -- já dependia pro irmão acima).
    if new.status = 'assinado' and v_handoff_origem_id is not null then
      select p.user_id, h.perfil_sdr_credito into v_sdr_user_id, v_sdr_perfil
        from public.handoffs h
        join public.empresa_membros p on p.id = h.de_membro_id
        where h.id = v_handoff_origem_id;
      if v_sdr_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
          values (v_empresa_id, 'handoff.contrato_assinado', v_ator, v_sdr_user_id, 'negocio', new.negocio_id, '{}'::jsonb, v_sdr_perfil);
      end if;
    end if;

    if old.status = 'assinado' and new.status is distinct from 'assinado' then
      perform public.estornar_lancamentos_evento(new.negocio_id, array['contrato.assinado', 'handoff.contrato_assinado']);
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Dado existente: regras já configuradas pra handoff.won/handoff.contrato_assinado
--    dependiam só da guarda de código (nunca precisaram marcar o checkbox). Liga
--    unica_por_negocio nelas pra manter o comportamento observado hoje (sem
--    duplicar pontuação enquanto o crédito está ativo), agora via motor.
-- ---------------------------------------------------------------------------

update public.gamification_rules
  set unica_por_negocio = true
  where evento_tipo in ('handoff.won', 'handoff.contrato_assinado') and not unica_por_negocio;
