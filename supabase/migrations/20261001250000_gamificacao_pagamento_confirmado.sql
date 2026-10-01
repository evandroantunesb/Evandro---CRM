-- "Pagamento confirmado" — marco operacional auditável (pedido do Evandro, 2026-10-01).
-- Objetivo explícito: permitir que o card só seja considerado realmente encerrado depois
-- de uma confirmação manual autorizada, SEM criar módulo financeiro completo (sem
-- parcelas/contas a receber/conciliação). Desenho revisado em Opus (escopo restrito:
-- schema, RPCs, RLS, estorno, ator×beneficiário) antes de codar.
--
-- Decisão já confirmada pelo Evandro: "negócio encerrado" é um ESTADO CALCULADO
-- (negocio.status = 'ganho' + contrato.status = 'assinado' + pagamento confirmado),
-- não um 4º valor no enum `status_negocio` — preserva aberto/ganho/perdido como estão e
-- não exige tocar Kanban/metas/indicadores. `registrar_contrato()` NÃO é redefinida aqui.
--
-- Por que tabela própria (não colunas em `contratos`): a policy "editar contrato" já
-- permite que qualquer um que vê o negócio (inclusive o closer) dê update em `contratos`
-- — não dá pra confiar em RLS de coluna pra bloquear autoconfirmação. Mesmo padrão já
-- usado pra isso no projeto: `handoffs` revoga toda escrita direta e só muda via RPC
-- `security definer` (`aceitar_handoff`/`devolver_handoff`).
--
-- Por que insert-only (não 1 linha mutável por contrato): no ciclo confirmar → estornar →
-- confirmar de novo, uma linha mutável sobrescreveria `confirmado_por`/`confirmado_em` da
-- primeira confirmação — perderia histórico. Cada confirmação é uma linha; "no máximo uma
-- ativa por contrato" é um índice único parcial (`where estornado_em is null`), não uma PK.
--
-- Trava do "não sai de assinado com pagamento ativo" fica num trigger BEFORE separado em
-- `contratos` (não dentro de `registrar_contrato()`, que já foi redefinida por várias PRs
-- empilhadas — mexer nela de novo só aumentaria o risco de uma mesclar por cima da outra).

-- Beneficiário do pagamento (pedido explícito do Evandro): o closer creditado precisa ser
-- quem estava comercialmente associado ao contrato NO MOMENTO DA ASSINATURA, congelado —
-- nunca `negocios.responsavel_id` lido na hora da confirmação, porque o negócio pode trocar
-- de responsável depois (redistribuição, férias) e o novo responsável não pode herdar
-- crédito de uma venda que não fez. Mesmo princípio já usado em `handoff_origem_id`
-- (referência causal persistida, nunca recalculada). Capturado write-once no trigger BEFORE
-- abaixo, na transição que entra em 'assinado' — não em `registrar_contrato()` (AFTER),
-- porque só um BEFORE pode escrever em NEW antes da linha gravar.
alter table public.contratos add column responsavel_assinatura_id uuid references public.empresa_membros (id) on delete set null;
update public.contratos c set responsavel_assinatura_id = n.responsavel_id
  from public.negocios n where n.id = c.negocio_id and c.status = 'assinado' and c.responsavel_assinatura_id is null;
-- Só o trigger (roda como dono da função, não como o cliente) pode escrever essa coluna —
-- a policy "editar contrato" continua aberta pras outras colunas, mas um update direto do
-- cliente em `responsavel_assinatura_id` (contornando a lógica write-once do trigger) fica
-- bloqueado em nível de coluna.
revoke update (responsavel_assinatura_id) on public.contratos from authenticated;

create type public.status_pagamento_contrato as enum ('pendente', 'confirmado', 'estornado');

