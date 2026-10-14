-- Raion Solo — registro manual de pagamento por negócio (escolha A + definição posterior,
-- 2026-10-14; handoff docs/HANDOFF-CLAUDE-SOLO-PRO-2026-10-14.md).
--
-- No Solo, o único administrador ativo marca "pago/recebido" sozinho, antes ou depois de
-- gerar/assinar contrato, sem segundo aprovador. É uma DECLARAÇÃO manual, não conciliação
-- bancária. O Pro não muda: `confirmar_pagamento` (contrato assinado, gestor/admin que não é
-- o responsável da assinatura, evento causal de gamificação) continua igual.
--
-- Critério Solo (decisão do Evandro, 2026-10-14): o banco confere as DUAS coisas —
--   1. plano explícito `planos_empresa.produto = 'solo'` (definido só pelo super-admin;
--      empresa sem linha de plano ou com 'pro' é Pro — todas as atuais ficam Pro);
--   2. exatamente 1 vínculo ativo na empresa (`empresa_membros.ativo`), que é quem registra
--      e precisa ser admin.
-- Se uma empresa Solo tiver mais de um vínculo ativo, só o registro autônomo é recusado:
-- nada é suspenso nem apagado.
--
-- Regras:
-- - Tabela própria, por NEGÓCIO (não por contrato): o pagamento pode vir antes do contrato.
--   Insert-only, como `confirmacoes_pagamento`: estorno e correção nunca sobrescrevem o
--   registro original. No máximo 1 registro ativo por negócio (índice parcial).
-- - Um pagamento por negócio: registro recusa negócio com confirmação ativa do Pro, e a
--   confirmação do Pro recusa negócio com registro ativo (gatilho BEFORE INSERT abaixo,
--   sem mudar o corpo de `confirmar_pagamento`). Os dois caminhos travam o negócio; ordem de
--   travas igual à atual (contrato → negócio, como `garantir_obra`).
-- - Sem gamificação: nenhum insert em `eventos`/`point_ledger` (nada de
--   `pagamento.confirmado` com ator = beneficiário). Só a linha do tempo (`atividades`).
-- - Negócio perdido não recebe registro novo; registro existente não some se o negócio
--   mudar de status depois (só estorno/correção auditados o encerram).
-- - Registro feito no Solo continua válido depois de upgrade para Pro, com autor e
--   histórico preservados. Estorno e correção (retificação da cadeia de um registro de origem
--   Solo) ficam com qualquer admin ativo da empresa, em qualquer plano; recebimento NOVO
--   continua só no Solo autônomo (decisão do Evandro na PR #186). A correção vale também em
--   negócio que virou perdido depois do registro.
-- - NÃO liga Pedido/Obra nesta etapa: `garantir_obra` continua exigindo a confirmação do Pro.
--   O registro passa a contar como marco de pagamento na P1 (Pedido + Obra condicional),
--   junto com a trava de módulo (M1) e de escopo (E1). Assim nenhuma Obra nasce para Solo
--   sem essas regras.

-- ---------------------------------------------------------------------------
-- Plano explícito Solo/Pro
-- ---------------------------------------------------------------------------

create type public.produto_plano as enum ('solo', 'pro');

-- Default 'pro': nenhuma empresa existente muda de comportamento.
alter table public.planos_empresa
  add column produto public.produto_plano not null default 'pro';

-- Solo autônomo: plano 'solo' + exatamente 1 vínculo ativo. Interna (ignora RLS).
create or replace function public.empresa_solo_autonoma(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.planos_empresa p
    where p.empresa_id = p_empresa_id and p.produto = 'solo'
  )
  and (
    select count(*) from public.empresa_membros m
    where m.empresa_id = p_empresa_id and m.ativo
  ) = 1;
$$;

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table public.registros_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Sem ação: o negócio não pode ser apagado com histórico de pagamento.
  negocio_id uuid not null references public.negocios (id),
  -- Data em que o cliente pagou, informada pelo admin (padrão: hoje). Diferente de
  -- `registrado_em`, que é sempre o horário do servidor.
  data_recebimento date not null,
  observacao text check (observacao is null or length(observacao) <= 500),
  -- Como o registro foi feito; guardado para o histórico continuar legível após upgrade.
  modalidade text not null default 'solo_autonomo' check (modalidade in ('solo_autonomo')),
  registrado_por_membro_id uuid not null references public.empresa_membros (id),
  registrado_por_user_id uuid not null,
  registrado_em timestamptz not null default now(),
  -- Correção: o novo registro aponta para o que ele substitui.
  substitui_id uuid references public.registros_pagamento (id),
  -- Estorno: write-once.
  estornado_por_membro_id uuid references public.empresa_membros (id),
  estornado_por_user_id uuid,
  estornado_em timestamptz,
  motivo_estorno text,
  constraint registros_pagamento_estorno_completo check (
    (estornado_em is null and estornado_por_membro_id is null and estornado_por_user_id is null
       and motivo_estorno is null)
    or
    (estornado_em is not null and estornado_por_membro_id is not null and estornado_por_user_id is not null
       and nullif(trim(motivo_estorno), '') is not null)
  ),
  constraint registros_pagamento_nao_substitui_a_si check (substitui_id is distinct from id)
);

