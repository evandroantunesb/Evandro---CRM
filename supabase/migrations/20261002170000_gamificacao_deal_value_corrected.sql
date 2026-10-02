-- Correção causal de valor pós-ganho (PR 2 de 2, Evandro 2026-10-02, depois da #121 que
-- corrigiu o beneficiário de deal.won). Fonte causal pra correções de valor feitas enquanto
-- o negócio permanece 'ganho' — complementa deal.won sem alterá-lo: Receita futura soma
-- deal.won.payload.valor + deltas de deal.value_corrected do mesmo ciclo (evento_original_id).
--
-- Bloqueio de UPDATE comum: padrão GUC local à transação (raion.permitir_correcao_valor),
-- técnica padrão de Postgres pra permitir que só uma função security definer específica
-- (corrigir_valor_negocio) grave uma coluna que a RLS/trigger normalmente bloqueia pra todo
-- mundo — não há precedente igual neste repo (as RPCs existentes como confirmar_pagamento
-- protegem uma tabela inteira, nunca um campo condicional dentro de uma tabela de edição
-- livre), mas é técnica padrão e segura: a flag é local à transação (set_config(...,true)),
-- e a própria RPC a desliga explicitamente logo depois do UPDATE autorizado (não espera o
-- fim da transação) — qualquer UPDATE comum posterior na mesma transação já volta a ser
-- bloqueado. O cliente autenticado não tem como setá-la diretamente (só RPCs do schema
-- public são expostas pelo PostgREST; set_config é pg_catalog).
--
-- Permissão: mesmo padrão de confirmar_pagamento — tem_papel('{admin,gestor}') + pode_ver_negocio
-- (que já restringe gestor à sua equipe). Closer/vendedor nunca passam no primeiro checque,
-- mesmo sendo responsável pelo negócio.
--
-- Beneficiário/perfil: herdados do deal.won ativo (o mais recente do negócio — sempre único,
-- porque cada deal.won só nasce de uma transição de status, delimitando o ciclo), nunca do
-- responsável atual — preserva o beneficiário congelado mesmo se o negócio trocar de dono
-- depois.

create or replace function public.preparar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
  v_etapa record;
  v_contato record;
  v_faltando text[] := '{}';
  v_fecha_como public.status_negocio;
  v_motivo_padrao uuid;
begin
  if tg_op = 'INSERT' then
    update public.empresas set seq_negocio = seq_negocio + 1
      where id = new.empresa_id
      returning seq_negocio into new.numero;
    new.criado_por := v_eu;
    -- Quem cria é o responsável, a não ser que outro tenha sido escolhido.
    new.responsavel_id := coalesce(new.responsavel_id, v_eu);
    if new.etapa_id is null then
      select id into new.etapa_id from public.etapas
        where funil_id = new.funil_id and inicial and ativa;
      if new.etapa_id is null then
        select id into new.etapa_id from public.etapas
          where funil_id = new.funil_id and ativa order by ordem limit 1;
      end if;
    end if;
    new.etapa_desde := now();
    new.status := 'aberto';
    new.motivo_perda_id := null;
    new.motivo_perda_detalhe := null;
  else
    new.numero := old.numero;
    new.criado_por := old.criado_por;
    new.empresa_id := old.empresa_id;
    if new.etapa_id is distinct from old.etapa_id then
      new.etapa_desde := now();
      -- Só fecha automaticamente se o negócio ainda estava aberto — nunca
      -- sobrescreve um ganho/perdido já registrado.
      if new.status = 'aberto' then
        select fecha_como into v_fecha_como from public.etapas where id = new.etapa_id;
        if v_fecha_como = 'ganho' then
          new.status := 'ganho';
        elsif v_fecha_como = 'perdido' then
          insert into public.motivos_perda (empresa_id, nome)
            values (new.empresa_id, 'Perdido automaticamente pela etapa')
            on conflict (empresa_id, nome) do update set nome = excluded.nome
            returning id into v_motivo_padrao;
          new.status := 'perdido';
          new.motivo_perda_id := v_motivo_padrao;
        end if;
      end if;
    end if;
    if new.status is distinct from old.status then
      new.fechado_em := case when new.status = 'aberto' then null else now() end;
    end if;

    -- Negócio ganho não tem mais edição comum de valor: só a RPC corrigir_valor_negocio
    -- (que seta a flag local à transação antes do UPDATE dela mesma) pode mudar valor
    -- de um negócio que já estava ganho antes deste UPDATE.
    if old.status = 'ganho' and new.valor is distinct from old.valor
       and coalesce(current_setting('raion.permitir_correcao_valor', true), '') <> 'on' then
      raise exception 'Negócio ganho: use a ação "Corrigir valor" pra alterar o valor.'
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if not exists (select 1 from public.etapas where id = new.etapa_id and funil_id = new.funil_id and empresa_id = new.empresa_id) then
    raise exception 'Etapa não pertence ao funil' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.contatos where id = new.contato_id and empresa_id = new.empresa_id) then
    raise exception 'Contato de outra empresa' using errcode = 'check_violation';
  end if;
  if new.origem_id is not null and not exists (select 1 from public.origens where id = new.origem_id and empresa_id = new.empresa_id) then
    raise exception 'Origem de outra empresa' using errcode = 'check_violation';
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.empresa_membros where id = new.responsavel_id and empresa_id = new.empresa_id and ativo
  ) then
    raise exception 'Responsável precisa ser um usuário ativo da empresa' using errcode = 'check_violation';
  end if;

  -- Perda: motivo obrigatório. Aberto ou ganho: sem motivo.
  if new.status = 'perdido' then
    if new.motivo_perda_id is null then
      raise exception 'Escolha o motivo da perda.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if not exists (select 1 from public.motivos_perda where id = new.motivo_perda_id and empresa_id = new.empresa_id) then
      raise exception 'Motivo de outra empresa' using errcode = 'check_violation';
    end if;
  else
    new.motivo_perda_id := null;
    new.motivo_perda_detalhe := null;
  end if;

  if new.status = 'ganho' and coalesce(new.valor, 0) <= 0
     and (tg_op = 'INSERT' or old.status is distinct from 'ganho' or new.valor is distinct from old.valor) then
    raise exception 'Informe o valor do negócio antes de marcar como ganho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Campos obrigatórios da etapa: conferidos ao entrar nela.
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    select nome, campos_obrigatorios into v_etapa from public.etapas where id = new.etapa_id;
    if cardinality(v_etapa.campos_obrigatorios) > 0 then
      select telefone, email, documento, cidade into v_contato from public.contatos where id = new.contato_id;
      if 'valor' = any (v_etapa.campos_obrigatorios) and coalesce(new.valor, 0) <= 0 then
        v_faltando := array_append(v_faltando, 'valor');
      end if;
      if 'origem' = any (v_etapa.campos_obrigatorios) and new.origem_id is null then
        v_faltando := array_append(v_faltando, 'origem');
      end if;
      if 'descricao' = any (v_etapa.campos_obrigatorios) and nullif(trim(new.descricao), '') is null then
        v_faltando := array_append(v_faltando, 'descrição');
      end if;
      if 'contato_telefone' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.telefone), '') is null then
        v_faltando := array_append(v_faltando, 'telefone do contato');
      end if;
      if 'contato_email' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.email::text), '') is null then
        v_faltando := array_append(v_faltando, 'e-mail do contato');
      end if;
      if 'contato_documento' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.documento), '') is null then
        v_faltando := array_append(v_faltando, 'CPF/CNPJ do contato');
      end if;
      if 'contato_cidade' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.cidade), '') is null then
        v_faltando := array_append(v_faltando, 'cidade do contato');
      end if;
      if cardinality(v_faltando) > 0 then
        raise exception 'Para entrar em "%", preencha: %.', v_etapa.nome, array_to_string(v_faltando, ', ')
          using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- corrigir_valor_negocio: única forma de alterar valor de negócio ganho. Lock de