create table public.confirmacoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  contrato_id uuid not null references public.contratos (id),
  negocio_id uuid not null references public.negocios (id),
  -- quem validou (ator do evento de gamificação)
  confirmado_por_membro_id uuid not null references public.empresa_membros (id),
  confirmado_por_user_id uuid not null,
  confirmado_em timestamptz not null default now(),
  -- quem é creditado: cópia de `contratos.responsavel_assinatura_id` (congelado na
  -- assinatura, não na confirmação) — ver comentário no topo do arquivo
  beneficiario_membro_id uuid not null references public.empresa_membros (id),
  beneficiario_user_id uuid not null,
  evento_confirmacao_id bigint not null references public.eventos (id),
  -- estorno: write-once, preenchido só na reversão
  estornado_por_membro_id uuid references public.empresa_membros (id),
  estornado_por_user_id uuid,
  estornado_em timestamptz,
  motivo_estorno text,
  evento_estorno_id bigint references public.eventos (id),
  constraint confirmacoes_pagamento_estorno_completo check (
    (estornado_em is null and estornado_por_membro_id is null and estornado_por_user_id is null
       and motivo_estorno is null and evento_estorno_id is null)
    or
    (estornado_em is not null and estornado_por_membro_id is not null and estornado_por_user_id is not null
       and nullif(trim(motivo_estorno), '') is not null and evento_estorno_id is not null)
  ),
  -- bloqueio físico: quem confirma nunca pode ser o próprio beneficiário (closer/gestor/admin
  -- responsável pelo negócio nunca se autoconfirma) — trava de banco, não só checagem no RPC.
  constraint confirmacoes_pagamento_sem_autoconfirmacao check (
    confirmado_por_membro_id <> beneficiario_membro_id and confirmado_por_user_id <> beneficiario_user_id
  )
);

-- No máximo 1 confirmação ATIVA por contrato — permite reconfirmar depois de um estorno
-- (a linha estornada sai da contagem do índice parcial).
create unique index confirmacoes_pagamento_ativa_unica
  on public.confirmacoes_pagamento (contrato_id) where estornado_em is null;
create index on public.confirmacoes_pagamento (negocio_id, confirmado_em desc);
create index on public.confirmacoes_pagamento (empresa_id, confirmado_em desc);

alter table public.confirmacoes_pagamento enable row level security;

create policy "ver confirmacoes de pagamento" on public.confirmacoes_pagamento for select to authenticated
  using (public.pode_ver_negocio(negocio_id));

-- Mesma defesa de `handoffs`: ninguém (nem service_role) escreve direto — só os RPCs
-- `security definer` abaixo, que bypassam o revoke por rodarem como dono da função.
revoke insert, update, delete, truncate on public.confirmacoes_pagamento from anon, authenticated, service_role;

-- Trigger extra: mesmo os RPCs não podem alterar uma confirmação já estornada, nem mudar
-- os dados de uma confirmação depois de criada (só o próprio estorno pode preencher as
-- colunas `estornado_*`, uma única vez). DELETE só é permitido em cascata (apagar a
-- empresa inteira) — nunca direto.
create or replace function public.proteger_confirmacao_pagamento()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() <= 1 then
      raise exception 'Confirmação de pagamento não pode ser apagada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    return old;
  end if;

  if old.estornado_em is not null then
    raise exception 'Confirmação de pagamento já estornada é imutável.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if (new.id, new.empresa_id, new.contrato_id, new.negocio_id, new.confirmado_por_membro_id,
      new.confirmado_por_user_id, new.confirmado_em, new.beneficiario_membro_id,
      new.beneficiario_user_id, new.evento_confirmacao_id)
     is distinct from
     (old.id, old.empresa_id, old.contrato_id, old.negocio_id, old.confirmado_por_membro_id,
      old.confirmado_por_user_id, old.confirmado_em, old.beneficiario_membro_id,
      old.beneficiario_user_id, old.evento_confirmacao_id) then
    raise exception 'Dados da confirmação de pagamento são imutáveis.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger confirmacoes_pagamento_protegida
  before update or delete on public.confirmacoes_pagamento
  for each row execute function public.proteger_confirmacao_pagamento();

-- Trava de banco pro ponto crítico: `aplicar_regras_gamificacao()` credita
-- `coalesce(beneficiario_id, ator_id)` — sem isso, um evento de pagamento sem
-- beneficiário cairia no gestor/admin que confirmou. Esta constraint garante que todo
-- evento `pagamento.*` sempre tem beneficiário explícito e diferente de quem agiu.
alter table public.eventos add constraint eventos_pagamento_beneficiario_check check (
  tipo not like 'pagamento.%' or (beneficiario_id is not null and ator_id is not null and beneficiario_id <> ator_id)
);

-- Status calculado (pendente/confirmado/estornado) — nenhuma coluna de status em
-- `contratos` nem em `confirmacoes_pagamento`; "não aplicável" (contrato ainda não
-- assinado) fica fora do enum, representado só pela ausência de qualquer linha e pelo
-- status do contrato.
create or replace function public.status_pagamento_contrato(p_contrato_id uuid)
returns public.status_pagamento_contrato
language sql stable security invoker set search_path = ''
as $$
  select case
    when exists (select 1 from public.confirmacoes_pagamento where contrato_id = c.id and estornado_em is null) then 'confirmado'::public.status_pagamento_contrato
    when exists (select 1 from public.confirmacoes_pagamento where contrato_id = c.id) then 'estornado'::public.status_pagamento_contrato
    when c.status = 'assinado' then 'pendente'::public.status_pagamento_contrato
    else null
  end
  from public.contratos c where c.id = p_contrato_id;