create unique index registros_pagamento_ativo_unico
  on public.registros_pagamento (negocio_id) where estornado_em is null;
create index on public.registros_pagamento (negocio_id, registrado_em desc);
create index on public.registros_pagamento (empresa_id, registrado_em desc);

-- Mesma proteção de `confirmacoes_pagamento`: dados imutáveis, estorno uma única vez,
-- DELETE só em cascata (empresa inteira).
create or replace function public.proteger_registro_pagamento()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() <= 1 then
      raise exception 'Registro de pagamento não pode ser apagado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    return old;
  end if;

  if old.estornado_em is not null then
    raise exception 'Registro de pagamento já estornado é imutável.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if (new.id, new.empresa_id, new.negocio_id, new.data_recebimento, new.observacao, new.modalidade,
      new.registrado_por_membro_id, new.registrado_por_user_id, new.registrado_em, new.substitui_id)
     is distinct from
     (old.id, old.empresa_id, old.negocio_id, old.data_recebimento, old.observacao, old.modalidade,
      old.registrado_por_membro_id, old.registrado_por_user_id, old.registrado_em, old.substitui_id) then
    raise exception 'Dados do registro de pagamento são imutáveis.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger registros_pagamento_protegido
  before update or delete on public.registros_pagamento
  for each row execute function public.proteger_registro_pagamento();

alter table public.registros_pagamento enable row level security;

-- Leitura: mesma regra de `confirmacoes_pagamento`.
create policy "ver registros de pagamento" on public.registros_pagamento for select to authenticated
  using (public.pode_ver_negocio(negocio_id));

-- Ninguém escreve direto (nem service_role): só as RPCs abaixo.
revoke all on public.registros_pagamento from anon;
revoke insert, update, delete, truncate on public.registros_pagamento from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Um pagamento por negócio: a confirmação do Pro recusa negócio com registro ativo
-- ---------------------------------------------------------------------------

-- BEFORE INSERT em `confirmacoes_pagamento`: `confirmar_pagamento` já travou o contrato;
-- aqui trava o negócio (mesma ordem de `garantir_obra`) e confere o registro. O registro faz
-- o caminho inverso (trava o negócio e confere a confirmação), então os dois se excluem.
create or replace function public.recusar_confirmacao_com_registro()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.negocios where id = new.negocio_id for no key update;
  if exists (
    select 1 from public.registros_pagamento where negocio_id = new.negocio_id and estornado_em is null
  ) then
    raise exception 'Este negócio já tem pagamento registrado. Estorne o registro antes de confirmar outro pagamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger confirmacoes_pagamento_recusar_com_registro
  before insert on public.confirmacoes_pagamento
  for each row execute function public.recusar_confirmacao_com_registro();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Pode registrar pagamento neste negócio agora? (para a interface; mesma regra da RPC,
-- sem conferir status nem pagamento já existente).
create or replace function public.pode_registrar_pagamento_negocio(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(n.empresa_id, '{admin}')
       and public.pode_ver_negocio(n.id)
       and public.empresa_solo_autonoma(n.empresa_id)
    from public.negocios n where n.id = p_negocio_id
  ), false);
