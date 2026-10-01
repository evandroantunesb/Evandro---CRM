-- Fechamento do handoff SDR → Closer (item 6 da spec de fechamento, Evandro
-- 2026-10-01). Critérios de aceite combinados:
--   1. Closer destinatário (`para_membro_id`) e admin/gestor autorizado podem
--      aceitar/devolver — não só o closer.
--   2. Quando admin/gestor agir, `ator_id` é quem clicou, mas o crédito de
--      pontos continua no SDR de origem (beneficiario_id).
--   3. `responsavel_id` só muda no aceite (já valia desde a #106, mantido).
--   4. Devolução mantém o negócio com o SDR, motivo obrigatório (já valia).
--   5. Timeline/eventos registram quem decidiu (ator_id), quando (created_at)
--      e o motivo — e agora também se foi por delegação (admin/gestor, não o
--      closer destinatário).
--   6. Notificação correta: closer no envio ("aguardando seu aceite", não
--      mais "recebido" — a transferência só acontece no aceite agora), SDR
--      na devolução (notificação nova, não existia).
--   7. Dupla resposta concorrente: já impedida estruturalmente desde a #106
--      (`for update` trava a linha; quem perde a corrida vê status ≠
--      pendente e recebe o erro "já foi respondida") — sem mudança aqui,
--      só testado nesta PR.
--   8. Só 1 handoff pendente por negócio: já garantido pelo índice único
--      parcial da #106, sem mudança.
--   9. RLS: já cobre o necessário (admin/gestor sempre enxergam via
--      `pode_ver_responsavel`/`tem_papel`; closer pendente via
--      `e_closer_de_handoff_pendente`) — sem mudança aqui.
--  10. Evento `oportunidade_aceita` (nome definitivo, substitui o
--      provisório `handoff.aceito`) credita o SDR de origem
--      (beneficiario_id), não quem clicou, com `profile_at_event` já
--      congelado no momento do aceite (mesmo padrão do bônus tardio de
--      `handoff.won`, que continua intocado).
--
-- Também corrige uma regressão encontrada nesta revisão: a migration da #106
-- redefiniu `registrar_handoff()` e, sem querer, derrubou a notificação
-- "handoff_recebido" que existia desde a PR #94 — o closer parou de ser
-- avisado quando uma oportunidade chegava. Restaurada aqui com o texto
-- atualizado pro fluxo de aceite.

-- ---------------------------------------------------------------------------
-- 1. Novo tipo de notificação pra devolução (SDR precisa ser avisado).
-- ---------------------------------------------------------------------------

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido'));

-- ---------------------------------------------------------------------------
-- 2. registrar_handoff(): restaura a notificação ao closer (regressão da
--    #106), com texto atualizado — ele precisa aceitar, não só "recebeu".
-- ---------------------------------------------------------------------------

create or replace function public.registrar_handoff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
begin
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (new.empresa_id, new.negocio_id, new.contato_id, 'handoff_enviado', v_ator,
            jsonb_build_object('handoff_id', new.id, 'para_membro_id', new.para_membro_id));
  if not exists (
    select 1 from public.eventos
    where empresa_id = new.empresa_id and tipo = 'handoff.created' and entidade_id = new.negocio_id
  ) then
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'handoff.created', v_ator, 'negocio', new.negocio_id,
              jsonb_build_object('handoff_id', new.id, 'para_membro_id', new.para_membro_id));
  end if;

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
    values (new.empresa_id, new.para_membro_id, 'handoff_recebido', 'Você tem uma oportunidade aguardando seu aceite.',
            '/negocios/' || new.negocio_id);

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. aceitar_handoff(): admin/gestor também podem aceitar; evento renomeado
--    pra oportunidade_aceita, creditando o SDR de origem com o perfil
--    congelado no momento (mesmo valor gravado em perfil_sdr_credito).
-- ---------------------------------------------------------------------------

create or replace function public.aceitar_handoff(p_handoff_id uuid)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
  v_perfil_sdr public.perfil_gamificacao;
  v_sdr_user_id uuid;
  v_por_delegacao boolean;
begin
  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or
     (v_meu_membro_id <> v_handoff.para_membro_id and not public.tem_papel(v_handoff.empresa_id, '{admin,gestor}'))
  then
    raise exception 'Você não pode aceitar essa oportunidade.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_por_delegacao := v_meu_membro_id <> v_handoff.para_membro_id;

  select perfil_gamificacao, user_id into v_perfil_sdr, v_sdr_user_id from public.empresa_membros where id = v_handoff.de_membro_id;

  update public.handoffs
    set status = 'aceito', respondido_por = v_meu_membro_id, respondido_em = now(), perfil_sdr_credito = v_perfil_sdr
    where id = p_handoff_id
    returning * into v_handoff;

  update public.negocios set responsavel_id = v_handoff.para_membro_id where id = v_handoff.negocio_id;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_handoff.empresa_id, v_handoff.negocio_id, v_handoff.contato_id, 'handoff_aceito', v_ator,
            jsonb_build_object('handoff_id', v_handoff.id, 'de_membro_id', v_handoff.de_membro_id, 'por_delegacao', v_por_delegacao));

  -- oportunidade_aceita substitui o handoff.aceito provisório da #106: o
  -- beneficiário dos pontos é sempre o SDR de origem (v_sdr_user_id), nunca
  -- quem clicou (v_ator, que pode ser o próprio closer ou um admin/gestor
  -- agindo por delegação) — profile_at_event já sai congelado.
  if v_sdr_user_id is not null then
    insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
      values (v_handoff.empresa_id, 'oportunidade_aceita', v_ator, v_sdr_user_id, 'negocio', v_handoff.negocio_id,
              jsonb_build_object('handoff_id', v_handoff.id, 'de_membro_id', v_handoff.de_membro_id, 'por_delegacao', v_por_delegacao),
              v_perfil_sdr);
  end if;

  return v_handoff;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. devolver_handoff(): admin/gestor também podem devolver; notifica o SDR
--    de origem (novo) com o motivo.
-- ---------------------------------------------------------------------------

create or replace function public.devolver_handoff(p_handoff_id uuid, p_motivo text)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
  v_motivo text := nullif(trim(p_motivo), '');
  v_por_delegacao boolean;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo da devolução.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or
     (v_meu_membro_id <> v_handoff.para_membro_id and not public.tem_papel(v_handoff.empresa_id, '{admin,gestor}'))
  then
    raise exception 'Você não pode devolver essa oportunidade.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_por_delegacao := v_meu_membro_id <> v_handoff.para_membro_id;

  update public.handoffs
    set status = 'devolvido', respondido_por = v_meu_membro_id, respondido_em = now(), motivo_devolucao = v_motivo
    where id = p_handoff_id
    returning * into v_handoff;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_handoff.empresa_id, v_handoff.negocio_id, v_handoff.contato_id, 'handoff_devolvido', v_ator,
            jsonb_build_object('handoff_id', v_handoff.id, 'motivo', v_motivo, 'por_delegacao', v_por_delegacao));
  insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
    values (v_handoff.empresa_id, 'handoff.devolvido', v_ator, 'negocio', v_handoff.negocio_id,
            jsonb_build_object('handoff_id', v_handoff.id, 'motivo', v_motivo, 'por_delegacao', v_por_delegacao));

  if v_handoff.de_membro_id is not null then
    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (v_handoff.empresa_id, v_handoff.de_membro_id, 'handoff_devolvido',
              'Sua oportunidade foi devolvida: ' || v_motivo, '/negocios/' || v_handoff.negocio_id);
  end if;

  return v_handoff;
end;
$$;
