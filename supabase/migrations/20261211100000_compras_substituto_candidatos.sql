-- Compras: o setor que atende no lugar dele também é candidato, recebe as tarefas e entra como participante
-- (Perfis e setores, pendência do 2c).
--
-- Decisões do Evandro (16/11/2026 e 17/11/2026), sobre a regra de 05/11 ("o setor que atende Compras vale só enquanto
-- ninguém ativo tiver o setor Compras"):
--  1. Autorização nas obras: a perda do substituto quando alguém entra em Compras continua (é a regra). Nada muda em
--     `autorizacao_setor_obra`.
--  2. Candidatos a participante e tarefas do setor Compras: enquanto a regra valer, quem atua no setor que atende no
--     lugar de Compras (`setor_atende_compras`) entra na lista de candidatos, pode ser atribuído como participante de
--     Compras na obra e pode ser responsável por tarefa de Compras. Com alguém ativo em Compras, só ele; sem escolha do
--     admin (nulo), ninguém.
--  3. O coordenador do setor que atende no lugar de Compras coordena as tarefas de Compras (também as sem obra) e
--     escolhe o responsável ao criá-las, como já coordena Compras nas obras.
--
-- Como: `setor_efetivo_obra` faz a troca (Compras -> `setor_atende_compras`; os demais setores ficam como estão), a
-- mesma que `autorizacao_setor_obra` já faz, e passa a valer em `membro_atua_no_setor` (responsável de tarefa, tarefas
-- automáticas, substituto da obra), `membros_do_setor` (lista de candidatos), `atribuir_participante_obra` (o
-- colaborador precisa ter o setor), `autorizacao_tarefa_setor` e `criar_tarefa_setor` (coordenador do setor).
-- Corpos de 20261029210000_tarefas_setor.sql, 20261122100000_gestor_escreve_setores.sql e
-- 20261123100000_substituto_obra.sql; fora a troca do setor, iguais.
--
-- Depende de: setor_atende_compras (20261125100000), tem_papel, meu_membro_id.

set lock_timeout = '5s';

-- Setor cujos membros atuam por `p_setor` na empresa: em Compras, o setor que atende no lugar dele (nulo = ninguém);
-- os demais, o próprio setor. Interna.
create or replace function public.setor_efetivo_obra(p_empresa_id uuid, p_setor public.setor_obra)
returns public.setor_obra
language sql stable security definer set search_path = ''
as $$
  select case when p_setor = 'compras' then public.setor_atende_compras(p_empresa_id) else p_setor end;
$$;
revoke all on function public.setor_efetivo_obra(uuid, public.setor_obra) from public, anon, authenticated, service_role;

-- Membro ativo de Operação que atua no setor (executar ou coordenar). Em Compras, o setor que atende no lugar dele.
create or replace function public.membro_atua_no_setor(p_empresa_id uuid, p_membro_id uuid, p_setor public.setor_obra)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros m
    join public.membro_setores_obra s on s.empresa_id = m.empresa_id and s.membro_id = m.id
      and s.setor = public.setor_efetivo_obra(p_empresa_id, p_setor)
    where m.id = p_membro_id and m.empresa_id = p_empresa_id and m.ativo and m.papel = 'operacao'
  );
$$;
revoke all on function public.membro_atua_no_setor(uuid, uuid, public.setor_obra) from public, anon, authenticated, service_role;

-- Quem atua no setor (para escolher o responsável de tarefa ou o participante da obra): admin, gestor ou o
-- coordenador do setor recebem a lista. Em Compras, o setor que atende no lugar dele (sem ninguém em Compras).
create or replace function public.membros_do_setor(p_empresa_id uuid, p_setor public.setor_obra)
returns table (membro_id uuid, capacidade public.capacidade_obra)
language sql stable security definer set search_path = ''
as $$
  select s.membro_id, s.capacidade
  from public.membro_setores_obra s
  join public.empresa_membros m on m.id = s.membro_id and m.empresa_id = s.empresa_id and m.ativo and m.papel = 'operacao'
  where s.empresa_id = p_empresa_id
    and s.setor = public.setor_efetivo_obra(p_empresa_id, p_setor)
    and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or exists (
        select 1 from public.membro_setores_obra eu
        where eu.empresa_id = p_empresa_id and eu.membro_id = public.meu_membro_id(p_empresa_id)
          and eu.setor = public.setor_efetivo_obra(p_empresa_id, p_setor)
          and eu.capacidade = 'coordenar'
      )
    )
  order by s.membro_id;
$$;

-- Autorização para agir na tarefa (corpo de 20261122100000). Coordenador: em Compras, o do setor que atende no lugar dele.
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
        and s.setor = public.setor_efetivo_obra(t.empresa_id, t.setor) and s.capacidade = 'coordenar'
    ) then 'coordenar'
    when t.negocio_id is not null
      and public.membro_atua_no_setor(t.empresa_id, public.meu_membro_id(t.empresa_id), t.setor) then 'executar'
    when t.responsavel_id = public.meu_membro_id(t.empresa_id)
      and public.membro_atua_no_setor(t.empresa_id, t.responsavel_id, t.setor) then 'executar'
  end
  from public.tarefas_setor t where t.id = p_tarefa_id;
$$;

-- Criar tarefa (corpo de 20261122100000). Coordenador que escolhe o responsável: em Compras, o do setor que atende no
-- lugar dele.
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
        where s.empresa_id = v_empresa and s.membro_id = v_eu and s.setor = public.setor_efetivo_obra(v_empresa, p_setor) and s.capacidade = 'coordenar'
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

