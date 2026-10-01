-- Fase B da reformulação da gamificação (spec do Evandro, 2026-10-01):
-- marcos comerciais "entrou em negociação" e "contrato assinado".
--
-- 1. `etapas.marca_negociacao`: análogo a `etapas.fecha_como` — o admin
--    marca qual(is) etapa(s) do funil representam negociação. A primeira
--    vez que um negócio entra numa etapa marcada emite `deal.negotiation_started`
--    (guarda permanente por negócio: sair e voltar não pontua de novo,
--    e entrada retroativa — negócio já criado direto numa etapa marcada —
--    também só pontua uma vez, no INSERT).
-- 2. `contrato.assinado`: `deal.won` NÃO representa contrato assinado (são
--    conceitos independentes no produto hoje — negócio pode ser marcado
--    ganho sem nunca ter gerado contrato). Por isso é um evento próprio,
--    emitido quando `contratos.status` entra em 'assinado', com estorno
--    automático (via `estornar_lancamentos_evento`, criada na Fase A)
--    quando o status sai de 'assinado' — simétrico, sem guarda permanente,
--    pra suportar reversão/correção do status sem deixar saldo errado.
--
-- Atribuição dos pontos (pedido explícito do Evandro): os dois eventos
-- creditam o responsável do negócio (`negocios.responsavel_id`), não quem
-- clicou pra mudar a etapa/status — mesmo padrão já usado em `handoff.won`.
-- Se o negócio não tem responsável definido, o evento simplesmente não é
-- emitido (não tem a quem creditar).
--
-- As regras de pontos em si (quantos pontos, condições) continuam sendo
-- configuradas pelo Evandro em Configurações > Gamificação — nenhuma regra
-- é criada por esta migration.

alter table public.etapas add column marca_negociacao boolean not null default false;

-- ---------------------------------------------------------------------------
-- registrar_negocio(): mesmo corpo da migration anterior (20261001130000),
-- acrescentando a emissão de deal.negotiation_started.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_tipo text;
  v_sdr_user_id uuid;
  v_responsavel_user_id uuid;
  v_marca_negociacao boolean;
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

-- ---------------------------------------------------------------------------
-- contrato.assinado: evento simétrico (entra/sai de 'assinado'), creditando
-- o responsável do negócio — não quem atualizou o status do contrato.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_contrato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_responsavel_id uuid;
  v_responsavel_user_id uuid;
begin
  if new.status is distinct from old.status then
    select empresa_id, responsavel_id into v_empresa_id, v_responsavel_id
      from public.negocios where id = new.negocio_id;

    if new.status = 'assinado' and v_responsavel_id is not null then
      select user_id into v_responsavel_user_id from public.empresa_membros where id = v_responsavel_id;
      if v_responsavel_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
          values (v_empresa_id, 'contrato.assinado', v_responsavel_user_id, 'negocio', new.negocio_id, '{}'::jsonb);
      end if;
    end if;

    if old.status = 'assinado' and new.status is distinct from 'assinado' then
      perform public.estornar_lancamentos_evento(new.negocio_id, array['contrato.assinado']);
    end if;
  end if;

  return null;
end;
$$;

create trigger trg_registrar_contrato after update on public.contratos
  for each row execute function public.registrar_contrato();
