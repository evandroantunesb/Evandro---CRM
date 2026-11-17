-- Procuração configurável (item 1 do roadmap; prévia aprovada pelo Evandro em 17/11/2026).
--
--  1. `modelos_procuracao`: o texto da procuração da empresa, com os mesmos `{{campos}}` e as mesmas regras de acesso
--     do modelo de contrato (lê quem tem acesso comercial; grava só o admin). A procuração não é gravada: o app preenche
--     o modelo a cada download.
--  2. `engenharia_checklist_modelo.gera_procuracao`: o item do checklist que ganha o botão "Baixar procuração
--     preenchida". Marcado pelo título padrão da Copel (20261114100000) nas empresas existentes e nas novas; depois a
--     marca é da coluna, então renomear o item não a perde. No máximo um item por empresa.
--  3. `tem_modelo_procuracao`: se a empresa tem modelo com texto (a Engenharia não lê a tabela).
--  4. `dados_procuracao_obra`: o que a procuração usa, para quem age na Engenharia da obra (mesma regra de
--     `autorizacao_setor_obra`). Sigilo: sem valor, condição de pagamento, e-mail, telefones nem data de nascimento.
--
-- Depende de: tocar_updated_at, tem_acesso_comercial, tem_papel, membro_ativo, autorizacao_setor_obra,
-- documento_cliente_pelo_titulo e o corpo de marcar_documento_cliente_modelo (20261127100000).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Modelo de procuração
-- ---------------------------------------------------------------------------

create table public.modelos_procuracao (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  conteudo text not null default '',
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.modelos_procuracao (atualizado_por);

create trigger modelos_procuracao_updated_at before update on public.modelos_procuracao
  for each row execute function public.tocar_updated_at();

alter table public.modelos_procuracao enable row level security;

create policy "ver modelo de procuração" on public.modelos_procuracao for select to authenticated
  using ((select public.tem_acesso_comercial(empresa_id)));
create policy "admin cria modelo de procuração" on public.modelos_procuracao for insert to authenticated
  with check ((select public.tem_papel(empresa_id, '{admin}')));
create policy "admin edita modelo de procuração" on public.modelos_procuracao for update to authenticated
  using ((select public.tem_papel(empresa_id, '{admin}'))) with check ((select public.tem_papel(empresa_id, '{admin}')));

-- ---------------------------------------------------------------------------
-- 2. Item do checklist que gera a procuração
-- ---------------------------------------------------------------------------

alter table public.engenharia_checklist_modelo add column gera_procuracao boolean not null default false;
create unique index engenharia_checklist_modelo_gera_procuracao
  on public.engenharia_checklist_modelo (empresa_id) where gera_procuracao;

-- Pelo título padrão da Copel (o admin pode ter editado: sem o título, o item fica sem a marca e sem o botão).
create or replace function public.gera_procuracao_pelo_titulo(p_titulo text)
returns boolean
language sql immutable set search_path = ''
as $$
  select lower(btrim(p_titulo)) = 'procuração no modelo da engenharia, com os documentos do cliente';
$$;
revoke all on function public.gera_procuracao_pelo_titulo(text) from public, anon, authenticated, service_role;

update public.engenharia_checklist_modelo
set gera_procuracao = true
where public.gera_procuracao_pelo_titulo(titulo);

-- Empresa nova (lista padrão): marca o documento do cliente (corpo de 20261127100000) e a procuração pelo título.
create or replace function public.marcar_documento_cliente_modelo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc text := public.documento_cliente_pelo_titulo(new.titulo);
begin
  if new.documento_cliente is null and v_doc is not null and not exists (
    select 1 from public.engenharia_checklist_modelo x where x.empresa_id = new.empresa_id and x.documento_cliente = v_doc
  ) then
    new.documento_cliente := v_doc;
  end if;
  if not new.gera_procuracao and public.gera_procuracao_pelo_titulo(new.titulo) and not exists (
    select 1 from public.engenharia_checklist_modelo x where x.empresa_id = new.empresa_id and x.gera_procuracao
  ) then
    new.gera_procuracao := true;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A empresa tem modelo? (para a Engenharia, que não lê a tabela)
-- ---------------------------------------------------------------------------

create or replace function public.tem_modelo_procuracao(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.membro_ativo(p_empresa_id) and exists (
    select 1 from public.modelos_procuracao m
    where m.empresa_id = p_empresa_id and m.conteudo ~ '\S'
  );
$$;
revoke all on function public.tem_modelo_procuracao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.tem_modelo_procuracao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Dados da procuração para quem age na Engenharia da obra
-- ---------------------------------------------------------------------------

create or replace function public.dados_procuracao_obra(p_obra_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if public.autorizacao_setor_obra(p_obra_id, 'engenharia') is null then
    raise exception 'Você não pode gerar a procuração desta obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  select jsonb_build_object(
    'modelo', coalesce(mp.conteudo, ''),
    'empresa_id', o.empresa_id,
    'empresa', jsonb_build_object('nome', e.nome, 'cnpj', e.cnpj),
    'negocio', jsonb_build_object(
      'titulo', n.titulo,
      'numero', n.numero,
      'unidade_consumidora', n.unidade_consumidora,
      'qualif_distribuidora', n.qualif_distribuidora,
      'consumo_medio_kwh', n.consumo_medio_kwh
    ),
    'contato', jsonb_build_object(
      'nome', c.nome,
      'documento', c.documento,
      'rg', c.rg,
      'endereco', c.endereco,
      'cidade', c.cidade,
      'uf', c.uf,
      'inscricao_estadual', c.inscricao_estadual
    )
  )
  into v
  from public.obras o
  join public.empresas e on e.id = o.empresa_id
  join public.negocios n on n.id = o.negocio_id and n.empresa_id = o.empresa_id
  left join public.contatos c on c.id = n.contato_id and c.empresa_id = o.empresa_id
  left join public.modelos_procuracao mp on mp.empresa_id = o.empresa_id
  where o.id = p_obra_id;
  return v;
end;
$$;
revoke all on function public.dados_procuracao_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.dados_procuracao_obra(uuid) to authenticated;

reset lock_timeout;
