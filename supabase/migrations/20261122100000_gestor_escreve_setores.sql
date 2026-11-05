-- Gestor escreve em todos os setores da obra, com histórico (etapa C dos Perfis e setores).
--
-- Decisões do Evandro (05/11/2026):
--  1. O gestor age como COORDENADOR em todos os setores operacionais (Compras, Engenharia, Operacional e
--     Administrativo) de qualquer obra da empresa: altera fluxos e marcos, gere participantes e lança/paga contas.
--     O que hoje é só do admin continua só do admin: atribuir um coordenador a uma obra
--     (`atribuir_participante_obra`), concluir a Engenharia sem conexão (`concluir_engenharia_sem_conexao`) e as
--     tabelas de configuração.
--  2. O gestor também conclui, responde, atribui e cancela tarefas de setor (também as do negócio).
--  3. Histórico: `registrar_historico_obra` já grava `autor_contexto.papel`; a ficha mostra "(gestor)" no autor.
--
-- Como: as duas portas de autorização devolvem 'coordenar' para o gestor, e as ~40 RPCs que passam por
-- `preparar_escrita_obra` / `autorizacao_tarefa_setor` herdam a regra sem mudar. O gestor não tem setores em
-- `membro_setores_obra` (só `operacao` tem), então nunca "executa" nem assume tarefa para si, e nunca é alvo de
-- atribuição. Vale só dentro da própria empresa (`tem_papel`); obra cancelada continua sem aceitar nada.
--
-- Só troca corpo de função (mesma assinatura): os privilégios de EXECUTE ficam como estão.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Autorização por setor da obra (corpo de 20261008100000 + gestor)
-- ---------------------------------------------------------------------------

create or replace function public.autorizacao_setor_obra(p_obra_id uuid, p_setor public.setor_obra)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p_setor is null or p_setor = 'comercial' then null
    when public.tem_papel(o.empresa_id, '{admin}') then 'admin'
    when public.tem_papel(o.empresa_id, '{gestor}') then 'coordenar'
    when not public.tem_papel(o.empresa_id, '{operacao}') then null
    when exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = o.empresa_id
        and s.membro_id = public.meu_membro_id(o.empresa_id)
        and s.setor = p_setor
        and s.capacidade = 'coordenar'
    ) then 'coordenar'
    when exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = o.empresa_id
        and s.membro_id = public.meu_membro_id(o.empresa_id)
        and s.setor = p_setor
    ) and exists (
      select 1 from public.obra_participantes p
      where p.obra_id = o.id
        and p.empresa_id = o.empresa_id
        and p.membro_id = public.meu_membro_id(o.empresa_id)
        and p.setor = p_setor
        and p.fim is null
    ) then 'executar'
  end
  from public.obras o where o.id = p_obra_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tarefas de setor (corpos de 20261029210000 e 20261119100100 + gestor)
-- ---------------------------------------------------------------------------

create or replace function public.autorizacao_tarefa_setor(p_tarefa_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when public.tem_papel(t.empresa_id, '{admin}') then 'admin'
    when public.tem_papel(t.empresa_id, '{gestor}') then 'coordenar'
    when not public.tem_papel(t.empresa_id, '{operacao}') then null
    when t.obra_id is not null and public.autorizacao_setor_obra(t.obra_id, t.setor) is not null
      then public.autorizacao_setor_obra(t.obra_id, t.setor)
    when exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = t.empresa_id and s.membro_id = public.meu_membro_id(t.empresa_id)
        and s.setor = t.setor and s.capacidade = 'coordenar'
    ) then 'coordenar'
    when t.negocio_id is not null
      and public.membro_atua_no_setor(t.empresa_id, public.meu_membro_id(t.empresa_id), t.setor) then 'executar'
    when t.responsavel_id = public.meu_membro_id(t.empresa_id)
      and public.membro_atua_no_setor(t.empresa_id, t.responsavel_id, t.setor) then 'executar'
  end
  from public.tarefas_setor t where t.id = p_tarefa_id;
$$;

