-- Operação / Obras — PR 3b-3: escritas controladas do papel `operacao` em Obras.
-- Arquitetura aprovada pelo Evandro. Sem tela nova.
--
-- Intocados: `garantir_obra`, snapshots e gatilhos da #145; `pode_ver_obra`,
-- `pode_ver_valor_vendido_obra`, `obra_dados_comerciais` e toda a leitura da 3b-2
-- (`pode_ver_obra_operacao`, `obras_operacao`, policies). A escrita direta nas tabelas de
-- Obras continua revogada (inclusive para service_role): tudo passa pelas RPCs abaixo.
--
-- O que muda:
-- 1. `autorizacao_setor_obra` (interna): ÚNICA regra de quem atua em um setor da obra.
--      admin da empresa ............................ 'admin'      (qualquer setor operacional)
--      operacao que COORDENA o setor ............... 'coordenar'  (mesmo sem participar)
--      operacao participante ATIVO no setor e que
--        ainda tem o setor em membro_setores_obra .. 'executar'
--      qualquer outro (gestor, vendedor, SDR, super-admin, outra empresa, inativo) → nulo
--    Setor `comercial` nunca é atuável. Coordenar não dá nada fora do próprio setor.
-- 2. Participantes: `atribuir_participante_obra` e `encerrar_participante_obra` (admin;
--    coordenador só no setor que coordena, nunca a si mesmo, nunca outro coordenador).
--    Participação ativa libera dados pessoais em `obras_operacao` (3b-2): por isso nunca
--    fica "adormecida" — é encerrada automaticamente quando o setor é retirado do membro,
--    quando o membro é desativado e quando ele deixa o papel `operacao`. Voltar exige nova
--    atribuição. Participações comerciais (vendedor/SDR da #145) nunca são tocadas.
-- 3. Fluxos: `alterar_status_fluxo_obra`, `marcar_parado_fluxo_obra`,
--    `definir_aguardando_fluxo_obra`. Qualquer status válido do próprio setor (retrocesso
--    permitido e auditado). Datas só no servidor.
-- 4. Marcos (nf_cliente, garantia): `atualizar_marco_obra`, só setor operacional.
-- 5. Obra cancelada: nenhuma escrita. Obra pausada: bloqueia fluxos e marcos; permite gerir
--    participantes. Estorno de pagamento não bloqueia.
-- 6. `obra_historico` ganha 4 tipos (participante_atribuido, participante_encerrado,
--    fluxo_alterado, marco_alterado), sempre pelo `registrar_historico_obra` (autor real).
-- 7. `membro_setores_obra_historico`: auditoria imutável das mudanças de setor/capacidade
--    (antes/depois, autor real), lida pelo admin da empresa e pelo super-admin (mesmo padrão
--    de `logs_auditoria`).

-- ---------------------------------------------------------------------------
-- Histórico da obra: novos tipos
-- ---------------------------------------------------------------------------

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado'
));

-- ---------------------------------------------------------------------------
-- Auditoria de setores do membro
-- ---------------------------------------------------------------------------

-- Setor é permissão da empresa (não de uma obra): auditoria própria. Uma linha por setor
-- que mudou: capacidade antes/depois (nulo = sem o setor). Autor real, sem FK nas colunas
-- de autor nem no membro (um `on delete set null` reescreveria o fato).
create table public.membro_setores_obra_historico (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null,
  setor public.setor_obra not null,
  capacidade_antes public.capacidade_obra,
  capacidade_depois public.capacidade_obra,
  autor_user_id uuid,
  autor_membro_id uuid,
  autor_contexto jsonb,
  created_at timestamptz not null default now(),
  constraint membro_setores_obra_historico_mudou check (capacidade_antes is distinct from capacidade_depois)
);
create index on public.membro_setores_obra_historico (empresa_id, membro_id, created_at desc);

-- Imutável: nem as funções alteram ou apagam. DELETE só em cascata (empresa inteira).
create or replace function public.proteger_membro_setores_obra_historico()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'O histórico de setores não pode ser alterado nem apagado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
end;
$$;

create trigger membro_setores_obra_historico_imutavel
  before update or delete on public.membro_setores_obra_historico
  for each row execute function public.proteger_membro_setores_obra_historico();

alter table public.membro_setores_obra_historico enable row level security;

-- Leitura: admin da empresa e super-admin (padrão de `logs_auditoria`).
create policy "admin lê histórico de setores" on public.membro_setores_obra_historico
  for select to authenticated
  using (public.tem_papel(empresa_id, '{admin}') or public.e_plataforma_admin());

