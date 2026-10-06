-- Corrige o beneficiário de `deal.won` (pedido do Evandro, 2026-10-02, antes da correção
-- causal de valor pós-ganho): hoje `beneficiario_id` fica null em `deal.won`, e o motor
-- (`aplicar_regras_gamificacao`, `coalesce(new.beneficiario_id, new.ator_id)`) credita XP/
-- moedas pra quem clicou em "ganho" (`ator_id`) — não pro responsável comercial do negócio.
-- Isso diverge do próprio `profile_at_event`, que já era o perfil do responsável: se um
-- gestor/admin fecha o negócio no lugar do closer, o XP ia pro gestor mas filtrado pelo
-- perfil do closer, uma inconsistência interna.
--
-- A partir de agora, `deal.won` passa a ser:
--   ator_id         = quem executou a ação (inalterado);
--   beneficiario_id = responsável comercial do negócio no momento do ganho
--                     (empresa_membros.user_id de new.responsavel_id, o mesmo id já
--                     congelado em payload.responsavel_id — nunca um lookup que pudesse
--                     divergir, nunca o responsável atual se mudar depois);
--   profile_at_event = perfil desse mesmo beneficiário (comportamento já correto antes,
--                      mantido, só deixou de divergir do beneficiario_id).
--
-- Escopo deliberadamente restrito a `deal.won` (status = 'ganho') — `deal.lost`/
-- `deal.reopened` continuam sem beneficiario_id, como já era antes: não fazem parte do
-- pedido e nenhuma regra de gamificação os usa hoje. Sem backfill de eventos históricos
-- (decisão explícita do Evandro) — só `deal.won` novos, a partir desta migration, nascem
-- com beneficiário correto.

create or replace function public.registrar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_ator_perfil public.perfil_gamificacao;
  v_tipo text;
  v_sdr_user_id uuid;
  v_sdr_perfil public.perfil_gamificacao;
  v_responsavel_user_id uuid;
  v_responsavel_perfil public.perfil_gamificacao;
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
        select perfil_gamificacao into v_responsavel_perfil from public.empresa_membros where id = new.responsavel_id;
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload, profile_at_event)
          values (new.empresa_id, 'deal.negotiation_started', v_responsavel_user_id, 'negocio', new.id, '{}'::jsonb, v_responsavel_perfil);
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
        select perfil_gamificacao into v_responsavel_perfil from public.empresa_membros where id = new.responsavel_id;
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload, profile_at_event)
          values (new.empresa_id, 'deal.negotiation_started', v_responsavel_user_id, 'negocio', new.id, '{}'::jsonb, v_responsavel_perfil);
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
      select perfil_gamificacao into v_ator_perfil from public.empresa_membros where empresa_id = new.empresa_id and user_id = v_ator;
      insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload, profile_at_event)
        values (new.empresa_id, 'deal.qualified', v_ator, 'negocio', new.id, '{}'::jsonb, v_ator_perfil);
    end if;
  end if;

  if new.status is distinct from old.status then
    v_tipo := case new.status when 'ganho' then 'negocio_ganho' when 'perdido' then 'negocio_perdido' else 'negocio_reaberto' end;
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, v_tipo, v_ator,
              jsonb_build_object('valor', new.valor));

    -- Beneficiário comercial de deal.won: o responsável pelo negócio no momento do ganho
    -- (nunca quem clicou) — mesmo empresa_membros.id já congelado em payload.responsavel_id,
    -- sem lookup separado que pudesse divergir. Só pra 'ganho': deal.lost/deal.reopened
    -- continuam sem beneficiario_id, como já era (fora do escopo deste pedido).
    v_responsavel_user_id := case when new.status = 'ganho'
      then (select user_id from public.empresa_membros where id = new.responsavel_id)
      else null end;
    select perfil_gamificacao into v_responsavel_perfil from public.empresa_membros where id = new.responsavel_id;
    insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
      values (new.empresa_id,
              case new.status when 'ganho' then 'deal.won' when 'perdido' then 'deal.lost' else 'deal.reopened' end,
              v_ator, v_responsavel_user_id, 'negocio', new.id,
              jsonb_build_object('valor', new.valor, 'responsavel_id', new.responsavel_id),
              v_responsavel_perfil);

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
