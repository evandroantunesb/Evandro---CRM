-- Obras: tipo de fixação do telhado escolhido pelos setores da obra.
--
-- Decisões do Evandro (29/10/2026): a estrutura/fixação do telhado saiu do kit da venda e passa a ser
-- definida na obra, por Engenharia, Compras ou Operacional, escolhendo de uma lista que cada empresa
-- monta em Configurações.
--
-- O que faz:
--  * `fixacoes_telhado`: lista da empresa (nome, ativa). Admin cria e edita; qualquer membro ativo lê.
--    Sem DELETE: opção desativada some da escolha, mas a obra que já usa continua mostrando o nome.
--    Já nasce com a lista inicial do Evandro (existentes e empresas novas).
--  * `obra_fixacao`: uma linha por obra com a opção escolhida. Lida por quem vê a obra (comercial ou
--    operação, mesmas regras das tabelas filhas); escrita direta revogada, inclusive para service_role.
--  * `definir_fixacao_obra(obra, fixacao)`: única porta de escrita. Vale quem atua em qualquer um dos três
--    setores (`autorizacao_setor_obra`: admin, coordenador do setor ou participante ativo dele). Obra
--    cancelada não aceita; obra pausada aceita (é dado da obra, não andamento de setor). Opção de outra
--    empresa ou desativada é recusada; nulo limpa. Cada mudança vai para `obra_historico`
--    (`fixacao_definida`, com os nomes de/para e o setor usado), sempre com o autor real.
-- O que NÃO faz: não toca no snapshot da venda (`obras.snapshot` continua congelado, inclusive a
-- `estrutura_telhado` antiga), nem em `garantir_obra`, `obras_operacao`, fluxos, marcos ou gatilhos.
-- Depende de: membro_ativo, tem_papel, auditar, tocar_updated_at, pode_ver_obra, pode_ver_obra_operacao,
-- autorizacao_setor_obra, preparar_escrita_obra, registrar_historico_obra (já existentes).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Lista da empresa
-- ---------------------------------------------------------------------------

create table public.fixacoes_telhado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index fixacoes_telhado_nome_unico on public.fixacoes_telhado (empresa_id, lower(trim(nome)));

-- A empresa da opção não muda (a obra aponta para ela pela empresa).
create or replace function public.proteger_fixacoes_telhado()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da opção de fixação não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger fixacoes_telhado_proteger before update on public.fixacoes_telhado
  for each row execute function public.proteger_fixacoes_telhado();
create trigger fixacoes_telhado_updated_at before update on public.fixacoes_telhado
  for each row execute function public.tocar_updated_at();
create trigger auditar_fixacoes_telhado after insert or update or delete on public.fixacoes_telhado
  for each row execute function public.auditar();

alter table public.fixacoes_telhado enable row level security;
create policy "ver fixações do telhado" on public.fixacoes_telhado for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria fixações do telhado" on public.fixacoes_telhado for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita fixações do telhado" on public.fixacoes_telhado for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
revoke delete, truncate on public.fixacoes_telhado from anon, authenticated;
revoke all on public.fixacoes_telhado from anon;

-- Lista inicial (passada pelo Evandro em 29/10/2026), por tipo de superfície. Cada empresa edita e
-- desativa o que não usa; empresas novas recebem a mesma lista.
create or replace function public.inserir_fixacoes_telhado_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.fixacoes_telhado (empresa_id, nome) values
    (p_empresa_id, 'Telhado cerâmico: gancho de aço inox (U ou T)'),
    (p_empresa_id, 'Fibrocimento: parafuso prisioneiro inox com vedação EPDM'),
    (p_empresa_id, 'Metálico: minitrilho'),
    (p_empresa_id, 'Metálico: suporte tipo L ou X'),
    (p_empresa_id, 'Metálico: perfil contínuo com parafuso brocante'),
    (p_empresa_id, 'Laje: triângulo com chumbamento químico'),
    (p_empresa_id, 'Laje: triângulo com lastro de concreto (sem furar)'),
    (p_empresa_id, 'Solo: monoposte'),
    (p_empresa_id, 'Solo: multibases'),
    (p_empresa_id, 'Carport'),
    (p_empresa_id, 'Seguidor solar (tracker)')
  on conflict (empresa_id, lower(trim(nome))) do nothing;
