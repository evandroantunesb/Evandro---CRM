-- Operação / Obras — PR 3b-2: acesso do papel `operacao` a Obras + identidade básica.
-- Arquitetura aprovada pelo Evandro. Nenhuma tela nova e nenhum mecanismo da #145 é
-- alterado: `garantir_obra`, gatilhos, snapshots, histórico, `pode_ver_obra`, a policy de
-- `obras` e `pode_ver_valor_vendido_obra` ficam exatamente como estão.
--
-- O que muda:
-- 1. `membro_setores_obra`: setores e capacidade (executar/coordenar) de cada membro
--    `operacao`, definidos só pelo admin da empresa (RPC `definir_setores_membro`).
-- 2. Caminho de operação SEPARADO do comercial (`pode_ver_obra_operacao`): papel
--    `operacao` explícito E (participante ativo da obra OU coordenador de algum setor).
--    Ele abre só as tabelas filhas (fluxos, marcos, participantes, histórico), que não têm
--    dado pessoal. A tabela `obras` continua só no caminho comercial da #145: `operacao`
--    lê 0 linhas dela diretamente (o snapshot traz CPF/CNPJ, telefone, e-mail, endereço).
-- 3. `operacao` lê a obra pela RPC `obras_operacao`: colunas técnicas + snapshot SEM o
--    bloco `cliente`. Dados pessoais vêm em campos separados e só para PARTICIPANTE ATIVO
--    daquela obra naquele setor (coordenar não basta):
--      operacional → endereço + telefones · engenharia → endereço + CPF/CNPJ ·
--      compras → nenhum · e-mail → nenhum setor.
-- 4. `operacao` continua SEM valor vendido, sem acesso comercial e sem ver perfis
--    (e-mail/telefone) dos colegas.
-- 5. Identidade básica (nome + avatar) dos colegas ativos, para a tela de Obras mostrar
--    quem atua: RPC `identidade_membros` e `pode_ver_avatar` ampliada. O papel `operacao`
--    ainda NÃO entra no cadastro de usuários.

-- ---------------------------------------------------------------------------
-- Tipo e tabela
-- ---------------------------------------------------------------------------

create type public.capacidade_obra as enum ('executar', 'coordenar');

-- Um setor operacional por linha. `comercial` não entra: o acesso comercial vem do papel.
-- Quem coordena QUALQUER setor vê todas as obras da empresa; quem só executa vê as obras
-- em que é participante ativo.
create table public.membro_setores_obra (
  empresa_id uuid not null,
  membro_id uuid not null,
  setor public.setor_obra not null check (setor <> 'comercial'),
  capacidade public.capacidade_obra not null,
  definido_por_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, membro_id, setor),
  -- Membro da mesma empresa; some junto com o vínculo. (alvo criado na #145)
  foreign key (empresa_id, membro_id) references public.empresa_membros (empresa_id, id) on delete cascade
);

create trigger membro_setores_obra_updated_at before update on public.membro_setores_obra
  for each row execute function public.tocar_updated_at();

alter table public.membro_setores_obra enable row level security;

-- Leitura: o próprio membro (suas linhas) e o admin da empresa. Outro `operacao` não vê
-- as linhas alheias. `meu_membro_id` já exige vínculo e empresa ativos.
create policy "ver setores de obra" on public.membro_setores_obra for select to authenticated
  using (
    membro_id = public.meu_membro_id(empresa_id)
    or public.tem_papel(empresa_id, '{admin}')
  );

-- Ninguém escreve direto (nem service_role): só `definir_setores_membro`, que roda como dono.
revoke all on public.membro_setores_obra from anon;
revoke insert, update, delete, truncate on public.membro_setores_obra from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Definir setores (admin)
-- ---------------------------------------------------------------------------