-- Ninguém escreve direto (nem service_role): só `definir_setores_membro`.
revoke all on public.membro_setores_obra_historico from anon;
revoke insert, update, delete, truncate on public.membro_setores_obra_historico from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autorização (interna)
-- ---------------------------------------------------------------------------

-- Ver o quadro no topo. Usuário só via auth.uid() (dentro de tem_papel/meu_membro_id),
-- que já exigem vínculo ativo e empresa ativa.
create or replace function public.autorizacao_setor_obra(p_obra_id uuid, p_setor public.setor_obra)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p_setor is null or p_setor = 'comercial' then null
    when public.tem_papel(o.empresa_id, '{admin}') then 'admin'
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

-- Porta comum de toda escrita da 3b-3: valida o setor, TRAVA a obra (serializa as escritas
-- da mesma obra), confere a autorização e o estado da obra. Devolve a autorização usada.
create or replace function public.preparar_escrita_obra(p_obra_id uuid, p_setor public.setor_obra, p_bloquear_pausada boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_aut text;
begin
  if p_setor is null or p_setor = 'comercial' then
    raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_obra from public.obras where id = p_obra_id for update;
  v_aut := case when found then public.autorizacao_setor_obra(p_obra_id, p_setor) end;
  -- Mesma resposta para "não existe" e "sem permissão": não revela obras de outros.
  if v_aut is null then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_bloquear_pausada and v_obra.pausada_em is not null then
    raise exception 'Esta obra está pausada: fluxos e marcos não podem ser alterados.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return v_aut;
end;
$$;

-- Encerra (fim = agora) as participações operacionais ativas do membro — todas, ou só as
-- de um setor — e registra cada uma no histórico da obra. Nunca toca no setor `comercial`.
-- Trava cada obra antes da participação (mesma ordem das RPCs: obra → participação).
create or replace function public.encerrar_participacoes_operacionais(p_membro_id uuid, p_setor public.setor_obra, p_origem text, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.obra_participantes;
begin
  for v_p in
    select * from public.obra_participantes p
    where p.membro_id = p_membro_id
      and p.fim is null
      and p.setor <> 'comercial'
      and (p_setor is null or p.setor = p_setor)
    order by p.obra_id, p.id
  loop
    perform 1 from public.obras where id = v_p.obra_id for update;
    update public.obra_participantes set fim = now() where id = v_p.id and fim is null;
    if found then
      perform public.registrar_historico_obra(v_p.obra_id, 'participante_encerrado', v_p.setor, jsonb_build_object(
        'participante_id', v_p.id,
        'membro_id', v_p.membro_id,
        'funcao', v_p.funcao,
        'principal', v_p.principal,
        'origem', p_origem,
        'motivo', p_motivo
      ));
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setores do membro: remoção encerra participações + auditoria
-- ---------------------------------------------------------------------------

-- Mesma assinatura, validações e mensagens da 3b-2. Novidades:
--   - setor retirado → encerra, na mesma transação, as participações ativas do membro
--     naquele setor (com histórico em cada obra);
--   - toda mudança de setor/capacidade vai para `membro_setores_obra_historico`.
create or replace function public.definir_setores_membro(p_membro_id uuid, p_setores jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_papel public.papel_membro;
  v_ativo boolean;
  v_item jsonb;
  v_setor text;
  v_capacidade text;
  v_vistos text[] := '{}';
  v_antigo record;
  v_cap_antes public.capacidade_obra;
  v_autor_membro uuid;
  v_autor_contexto jsonb;
begin
  -- Trava a linha do membro: não desativa/muda de papel no meio da operação.
  select m.empresa_id, m.papel, m.ativo into v_empresa, v_papel, v_ativo
  from public.empresa_membros m where m.id = p_membro_id for update;

  -- Mesma resposta para "não existe" e "não sou admin dessa empresa": não revela vínculos de outras empresas.
  if v_empresa is null or not public.tem_papel(v_empresa, '{admin}') then
    raise exception 'Você não tem acesso a este colaborador.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not v_ativo then
    raise exception 'O colaborador precisa estar ativo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_papel <> 'operacao' then
    raise exception 'Só colaboradores com o papel Operação têm setores de obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_setores is null or jsonb_typeof(p_setores) <> 'array' then
    raise exception 'Informe a lista de setores.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  for v_item in select * from jsonb_array_elements(p_setores) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_setor := v_item ->> 'setor';
    v_capacidade := v_item ->> 'capacidade';
    if v_setor is null or v_setor not in ('compras', 'engenharia', 'operacional') then
      raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_capacidade is null or v_capacidade not in ('executar', 'coordenar') then
      raise exception 'Capacidade inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_setor = any (v_vistos) then
      raise exception 'Setor repetido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_vistos := v_vistos || v_setor;
  end loop;

  -- Autor real (o admin que chama), com o papel deste momento.
  v_autor_membro := public.meu_membro_id(v_empresa);
  v_autor_contexto := jsonb_build_object('papel', 'admin');

  -- Setores retirados: remove, audita e encerra as participações daquele setor.
  for v_antigo in
    delete from public.membro_setores_obra
    where empresa_id = v_empresa and membro_id = p_membro_id
      and setor::text <> all (v_vistos)
    returning setor, capacidade
  loop
    insert into public.membro_setores_obra_historico
      (empresa_id, membro_id, setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id, autor_contexto)
    values (v_empresa, p_membro_id, v_antigo.setor, v_antigo.capacidade, null, (select auth.uid()), v_autor_membro, v_autor_contexto);
    perform public.encerrar_participacoes_operacionais(p_membro_id, v_antigo.setor, 'setor_removido',
      'Setor retirado do colaborador');
  end loop;

  -- Setores mantidos/novos: grava (como na 3b-2) e audita só o que mudou.
  for v_item in select * from jsonb_array_elements(p_setores) loop
    select s.capacidade into v_cap_antes
    from public.membro_setores_obra s
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.setor = (v_item ->> 'setor')::public.setor_obra;

    insert into public.membro_setores_obra (empresa_id, membro_id, setor, capacidade, definido_por_user_id)
    values (v_empresa, p_membro_id, (v_item ->> 'setor')::public.setor_obra,
            (v_item ->> 'capacidade')::public.capacidade_obra, (select auth.uid()))
    on conflict (empresa_id, membro_id, setor) do update
      set capacidade = excluded.capacidade, definido_por_user_id = excluded.definido_por_user_id;

    if v_cap_antes is distinct from (v_item ->> 'capacidade')::public.capacidade_obra then
      insert into public.membro_setores_obra_historico
        (empresa_id, membro_id, setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id, autor_contexto)
      values (v_empresa, p_membro_id, (v_item ->> 'setor')::public.setor_obra, v_cap_antes,
              (v_item ->> 'capacidade')::public.capacidade_obra, (select auth.uid()), v_autor_membro, v_autor_contexto);
    end if;
  end loop;
end;
$$;

-- RPC de cliente: só `authenticated` executa (grants da 3b-2 reafirmados).
revoke all on function public.definir_setores_membro(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.definir_setores_membro(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Desativação / troca de papel encerram participações
-- ---------------------------------------------------------------------------

-- Participação nunca fica adormecida: membro desativado, ou que deixa o papel `operacao`,
-- perde as participações operacionais ativas na hora (com histórico). Se voltar, precisa de
-- nova atribuição explícita. O autor é quem fez a mudança (auth.uid(); nulo se serviço).
create or replace function public.obra_ao_alterar_membro()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.ativo and not new.ativo then
    perform public.encerrar_participacoes_operacionais(new.id, null, 'membro_desativado',
      'Colaborador desativado');
  elsif old.papel = 'operacao' and new.papel <> 'operacao' then
    perform public.encerrar_participacoes_operacionais(new.id, null, 'papel_alterado',
      'Colaborador deixou o papel Operação');
  end if;
  return null;
end;
$$;

-- Sem lista de colunas: `ativo` é recalculado num gatilho BEFORE a partir de `status`.
create trigger empresa_membros_encerrar_participacoes_obra
  after update on public.empresa_membros
  for each row when ((old.ativo and not new.ativo) or (old.papel = 'operacao' and new.papel <> 'operacao'))
  execute function public.obra_ao_alterar_membro();

-- ---------------------------------------------------------------------------
-- Participantes
-- ---------------------------------------------------------------------------

-- Atribui um membro `operacao` a um setor da obra. Quem pode: admin (qualquer setor
-- operacional) e coordenador do setor — este nunca a si mesmo nem a outro coordenador
-- (só o admin atribui coordenador). Alvo: ativo, mesma empresa, papel `operacao`, com o
-- setor em membro_setores_obra. Funções: responsavel, apoio, substituto (vendedor/sdr são
-- da #145). principal exige funcao = responsavel; havendo principal ativo no setor, só
-- entra outro substituindo-o (p_substitui_id): o antigo é encerrado e o novo criado na
-- mesma transação, com a obra e as participações travadas. Obra pausada permite.
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
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.setor = p_setor
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

-- Encerra uma participação operacional (fim = agora). Quem pode: admin e coordenador do
-- setor da participação. Ninguém encerra a própria. Motivo obrigatório (vai para o
-- histórico). Participações comerciais (#145) não passam por aqui. Obra pausada permite.
create or replace function public.encerrar_participante_obra(p_participante_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.obra_participantes;
  v_aut text;
  v_motivo text := nullif(trim(p_motivo), '');
begin
  select * into v_p from public.obra_participantes where id = p_participante_id;
  if not found then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_p.setor = 'comercial' then
    raise exception 'Participações comerciais não são encerradas por aqui.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_aut := public.preparar_escrita_obra(v_p.obra_id, v_p.setor, false);
  if v_aut not in ('admin', 'coordenar') then
    raise exception 'Você não pode encerrar participações neste setor.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo do encerramento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Relê travado (a obra já está travada pela porta comum).
  select * into v_p from public.obra_participantes where id = p_participante_id for update;
  if v_p.fim is not null then
    raise exception 'Esta participação já foi encerrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_p.membro_id = public.meu_membro_id(v_p.empresa_id) then
    raise exception 'Você não pode encerrar a própria participação.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  update public.obra_participantes set fim = now() where id = v_p.id;
  perform public.registrar_historico_obra(v_p.obra_id, 'participante_encerrado', v_p.setor, jsonb_build_object(
    'participante_id', v_p.id,
    'membro_id', v_p.membro_id,
    'funcao', v_p.funcao,
    'principal', v_p.principal,
    'origem', 'manual',
    'motivo', v_motivo,
    'autorizacao', v_aut
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- Fluxos
-- ---------------------------------------------------------------------------

-- Qualquer status válido do próprio setor; retrocesso permitido; tudo auditado. Datas só
-- no servidor: status_desde = agora; iniciado_em só na primeira saída do status inicial
-- (nunca apagado); concluido_em = agora ao entrar no status final e limpo ao sair dele.
-- Mesmo status: nada muda (sem histórico).
create or replace function public.alterar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_fluxo public.obra_fluxos;
  v_inicial text;
  v_final text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, true);
  if p_status is null or not (
    (p_setor = 'compras' and p_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor'))
    or (p_setor = 'engenharia' and p_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
    or (p_setor = 'operacional' and p_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  ) then
    raise exception 'Status inválido para este setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_inicial := case p_setor when 'compras' then 'a_comprar' when 'engenharia' then 'a_iniciar' else 'aguardando_liberacao' end;
  v_final := case p_setor when 'compras' then 'faturado_fornecedor' else 'concluido' end;

  select * into v_fluxo from public.obra_fluxos where obra_id = p_obra_id and setor = p_setor for update;
  if not found then
    raise exception 'Fluxo do setor não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_fluxo.status = p_status then
    return;
  end if;

  update public.obra_fluxos
  set status = p_status,
      status_desde = now(),
      iniciado_em = case when v_fluxo.iniciado_em is null and p_status <> v_inicial then now() else v_fluxo.iniciado_em end,
      concluido_em = case when p_status = v_final then now() else null end
  where obra_id = p_obra_id and setor = p_setor;

  perform public.registrar_historico_obra(p_obra_id, 'fluxo_alterado', p_setor, jsonb_build_object(
    'campo', 'status',
    'de', v_fluxo.status,
    'para', p_status,
    'autorizacao', v_aut
  ));
end;
$$;

-- Liga/desliga "parado". Ligar exige motivo; desligar limpa o motivo. Trocar só o motivo
-- com o fluxo já parado também é registrado.
create or replace function public.marcar_parado_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_parado boolean, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_fluxo public.obra_fluxos;
  v_motivo text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, true);
  if p_parado is null then
    raise exception 'Informe se o fluxo está parado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_motivo := case when p_parado then nullif(trim(p_motivo), '') end;
  if p_parado and v_motivo is null then
    raise exception 'Informe o motivo da parada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_fluxo from public.obra_fluxos where obra_id = p_obra_id and setor = p_setor for update;
  if not found then
    raise exception 'Fluxo do setor não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_fluxo.parado = p_parado and v_fluxo.parado_motivo is not distinct from v_motivo then
    return;
  end if;

  update public.obra_fluxos set parado = p_parado, parado_motivo = v_motivo
  where obra_id = p_obra_id and setor = p_setor;

  perform public.registrar_historico_obra(p_obra_id, 'fluxo_alterado', p_setor, jsonb_build_object(
    'campo', 'parado',
    'de', jsonb_build_object('parado', v_fluxo.parado, 'motivo', v_fluxo.parado_motivo),
    'para', jsonb_build_object('parado', p_parado, 'motivo', v_motivo),
    'autorizacao', v_aut
  ));
end;
$$;

-- Define por quem o fluxo aguarda (nulo limpa). aguardando_desde = agora a cada novo valor.
create or replace function public.definir_aguardando_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_aguardando public.aguardando_obra default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_fluxo public.obra_fluxos;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, true);
  select * into v_fluxo from public.obra_fluxos where obra_id = p_obra_id and setor = p_setor for update;
  if not found then
    raise exception 'Fluxo do setor não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_fluxo.aguardando is not distinct from p_aguardando then
    return;
  end if;

  update public.obra_fluxos
  set aguardando = p_aguardando,
      aguardando_desde = case when p_aguardando is null then null else now() end
  where obra_id = p_obra_id and setor = p_setor;

  perform public.registrar_historico_obra(p_obra_id, 'fluxo_alterado', p_setor, jsonb_build_object(
    'campo', 'aguardando',
    'de', v_fluxo.aguardando,
    'para', p_aguardando,
    'autorizacao', v_aut
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- Marcos (Operacional)
-- ---------------------------------------------------------------------------

-- nf_cliente e garantia: só o setor operacional (admin, coordenador do operacional,
-- executor participante ativo do operacional). nao_se_aplica exige motivo; concluido grava
-- data e autor (membro); voltar para pendente limpa ambos. Mesmo estado: nada muda.
create or replace function public.atualizar_marco_obra(p_obra_id uuid, p_marco public.marco_obra, p_status public.status_marco_obra, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_marco public.obra_marcos;
  v_motivo text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'operacional', true);
  if p_marco is null or p_status is null then
    raise exception 'Informe o marco e o status.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_motivo := case when p_status = 'nao_se_aplica' then nullif(trim(p_motivo), '') end;
  if p_status = 'nao_se_aplica' and v_motivo is null then
    raise exception 'Informe por que o marco não se aplica.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_marco from public.obra_marcos where obra_id = p_obra_id and marco = p_marco for update;
  if not found then
    raise exception 'Marco não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_marco.status = p_status and v_marco.motivo is not distinct from v_motivo then
    return;
  end if;

  update public.obra_marcos
  set status = p_status,
      motivo = v_motivo,
      concluido_em = case when p_status = 'concluido' then now() end,
      concluido_por_membro_id = case when p_status = 'concluido' then public.meu_membro_id(v_marco.empresa_id) end
  where obra_id = p_obra_id and marco = p_marco;

  perform public.registrar_historico_obra(p_obra_id, 'marco_alterado', 'operacional', jsonb_build_object(
    'marco', p_marco,
    'de', jsonb_build_object('status', v_marco.status, 'motivo', v_marco.motivo),
    'para', jsonb_build_object('status', p_status, 'motivo', v_motivo),
    'autorizacao', v_aut
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

-- Internas (ignoram RLS): nenhum cliente executa.
revoke all on function public.autorizacao_setor_obra(uuid, public.setor_obra) from public, anon, authenticated, service_role;
revoke all on function public.preparar_escrita_obra(uuid, public.setor_obra, boolean) from public, anon, authenticated, service_role;
revoke all on function public.encerrar_participacoes_operacionais(uuid, public.setor_obra, text, text) from public, anon, authenticated, service_role;
revoke all on function public.obra_ao_alterar_membro() from public, anon, authenticated, service_role;
revoke all on function public.proteger_membro_setores_obra_historico() from public, anon, authenticated, service_role;

-- RPCs de cliente: só `authenticated` executa.
revoke all on function public.atribuir_participante_obra(uuid, uuid, public.setor_obra, public.funcao_participante_obra, boolean, uuid) from public, anon, authenticated, service_role;
grant execute on function public.atribuir_participante_obra(uuid, uuid, public.setor_obra, public.funcao_participante_obra, boolean, uuid) to authenticated;
revoke all on function public.encerrar_participante_obra(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.encerrar_participante_obra(uuid, text) to authenticated;
revoke all on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) to authenticated;
revoke all on function public.marcar_parado_fluxo_obra(uuid, public.setor_obra, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.marcar_parado_fluxo_obra(uuid, public.setor_obra, boolean, text) to authenticated;
revoke all on function public.definir_aguardando_fluxo_obra(uuid, public.setor_obra, public.aguardando_obra) from public, anon, authenticated, service_role;
grant execute on function public.definir_aguardando_fluxo_obra(uuid, public.setor_obra, public.aguardando_obra) to authenticated;
revoke all on function public.atualizar_marco_obra(uuid, public.marco_obra, public.status_marco_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.atualizar_marco_obra(uuid, public.marco_obra, public.status_marco_obra, text) to authenticated;