-- linha (for update) serializa correções concorrentes — a segunda corrigenda espera a
-- primeira commitar e enxerga o valor já corrigido (de/delta corretos, sem perda de
-- atualização). Não gera XP/moedas (nenhuma gamification_rules pra deal.value_corrected
-- por padrão — o motor simplesmente não encontra regra e não insere no point_ledger) e
-- não entra no catálogo configurável da Gamificação (EVENTOS_GAMIFICACAO em
-- src/lib/gamificacao.ts não foi alterado).
-- ---------------------------------------------------------------------------

create or replace function public.corrigir_valor_negocio(p_negocio_id uuid, p_novo_valor numeric, p_motivo text)
returns public.eventos
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_ator uuid := (select auth.uid());
  v_evento_won_id bigint;
  v_beneficiario uuid;
  v_perfil public.perfil_gamificacao;
  v_evento public.eventos;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if not public.tem_papel(v_negocio.empresa_id, '{admin,gestor}') then
    raise exception 'Só gestor ou admin pode corrigir o valor de um negócio ganho.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.pode_ver_negocio(p_negocio_id) then
    raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  if v_negocio.status <> 'ganho' then
    raise exception 'Só é possível corrigir valor de negócio ganho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo da correção.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_novo_valor is null or p_novo_valor < 0 then
    raise exception 'Informe um valor válido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_novo_valor = v_negocio.valor then
    raise exception 'O novo valor precisa ser diferente do valor atual.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- deal.won ativo do ciclo atual: sempre o mais recente do negócio — nunca há mais de um
  -- deal.won sem uma transição de status entre eles (cada deal.won nasce de uma mudança de
  -- status, e o negócio está 'ganho' agora, então nenhuma transição aconteceu depois dele).
  select id, beneficiario_id, profile_at_event into v_evento_won_id, v_beneficiario, v_perfil
    from public.eventos
    where entidade = 'negocio' and entidade_id = p_negocio_id and tipo = 'deal.won'
    order by created_at desc limit 1;
  if v_evento_won_id is null then
    raise exception 'Nenhum deal.won encontrado pra este negócio — não é possível corrigir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  perform set_config('raion.permitir_correcao_valor', 'on', true);
  update public.negocios set valor = p_novo_valor where id = p_negocio_id;
  perform set_config('raion.permitir_correcao_valor', 'off', true);

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (v_negocio.empresa_id, 'deal.value_corrected', v_ator, v_beneficiario, 'negocio', p_negocio_id,
            jsonb_build_object('de', v_negocio.valor, 'para', p_novo_valor, 'delta', p_novo_valor - v_negocio.valor,
                                'motivo', p_motivo, 'evento_original_id', v_evento_won_id),
            v_perfil)
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function public.corrigir_valor_negocio(uuid, numeric, text) from public, anon;
grant execute on function public.corrigir_valor_negocio(uuid, numeric, text) to authenticated;