create or replace function public.criar_tarefa_setor(
  p_setor public.setor_obra,
  p_titulo text,
  p_prazo date,
  p_obra_id uuid default null,
  p_negocio_id uuid default null,
  p_descricao text default null,
  p_responsavel_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_eu uuid;
  v_pode boolean;
  v_aut text;
  v_id uuid;
begin
  if num_nonnulls(p_obra_id, p_negocio_id) <> 1 then
    raise exception 'Informe a obra ou o negócio da tarefa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_setor is null or p_setor = 'comercial' then
    raise exception 'Escolha Compras, Engenharia, Operacional ou Administrativo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_titulo, ''))) < 2 then
    raise exception 'Informe o título da tarefa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_prazo is null or p_prazo < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O prazo não pode ser no passado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_obra_id is not null then
    select o.empresa_id into v_empresa from public.obras o where o.id = p_obra_id and o.cancelada_em is null;
    -- Na obra: admin, quem atua em algum setor dela (o gestor entra por aqui), ou o comercial que já vê a obra.
    v_pode := v_empresa is not null and (
      public.tem_papel(v_empresa, '{admin}')
      or exists (
        select 1 from unnest(array['compras', 'engenharia', 'operacional', 'administrativo']::public.setor_obra[]) s
        where public.autorizacao_setor_obra(p_obra_id, s) is not null
      )
      or (public.tem_acesso_comercial(v_empresa) and public.pode_ver_obra(p_obra_id))
    );
  else
    select n.empresa_id into v_empresa from public.negocios n where n.id = p_negocio_id and n.arquivado_em is null;
    -- No negócio: quem tem acesso comercial e vê o negócio.
    v_pode := v_empresa is not null and public.tem_acesso_comercial(v_empresa) and public.pode_ver_negocio(p_negocio_id);
  end if;
  if not coalesce(v_pode, false) then
    raise exception 'Você não pode criar tarefa aqui.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  v_eu := public.meu_membro_id(v_empresa);
  if p_responsavel_id is not null then
    -- Escolher a pessoa: admin, gestor ou coordenador do setor; a pessoa precisa atuar no setor.
    v_aut := case
      when public.tem_papel(v_empresa, '{admin}') then 'admin'
      when public.tem_papel(v_empresa, '{gestor}') then 'coordenar'
      when exists (
        select 1 from public.membro_setores_obra s
        where s.empresa_id = v_empresa and s.membro_id = v_eu and s.setor = p_setor and s.capacidade = 'coordenar'
      ) then 'coordenar'
      when p_responsavel_id = v_eu then 'executar'
    end;
    if v_aut is null then
      raise exception 'Só o coordenador do setor, o gestor ou o admin escolhe o responsável.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
    if not public.membro_atua_no_setor(v_empresa, p_responsavel_id, p_setor) then
      raise exception 'O responsável precisa atuar nesse setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  insert into public.tarefas_setor (empresa_id, obra_id, negocio_id, setor, titulo, descricao, prazo, responsavel_id, criado_por)
  values (v_empresa, p_obra_id, p_negocio_id, p_setor, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), p_prazo, p_responsavel_id, v_eu)
  returning id into v_id;

  perform public.registrar_historico_tarefa_setor(v_id, v_empresa, 'criada',
    jsonb_build_object('setor', p_setor, 'responsavel_id', p_responsavel_id, 'prazo', p_prazo));
  return v_id;
end;
$$;

-- Quem atua no setor (para escolher o responsável de tarefa ou o participante da obra): admin, gestor ou o
-- coordenador do setor recebem a lista.
create or replace function public.membros_do_setor(p_empresa_id uuid, p_setor public.setor_obra)
returns table (membro_id uuid, capacidade public.capacidade_obra)
language sql stable security definer set search_path = ''
as $$
  select s.membro_id, s.capacidade
  from public.membro_setores_obra s
  join public.empresa_membros m on m.id = s.membro_id and m.empresa_id = s.empresa_id and m.ativo and m.papel = 'operacao'
  where s.empresa_id = p_empresa_id and s.setor = p_setor
    and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or exists (
        select 1 from public.membro_setores_obra eu
        where eu.empresa_id = p_empresa_id and eu.membro_id = public.meu_membro_id(p_empresa_id)
          and eu.setor = p_setor and eu.capacidade = 'coordenar'
      )
    )
  order by s.membro_id;
$$;

reset lock_timeout;