$$;

-- Núcleo interno do registro (sem checagem de permissão; quem chama já conferiu e travou o
-- negócio).
create or replace function public.inserir_registro_pagamento(
  p_negocio public.negocios, p_membro_id uuid, p_data date, p_observacao text, p_substitui_id uuid
)
returns public.registros_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_data date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_obs text := nullif(trim(p_observacao), '');
  v_reg public.registros_pagamento;
begin
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do recebimento não pode ser futura.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Perdido barra só recebimento NOVO; a retificação (p_substitui_id preenchido) corrige um
  -- fato já registrado e é permitida (decisão do Evandro, 2026-10-14).
  if p_substitui_id is null and p_negocio.status = 'perdido' then
    raise exception 'Negócio perdido: reabra o negócio antes de registrar o pagamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (
    select 1 from public.confirmacoes_pagamento where negocio_id = p_negocio.id and estornado_em is null
  ) then
    raise exception 'Este negócio já tem pagamento confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (
    select 1 from public.registros_pagamento where negocio_id = p_negocio.id and estornado_em is null
  ) then
    raise exception 'Este negócio já tem pagamento registrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.registros_pagamento
    (empresa_id, negocio_id, data_recebimento, observacao, registrado_por_membro_id, registrado_por_user_id, substitui_id)
    values (p_negocio.empresa_id, p_negocio.id, v_data, v_obs, p_membro_id, v_ator, p_substitui_id)
    returning * into v_reg;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (p_negocio.empresa_id, p_negocio.id, p_negocio.contato_id, 'pagamento_registrado', v_ator,
            jsonb_build_object('registro_id', v_reg.id, 'data_recebimento', v_reg.data_recebimento,
                               'substitui_id', p_substitui_id));
  return v_reg;
end;
$$;

-- Trava o negócio e confere a autorização do Solo autônomo. Devolve o negócio travado.
create or replace function public.travar_negocio_solo_autonomo(p_negocio_id uuid)
returns public.negocios
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for no key update;
  -- Mesma resposta para "não existe" e "sem permissão".
  if not found or not public.pode_ver_negocio(p_negocio_id) or not public.tem_papel(v_negocio.empresa_id, '{admin}') then
    raise exception 'Você não tem permissão para registrar pagamento neste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.empresa_solo_autonoma(v_negocio.empresa_id) then
    raise exception 'Registro direto de pagamento é só do plano Solo com um único usuário ativo. Use a confirmação de pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return v_negocio;
end;
$$;

-- Registrar: admin único do Solo, antes ou depois do contrato, sem segundo aprovador.
create or replace function public.registrar_pagamento_negocio(p_negocio_id uuid, p_data_recebimento date default null, p_observacao text default null)
returns public.registros_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios := public.travar_negocio_solo_autonomo(p_negocio_id);
begin
  return public.inserir_registro_pagamento(v_negocio, public.meu_membro_id(v_negocio.empresa_id), p_data_recebimento, p_observacao, null);
end;
$$;

-- Estorna o registro ativo (interno; quem chama já travou o negócio).
create or replace function public.estornar_registro_pagamento_interno(p_negocio public.negocios, p_membro_id uuid, p_motivo text, p_tipo_atividade text)
returns public.registros_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_motivo text := nullif(trim(p_motivo), '');
  v_reg public.registros_pagamento;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_reg from public.registros_pagamento
    where negocio_id = p_negocio.id and estornado_em is null for update;
  -- Só a cadeia de um registro de origem Solo, da mesma empresa do negócio travado.
  if not found or v_reg.empresa_id <> p_negocio.empresa_id or v_reg.modalidade <> 'solo_autonomo' then
    raise exception 'Não há pagamento registrado para este negócio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.registros_pagamento
    set estornado_por_membro_id = p_membro_id, estornado_por_user_id = v_ator,
        estornado_em = now(), motivo_estorno = v_motivo
    where id = v_reg.id
    returning * into v_reg;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (p_negocio.empresa_id, p_negocio.id, p_negocio.contato_id, p_tipo_atividade, v_ator,
            jsonb_build_object('registro_id', v_reg.id, 'motivo', v_motivo));
  return v_reg;