-- Atribuir participante (corpo de 20261123100000). O colaborador precisa ter o setor; em Compras, o que atende no
-- lugar dele.
create or replace function public.atribuir_participante_obra(
  p_obra_id uuid,
  p_membro_id uuid,
  p_setor public.setor_obra,
  p_funcao public.funcao_participante_obra default 'apoio',
  p_principal boolean default false,
  p_substitui_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_empresa uuid;
  v_meu uuid;
  v_alvo public.empresa_membros;
  v_ant public.obra_participantes;
  v_principal public.obra_participantes;
  v_substituto public.obra_participantes;
  v_id uuid;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, false);
  if v_aut not in ('admin', 'coordenar') then
    raise exception 'Você não pode atribuir participantes neste setor.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  select o.empresa_id into v_empresa from public.obras o where o.id = p_obra_id;
  v_meu := public.meu_membro_id(v_empresa);

  if p_funcao is null or p_funcao not in ('responsavel', 'apoio', 'substituto') then
    raise exception 'Função inválida para a obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce(p_principal, false) and p_funcao <> 'responsavel' then
    raise exception 'O responsável principal precisa ter a função Responsável.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Trava o alvo: não é desativado nem muda de papel no meio da atribuição.
  select * into v_alvo from public.empresa_membros where id = p_membro_id for update;
  if not found or v_alvo.empresa_id <> v_empresa or not v_alvo.ativo or v_alvo.papel <> 'operacao' then
    raise exception 'O colaborador precisa estar ativo, ser da mesma empresa e ter o papel Operação.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (
    select 1 from public.membro_setores_obra s
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.setor = public.setor_efetivo_obra(v_empresa, p_setor)
  ) then
    raise exception 'O colaborador não tem este setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_aut = 'coordenar' then
    if p_membro_id = v_meu then
      raise exception 'Você não pode se atribuir a uma obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
    if exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.capacidade = 'coordenar'
    ) then
      raise exception 'Só o admin atribui um coordenador a uma obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  end if;

  if p_substitui_id is not null then
    select * into v_ant from public.obra_participantes where id = p_substitui_id for update;
    if not found or v_ant.obra_id <> p_obra_id or v_ant.setor <> p_setor or v_ant.fim is not null then
      raise exception 'A participação substituída precisa estar ativa nesta obra e neste setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_ant.membro_id = v_meu then
      raise exception 'Você não pode encerrar a própria participação.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  end if;

  if coalesce(p_principal, false) then
    select * into v_principal from public.obra_participantes
    where obra_id = p_obra_id and setor = p_setor and principal and fim is null
    for update;
    if found and v_principal.id is distinct from p_substitui_id then
      raise exception 'Este setor já tem um responsável principal: informe a substituição.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- O principal não pode ser também o substituto do setor.
    if exists (
      select 1 from public.obra_participantes p
      where p.obra_id = p_obra_id and p.setor = p_setor and p.membro_id = p_membro_id
        and p.funcao = 'substituto' and p.fim is null and p.id is distinct from p_substitui_id
    ) then
      raise exception 'Esta pessoa é o substituto do setor: encerre a substituição antes de torná-la principal.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if p_funcao = 'substituto' then
    if exists (
      select 1 from public.obra_participantes p
      where p.obra_id = p_obra_id and p.setor = p_setor and p.membro_id = p_membro_id
        and p.principal and p.fim is null and p.id is distinct from p_substitui_id
    ) then
      raise exception 'O responsável principal não pode ser o próprio substituto.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- Um substituto por setor na obra: havendo outro, só entra substituindo-o.
    select * into v_substituto from public.obra_participantes
    where obra_id = p_obra_id and setor = p_setor and funcao = 'substituto' and fim is null
    for update;
    if found and v_substituto.id is distinct from p_substitui_id then
      raise exception 'Este setor já tem um substituto: informe a substituição.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if exists (
    select 1 from public.obra_participantes p
    where p.obra_id = p_obra_id and p.membro_id = p_membro_id and p.setor = p_setor
      and p.funcao = p_funcao and p.fim is null and p.id is distinct from p_substitui_id
  ) then
    raise exception 'O colaborador já participa deste setor da obra com essa função.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_substitui_id is not null then
    update public.obra_participantes set fim = now() where id = p_substitui_id;
    perform public.registrar_historico_obra(p_obra_id, 'participante_encerrado', p_setor, jsonb_build_object(
      'participante_id', v_ant.id,
      'membro_id', v_ant.membro_id,
      'funcao', v_ant.funcao,
      'principal', v_ant.principal,
      'origem', 'substituicao',
      'motivo', 'Substituído',
      'autorizacao', v_aut
    ));
  end if;

  insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, substitui_id, criado_por_user_id)
  values (p_obra_id, v_empresa, p_membro_id, p_setor, p_funcao, coalesce(p_principal, false), p_substitui_id, (select auth.uid()))
  returning id into v_id;

  perform public.registrar_historico_obra(p_obra_id, 'participante_atribuido', p_setor, jsonb_build_object(
    'participante_id', v_id,
    'membro_id', p_membro_id,
    'funcao', p_funcao,
    'principal', coalesce(p_principal, false),
    'substitui_id', p_substitui_id,
    'autorizacao', v_aut
  ));
  return v_id;
end;
$$;

reset lock_timeout;
