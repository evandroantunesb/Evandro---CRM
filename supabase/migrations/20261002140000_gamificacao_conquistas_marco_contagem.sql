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
-- entidade — NUNCA a tabela satélite `confirmacoes_pagamento`: ela só é gravada DEPOIS do
-- insert em `eventos` dentro de `confirmar_pagamento()` (mesma transação, instrução
-- seguinte), então ainda não existiria no instante em que este gatilho roda (achado da
-- 1ª rodada de CI desta PR — `pagamento.confirmado` lia essa tabela antes e sempre via 0).
-- Reunião e visita realizadas ficam de fora até a PR #109 (`tarefas.resultado`) mesclar —
-- não há fonte causal aceitável hoje sem usar `task.completed` genérico, que o Evandro
-- vetou explicitamente como workaround.
--
-- Atribuição (beneficiário) é sempre a fonte causal/congelada no momento da transição,
-- nunca o responsável atual do negócio (que pode mudar depois por redistribuição):
--   - deal.qualified / deal.negotiation_started: `ator_id` do evento (quem qualificou /
--     o responsável no momento da transição para negociação) — mesma leitura que
--     `aplicar_regras_gamificacao()` já faz pra esses dois tipos.
--   - contrato.assinado: `ator_id` do evento, que já vem do `responsavel_assinatura_id`
--     congelado na assinatura (ver `20261001250000_gamificacao_pagamento_confirmado.sql`).
--   - handoff.won: `beneficiario_id` do evento (o SDR de origem), já congelado.
--   - pagamento.confirmado: `beneficiario_id` do evento mais recente do par
--     pagamento.confirmado/pagamento.confirmacao_estornada (mesma fonte usada pra contar o
--     estado ao vivo — ver nota acima; nunca `confirmacoes_pagamento` nem o responsável atual).
--   - deal.won: EXCEÇÃO. `ator_id` aqui é só quem clicou pra mudar o status (pode ser um
--     gestor fechando em nome de alguém, ou a etapa fechando automaticamente) — não é
--     fonte segura de crédito. A fonte causal correta é `payload->>'responsavel_id'`
--     (gravado por `registrar_negocio()` no mesmo instante da transição, e que já é um
--     `empresa_membros.id`, não um `auth.users.id` como os demais ator_id/beneficiario_id)
--     — nunca o `negocios.responsavel_id` atual, que pode ter sido reatribuído depois.
--
-- Perfil aplicável (auditoria 2026-10-02, item 9 + rodada 2): cada OCORRÊNCIA contada
-- precisa do seu próprio perfil causal/congelado — nunca o perfil atual do membro
-- aplicado retroativamente ao histórico. Exemplo que motivou a correção: membro tem 8
-- ocorrências congeladas como sdr, muda de perfil, produz 2 ocorrências como closer; uma
-- conquista `perfil_aplicavel=closer, quantidade=10` deve marcar 2/10, nunca 10/10.
--
-- Depois da auditoria read-only pedida pelo Evandro (eventos.profile_at_event já existia
-- desde `20261001190000_gamificacao_perfis.sql`, só não era preenchido por 5 dos 6
-- marcos), todos os 6 marcos agora congelam o perfil causal por ocorrência:
--   - handoff.won / handoff.contrato_assinado: já preenchiam (`perfil_sdr_credito`,
--     congelado no aceite do handoff) — sem mudança.
--   - deal.qualified: `profile_at_event` = perfil de `v_ator` (quem qualificou) no
--     instante da emissão, lido de `empresa_membros` dentro do mesmo insert.
--   - deal.negotiation_started: `profile_at_event` = perfil do responsável causal
--     (`v_responsavel_id`, já resolvido pro insert) no mesmo instante.
--   - deal.won: `profile_at_event` = perfil do mesmo `empresa_membros.id` já congelado em
--     `payload->>'responsavel_id'` — mesma fonte, mesmo instante, nunca um lookup
--     separado que pudesse divergir.
--   - contrato.assinado / pagamento.confirmado: ambos compartilham o par causal novo
--     `contratos.perfil_assinatura` (nullable, write-once, congelado exatamente onde
--     `responsavel_assinatura_id` já era congelado, em `travar_contrato_com_pagamento()`)
--     — nunca recalculado numa reassinatura, nunca o perfil atual do membro.
--     `contrato.assinado` grava `profile_at_event = new.perfil_assinatura` no insert do
--     evento (o gatilho AFTER vê o valor já congelado pelo BEFORE); `confirmar_pagamento()`
--     grava `profile_at_event = v_contrato.perfil_assinatura` (mesma coluna, lida do
--     contrato no momento da confirmação — nunca recongelada ali).
--
-- Histórico: sem backfill de `profile_at_event`/`perfil_assinatura` usando o perfil atual
-- do membro — não existe fonte causal congelada/determinística pra contratos/eventos
-- anteriores a esta migration, então ficam `null` (integridade causal > completar
-- artificialmente o histórico). Uma ocorrência com perfil causal `null` só conta pra
-- conquista geral (`perfil_aplicavel = null`); nunca pra uma conquista de perfil
-- específico. Mudar `perfil_aplicavel` de uma conquista depois de criada também não
-- reinterpreta fatos antigos: a contagem é sempre recalculada do zero a partir do perfil
-- congelado (ou `null`) de cada ocorrência.
--
-- `ativa_desde` (retroatividade): sem desbloqueio retroativo automático — só eventos a
-- partir de quando a conquista foi criada contam, tanto no desbloqueio marginal (gatilho)
-- quanto na recontagem completa a cada avaliação (idêntico ao papel do corte em qualquer
-- reavaliação, pra não inflar quando a conquista é reativada depois de desativada).
-- Imutável depois de criada (trigger abaixo) — "desde quando essa conquista existe no
-- sistema" nunca é redefinido por toggles de `ativa` nem por edição administrativa.
--
-- Não mexe nos invariantes já fechados de XP/moedas, estorno ou reocorrência: a rodada 2
-- (perfil causal por ocorrência, acima) redefine `registrar_negocio`/`registrar_contrato`/
-- `confirmar_pagamento`/`travar_contrato_com_pagamento`, mas só pra ADICIONAR
-- `profile_at_event`/`perfil_assinatura` nos pontos já existentes de emissão/congelamento —
-- nenhuma lógica de pontuação, estorno, reocorrência ou guarda de duplicata muda. Também
-- um filtro aditivo de `perfil_aplicavel` em `avaliar_conquistas_pontos()` (todo-não-filtrado
-- continua idêntico pra toda conquista existente, já que a coluna nova nasce `null`).
-- `aceitar_handoff()` não é tocada (já gravava `perfil_sdr_credito` certo).

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
-- Perfil causal por ocorrência (auditoria 2026-10-02, rodada 2): `contratos.
-- perfil_assinatura` é o par causal de `responsavel_assinatura_id` — mesma coluna
-- alimenta `contrato.assinado` e `pagamento.confirmado`, já que os dois creditam o
-- mesmo beneficiário congelado na assinatura. Write-once: congelado no mesmo ponto e com
-- o mesmo padrão coalesce-com-old que já protege `responsavel_assinatura_id` em
-- `travar_contrato_com_pagamento()` — reassinar o contrato nunca recalcula, e mudar o
-- perfil do membro depois nunca altera o que já foi congelado.
-- ---------------------------------------------------------------------------

