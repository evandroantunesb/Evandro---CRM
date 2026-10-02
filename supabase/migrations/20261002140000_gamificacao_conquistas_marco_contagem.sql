-- Conquistas por marco de evento (Evandro, 2026-10-02), segunda metrica de criterio
-- além de "xp_acumulado". Decisão central das auditorias anteriores: o fato comercial
-- (evento) é independente da regra de pontuação — uma empresa deve poder ter uma
-- conquista de "10 contratos assinados" mesmo que `contrato.assinado` conceda 0 XP ou
-- não tenha `gamification_rule` ativa. Por isso este motor lê só `eventos` + as tabelas
-- de estado vivo (`negocios`, `contratos`, `confirmacoes_pagamento`) — nunca
-- `gamification_rules` nem `point_ledger` — e roda num gatilho próprio, separado de
-- `avaliar_conquistas_pontos()`.
--
-- Marcos cobertos nesta PR (catálogo fechado após auditoria de atribuição/perfil):
-- deal.qualified, deal.negotiation_started (fatos permanentes — contam direto de
-- `eventos`, guarda de emissão já impede duplicata); contrato.assinado, deal.won,
-- handoff.won, pagamento.confirmado (estados reversíveis — contam o estado AO VIVO,
-- nunca a contagem bruta de linhas em `eventos`, pra não contar dobrado um ciclo
-- reaberto/reassinado/reconfirmado). `contrato.assinado` lê `contratos.status` direto
-- (já committed antes do `eventos` ser inserido, dentro do mesmo AFTER UPDATE trigger);
-- `deal.won`/`handoff.won`/`pagamento.confirmado` usam o par de eventos mais recente por
-- entidade (nunca a tabela satélite `confirmacoes_pagamento`, que só é gravada DEPOIS do
-- insert em `eventos` dentro de `confirmar_pagamento()` — ainda não existiria no instante
-- em que este gatilho roda). Reunião e visita realizadas ficam de fora até a PR #109
-- (`tarefas.resultado`) mesclar — não há fonte causal aceitável hoje sem usar
-- `task.completed` genérico, que o Evandro vetou explicitamente como workaround.
--
-- Atribuição (beneficiário) é sempre a fonte causal/congelada no momento da transição,
-- nunca o responsável atual do negócio (que pode mudar depois por redistribuição):
--   - deal.qualified / deal.negotiation_started: `ator_id` do evento (quem qualificou /
--     o responsável no momento da transição para negociação) — mesma leitura que
--     `aplicar_regras_gamificacao()` já faz pra esses dois tipos.
--   - contrato.assinado: `ator_id` do evento, que já vem do `responsavel_assinatura_id`
--     congelado na assinatura (ver `20261001250000_gamificacao_pagamento_confirmado.sql`).
--   - handoff.won: `beneficiario_id` do evento (o SDR de origem), já congelado.
--   - pagamento.confirmado: `confirmacoes_pagamento.beneficiario_membro_id`, já
--     congelado na assinatura do contrato (nunca o responsável atual).
--   - deal.won: EXCEÇÃO. `ator_id` aqui é só quem clicou pra mudar o status (pode ser um
--     gestor fechando em nome de alguém, ou a etapa fechando automaticamente) — não é
--     fonte segura de crédito. A fonte causal correta é `payload->>'responsavel_id'`
--     (gravado por `registrar_negocio()` no mesmo instante da transição, e que já é um
--     `empresa_membros.id`, não um `auth.users.id` como os demais ator_id/beneficiario_id)
--     — nunca o `negocios.responsavel_id` atual, que pode ter sido reatribuído depois.
--
-- Perfil aplicável usa o mesmo princípio: `profile_at_event` quando o evento já o grava
-- congelado (só `handoff.won` hoje), senão o perfil atual do membro (igual ao que
-- `aplicar_regras_gamificacao()` já faz pros eventos imediatos).
--
-- `ativa_desde` (retroatividade): sem desbloqueio retroativo automático — só eventos a
-- partir de quando a conquista foi criada contam, tanto no desbloqueio marginal (gatilho)
-- quanto na recontagem completa a cada avaliação (idêntico ao papel do corte em qualquer
-- reavaliação, pra não inflar quando a conquista é reativada depois de desativada).
-- Imutável depois de criada (trigger abaixo) — "desde quando essa conquista existe no
-- sistema" nunca é redefinido por toggles de `ativa` nem por edição administrativa.
--
-- Não mexe nos invariantes já fechados de XP/moedas, estorno ou reocorrência: nenhuma
-- função de `registrar_negocio`/`registrar_contrato`/`confirmar_pagamento`/
-- `aceitar_handoff`/`aplicar_regras_gamificacao` é redefinida aqui, exceto um filtro
-- aditivo de `perfil_aplicavel` em `avaliar_conquistas_pontos()` (todo-não-filtrado
-- continua idêntico pra toda conquista existente, já que a coluna nova nasce `null`).