-- p_setores: array JSON de objetos {"setor": "...", "capacidade": "..."}, ex.:
--   [{"setor":"engenharia","capacidade":"coordenar"},{"setor":"compras","capacidade":"executar"}]
-- SUBSTITUI o conjunto do membro: setores que saíram da lista são removidos, os demais
-- são inseridos/atualizados. Array vazio remove todos. Setor `comercial`, valores
-- inválidos e setor repetido são rejeitados.
-- Quem pode: só admin da empresa do membro, e o membro precisa estar ativo e ter papel
-- `operacao`. (Autorização de "operacao ativo" reutiliza `tem_papel`, que já exige vínculo
-- ativo, empresa ativa e o papel; nenhuma função auxiliar nova é necessária.)
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

  delete from public.membro_setores_obra
  where empresa_id = v_empresa and membro_id = p_membro_id
    and setor::text <> all (v_vistos);

  insert into public.membro_setores_obra (empresa_id, membro_id, setor, capacidade, definido_por_user_id)
  select v_empresa, p_membro_id, (i ->> 'setor')::public.setor_obra, (i ->> 'capacidade')::public.capacidade_obra,
         (select auth.uid())
  from jsonb_array_elements(p_setores) i
  on conflict (empresa_id, membro_id, setor) do update
    set capacidade = excluded.capacidade, definido_por_user_id = excluded.definido_por_user_id;
end;
$$;