alter table public.contratos add column perfil_assinatura public.perfil_gamificacao;
revoke update (perfil_assinatura) on public.contratos from authenticated;

create or replace function public.travar_contrato_com_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Só bloqueia exclusão direta (depth 1). Numa cascata de exclusão de empresa inteira
    -- (depth > 1), `confirmacoes_pagamento` já cascateia pela sua própria FK em
    -- `empresa_id` — bloquear aqui travaria a cascata sem necessidade.
    if pg_trigger_depth() <= 1 and exists (select 1 from public.confirmacoes_pagamento where contrato_id = old.id) then
      raise exception 'Contrato com histórico de pagamento não pode ser apagado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    return old;
  end if;

  if new.status = 'assinado' and old.status is distinct from 'assinado' then
    new.responsavel_assinatura_id := coalesce(
      old.responsavel_assinatura_id,
      (select responsavel_id from public.negocios where id = new.negocio_id)
    );
    -- Par causal de responsavel_assinatura_id: mesmo coalesce-com-old (nunca recalculado
    -- numa reassinatura), lido do perfil do responsável que acabou de ser resolvido acima
    -- — nunca do perfil atual do membro numa reassinatura futura.
    new.perfil_assinatura := coalesce(
      old.perfil_assinatura,
      (select perfil_gamificacao from public.empresa_membros where id = new.responsavel_assinatura_id)
    );
  end if;

  if old.status = 'assinado' and new.status is distinct from 'assinado'
     and exists (select 1 from public.confirmacoes_pagamento where contrato_id = old.id and estornado_em is null) then
    raise exception 'Pagamento confirmado: estorne a confirmação antes de alterar o status do contrato.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if (new.negocio_id is distinct from old.negocio_id or new.empresa_id is distinct from old.empresa_id)
     and exists (select 1 from public.confirmacoes_pagamento where contrato_id = old.id) then
    raise exception 'Contrato com histórico de pagamento não pode trocar de negócio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  return new;