$$;
revoke all on function public.inserir_fixacoes_telhado_padrao(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_fixacoes_telhado_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_fixacoes_telhado_padrao(new.id);
  return null;
end;
$$;
revoke all on function public.criar_fixacoes_telhado_empresa() from public, anon, authenticated, service_role;
create trigger empresas_fixacoes_telhado after insert on public.empresas
  for each row execute function public.criar_fixacoes_telhado_empresa();

select public.inserir_fixacoes_telhado_padrao(id) from public.empresas;

-- ---------------------------------------------------------------------------
-- Escolha na obra
-- ---------------------------------------------------------------------------

create table public.obra_fixacao (
  obra_id uuid primary key,
  empresa_id uuid not null,
  fixacao_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  -- Mesma empresa garantida pela FK composta.
  foreign key (empresa_id, fixacao_id) references public.fixacoes_telhado (empresa_id, id)
);
create index on public.obra_fixacao (fixacao_id);
create trigger obra_fixacao_updated_at before update on public.obra_fixacao
  for each row execute function public.tocar_updated_at();

alter table public.obra_fixacao enable row level security;
create policy "ver fixação da obra" on public.obra_fixacao for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
revoke all on public.obra_fixacao from anon;
revoke insert, update, delete, truncate on public.obra_fixacao from authenticated, service_role;

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida'
));

-- Escolhe (ou limpa, com nulo) a fixação da obra. O setor usado é o primeiro em que a pessoa atua,
-- na ordem engenharia, compras, operacional; `preparar_escrita_obra` trava a obra e confere de novo.
create or replace function public.definir_fixacao_obra(p_obra_id uuid, p_fixacao_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_setor public.setor_obra;
  v_aut text;
  v_empresa uuid;
  v_atual uuid;
  v_nome_de text;
  v_nome_para text;
begin
  select s into v_setor
  from unnest(array['engenharia', 'compras', 'operacional']::public.setor_obra[]) with ordinality as t(s, ordem)
  where public.autorizacao_setor_obra(p_obra_id, s) is not null
  order by ordem
  limit 1;
  -- Sem setor: preparar_escrita_obra responde "sem permissão" (mesma resposta para obra inexistente).
  v_aut := public.preparar_escrita_obra(p_obra_id, coalesce(v_setor, 'engenharia'), false);
  select empresa_id into v_empresa from public.obras where id = p_obra_id;

  if p_fixacao_id is not null then
    select nome into v_nome_para from public.fixacoes_telhado
    where id = p_fixacao_id and empresa_id = v_empresa and ativa;
    if not found then
      raise exception 'Opção de fixação inválida ou desativada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  select f.fixacao_id, t.nome into v_atual, v_nome_de
  from public.obra_fixacao f join public.fixacoes_telhado t on t.id = f.fixacao_id
  where f.obra_id = p_obra_id
  for update of f;
  if v_atual is not distinct from p_fixacao_id then
    return;
  end if;

  if p_fixacao_id is null then
    delete from public.obra_fixacao where obra_id = p_obra_id;
  else
    insert into public.obra_fixacao (obra_id, empresa_id, fixacao_id)
    values (p_obra_id, v_empresa, p_fixacao_id)
    on conflict (obra_id) do update set fixacao_id = excluded.fixacao_id;
  end if;

  perform public.registrar_historico_obra(p_obra_id, 'fixacao_definida', v_setor, jsonb_build_object(
    'de', v_nome_de,
    'para', v_nome_para,
    'autorizacao', v_aut
  ));
end;
$$;

revoke all on function public.proteger_fixacoes_telhado() from public, anon, authenticated, service_role;
revoke all on function public.definir_fixacao_obra(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.definir_fixacao_obra(uuid, uuid) to authenticated;
