-- Gamificação do SDR (spec RAION_SDR_REGRAS_PERMISSOES, fase 8, §34-36). Segue o padrão já
-- usado no resto do sistema: gatilhos de domínio decidem o `ator_id` do evento; o motor
-- genérico (aplicar_regras_gamificacao, 20260926100000) só casa a regra e credita quem for
-- `ator_id`, sem mudança nele. Isso resolve o "bônus de qualidade" do §35 (handoff que virou
-- venda) sem criar um canal lateral de crédito: o SDR do handoff (não o vendedor que fechou)
-- é quem recebe o evento `handoff.won`.
--
-- Eventos novos, cada um "1x por negócio" (§36) via checagem `not exists`:
--   deal.first_contact_done  — SDR conclui a tarefa automática "Realizar primeiro contato" (fase 6).
--   deal.energy_bill_received — campo de qualificação qualif_possui_conta_energia vira true.
--   handoff.created           — "Enviar para vendas": lead entregue, creditado ao SDR (de_membro_id).
--   handoff.won               — negócio com handoff fecha como ganho: bônus creditado ao SDR do handoff.
-- "Reunião agendada"/"Visita agendada" não precisam de evento novo: já dá pra criar uma regra
-- em cima de task.created filtrando payload.tipo = 'reuniao'/'visita' (ver src/lib/gamificacao.ts).

-- Amplia o payload de task.created pra incluir o tipo da tarefa, hoje ausente no catálogo
-- configurável (src/lib/gamificacao.ts já lê `campos`, mas o formulário de condição só oferece
-- os campos declarados ali — sem mudança de schema aqui, só o catálogo em código).

create or replace function public.registrar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_contato uuid;
begin
  if new.negocio_id is not null then
    select contato_id into v_contato from public.negocios where id = new.negocio_id;
  end if;
  if tg_op = 'INSERT' then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_criada', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo, 'vence_em', new.vence_em,
                                   'responsavel_id', new.responsavel_id));
    end if;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'task.created', v_ator, 'tarefa', new.id,
              jsonb_build_object('negocio_id', new.negocio_id, 'tipo', new.tipo, 'responsavel_id', new.responsavel_id));
  elsif new.concluida_em is not null and old.concluida_em is null then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_concluida', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo,
                                   'atrasada', new.concluida_em > new.vence_em));
    end if;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'task.completed', v_ator, 'tarefa', new.id,
              jsonb_build_object('negocio_id', new.negocio_id, 'tipo', new.tipo, 'responsavel_id', new.responsavel_id,
                                 'no_prazo', new.concluida_em <= new.vence_em));

    if new.titulo = 'Realizar primeiro contato' and new.negocio_id is not null
       and not exists (
         select 1 from public.eventos
         where empresa_id = new.empresa_id and tipo = 'deal.first_contact_done' and entidade_id = new.negocio_id
       )
    then
      insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
        values (new.empresa_id, 'deal.first_contact_done', v_ator, 'negocio', new.negocio_id,
                jsonb_build_object('tarefa_id', new.id));
    end if;
  end if;
  return null;
end;
$$;

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

-- "Lead entregue para vendas": credita quem fez o handoff (de_membro_id), não quem recebeu.
create or replace function public.registrar_handoff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.eventos
    where empresa_id = new.empresa_id and tipo = 'handoff.created' and entidade_id = new.negocio_id
  ) then
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'handoff.created', v_ator, 'negocio', new.negocio_id,
              jsonb_build_object('handoff_id', new.id, 'para_membro_id', new.para_membro_id));
  end if;
  return null;
end;
$$;
create trigger handoffs_registrar after insert on public.handoffs
  for each row execute function public.registrar_handoff();