alter table public.conquistas add column perfil_aplicavel public.perfil_gamificacao;
alter table public.conquistas add column ativa_desde timestamptz not null default now();

create or replace function public.conquistas_impedir_mudar_ativa_desde()
returns trigger
language plpgsql
as $$
begin
  if new.ativa_desde is distinct from old.ativa_desde then
    raise exception 'ativa_desde não pode ser alterado depois de criado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger conquistas_ativa_desde_imutavel before update on public.conquistas
  for each row execute function public.conquistas_impedir_mudar_ativa_desde();

-- ---------------------------------------------------------------------------
-- Filtro aditivo de perfil em avaliar_conquistas_pontos() (xp_acumulado) — mesmo
-- padrão de gamification_rules.perfil_aplicavel. Sem mudança de comportamento pra
-- conquista existente (perfil_aplicavel nasce null = geral).
-- ---------------------------------------------------------------------------

create or replace function public.avaliar_conquistas_pontos()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric;
  v_conquista record;
  v_desbloqueio_id uuid;
begin
  if new.estornado then
    return new;
  end if;

  select coalesce(sum(xp), 0) into v_total
    from public.point_ledger
    where membro_id = new.membro_id and not estornado and referencia_tipo <> 'conquista';

  for v_conquista in
    select * from public.conquistas
    where empresa_id = new.empresa_id
      and ativa
      and criterio->>'metrica' = 'xp_acumulado'
      and (perfil_aplicavel is null or perfil_aplicavel = new.profile_at_event)
      and v_total >= (criterio->>'valor')::numeric
      and not exists (
        select 1 from public.conquistas_desbloqueadas cd
        where cd.conquista_id = conquistas.id and cd.membro_id = new.membro_id
      )
  loop
    insert into public.conquistas_desbloqueadas (empresa_id, conquista_id, membro_id)
      values (new.empresa_id, v_conquista.id, new.membro_id)
      on conflict (conquista_id, membro_id) do nothing
      returning id into v_desbloqueio_id;

    if v_desbloqueio_id is null then
      continue;
    end if;

    if v_conquista.xp_bonus > 0 then
      insert into public.point_ledger (empresa_id, membro_id, descricao, referencia_tipo, referencia_id, xp, moedas, profile_at_event)
        values (new.empresa_id, new.membro_id, 'Conquista: ' || v_conquista.nome, 'conquista', v_conquista.id, v_conquista.xp_bonus, 0, new.profile_at_event);
    end if;

    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (new.empresa_id, new.membro_id, 'conquista_desbloqueada', 'Nova conquista desbloqueada: ' || v_conquista.nome, '/gamificacao/jornada');
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo central dos marcos elegíveis: fonte de verdade por marco (fato
-- permanente conta direto de `eventos`; estado reversível conta a tabela dona
-- AO VIVO, usando o `eventos` mais recente daquele tipo só pra atribuição e
-- corte de `ativa_desde`). Função isolada e testável, sem nenhuma referência a
-- `gamification_rules`/`point_ledger`.
-- ---------------------------------------------------------------------------

create or replace function public.contar_marco_membro(
  p_marco text,
  p_empresa_id uuid,
  p_membro_id uuid,
  p_ativa_desde timestamptz
)
returns integer
language plpgsql security definer set search_path = ''
stable
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  if p_marco in ('deal.qualified', 'deal.negotiation_started') then
    select user_id into v_user_id from public.empresa_membros where id = p_membro_id;
    if v_user_id is null then
      return 0;
    end if;
    select count(distinct entidade_id) into v_count
      from public.eventos
      where empresa_id = p_empresa_id and tipo = p_marco and created_at >= p_ativa_desde
        and coalesce(beneficiario_id, ator_id) = v_user_id;
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'contrato.assinado' then
    select count(*) into v_count
      from public.contratos c
      join lateral (
        select e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.tipo = 'contrato.assinado' and e.entidade_id = c.negocio_id
        order by e.created_at desc limit 1
      ) ult on true
      where c.empresa_id = p_empresa_id and c.status = 'assinado'
        and c.responsavel_assinatura_id = p_membro_id
        and ult.created_at >= p_ativa_desde;
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'deal.won' then
    select count(*) into v_count
      from public.negocios n
      join lateral (
        select e.payload, e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.tipo = 'deal.won' and e.entidade_id = n.id
        order by e.created_at desc limit 1
      ) ult on true
      where n.empresa_id = p_empresa_id and n.status = 'ganho'
        and (ult.payload->>'responsavel_id')::uuid = p_membro_id
        and ult.created_at >= p_ativa_desde;
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'handoff.won' then
    select user_id into v_user_id from public.empresa_membros where id = p_membro_id;
    if v_user_id is null then
      return 0;
    end if;
    select count(*) into v_count
      from public.negocios n
      join lateral (
        select e.beneficiario_id, e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.tipo = 'handoff.won' and e.entidade_id = n.id
        order by e.created_at desc limit 1
      ) ult on true
      where n.empresa_id = p_empresa_id and n.status = 'ganho'
        and ult.beneficiario_id = v_user_id
        and ult.created_at >= p_ativa_desde;
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'pagamento.confirmado' then
    -- Não lê `confirmacoes_pagamento` diretamente: a linha dessa tabela só é gravada
    -- DEPOIS do insert em `eventos` dentro de `confirmar_pagamento()` (mesma transação,
    -- mas instrução seguinte) — no instante em que este gatilho roda (AFTER INSERT em
    -- `eventos`), a confirmação ainda não existe. Usa o par
    -- pagamento.confirmado/pagamento.confirmacao_estornada em `eventos` (mesmo padrão dos
    -- outros marcos reversíveis) pra saber se o pagamento está confirmado AO VIVO agora.
    select user_id into v_user_id from public.empresa_membros where id = p_membro_id;
    if v_user_id is null then
      return 0;
    end if;
    select count(*) into v_count
      from public.negocios n
      join lateral (
        select e.tipo, e.beneficiario_id, e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.entidade_id = n.id
          and e.tipo in ('pagamento.confirmado', 'pagamento.confirmacao_estornada')
        order by e.created_at desc limit 1
      ) ult on true
      where n.empresa_id = p_empresa_id
        and ult.tipo = 'pagamento.confirmado'
        and ult.beneficiario_id = v_user_id
        and ult.created_at >= p_ativa_desde;
    return coalesce(v_count, 0);
  end if;

  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilho: toda inserção em `eventos` de um dos marcos suportados reavalia as