-- RPC de cliente: só `authenticated` executa.
revoke all on function public.definir_setores_membro(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.definir_setores_membro(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Quem vê a Obra (caminho de operação)
-- ---------------------------------------------------------------------------

-- `pode_ver_obra` (comercial, #145) NÃO muda. Este é o caminho de operação, separado:
-- exige o papel `operacao` (ativo, empresa ativa) E uma destas condições:
--   - ser participante ativo (fim nulo) da obra; ou
--   - coordenar algum setor na empresa da obra (vê todas as obras da própria empresa).
-- Quem não é `operacao` não ganha nada por estar em obra_participantes.
-- Usada nas policies das tabelas filhas e em `obras_operacao`; NÃO na policy de `obras`.
create or replace function public.pode_ver_obra_operacao(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{operacao}')
      and (
        exists (
          select 1 from public.obra_participantes p
          where p.obra_id = o.id
            and p.membro_id = public.meu_membro_id(o.empresa_id)
            and p.fim is null
        )
        or exists (
          select 1 from public.membro_setores_obra s
          where s.empresa_id = o.empresa_id
            and s.membro_id = public.meu_membro_id(o.empresa_id)
            and s.capacidade = 'coordenar'
        )
      )
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

-- Usada em policies: só `authenticated` executa.
revoke all on function public.pode_ver_obra_operacao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_obra_operacao(uuid) to authenticated;

-- Tabelas filhas (sem dado pessoal nem valor): caminho comercial da #145 OU operação.
-- A policy de `obras` e a de `obra_dados_comerciais` não mudam.
drop policy "ver fluxos da obra" on public.obra_fluxos;
create policy "ver fluxos da obra" on public.obra_fluxos for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
drop policy "ver marcos da obra" on public.obra_marcos;
create policy "ver marcos da obra" on public.obra_marcos for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
drop policy "ver participantes da obra" on public.obra_participantes;
create policy "ver participantes da obra" on public.obra_participantes for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
drop policy "ver historico da obra" on public.obra_historico;
create policy "ver historico da obra" on public.obra_historico for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));

-- Leitura da obra por `operacao`. O usuário vem SEMPRE de auth.uid() (nenhum membro/user
-- por parâmetro). p_obra_id nulo = todas as obras visíveis; preenchido = só aquela (vazio
-- se não tiver acesso, sem revelar se existe).
-- Devolve as colunas técnicas e o snapshot SEM o bloco `cliente`. Dados pessoais vêm em
-- campos separados, nulos salvo para participante ATIVO daquela obra no setor:
--   cliente_endereco  → operacional ou engenharia
--   cliente_telefone(2) → operacional
--   cliente_documento → engenharia (CPF/CNPJ)
-- E-mail nunca é devolvido. Coordenador/principal sem participação ativa não recebe dado
-- pessoal. Nunca devolve valor vendido (fica em obra_dados_comerciais).
create or replace function public.obras_operacao(p_obra_id uuid default null)
returns table (
  obra_id uuid,
  empresa_id uuid,
  numero integer,
  cliente_nome text,
  cidade text,
  uf text,
  potencia_kwp numeric,
  tipo_ligacao public.tipo_ligacao,
  unidade_consumidora text,
  snapshot jsonb,
  snapshot_versao integer,
  pausada_em timestamptz,
  pausa_motivo text,
  cancelada_em timestamptz,
  cancelamento_motivo text,
  alerta_pagamento_estornado_em timestamptz,
  venda_alterada_em timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  cliente_endereco text,
  cliente_telefone text,
  cliente_telefone2 text,
  cliente_documento text
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id, o.empresa_id, o.numero, o.cliente_nome, o.cidade, o.uf, o.potencia_kwp,
    o.tipo_ligacao, o.unidade_consumidora,
    o.snapshot - 'cliente',
    o.snapshot_versao, o.pausada_em, o.pausa_motivo, o.cancelada_em, o.cancelamento_motivo,
    o.alerta_pagamento_estornado_em, o.venda_alterada_em, o.created_at, o.updated_at,
    case when a.operacional or a.engenharia then o.snapshot -> 'cliente' ->> 'endereco' end,
    case when a.operacional then o.snapshot -> 'cliente' ->> 'telefone' end,
    case when a.operacional then o.snapshot -> 'cliente' ->> 'telefone2' end,
    case when a.engenharia then o.snapshot -> 'cliente' ->> 'documento' end
  from public.obras o
  -- Setores em que EU sou participante ativo desta obra.
  cross join lateral (
    select
      coalesce(bool_or(p.setor = 'operacional'), false) as operacional,
      coalesce(bool_or(p.setor = 'engenharia'), false) as engenharia
    from public.obra_participantes p
    where p.obra_id = o.id
      and p.empresa_id = o.empresa_id
      and p.membro_id = public.meu_membro_id(o.empresa_id)
      and p.fim is null
  ) a
  where o.empresa_id in (
      select m.empresa_id from public.empresa_membros m
      where m.user_id = (select auth.uid()) and m.ativo and m.papel = 'operacao'
    )
    and (p_obra_id is null or o.id = p_obra_id)
    and public.pode_ver_obra_operacao(o.id)
  order by o.created_at desc, o.numero desc;
$$;

-- RPC de cliente: só `authenticated` executa.
revoke all on function public.obras_operacao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.obras_operacao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Identidade básica dos colegas
-- ---------------------------------------------------------------------------

-- Nome e caminho do avatar dos membros ATIVOS da empresa, para qualquer membro ativo dela
-- (qualquer papel). Nunca devolve e-mail ou telefone. Sem acesso (não é membro ativo, ou
-- empresa de outro) devolve VAZIO, sem revelar se a empresa existe.
create or replace function public.identidade_membros(p_empresa_id uuid)
returns table (membro_id uuid, nome text, avatar_caminho text)
language sql stable security definer set search_path = ''
as $$
  select m.id, pf.nome, pf.avatar_caminho
  from public.empresa_membros m
  join public.perfis pf on pf.id = m.user_id
  where m.empresa_id = p_empresa_id
    and m.ativo
    and public.membro_ativo(p_empresa_id)
  order by pf.nome, m.id;
$$;

revoke all on function public.identidade_membros(uuid) from public, anon, authenticated, service_role;
grant execute on function public.identidade_membros(uuid) to authenticated;

-- Quem chama e o outro usuário são membros ativos de uma mesma empresa ativa (qualquer
-- papel). Função PRÓPRIA, só para o avatar: `compartilha_empresa` (genérica) e
-- `compartilha_empresa_comercial` (perfis) continuam como estão.
create or replace function public.compartilha_empresa_identidade(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros meu
    join public.empresas e on e.id = meu.empresa_id
    join public.empresa_membros outro on outro.empresa_id = meu.empresa_id
    where meu.user_id = (select auth.uid())
      and meu.ativo
      and e.situacao = 'ativa'
      and outro.user_id = p_user_id
      and outro.ativo
  );
$$;

-- Usada em pode_ver_avatar (policy do storage): só `authenticated` executa.
revoke all on function public.compartilha_empresa_identidade(uuid) from public, anon, authenticated, service_role;
grant execute on function public.compartilha_empresa_identidade(uuid) to authenticated;

-- Corpo da #147 (CASE valida o uuid antes do cast) + identidade básica. Os 4 papéis
-- comerciais ficam exatamente como hoje; `operacao` passa a ver avatar de colegas ativos
-- da mesma empresa. Super-admin continua sem acesso extra. `perfis` NÃO muda.
create or replace function public.pode_ver_avatar(p_pasta text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case
      when p_pasta = (select auth.uid())::text then true
      when p_pasta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.compartilha_empresa_comercial(p_pasta::uuid)
          or public.compartilha_empresa_identidade(p_pasta::uuid)
      else false
    end,
    false
  );
$$;
