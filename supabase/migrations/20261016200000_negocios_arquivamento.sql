-- P1a-0 — Arquivamento de negócio (1ª de 2 migrations em sequência; a 2ª, P1a-1, fica para outra PR).
--
-- Por que vem ANTES: a P1a-1 (proposta_versoes) passará a recusar a exclusão de negócio, proposta e empresa com
-- versão emitida. O arquivamento precisa estar no banco E em uso no app (botão, filtros) antes disso, para ser a
-- alternativa à exclusão. A P1a-1 confere que esta foi aplicada e recusa rodar sem ela.
--
-- O que faz:
--  * 3 colunas anuláveis e 1 restrição de coerência em `negocios`; `arquivar_negocio` e `desarquivar_negocio`
--    (admin ou gestor, motivo obrigatório), registradas na auditoria existente (`logs_auditoria`);
--  * negócio arquivado fica SOMENTE LEITURA por qualquer caminho (API, service_role, funções do M1, dono), por
--    gatilhos em `negocios` e nas tabelas comerciais filhas, inclusive UPDATE só de updated_at; a única mudança
--    aceita é o banco anular sozinho a referência a um registro apagado (ON DELETE SET NULL); notas e etiquetas
--    continuam editáveis;
--  * arquivar e desarquivar só pelas funções, para qualquer papel (inclusive o dono) e sem INSERT já arquivado:
--    toda mudança de arquivamento passa pela auditoria;
--  * arquivar recusa negócio que uma rotina do M1 ainda alteraria (distribuição de lead ou repasse pendentes;
--    contrato, pagamento ou obra; responsável inativo) ou com tarefas abertas (informa quantas); essas
--    pendências também não nascem nem entram depois no arquivado (troca de negocio_id, volta a pendente);
--  * CONCORRÊNCIA: arquivar/desarquivar travam o negócio (FOR UPDATE); os gatilhos das tabelas filhas e das
--    tabelas do M1 conferidas pelo arquivar travam o mesmo negócio em FOR KEY SHARE antes de ler o estado. A
--    operação que chega depois espera a outra transação e revalida (testado com duas sessões reais).
-- O que NÃO faz: não bloqueia exclusão de negócio não arquivado; não altera nem recalcula nenhuma linha existente
-- (todas ficam não arquivadas); não gera evento, ponto nem comissão (arquivar e desarquivar não mudam etapa,
-- status, valor nem responsável); não altera nenhuma função, gatilho ou tabela existente do M1 (só acrescenta
-- gatilhos de proteção).
-- Depende de: tem_papel, meu_membro_id e logs_auditoria (já existentes).

set lock_timeout = '3s';

alter table public.negocios
  add column arquivado_em timestamptz,
  add column arquivado_por uuid references public.empresa_membros (id) on delete set null,
  add column motivo_arquivamento text,
  -- Não arquivado: as 3 colunas nulas. Arquivado: data e motivo preenchidos; o autor pode ficar nulo só se o
  -- membro que arquivou for apagado depois (on delete set null).
  add constraint negocios_arquivamento_coerente
    check ((arquivado_em is null and motivo_arquivamento is null and arquivado_por is null)
           or (arquivado_em is not null and length(btrim(coalesce(motivo_arquivamento, ''))) > 0));

-- As colunas de arquivamento só mudam por `arquivar_negocio` e `desarquivar_negocio`, que conferem papel, motivo e
-- pendências e gravam a auditoria. Vale para QUALQUER papel, inclusive o dono: as duas funções marcam a transação
-- com `raion.arquivamento_negocio` = id do negócio só durante o próprio UPDATE, e sem essa marca a mudança é
-- recusada (um UPDATE direto do dono arquivaria ou desarquivaria sem auditoria). Negócio também não NASCE
-- arquivado. Única exceção: o banco anular sozinho o autor quando o membro é apagado (ON DELETE SET NULL).
-- Limite (o mesmo de todo gatilho): quem é dono pode desligar gatilhos ou forjar a marca de propósito.
create or replace function public.negocios_proteger_arquivamento()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.arquivado_em is null and new.arquivado_por is null and new.motivo_arquivamento is null then
      return new;
    end if;
  elsif (new.arquivado_em, new.arquivado_por, new.motivo_arquivamento)
        is not distinct from (old.arquivado_em, old.arquivado_por, old.motivo_arquivamento) then
    return new;
  elsif new.arquivado_em is not distinct from old.arquivado_em
        and new.motivo_arquivamento is not distinct from old.motivo_arquivamento
        and new.arquivado_por is null
        and not exists (select 1 from public.empresa_membros where id = old.arquivado_por) then
    return new;
  elsif current_user not in ('authenticated', 'anon', 'service_role')
        and current_setting('raion.arquivamento_negocio', true) = new.id::text then
    return new;
  end if;
  raise exception 'Use arquivar ou desarquivar para mudar o arquivamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
