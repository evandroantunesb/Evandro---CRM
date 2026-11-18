-- Contrato: texto só pelo servidor, etapa 2 de 2 (decisão do Evandro, 18/11/2026; plano em
-- docs/superpowers/plans/2026-11-18-contrato-texto-servidor.md). A etapa 1 (20261214100000) criou o caminho novo
-- (texto montado pelo servidor em `contratos_geracoes`); esta fecha os caminhos antigos:
--
--  1. Sai `gerar_contrato_com_condicao(uuid, text, jsonb, numeric, text)`, que aceitava texto vindo do usuário.
--  2. Para usuários do app (papel `authenticated` no JWT), `contratos` só recebe `insert` e só muda `conteudo` ou
--     `condicao_pagamento` dentro de `gerar_contrato_com_condicao(uuid, uuid)` (texto do servidor) ou, só o texto,
--     de `editar_texto_contrato` (com marca e histórico). Status, assinatura, pagamento e o resto seguem como hoje;
--     service role e scripts no banco não mudam.
--
-- As marcas são `set_config(..., true)`: locais à transação e fora do alcance do cliente (o PostgREST só expõe
-- funções de `public`; `set_config` é de `pg_catalog`), mesma técnica de 20261002170000.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Assinatura antiga da geração
-- ---------------------------------------------------------------------------

drop function public.gerar_contrato_com_condicao(uuid, text, jsonb, numeric, text);

-- ---------------------------------------------------------------------------
-- 2. Trava de texto e condição
-- ---------------------------------------------------------------------------

create or replace function public.contratos_texto_pelo_servidor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'authenticated'
     or coalesce(current_setting('raion.contrato_geracao', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'O contrato só é criado pelo botão "Gerar contrato".' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if new.condicao_pagamento is distinct from old.condicao_pagamento then
    raise exception 'A condição de pagamento só muda gerando o contrato de novo.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if new.conteudo is distinct from old.conteudo
     and coalesce(current_setting('raion.contrato_edicao_manual', true), '') <> 'on' then
    raise exception 'O texto do contrato só muda gerando de novo ou pelo botão "Editar texto".' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.contratos_texto_pelo_servidor() from public, anon, authenticated;

create trigger contratos_texto_pelo_servidor before insert or update on public.contratos
  for each row execute function public.contratos_texto_pelo_servidor();

-- ---------------------------------------------------------------------------
-- 3. Geração com a marca
-- ---------------------------------------------------------------------------

-- Igual à etapa 1, com a marca `raion.contrato_geracao` só em volta da gravação do contrato.
create or replace function public.gerar_contrato_com_condicao(p_negocio_id uuid, p_geracao_id uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_geracao public.contratos_geracoes;
  v_eu uuid;
  v_gravados integer;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_eu := public.meu_membro_id(v_negocio.empresa_id);

  v_geracao := public.consumir_geracao_contrato(p_negocio_id, p_geracao_id);
  if v_geracao.id is null then
    raise exception 'O contrato montado expirou. Gere de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if v_geracao.condicao is not null and v_geracao.valor is not null and v_geracao.valor is distinct from v_negocio.valor then
    if v_geracao.valor <= 0 then
      raise exception 'Valor do negócio inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_negocio.status = 'ganho' then
      -- Só admin ou gestor; registra a correção para metas e comissões.
      perform public.corrigir_valor_negocio(p_negocio_id, v_geracao.valor, v_geracao.motivo);
    else
      update public.negocios set valor = v_geracao.valor where id = p_negocio_id;
      get diagnostics v_gravados = row_count;
      if v_gravados <> 1 then
        raise exception 'Sem permissão para mudar o valor deste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
      end if;
    end if;
  end if;

  perform set_config('raion.contrato_geracao', 'on', true);
  insert into public.contratos (empresa_id, negocio_id, conteudo, condicao_pagamento, criado_por, atualizado_por)
  values (v_negocio.empresa_id, p_negocio_id, v_geracao.conteudo, v_geracao.condicao, v_eu, v_eu)
  on conflict (negocio_id) do update
    set conteudo = excluded.conteudo, condicao_pagamento = excluded.condicao_pagamento, atualizado_por = excluded.atualizado_por
    where public.contratos.status = 'rascunho';
  get diagnostics v_gravados = row_count;
  perform set_config('raion.contrato_geracao', '', true);
  if v_gravados <> 1 then
    raise exception 'Este contrato já saiu do rascunho: o texto não muda mais automaticamente.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.gerar_contrato_com_condicao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gerar_contrato_com_condicao(uuid, uuid) to authenticated;

reset lock_timeout;