end;
$$;

-- registrar_contrato(): idêntica à versão anterior (`20261001260000_gamificacao_fix_
-- reocorrencia.sql`), só adiciona `profile_at_event = new.perfil_assinatura` no insert de
-- `contrato.assinado` — lido direto do campo da própria linha (já congelado pelo BEFORE
-- trigger acima, que roda antes deste AFTER na mesma transação), nunca recalculado aqui.
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
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload, profile_at_event)
          values (v_empresa_id, 'contrato.assinado', v_responsavel_user_id, 'negocio', new.negocio_id, '{}'::jsonb, new.perfil_assinatura);
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

-- confirmar_pagamento(): idêntica à versão anterior (`20261001250000_gamificacao_
-- pagamento_confirmado.sql`), só adiciona `profile_at_event = v_contrato.perfil_assinatura`
-- no insert de `pagamento.confirmado` — mesma coluna causal da assinatura, lida do
-- contrato (já no registro `v_contrato` obtido no início da função), nunca o perfil atual
-- do beneficiário no instante da confirmação.
create or replace function public.confirmar_pagamento(p_contrato_id uuid)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_contato_id uuid;
  v_ator uuid := (select auth.uid());
  v_meu_membro_id uuid;
  v_benef_user uuid;
  v_evento_id bigint;
  v_conf public.confirmacoes_pagamento;
begin
  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if not public.tem_papel(v_contrato.empresa_id, '{admin,gestor}') then
    raise exception 'Só gestor ou admin pode confirmar pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.pode_ver_negocio(v_contrato.negocio_id) then
    raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_contrato.empresa_id);

  if v_contrato.status <> 'assinado' then
    raise exception 'Só é possível confirmar pagamento de contrato assinado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if exists (select 1 from public.confirmacoes_pagamento where contrato_id = p_contrato_id and estornado_em is null) then
    raise exception 'Pagamento deste contrato já está confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Beneficiário: closer congelado no momento da assinatura (`responsavel_assinatura_id`,
  -- ver trigger `travar_contrato_com_pagamento`), nunca `negocios.responsavel_id` atual —
  -- o negócio pode ter trocado de responsável entre a assinatura e o pagamento.
  if v_contrato.responsavel_assinatura_id is null then
    raise exception 'Contrato sem responsável registrado na assinatura: não é possível determinar o beneficiário.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_contrato.responsavel_assinatura_id = v_meu_membro_id then
    raise exception 'Você não pode confirmar o pagamento de um contrato que assinou como responsável.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  select user_id into v_benef_user from public.empresa_membros where id = v_contrato.responsavel_assinatura_id;
  if v_benef_user is null then
    raise exception 'Responsável da assinatura inválido para crédito.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (v_contrato.empresa_id, 'pagamento.confirmado', v_ator, v_benef_user, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id), v_contrato.perfil_assinatura)
    returning id into v_evento_id;

  insert into public.confirmacoes_pagamento
    (empresa_id, contrato_id, negocio_id, confirmado_por_membro_id, confirmado_por_user_id,
     beneficiario_membro_id, beneficiario_user_id, evento_confirmacao_id)
    values (v_contrato.empresa_id, v_contrato.id, v_contrato.negocio_id, v_meu_membro_id, v_ator,
            v_contrato.responsavel_assinatura_id, v_benef_user, v_evento_id)
    returning * into v_conf;

  select contato_id into v_contato_id from public.negocios where id = v_contrato.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_contrato.empresa_id, v_contrato.negocio_id, v_contato_id, 'pagamento_confirmado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id));

  return v_conf;
