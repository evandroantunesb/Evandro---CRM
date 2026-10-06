-- Corretiva pedida pelo Evandro em 2026-10-01, depois da #110 (bônus de contrato
-- originado pelo SDR): auditoria confirmou que `handoff.won` ainda escolhia o SDR
-- via "order by created_at desc limit 1" sobre TODOS os handoffs do negócio —
-- inclusive um handoff `pendente`/`devolvido` mais recente que nunca chegou a ser
-- aceito (nesse caso `perfil_sdr_credito` vem nulo, mas o `de_membro_id` já seria
-- escolhido errado). Exatamente o padrão arbitrário que a #110 evitou ao criar
-- `negocios.handoff_origem_id`.
--
-- Auditoria (resumo, ver fio da thread pro detalhe):
--   1. `handoff.won` dispara em `registrar_negocio()` quando `negocios.status`
--      vira 'ganho' (mudança de etapa do funil, via `etapas.fecha_como`).
--   2. `handoff.contrato_assinado` (#110) dispara em `registrar_contrato()` quando
--      `contratos.status` vira 'assinado' (entidade separada, sem vínculo no
--      banco com o status do negócio — mesmo já confirmado pelo Evandro na Fase B
--      pro par do closer, `deal.won` x `contrato.assinado`).
--   3. Os dois PODEM disparar pro mesmo negócio (etapa ganha e contrato assinado
--      não são a mesma transição) — é o mesmo desenho já aprovado pro par do
--      closer, não um bug novo. Pontuação dupla só ocorre se o admin configurar
--      pontos pros dois tipos de evento ao mesmo tempo em Configurações >
--      Gamificação; isso já é responsabilidade operacional do admin hoje (mesmo
--      risco já existe entre `deal.won` e `contrato.assinado`, aceito na Fase B).
--      Não são o mesmo fato comercial no banco (etapa x documento), então mantidos
--      como eventos separados — cada um correto na própria origem causal.
--
-- Fix: troca a busca arbitrária por `negocios.handoff_origem_id` (o mesmo
-- write-once da #110, gravado só no aceite, nunca sobrescrito). Resultado:
-- nunca escolhe pelo handoff mais recente, nunca recalcula pelo histórico,
-- sempre o SDR causal — consistente com `handoff.contrato_assinado`.
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
      -- Troca a busca arbitrária (order by created_at desc) pela referência
      -- causal write-once da #110: nunca escolhe o handoff mais recente, nunca
      -- recalcula pelo histórico — é o mesmo handoff que originou o closer atual.
      select p.user_id, h.perfil_sdr_credito into v_sdr_user_id, v_sdr_perfil
        from public.handoffs h
        join public.empresa_membros p on p.id = h.de_membro_id
        where h.id = new.handoff_origem_id;
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