end;
$$;
revoke all on function public.negocios_proteger_arquivamento() from public, anon, authenticated, service_role;
create trigger negocios_proteger_arquivamento
  before insert or update of arquivado_em, arquivado_por, motivo_arquivamento on public.negocios
  for each row execute function public.negocios_proteger_arquivamento();

-- Arquivar/desarquivar: admin ou gestor da empresa. Não apaga nada; ficha, versões e links continuam.
create or replace function public.arquivar_negocio(p_negocio_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_membro uuid;
  v_tarefas_abertas integer;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo do arquivamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found or not public.tem_papel(v_negocio.empresa_id, '{admin,gestor}') then
    raise exception 'Negócio não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_negocio.arquivado_em is not null then
    raise exception 'Este negócio já está arquivado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- As conferências abaixo rodam DEPOIS do FOR UPDATE, cada uma com um retrato novo (READ COMMITTED): quem criou
  -- pendência antes espera-se aqui e ela é vista; quem tenta criar depois espera este commit (gatilhos acima).
  -- Arquivado é somente leitura: recusa o que uma rotina do M1 ainda alteraria depois (a distribuição de lead
  -- expirada troca o responsável pelo cron; o aceite do repasse também; contrato, pagamento e obra seguem vivos).
  if exists (select 1 from public.atribuicoes_leads where negocio_id = p_negocio_id and status = 'pendente') then
    raise exception 'Há uma distribuição de lead pendente para este negócio: conclua antes de arquivar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.handoffs where negocio_id = p_negocio_id and status = 'pendente') then
    raise exception 'Há um repasse pendente para este negócio: conclua antes de arquivar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.contratos where negocio_id = p_negocio_id)
     or exists (select 1 from public.obras where negocio_id = p_negocio_id)
     or exists (select 1 from public.registros_pagamento where negocio_id = p_negocio_id)
     or exists (select 1 from public.confirmacoes_pagamento where negocio_id = p_negocio_id) then
    raise exception 'Negócio com contrato, pagamento ou obra não pode ser arquivado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Tarefas abertas ficariam congeladas (somente leitura): o usuário resolve antes; nada é concluído nem cancelado aqui.
  select count(*) into v_tarefas_abertas from public.tarefas where negocio_id = p_negocio_id and concluida_em is null;
  if v_tarefas_abertas > 0 then
    raise exception '%', case when v_tarefas_abertas = 1
        then 'Há 1 tarefa aberta neste negócio: conclua ou exclua a tarefa antes de arquivar.'
        else 'Há ' || v_tarefas_abertas || ' tarefas abertas neste negócio: conclua ou exclua as tarefas antes de arquivar.' end
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- `preparar_negocio` (M1) recusa qualquer alteração de negócio cujo responsável não está ativo.
  if v_negocio.responsavel_id is not null
     and not exists (select 1 from public.empresa_membros where id = v_negocio.responsavel_id and ativo) then
    raise exception 'O responsável deste negócio não está ativo: reatribua antes de arquivar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_membro := public.meu_membro_id(v_negocio.empresa_id);
  -- Marca só para este UPDATE (negocios_proteger_arquivamento exige); desfeita em seguida.
  perform set_config('raion.arquivamento_negocio', p_negocio_id::text, true);
  update public.negocios set arquivado_em = now(), arquivado_por = v_membro, motivo_arquivamento = v_motivo
   where id = p_negocio_id;
  perform set_config('raion.arquivamento_negocio', '', true);
  -- Histórico na auditoria existente (sem FK: sobrevive à exclusão do membro). Não gera evento de gamificação.
  insert into public.logs_auditoria (empresa_id, user_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (v_negocio.empresa_id, (select auth.uid()), 'arquivar', 'negocios', p_negocio_id::text,
          jsonb_build_object('arquivado_em', null, 'responsavel_id', v_negocio.responsavel_id),
          jsonb_build_object('arquivado_em', now(), 'motivo', v_motivo, 'membro_id', v_membro,
                             'membro_nome', (select pf.nome from public.perfis pf where pf.id = (select auth.uid()))));
end;
$$;
revoke all on function public.arquivar_negocio(uuid, text) from public, anon, service_role;
grant execute on function public.arquivar_negocio(uuid, text) to authenticated;

-- Desarquivar exige motivo. `p_novo_responsavel` (opcional) reatribui no mesmo UPDATE — obrigatório quando o
-- responsável deixou de estar ativo, porque o negócio não pode ser alterado (`preparar_negocio`, M1) nem
-- reatribuído enquanto arquivado. Validações do novo responsável: as do próprio M1 (`preparar_negocio`: membro
-- ativo da empresa; `exigir_responsavel_comercial`: papel comercial). Recompensa: nenhuma. O M1 registra a troca
-- no histórico (evento `deal.owner_changed` e atividade `responsavel_alterado`), e o motor de gamificação do M1
-- trata `deal.owner_changed` como estruturalmente inelegível (sem XP nem moedas, mesmo com regra ativa); metas,
-- conquistas e comissões não leem esse evento. Se o novo responsável for SDR, o M1 cria a tarefa "Realizar
-- primeiro contato", como em qualquer atribuição a SDR (`task.created` também é inelegível).
create or replace function public.desarquivar_negocio(p_negocio_id uuid, p_motivo text, p_novo_responsavel uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_membro uuid;
  v_responsavel uuid;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo do desarquivamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found or not public.tem_papel(v_negocio.empresa_id, '{admin,gestor}') then
    raise exception 'Negócio não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_negocio.arquivado_em is null then
    raise exception 'Este negócio não está arquivado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_responsavel := coalesce(p_novo_responsavel, v_negocio.responsavel_id);
  if p_novo_responsavel is null and v_negocio.responsavel_id is not null
     and not exists (select 1 from public.empresa_membros where id = v_negocio.responsavel_id and ativo) then
    raise exception 'O responsável deste negócio não está mais ativo: informe o novo responsável para desarquivar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_membro := public.meu_membro_id(v_negocio.empresa_id);
  perform set_config('raion.arquivamento_negocio', p_negocio_id::text, true);
  update public.negocios set arquivado_em = null, arquivado_por = null, motivo_arquivamento = null, responsavel_id = v_responsavel
   where id = p_negocio_id;
  perform set_config('raion.arquivamento_negocio', '', true);
  insert into public.logs_auditoria (empresa_id, user_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (v_negocio.empresa_id, (select auth.uid()), 'desarquivar', 'negocios', p_negocio_id::text,
          jsonb_build_object('arquivado_em', v_negocio.arquivado_em, 'arquivado_por', v_negocio.arquivado_por,
                             'motivo_arquivamento', v_negocio.motivo_arquivamento, 'responsavel_id', v_negocio.responsavel_id),
          jsonb_build_object('arquivado_em', null, 'motivo', v_motivo, 'membro_id', v_membro,
                             'membro_nome', (select pf.nome from public.perfis pf where pf.id = (select auth.uid())),
                             'responsavel_id', v_responsavel));
end;
$$;
revoke all on function public.desarquivar_negocio(uuid, text, uuid) from public, anon, service_role;
grant execute on function public.desarquivar_negocio(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Somente leitura do negócio arquivado — vale para QUALQUER papel e caminho (API, service_role, funções
-- SECURITY DEFINER do M1, dono), sem depender de pg_trigger_depth(). Ficam fora, de propósito: `notas`
-- (observações administrativas; o evento `note.created` é estruturalmente inelegível no motor do M1, sem
-- recompensa), etiquetas (`negocio_etiquetas` só tem `preparar_negocio_etiqueta`, que valida a
-- empresa: não gera evento, ponto, comissão, automação nem altera o negócio), logs (atividades, historico_etapas,
-- eventos, aberturas) e o cancelamento de versão emitida (P1a-1). Exceções de dados, não de papel:
--  * desarquivar (só pelas funções: `negocios_proteger_arquivamento` barra o resto);
--  * a anulação feita pelo próprio banco (ON DELETE SET NULL) quando um membro, origem, repasse, kit do catálogo
--    ou modelo é apagado — aceita só se o registro referenciado NÃO existe mais (anular pela API é recusado).
--    Sem isso, apagar um membro responsável por negócio arquivado seria bloqueado.
-- ---------------------------------------------------------------------------

-- Roda como dona (SECURITY DEFINER), como os gatilhos do M1: a RLS de quem chama não pode esconder o negócio
-- arquivado nem o registro referenciado. A regra não depende de papel.
-- Confere uma mudança de linha de negócio arquivado: fora `p_ignoradas`, nada muda; cada coluna 'col:tabela'
-- de `p_anulaveis` só pode mudar para nulo, e só quando o registro antigo não existe mais em public.<tabela>; e
-- PELO MENOS UMA foi anulada assim. Sem isso, um UPDATE só de updated_at (ou sem mudança, que o gatilho
-- *_updated_at, posterior a este, transformaria num "toque") passaria na linha arquivada.
create or replace function public.arquivado_so_anulacao_automatica(p_novo jsonb, p_velho jsonb, p_anulaveis text[], p_ignoradas text[])
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_par text;
  v_col text;
  v_existe boolean;
  v_anulou boolean := false;
begin
  if (p_novo - p_ignoradas) is distinct from (p_velho - p_ignoradas) then
    return false;
  end if;
  foreach v_par in array p_anulaveis loop
    v_col := split_part(v_par, ':', 1);
    if (p_novo -> v_col) is distinct from (p_velho -> v_col) then
      if (p_novo -> v_col) <> 'null'::jsonb then
        return false;
      end if;
      execute format('select exists (select 1 from public.%I where id = $1)', split_part(v_par, ':', 2))
        into v_existe using (p_velho ->> v_col)::uuid;
      if v_existe then
        return false;
      end if;
      v_anulou := true;
    end if;
  end loop;
  return v_anulou;
end;
$$;
revoke all on function public.arquivado_so_anulacao_automatica(jsonb, jsonb, text[], text[]) from public, anon, authenticated, service_role;

create or replace function public.negocios_arquivado_somente_leitura()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_anulaveis text[] := array['responsavel_id:empresa_membros', 'criado_por:empresa_membros', 'arquivado_por:empresa_membros',
                              'handoff_origem_id:handoffs', 'origem_id:origens'];
begin
  if old.arquivado_em is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Negócio arquivado não pode ser apagado: desarquive antes.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Desarquivar (só pelas funções). Pode trocar o responsável no mesmo UPDATE; o resto continua igual.
  if new.arquivado_em is null
     and (to_jsonb(new) - array['updated_at', 'arquivado_em', 'arquivado_por', 'motivo_arquivamento', 'responsavel_id'])
         = (to_jsonb(old) - array['updated_at', 'arquivado_em', 'arquivado_por', 'motivo_arquivamento', 'responsavel_id']) then
    return new;
  end if;
  if not public.arquivado_so_anulacao_automatica(to_jsonb(new), to_jsonb(old), v_anulaveis,
           array['updated_at', 'responsavel_id', 'criado_por', 'arquivado_por', 'handoff_origem_id', 'origem_id']) then
    raise exception 'Negócio arquivado é somente leitura: desarquive antes de alterar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.negocios_arquivado_somente_leitura() from public, anon, authenticated, service_role;
create trigger negocios_arquivado_somente_leitura
  before update or delete on public.negocios
  for each row execute function public.negocios_arquivado_somente_leitura();

-- Tabelas comerciais filhas. Argumentos do gatilho: 'coluna:tabela' que o banco anula sozinho (ON DELETE SET NULL).
-- Concorrência: antes de ler o estado, trava o(s) negócio(s) da linha em FOR KEY SHARE — o mesmo modo que a FK
-- usa, compatível com edições comuns do negócio, mas em conflito com o FOR UPDATE de arquivar/desarquivar. Se um
-- arquivamento estiver em curso, esta operação ESPERA o commit e lê a versão nova (READ COMMITTED; em níveis mais
-- altos o PostgreSQL recusa por serialização). Sem a trava, a leitura antecipava o commit e a linha passava
-- (provado com duas sessões). Ordem por id: duas operações que movem linhas entre os mesmos negócios não se
-- travam em ordem inversa.
create or replace function public.negocio_arquivado_bloquear_filho()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_anulaveis text[] := coalesce(tg_argv, '{}');
  v_novo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_velho jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_arquivado boolean;
begin
  select coalesce(bool_or(n.arquivado_em is not null), false) into v_arquivado
    from (select arquivado_em from public.negocios
          where id in ((v_novo ->> 'negocio_id')::uuid, (v_velho ->> 'negocio_id')::uuid)
          order by id
          for key share) n;
  if not v_arquivado then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and public.arquivado_so_anulacao_automatica(v_novo, v_velho, v_anulaveis,
       array['updated_at'] || array(select split_part(a, ':', 1) from unnest(v_anulaveis) a)) then
    return new;
  end if;
  raise exception 'Negócio arquivado é somente leitura: desarquive antes de alterar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
end;
$$;
revoke all on function public.negocio_arquivado_bloquear_filho() from public, anon, authenticated, service_role;
create trigger calculos_solares_arquivado_somente_leitura before insert or update or delete on public.calculos_solares
  for each row execute function public.negocio_arquivado_bloquear_filho('criado_por:empresa_membros', 'atualizado_por:empresa_membros', 'kit_id:kits_solares');
create trigger kit_componentes_arquivado_somente_leitura before insert or update or delete on public.kit_componentes
  for each row execute function public.negocio_arquivado_bloquear_filho();
create trigger propostas_arquivado_somente_leitura before insert or update or delete on public.propostas
  for each row execute function public.negocio_arquivado_bloquear_filho('criado_por:empresa_membros', 'atualizado_por:empresa_membros', 'modelo_id:proposta_modelos');
create trigger tarefas_arquivado_somente_leitura before insert or update or delete on public.tarefas
  for each row execute function public.negocio_arquivado_bloquear_filho('responsavel_id:empresa_membros', 'criado_por:empresa_membros', 'concluida_por:empresa_membros');
create trigger anexos_arquivado_somente_leitura before insert or update or delete on public.anexos
  for each row execute function public.negocio_arquivado_bloquear_filho('enviado_por:empresa_membros');
create trigger handoffs_arquivado_somente_leitura before insert or update or delete on public.handoffs
  for each row execute function public.negocio_arquivado_bloquear_filho('de_membro_id:empresa_membros', 'respondido_por:empresa_membros');

-- Pendências que o arquivar confere (distribuição de lead, contrato, pagamento, obra): não podem NASCER num
-- negócio arquivado nem durante o arquivamento (a trava acima serializa com ele), nem ENTRAR nele depois.
--  * atribuicoes_leads, contratos e obras: INSERT e UPDATE. Sem o UPDATE, service_role e o dono transfeririam
--    uma distribuição pendente ou um contrato para o arquivado (troca de negocio_id) e devolveriam a pendente
--    uma distribuição já decidida do arquivado (as decididas continuam nele). As rotinas do M1 só alteram
--    distribuição pendente e contrato/obra existentes, que o arquivar recusa: nada delas passa por aqui.
--  * registros_pagamento e confirmacoes_pagamento: só INSERT. O UPDATE já não tem concessão para a API e o
--    gatilho do M1 trava negocio_id e os demais dados para qualquer papel, inclusive o dono.
--  * DELETE segue só com as regras do M1: apagar não cria pendência (o negócio arquivado não pode ser apagado).
create trigger atribuicoes_leads_arquivado_somente_leitura before insert or update on public.atribuicoes_leads
  for each row execute function public.negocio_arquivado_bloquear_filho('membro_final_id:empresa_membros', 'decidido_por:empresa_membros');
create trigger contratos_arquivado_somente_leitura before insert or update on public.contratos
  for each row execute function public.negocio_arquivado_bloquear_filho('criado_por:empresa_membros', 'atualizado_por:empresa_membros', 'responsavel_assinatura_id:empresa_membros');
create trigger registros_pagamento_arquivado_somente_leitura before insert on public.registros_pagamento
  for each row execute function public.negocio_arquivado_bloquear_filho();
create trigger confirmacoes_pagamento_arquivado_somente_leitura before insert on public.confirmacoes_pagamento
  for each row execute function public.negocio_arquivado_bloquear_filho();
create trigger obras_arquivado_somente_leitura before insert or update on public.obras
  for each row execute function public.negocio_arquivado_bloquear_filho();

reset lock_timeout;