end;
$$;

-- Retificação de histórico (estorno e correção): qualquer admin ativo da empresa do negócio,
-- em qualquer plano — inclusive depois de upgrade Solo → Pro (decisão do Evandro na PR #186).
-- Não exige o Solo autônomo, porque não inicia recebimento novo: só mexe na cadeia de um
-- registro de origem Solo que já existe (conferida em `estornar_registro_pagamento_interno`).
-- Recebimento novo continua só por `registrar_pagamento_negocio` (Solo autônomo).
create or replace function public.travar_negocio_retificacao(p_negocio_id uuid)
returns public.negocios
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for no key update;
  if not found or not public.pode_ver_negocio(p_negocio_id) or not public.tem_papel(v_negocio.empresa_id, '{admin}') then
    raise exception 'Só o administrador pode estornar ou corrigir o registro de pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return v_negocio;
end;
$$;

create or replace function public.estornar_registro_pagamento(p_negocio_id uuid, p_motivo text)
returns public.registros_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios := public.travar_negocio_retificacao(p_negocio_id);
begin
  return public.estornar_registro_pagamento_interno(v_negocio, public.meu_membro_id(v_negocio.empresa_id), p_motivo, 'pagamento_registro_estornado');
end;
$$;

-- Corrigir (ex.: data errada): estorna o ativo e registra o substituto na mesma transação,
-- ligados por `substitui_id`. É retificação, não recebimento novo: vale após upgrade e em
-- negócio que virou perdido depois do registro.
create or replace function public.corrigir_registro_pagamento(p_negocio_id uuid, p_data_recebimento date, p_observacao text, p_motivo text)
returns public.registros_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios := public.travar_negocio_retificacao(p_negocio_id);
  v_membro uuid := public.meu_membro_id(v_negocio.empresa_id);
  v_antigo public.registros_pagamento;
begin
  v_antigo := public.estornar_registro_pagamento_interno(v_negocio, v_membro, p_motivo, 'pagamento_registro_corrigido');
  return public.inserir_registro_pagamento(v_negocio, v_membro, p_data_recebimento, p_observacao, v_antigo.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------

revoke all on function public.empresa_solo_autonoma(uuid) from public, anon, authenticated, service_role;
revoke all on function public.proteger_registro_pagamento() from public, anon, authenticated, service_role;
revoke all on function public.recusar_confirmacao_com_registro() from public, anon, authenticated, service_role;
revoke all on function public.inserir_registro_pagamento(public.negocios, uuid, date, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.travar_negocio_solo_autonomo(uuid) from public, anon, authenticated, service_role;
revoke all on function public.travar_negocio_retificacao(uuid) from public, anon, authenticated, service_role;
revoke all on function public.estornar_registro_pagamento_interno(public.negocios, uuid, text, text) from public, anon, authenticated, service_role;

revoke all on function public.pode_registrar_pagamento_negocio(uuid) from public, anon;
grant execute on function public.pode_registrar_pagamento_negocio(uuid) to authenticated;
revoke all on function public.registrar_pagamento_negocio(uuid, date, text) from public, anon;
grant execute on function public.registrar_pagamento_negocio(uuid, date, text) to authenticated;
revoke all on function public.estornar_registro_pagamento(uuid, text) from public, anon;
grant execute on function public.estornar_registro_pagamento(uuid, text) to authenticated;
revoke all on function public.corrigir_registro_pagamento(uuid, date, text, text) from public, anon;
grant execute on function public.corrigir_registro_pagamento(uuid, date, text, text) to authenticated;