-- conquistas de `marco_contagem` daquele marco. Concurrency-safe/idempotente
-- (ON CONFLICT DO NOTHING), nunca aborta a transação comercial que originou o
-- evento, e nunca depende de `gamification_rules`/`point_ledger`.
-- ---------------------------------------------------------------------------

create or replace function public.avaliar_conquistas_marco()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro_id uuid;
  v_user_id uuid;
  v_perfil_membro public.perfil_gamificacao;
  v_perfil public.perfil_gamificacao;
  v_conquista record;
  v_contagem integer;
  v_desbloqueio_id uuid;
begin
  if new.tipo not in (
    'deal.qualified', 'deal.negotiation_started', 'contrato.assinado',
    'deal.won', 'handoff.won', 'pagamento.confirmado'
  ) then
    return new;
  end if;

  if new.tipo = 'deal.won' then
    -- Exceção deliberada: ator_id de deal.won não é fonte segura de crédito (pode ser
    -- gestor/admin executando a transição, ou a etapa fechando automaticamente) — usa o
    -- responsável congelado no payload no instante da virada, nunca o responsável atual.
    v_membro_id := (new.payload->>'responsavel_id')::uuid;
  else
    v_user_id := coalesce(new.beneficiario_id, new.ator_id);
    if v_user_id is null then
      return new;
    end if;
    select id into v_membro_id from public.empresa_membros
      where empresa_id = new.empresa_id and user_id = v_user_id and ativo
      limit 1;
  end if;

  if v_membro_id is null then
    return new;
  end if;

  select perfil_gamificacao into v_perfil_membro from public.empresa_membros where id = v_membro_id;
  v_perfil := coalesce(new.profile_at_event, v_perfil_membro);

  for v_conquista in
    select * from public.conquistas
    where empresa_id = new.empresa_id
      and ativa
      and criterio->>'metrica' = 'marco_contagem'
      and criterio->>'marco' = new.tipo
      and (perfil_aplicavel is null or perfil_aplicavel = v_perfil)
      and not exists (
        select 1 from public.conquistas_desbloqueadas cd
        where cd.conquista_id = conquistas.id and cd.membro_id = v_membro_id
      )
  loop
    v_contagem := public.contar_marco_membro(new.tipo, new.empresa_id, v_membro_id, v_conquista.ativa_desde);
    if v_contagem < (v_conquista.criterio->>'valor')::numeric then
      continue;
    end if;

    insert into public.conquistas_desbloqueadas (empresa_id, conquista_id, membro_id)
      values (new.empresa_id, v_conquista.id, v_membro_id)
      on conflict (conquista_id, membro_id) do nothing
      returning id into v_desbloqueio_id;

    if v_desbloqueio_id is null then
      continue;
    end if;

    if v_conquista.xp_bonus > 0 then
      insert into public.point_ledger (empresa_id, membro_id, descricao, referencia_tipo, referencia_id, xp, moedas, profile_at_event)
        values (new.empresa_id, v_membro_id, 'Conquista: ' || v_conquista.nome, 'conquista', v_conquista.id, v_conquista.xp_bonus, 0, v_perfil);
    end if;

    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (new.empresa_id, v_membro_id, 'conquista_desbloqueada', 'Nova conquista desbloqueada: ' || v_conquista.nome, '/gamificacao/jornada');
  end loop;

  return new;
end;
$$;

create trigger eventos_avaliar_conquistas_marco after insert on public.eventos
  for each row execute function public.avaliar_conquistas_marco();
