-- Contrato: o texto gerado só vem do servidor (etapa 1 de 2, decisão do Evandro em 18/11/2026).
--
-- Antes, o app montava o texto e o mandava pronto para `gerar_contrato_com_condicao(negócio, texto, condição, valor,
-- motivo)`: quem tem acesso ao financeiro do negócio conseguia chamar a mesma função pela API com um texto qualquer.
-- Agora o servidor monta o texto como antes e o guarda em `contratos_geracoes` com a service role (o usuário não lê
-- nem escreve nessa tabela); a geração recebe só o id dessa linha e a consome na sessão de quem pediu, com a RLS, as
-- travas e a autoria de sempre (inclusive a correção de valor do negócio ganho).
--
-- Esta etapa só acrescenta (a função antiga continua, para o app em produção não parar entre a migration e o deploy).
-- A etapa 2 tira a função antiga e trava o texto e a condição para gravação direta pela API.
--
-- Depende de: meu_membro_id, corrigir_valor_negocio, negocios_id_empresa_id_key.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Texto gerado pelo servidor, à espera de ser gravado
-- ---------------------------------------------------------------------------

create table public.contratos_geracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null,
  -- Quem pediu a geração: só essa pessoa consome a linha.
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  conteudo text not null,
  -- Condição escolhida pelo cliente (mesmo formato de `contratos.condicao_pagamento`), novo valor do negócio e motivo
  -- da correção; condição nula = o valor do negócio não muda.
  condicao jsonb,
  valor numeric,
  motivo text not null default '',
  created_at timestamptz not null default now(),
  constraint contratos_geracoes_negocio_empresa_fk foreign key (negocio_id, empresa_id)
    references public.negocios (id, empresa_id) on delete cascade
);
create index on public.contratos_geracoes (negocio_id, empresa_id);
create index on public.contratos_geracoes (membro_id);
create index on public.contratos_geracoes (empresa_id);

comment on table public.contratos_geracoes is
  'Texto do contrato montado pelo servidor (service role), consumido uma vez por gerar_contrato_com_condicao na sessão de quem pediu. Sem acesso para usuários do app.';

-- Só a service role escreve; ninguém do app lê. RLS ligada sem política: nega tudo a anon e authenticated.
alter table public.contratos_geracoes enable row level security;
revoke all on table public.contratos_geracoes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Consumo da linha (uma vez, só por quem pediu, até 10 minutos)
-- ---------------------------------------------------------------------------

create or replace function public.consumir_geracao_contrato(p_negocio_id uuid, p_geracao_id uuid)
returns public.contratos_geracoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_geracao public.contratos_geracoes;
begin
  delete from public.contratos_geracoes g
  where g.id = p_geracao_id
    and g.negocio_id = p_negocio_id
    and g.membro_id = public.meu_membro_id(g.empresa_id)
    and g.created_at > now() - interval '10 minutes'
  returning g.* into v_geracao;

  -- Sobras de quem chama (geração que falhou depois de montar o texto).
  delete from public.contratos_geracoes g
  where g.created_at <= now() - interval '10 minutes'
    and g.membro_id in (select m.id from public.empresa_membros m where m.user_id = (select auth.uid()));

  return v_geracao;
end;
$$;
revoke all on function public.consumir_geracao_contrato(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.consumir_geracao_contrato(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Geração pelo id da linha montada pelo servidor
-- ---------------------------------------------------------------------------

/*
 * Mesmo comportamento de `gerar_contrato_com_condicao(uuid, text, jsonb, numeric, text)`, com texto, condição, valor e
 * motivo vindos de `contratos_geracoes` (montados pelo servidor) em vez de parâmetros. Roda como quem chama: a RLS de
 * `negocios` e `contratos` e a correção de valor do negócio ganho (só admin ou gestor) valem como antes.
 */
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

  insert into public.contratos (empresa_id, negocio_id, conteudo, condicao_pagamento, criado_por, atualizado_por)
  values (v_negocio.empresa_id, p_negocio_id, v_geracao.conteudo, v_geracao.condicao, v_eu, v_eu)
  on conflict (negocio_id) do update
    set conteudo = excluded.conteudo, condicao_pagamento = excluded.condicao_pagamento, atualizado_por = excluded.atualizado_por
    where public.contratos.status = 'rascunho';
  get diagnostics v_gravados = row_count;
  if v_gravados <> 1 then
    raise exception 'Este contrato já saiu do rascunho: o texto não muda mais automaticamente.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.gerar_contrato_com_condicao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gerar_contrato_com_condicao(uuid, uuid) to authenticated;

reset lock_timeout;
