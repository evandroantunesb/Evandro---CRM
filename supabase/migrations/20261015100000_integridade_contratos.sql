-- Integridade de `contratos` na escrita direta pela API (reforço da PR #190; revisão do Evandro e
-- do Claude Opus em 2026-10-15). A #190 tirou o SDR de contratos; esta migration fecha o que o
-- papel financeiro (admin, gestor, vendedor) ainda conseguia gravar por fora do fluxo da interface:
--
--   1. `empresa_id` diferente da empresa real do negócio, no INSERT, e troca de `empresa_id` ou
--      `negocio_id` depois da criação. Não havia FK composta nem gatilho.
--   2. INSERT já com status `assinado`: pulava o gatilho que congela o responsável da assinatura e
--      o `trg_registrar_contrato` (eventos causais, Obra), que só rodam no UPDATE.
--   3. Responsável e perfil congelados na assinatura (`responsavel_assinatura_id`,
--      `perfil_assinatura`) graváveis pelo cliente, no INSERT e no UPDATE. Os REVOKE de coluna de
--      20261001250000/20261002140000 não têm efeito enquanto `authenticated` tem privilégio de
--      tabela; a proteção passa a ser por gatilho. O beneficiário de `confirmar_pagamento` é
--      essa coluna, então ela só pode nascer do congelamento feito pelo banco.
--
-- Também: `confirmar_pagamento` e `estornar_confirmacao_pagamento` passam a conferir papel e
-- autoconfirmação pela empresa DO NEGÓCIO (não pelo `empresa_id` do contrato, que podia divergir em
-- dado legado), e TRUNCATE em `contratos` sai de `anon`/`authenticated`.
--
-- Só autorização e integridade. Nenhum dado é alterado ou apagado. A restrição vale para todo papel
-- fora da lista de privilegiados (`postgres`, `supabase_admin`, `service_role`): RPCs e gatilhos
-- `security definer` (dono `postgres`), seeds e manutenção seguem como antes — para eles vale só a
-- FK composta.
--
-- A FK composta nasce NOT VALID: vale para toda linha nova ou com a chave alterada, mas não varre as
-- existentes, então a migration não falha se produção tiver divergência antiga. Rode a auditoria
-- SELECT (docs/auditorias/contratos-empresa-divergente.sql) e, com zero divergências, valide em
-- migration própria (`alter table public.contratos validate constraint contratos_negocio_empresa_fk`
-- — SHARE UPDATE EXCLUSIVE, não bloqueia leitura nem escrita).

-- Os ALTER abaixo pegam lock exclusivo por instantes (o UNIQUE em `negocios` bloqueia leitura e
-- escrita enquanto o índice é construído). Se houver transação longa segurando a tabela, falha em
-- 3 s em vez de enfileirar o app inteiro atrás da migration; basta reaplicar. SET de sessão (não
-- LOCAL) para valer com ou sem transação em volta do arquivo; o RESET no fim devolve o padrão.
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- FK composta (negocio_id, empresa_id) -> negocios (id, empresa_id)
-- ---------------------------------------------------------------------------

-- `id` já é chave primária; a unicidade do par existe só para servir de alvo da FK composta.
alter table public.negocios add constraint negocios_id_empresa_id_key unique (id, empresa_id);

-- NO ACTION: a exclusão em cascata continua vindo só da FK simples já existente
-- (`contratos_negocio_id_fkey`, on delete cascade). Esta FK só garante a consistência do par.
alter table public.contratos
  add constraint contratos_negocio_empresa_fk
  foreign key (negocio_id, empresa_id) references public.negocios (id, empresa_id)
  not valid;

-- ---------------------------------------------------------------------------
-- Gatilho: o que só o banco grava em `contratos`
-- ---------------------------------------------------------------------------

-- INVOKER de propósito: `current_user` precisa ser o papel da requisição (PostgREST faz
-- SET ROLE authenticated). Em RPC/gatilho `security definer`, `current_user` é o dono, que está
-- na lista de privilegiados — esse é o caminho legítimo para escrever o que o cliente não pode.
--
-- Ordem dos BEFORE em `contratos` (alfabética): contratos_integridade → contratos_travar_com_pagamento
-- → contratos_updated_at. Este gatilho vê só o que o cliente enviou; o congelamento de
-- `responsavel_assinatura_id`/`perfil_assinatura` feito por `travar_contrato_com_pagamento()` na
-- transição para 'assinado' acontece depois, no mesmo UPDATE, e não passa por aqui.
create or replace function public.proteger_integridade_contrato()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_empresa uuid;
  -- Lista positiva: papel novo ou desconhecido fica restrito.
  v_restrito boolean := current_user not in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    -- Qualquer papel: o contrato é da empresa do negócio. (Se a RLS do chamador esconde o negócio,
    -- não há linha aqui e a FK composta recusa do mesmo jeito.)
    select empresa_id into v_empresa from public.negocios where id = new.negocio_id;
    if v_empresa is not null and v_empresa is distinct from new.empresa_id then
      -- Para papel restrito é falta de permissão (42501, o mesmo código da RLS que este gatilho
      -- antecede); para os demais, violação de integridade.
      raise exception 'A empresa do contrato precisa ser a empresa do negócio.'
        using errcode = case when v_restrito then 'insufficient_privilege' else 'check_violation' end;
    end if;

    if v_restrito then
      -- A assinatura nasce do UPDATE de status, que congela o responsável e emite os eventos.
      if new.status = 'assinado' then
        raise exception 'Contrato não pode ser criado já assinado: crie como rascunho e atualize o status.' using errcode = 'check_violation';
      end if;
      if new.responsavel_assinatura_id is not null or new.perfil_assinatura is not null then
        raise exception 'Responsável e perfil da assinatura são definidos pelo banco na assinatura.' using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end if;

  if v_restrito then
    -- O contrato não muda de empresa nem de negócio. Só vale se a chave mudou — contrato legado
    -- com divergência continua podendo mudar de status ou de texto.
    if new.empresa_id is distinct from old.empresa_id or new.negocio_id is distinct from old.negocio_id then
      raise exception 'Contrato não pode trocar de empresa nem de negócio.' using errcode = 'insufficient_privilege';
    end if;
    -- Responsável e perfil da assinatura: só o congelamento do banco (gatilho seguinte) grava.
    if new.responsavel_assinatura_id is distinct from old.responsavel_assinatura_id
       or new.perfil_assinatura is distinct from old.perfil_assinatura then
      raise exception 'Responsável e perfil da assinatura são definidos pelo banco na assinatura.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_integridade_contrato() from public, anon, authenticated;