end;
$$;

-- registrar_negocio(): idêntica à versão anterior (`20261001260000_gamificacao_fix_
-- reocorrencia.sql`), só adiciona `profile_at_event` em 3 dos inserts — deal.qualified
-- (perfil de v_ator, já resolvido), deal.negotiation_started (perfil do responsável
-- causal v_responsavel_id/v_responsavel_user_id, já resolvido) e deal.won (perfil do
-- mesmo empresa_membros.id já congelado no payload, nunca um lookup separado que pudesse
-- divergir). handoff.won já gravava profile_at_event corretamente — sem mudança ali.
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
    -- profile_at_event (só relevante pra deal.won, mas resolvido pro mesmo
    -- empresa_membros.id já congelado em payload->>'responsavel_id' acima — nunca um
    -- lookup separado que pudesse divergir do beneficiário real).
    select perfil_gamificacao into v_responsavel_perfil from public.empresa_membros where id = new.responsavel_id;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload, profile_at_event)
      values (new.empresa_id,
              case new.status when 'ganho' then 'deal.won' when 'perdido' then 'deal.lost' else 'deal.reopened' end,
              v_ator, 'negocio', new.id,
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
  p_ativa_desde timestamptz,
  p_perfil_requerido public.perfil_gamificacao default null
)
returns integer
language plpgsql security definer set search_path = ''
stable
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  -- Perfil por ocorrência (auditoria 2026-10-02, item 9 + rodada 2): todos os 6 marcos
  -- agora filtram cada ocorrência pelo seu próprio perfil causal/congelado (ver topo do
  -- arquivo) — nunca pelo perfil atual do membro. Ocorrência com perfil causal `null`
  -- (histórico anterior a esta migration, sem backfill) nunca conta pra conquista com
  -- `p_perfil_requerido` não-nulo — só pra conquista geral.

  if p_marco in ('deal.qualified', 'deal.negotiation_started') then
    select user_id into v_user_id from public.empresa_membros where id = p_membro_id;
    if v_user_id is null then
      return 0;
    end if;
    select count(distinct entidade_id) into v_count
      from public.eventos
      where empresa_id = p_empresa_id and tipo = p_marco and created_at >= p_ativa_desde
        and coalesce(beneficiario_id, ator_id) = v_user_id
        and (p_perfil_requerido is null or profile_at_event = p_perfil_requerido);
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
        and ult.created_at >= p_ativa_desde
        and (p_perfil_requerido is null or c.perfil_assinatura = p_perfil_requerido);
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'deal.won' then
    select count(*) into v_count
      from public.negocios n
      join lateral (
        select e.payload, e.profile_at_event, e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.tipo = 'deal.won' and e.entidade_id = n.id
        order by e.created_at desc limit 1
      ) ult on true
      where n.empresa_id = p_empresa_id and n.status = 'ganho'
        and (ult.payload->>'responsavel_id')::uuid = p_membro_id
        and ult.created_at >= p_ativa_desde
        and (p_perfil_requerido is null or ult.profile_at_event = p_perfil_requerido);
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'handoff.won' then
    select user_id into v_user_id from public.empresa_membros where id = p_membro_id;
    if v_user_id is null then
      return 0;
    end if;
    -- `profile_at_event` filtra cada ocorrência pelo seu próprio perfil, nunca pelo
    -- perfil atual do membro. Conquista muda `perfil_aplicavel` depois? A recontagem é
    -- sempre do zero contra esse dado congelado, então nunca reinterpreta fatos de outro
    -- perfil.
    select count(*) into v_count
      from public.negocios n
      join lateral (
        select e.beneficiario_id, e.profile_at_event, e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.tipo = 'handoff.won' and e.entidade_id = n.id
        order by e.created_at desc limit 1
      ) ult on true
      where n.empresa_id = p_empresa_id and n.status = 'ganho'
        and ult.beneficiario_id = v_user_id
        and ult.created_at >= p_ativa_desde
        and (p_perfil_requerido is null or ult.profile_at_event = p_perfil_requerido);
    return coalesce(v_count, 0);
  end if;

  if p_marco = 'pagamento.confirmado' then
    -- Não lê `confirmacoes_pagamento` diretamente: a linha dessa tabela só é gravada
    -- DEPOIS do insert em `eventos` dentro de `confirmar_pagamento()` (mesma transação,
    -- mas instrução seguinte) — no instante em que este gatilho roda (AFTER INSERT em
    -- `eventos`), a confirmação ainda não existe. Usa o par
    -- pagamento.confirmado/pagamento.confirmacao_estornada em `eventos` (mesmo padrão dos
    -- outros marcos reversíveis) pra saber se o pagamento está confirmado AO VIVO agora.
    -- `profile_at_event` do evento `pagamento.confirmado` já é `contratos.perfil_assinatura`
    -- (mesma coluna causal de `contrato.assinado`, gravada por `confirmar_pagamento()`).
    select user_id into v_user_id from public.empresa_membros where id = p_membro_id;
    if v_user_id is null then
      return 0;
    end if;
    select count(*) into v_count
      from public.negocios n
      join lateral (
        select e.tipo, e.beneficiario_id, e.profile_at_event, e.created_at from public.eventos e
        where e.empresa_id = p_empresa_id and e.entidade_id = n.id
          and e.tipo in ('pagamento.confirmado', 'pagamento.confirmacao_estornada')
        order by e.created_at desc limit 1
      ) ult on true
      where n.empresa_id = p_empresa_id
        and ult.tipo = 'pagamento.confirmado'
        and ult.beneficiario_id = v_user_id
        and ult.created_at >= p_ativa_desde
        and (p_perfil_requerido is null or ult.profile_at_event = p_perfil_requerido);
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
  v_perfil_evento public.perfil_gamificacao;
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
  -- Perfil deste evento específico, só usado pra registrar o bônus da conquista com o
  -- perfil correto (contexto do fato que desbloqueou) — nunca pra filtrar quais
  -- conquistas avaliar: isso é responsabilidade de `contar_marco_membro()`, que filtra
  -- cada ocorrência contada pelo seu próprio perfil congelado (ver topo do arquivo).
  v_perfil_evento := coalesce(new.profile_at_event, v_perfil_membro);

  for v_conquista in
    select * from public.conquistas
    where empresa_id = new.empresa_id
      and ativa
      and criterio->>'metrica' = 'marco_contagem'
      and criterio->>'marco' = new.tipo
      and not exists (
        select 1 from public.conquistas_desbloqueadas cd
        where cd.conquista_id = conquistas.id and cd.membro_id = v_membro_id
      )
  loop
    v_contagem := public.contar_marco_membro(new.tipo, new.empresa_id, v_membro_id, v_conquista.ativa_desde, v_conquista.perfil_aplicavel);
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
        values (new.empresa_id, v_membro_id, 'Conquista: ' || v_conquista.nome, 'conquista', v_conquista.id, v_conquista.xp_bonus, 0, v_perfil_evento);
    end if;

    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (new.empresa_id, v_membro_id, 'conquista_desbloqueada', 'Nova conquista desbloqueada: ' || v_conquista.nome, '/gamificacao/jornada');
  end loop;

  return new;
end;
$$;

create trigger eventos_avaliar_conquistas_marco after insert on public.eventos
  for each row execute function public.avaliar_conquistas_marco();
