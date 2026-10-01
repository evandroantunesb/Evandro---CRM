-- Fluxo de aceite do closer (spec aprovada pelo Evandro, 2026-10-01): "SDR envia
-- oportunidade" → "Aguardando aceite" → closer "Aceita" ou "Devolve". Reaproveita a
-- tabela `handoffs` existente (fase 5 SDR) em vez de criar um conceito novo.
--
-- Mudança de comportamento: hoje `enviarParaVendas()` já transfere `responsavel_id`
-- pro closer na hora do envio. A partir desta migration, a transferência só acontece
-- no aceite — enquanto pendente ou se devolvido, o negócio continua com o SDR.
--
-- Ajustes pedidos pelo Evandro antes de implementar:
--   1. `ator_id` do evento é sempre quem executou a ação; quem ganha pontos (quando
--      não é o próprio ator) vai no novo `eventos.beneficiario_id`. Corrige o
--      `handoff.won`, que hoje sobrecarrega `ator_id` com o SDR em vez do vendedor
--      que realmente fechou o negócio.
--   2. No máximo um handoff `pendente` por negócio (índice único parcial).
--   3. Aceite/devolução são atômicos e só valem com `status = 'pendente'`
--      (funções security definer com `for update`, chamadas via RPC).
--   4. Handoff devolvido nunca reabre; um novo envio cria uma linha nova.
--   5. Timeline (`atividades`) + eventos (`eventos`) pra envio, aceite e devolução —
--      isso também deixa taxa de aceitação por SDR de graça (status + de_membro_id
--      já ficam na própria linha do handoff).
--   6. RLS: o closer precisa ver o negócio (e dados ligados: contato, atividades,
--      tarefas, notas, anexos, proposta, contrato, cálculo) enquanto o handoff dele
--      está pendente, mesmo com `responsavel_id` ainda no SDR — estende o helper
--      central `pode_ver_negocio` (reaproveitado por quase toda política do app) e
--      `pode_ver_contato_linha`, em vez de duplicar a regra em cada tabela.
--   7. Estado do handoff fica visível na tela do negócio (aguardando aceite / aceito
--      / devolvido) — UI em `src/app/(app)/negocios/[id]/`.

-- ---------------------------------------------------------------------------
-- 1. eventos.beneficiario_id — separa "quem agiu" de "quem ganha pontos".
-- ---------------------------------------------------------------------------

alter table public.eventos add column beneficiario_id uuid;

create or replace function public.aplicar_regras_gamificacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_beneficiario uuid := coalesce(new.beneficiario_id, new.ator_id);
  v_membro_id uuid;
  v_regra record;
  v_qtd integer;
  v_desde timestamptz;
begin
  if v_beneficiario is null then
    return new;
  end if;

  select id into v_membro_id from public.empresa_membros
    where empresa_id = new.empresa_id and user_id = v_beneficiario and ativo
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

-- registrar_negocio(): parte do corpo acumulado das Fases A (estorno), B
-- (negotiation_started/contrato) e C (qualified) — PRs #103/#104/#105,
-- empilhadas nesta mesma branch em 2026-10-01 pra consolidar (branches
-- antes independentes causavam CI vermelho: cada uma redefinia a função a
-- partir de uma base diferente e a que mesclasse por último apagaria
-- silenciosamente as outras). Único ajuste desta migration: handoff.won
-- passa a usar beneficiario_id em vez de sobrecarregar ator_id com o SDR.
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
        insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload)
          values (new.empresa_id, 'handoff.won', v_ator, v_sdr_user_id, 'negocio', new.id,
                  jsonb_build_object('valor', new.valor));
      end if;
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2-4. handoffs: status + campos de resposta, índice "só um pendente por negócio".
-- ---------------------------------------------------------------------------

alter table public.handoffs
  add column status text not null default 'pendente',
  add column respondido_por uuid references public.empresa_membros (id) on delete set null,
  add column respondido_em timestamptz,
  add column motivo_devolucao text;

-- Handoffs existentes já tinham o responsável transferido na hora (fluxo antigo, sem
-- aceite/recusa) — marca retroativamente como "aceito" pra não aparecerem como pendentes.
update public.handoffs set status = 'aceito', respondido_em = created_at;

alter table public.handoffs add constraint handoffs_status_check check (status in ('pendente', 'aceito', 'devolvido'));
alter table public.handoffs add constraint handoffs_devolvido_tem_motivo
  check (status <> 'devolvido' or nullif(trim(motivo_devolucao), '') is not null);

create unique index handoffs_negocio_pendente_unico on public.handoffs (negocio_id) where status = 'pendente';

-- Timeline do envio (a tabela `atividades` já registra responsavel_alterado via
-- registrar_negocio, mas isso só volta a acontecer no aceite agora — este evento próprio
-- deixa claro que foi um envio pro closer, não uma reatribuição qualquer).
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
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Aceite/devolução: atômicos, security definer, só com status = 'pendente'.
-- ---------------------------------------------------------------------------

create or replace function public.aceitar_handoff(p_handoff_id uuid)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
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

  update public.handoffs
    set status = 'aceito', respondido_por = v_meu_membro_id, respondido_em = now()
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

revoke insert, update, delete on public.handoffs from anon, authenticated, service_role;
grant insert on public.handoffs to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS: closer vê a oportunidade (e tudo que depende de `pode_ver_negocio` /
-- `pode_ver_contato_linha`) enquanto o handoff dele está pendente, mesmo com
-- `responsavel_id` ainda no SDR.
-- ---------------------------------------------------------------------------

create or replace function public.e_closer_de_handoff_pendente(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.handoffs h
    join public.empresa_membros m on m.id = h.para_membro_id
    where h.negocio_id = p_negocio_id
      and h.status = 'pendente'
      and m.user_id = (select auth.uid())
      and m.ativo
  );
$$;

create or replace function public.pode_ver_negocio(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.pode_ver_responsavel(n.empresa_id, n.responsavel_id) or public.e_closer_de_handoff_pendente(n.id)
    from public.negocios n where n.id = p_negocio_id
  ), false);
$$;

create or replace function public.pode_ver_contato_linha(p_empresa_id uuid, p_contato_id uuid, p_criado_por uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.membro_ativo(p_empresa_id)
    and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or p_criado_por = public.meu_membro_id(p_empresa_id)
      or exists (
        select 1 from public.negocios n
        where n.contato_id = p_contato_id
          and (public.pode_ver_responsavel(n.empresa_id, n.responsavel_id) or public.e_closer_de_handoff_pendente(n.id))
      )
    );
$$;

create policy "closer ve negocio em handoff pendente" on public.negocios for select to authenticated
  using (public.e_closer_de_handoff_pendente(id));

-- `handoffs` já tinha "ver quem vê o negócio" (cobre SDR/gestor/admin via responsavel_id).
-- Falta o closer pendente ver a própria linha antes de aceitar (responsavel_id ainda é o SDR).
create policy "closer ve handoff pendente endereçado a ele" on public.handoffs for select to authenticated
  using (
    status = 'pendente'
    and exists (
      select 1 from public.empresa_membros m
      where m.id = para_membro_id and m.user_id = (select auth.uid()) and m.ativo
    )
  );