create trigger contratos_integridade
  before insert or update on public.contratos
  for each row execute function public.proteger_integridade_contrato();

-- ---------------------------------------------------------------------------
-- INSERT: autorização financeira explícita (a #190 mantinha tem_acesso_comercial na empresa_id)
-- ---------------------------------------------------------------------------

drop policy "criar contrato" on public.contratos;
create policy "criar contrato" on public.contratos for insert to authenticated
  with check (public.tem_acesso_financeiro(empresa_id) and public.pode_ver_financeiro_negocio(negocio_id));

-- PostgREST não expõe TRUNCATE; revogado por consistência com `confirmacoes_pagamento`.
revoke truncate on public.contratos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Confirmação e estorno: empresa do NEGÓCIO
-- ---------------------------------------------------------------------------

-- confirmar_pagamento(): idêntica à versão de 20261002140000_gamificacao_conquistas_marco_contagem.sql,
-- exceto que papel, membro do ator e `empresa_id` gravado (evento, confirmação, atividade) vêm da
-- empresa do negócio. Com contrato consistente, é o mesmo valor de antes.
create or replace function public.confirmar_pagamento(p_contrato_id uuid)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_empresa uuid;
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
  select empresa_id into v_empresa from public.negocios where id = v_contrato.negocio_id;

  if not public.tem_papel(v_empresa, '{admin,gestor}') then
    raise exception 'Só gestor ou admin pode confirmar pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.pode_ver_negocio(v_contrato.negocio_id) then
    raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_empresa);

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
    values (v_empresa, 'pagamento.confirmado', v_ator, v_benef_user, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id), v_contrato.perfil_assinatura)
    returning id into v_evento_id;

  insert into public.confirmacoes_pagamento
    (empresa_id, contrato_id, negocio_id, confirmado_por_membro_id, confirmado_por_user_id,
     beneficiario_membro_id, beneficiario_user_id, evento_confirmacao_id)
    values (v_empresa, v_contrato.id, v_contrato.negocio_id, v_meu_membro_id, v_ator,
            v_contrato.responsavel_assinatura_id, v_benef_user, v_evento_id)
    returning * into v_conf;

  select contato_id into v_contato_id from public.negocios where id = v_contrato.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_empresa, v_contrato.negocio_id, v_contato_id, 'pagamento_confirmado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id));

  return v_conf;
end;
$$;
revoke all on function public.confirmar_pagamento(uuid) from public, anon;
grant execute on function public.confirmar_pagamento(uuid) to authenticated;

-- estornar_confirmacao_pagamento(): idêntica à versão de 20261001250000_gamificacao_pagamento_confirmado.sql,
-- com a mesma troca: papel, membro do ator e `empresa_id` gravado vêm da empresa do negócio.
create or replace function public.estornar_confirmacao_pagamento(p_contrato_id uuid, p_motivo text)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_empresa uuid;
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
  select empresa_id into v_empresa from public.negocios where id = v_contrato.negocio_id;
  if not public.tem_papel(v_empresa, '{admin,gestor}') or not public.pode_ver_negocio(v_contrato.negocio_id) then
    raise exception 'Só gestor ou admin pode estornar a confirmação.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_empresa);

  select * into v_conf from public.confirmacoes_pagamento
    where contrato_id = p_contrato_id and estornado_em is null for update;
  if not found then
    raise exception 'Não há pagamento confirmado para estornar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload)
    values (v_empresa, 'pagamento.confirmacao_estornada', v_ator, v_conf.beneficiario_user_id, 'negocio', v_contrato.negocio_id,
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
    values (v_empresa, v_contrato.negocio_id, v_contato_id, 'pagamento_estornado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id, 'motivo', v_motivo));

  return v_conf;
end;
$$;
revoke all on function public.estornar_confirmacao_pagamento(uuid, text) from public, anon;
grant execute on function public.estornar_confirmacao_pagamento(uuid, text) to authenticated;

reset lock_timeout;