$$;

-- Estorno exato: reverte só os lançamentos do evento de confirmação específico (por
-- evento_id, nunca por tipo de evento + regra — a função genérica `estornar_lancamentos_evento`
-- falharia em silêncio se a regra de pontos fosse apagada ou o evento_tipo editado depois).
create or replace function public.estornar_lancamentos_do_evento(p_evento_id bigint, p_estornado_por uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.point_ledger
    set estornado = true, estornado_em = now(), estornado_por = p_estornado_por
    where evento_id = p_evento_id and not estornado;
end;
$$;
revoke all on function public.estornar_lancamentos_do_evento(bigint, uuid) from public, anon, authenticated;

-- Trigger BEFORE em `contratos`, com duas responsabilidades:
-- 1. Congela `responsavel_assinatura_id` (write-once) na transição que entra em 'assinado'
--    — é o beneficiário real do pagamento, nunca recalculado depois.
-- 2. Impede sair de 'assinado' (ou trocar negócio/empresa, ou apagar) enquanto houver
--    confirmação de pagamento ativa. Roda antes do AFTER `trg_registrar_contrato`, então o
--    estorno automático de `contrato.assinado` nem chega a acontecer — a transição é
--    barrada primeiro. Edição normal do contrato (conteúdo, token etc.) continua livre; só
--    as transições abaixo são travadas. `registrar_contrato()` continua intocada.
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

create trigger contratos_travar_com_pagamento
  before update or delete on public.contratos
  for each row execute function public.travar_contrato_com_pagamento();

-- RPC: confirmar pagamento. Só admin/gestor; nunca quem é o beneficiário (closer
-- congelado na assinatura — cobre gestor/admin que também é esse closer).
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

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload)
    values (v_contrato.empresa_id, 'pagamento.confirmado', v_ator, v_benef_user, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id))
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
revoke all on function public.confirmar_pagamento(uuid) from public, anon;
grant execute on function public.confirmar_pagamento(uuid) to authenticated;

-- RPC: estornar confirmação de pagamento. Motivo obrigatório. Não trava "o responsável
-- estornando o próprio negócio" (só reduz pontos do closer, sem incentivo a fraude) — se
-- o Evandro quiser simetria com `confirmar_pagamento`, é a mesma checagem de responsavel_id.
create or replace function public.estornar_confirmacao_pagamento(p_contrato_id uuid, p_motivo text)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_conf public.confirmacoes_pagamento;
  v_ator uuid := (select auth.uid());
  v_meu_membro_id uuid;
  v_motivo text := nullif(trim(p_motivo), '');
  v_contato_id uuid;
  v_evento_id bigint;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo do estorno.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not public.tem_papel(v_contrato.empresa_id, '{admin,gestor}') or not public.pode_ver_negocio(v_contrato.negocio_id) then
    raise exception 'Só gestor ou admin pode estornar a confirmação.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_contrato.empresa_id);

  select * into v_conf from public.confirmacoes_pagamento
    where contrato_id = p_contrato_id and estornado_em is null for update;
  if not found then
    raise exception 'Não há pagamento confirmado para estornar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload)
    values (v_contrato.empresa_id, 'pagamento.confirmacao_estornada', v_ator, v_conf.beneficiario_user_id, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id, 'motivo', v_motivo))
    returning id into v_evento_id;

  perform public.estornar_lancamentos_do_evento(v_conf.evento_confirmacao_id, v_meu_membro_id);

  update public.confirmacoes_pagamento
    set estornado_por_membro_id = v_meu_membro_id, estornado_por_user_id = v_ator,
        estornado_em = now(), motivo_estorno = v_motivo, evento_estorno_id = v_evento_id
    where id = v_conf.id
    returning * into v_conf;

  select contato_id into v_contato_id from public.negocios where id = v_contrato.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_contrato.empresa_id, v_contrato.negocio_id, v_contato_id, 'pagamento_estornado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id, 'motivo', v_motivo));

  return v_conf;
end;
$$;
revoke all on function public.estornar_confirmacao_pagamento(uuid, text) from public, anon;
grant execute on function public.estornar_confirmacao_pagamento(uuid, text) to authenticated;
