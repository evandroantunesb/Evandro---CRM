-- Entrega 5 (continuação): fundação do construtor de propostas modular.
-- Cada empresa passa a poder montar seus próprios "modelos" de proposta:
-- uma capa (entre 3 variantes) + uma lista ordenada de blocos configuráveis
-- (ativos/inativos, com configuração própria em JSON). Isso substitui, aos
-- poucos, a lógica fixa de seções da proposta (mostrar_sistema/mostrar_economia,
-- ver 20260926050000_proposta_secoes.sql) por algo que o próprio gestor edita.
--
-- Esta migration só cria a fundação (identidade visual da empresa, modelos e
-- blocos) — ainda sem tela de edição nem ligação com a emissão da proposta
-- no negócio. Isso vem em entregas seguintes, reaproveitando estas tabelas.
--
-- Desativar um bloco nunca apaga sua configuração (só sai do "ativo=false");
-- é assim que o gestor experimenta sem perder o que já montou.

create type public.proposta_modelo_capa as enum ('foto', 'minimalista', 'tecnica');
create type public.proposta_modelo_status as enum ('rascunho', 'publicado', 'arquivado');
create type public.proposta_bloco_quebra as enum ('auto', 'nova_pagina', 'pagina_exclusiva');

-- Identidade visual da proposta por empresa (nome comercial exibido, logo,
-- cores, contato e foto de capa padrão). Sem isso, o modelo cai num
-- fallback simples (nome da empresa em texto, cores da paleta padrão) —
-- nunca mostra a marca Raion nem uma marca inventada na proposta do cliente.
create table public.proposta_identidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  nome_exibicao text,
  logo_url text,
  logo_escuro_url text,
  cor_primaria text check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  cor_destaque text check (cor_destaque ~ '^#[0-9a-fA-F]{6}$'),
  whatsapp text,
  rodape_texto text,
  foto_capa_url text,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposta_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  capa_variante public.proposta_modelo_capa not null default 'foto',
  status public.proposta_modelo_status not null default 'rascunho',
  padrao boolean not null default false,
  -- Sobe a cada publicação; a proposta emitida guarda a revisão usada, para
  -- que editar o modelo depois nunca altere uma proposta já entregue.
  revisao integer not null default 1,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.proposta_modelos (empresa_id);
-- Só um modelo padrão por empresa.
create unique index proposta_modelos_padrao_unico on public.proposta_modelos (empresa_id) where padrao;

-- Biblioteca de blocos: os tipos abaixo cobrem todo o catálogo da
-- especificação (capa/institucional/educativo/diagnóstico/geração/economia/
-- fechamento), mesmo que só uma parte deles já tenha um renderer pronto —
-- isso evita ter que alterar o formato de armazenamento ao ligar os
-- próximos. `config` guarda tudo que é específico do bloco (textos,
-- indicadores ligados/desligados, imagens escolhidas etc.).
create table public.proposta_modelo_blocos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.proposta_modelos (id) on delete cascade,
  tipo text not null check (tipo = any (array[
    'cover', 'proposal_identity', 'cover_benefits',
    'about_company', 'company_highlights', 'company_numbers', 'team_and_certifications', 'portfolio', 'testimonials',
    'solar_benefits', 'how_it_works', 'day_night', 'solar_faq',
    'customer_profile', 'current_consumption', 'consumption_chart', 'system_summary', 'equipment_summary', 'equipment_table', 'installation_layout',
    'generation_monthly_chart', 'generation_vs_consumption', 'generation_summary', 'simulation_assumptions', 'long_term_generation',
    'before_after_bill', 'savings_summary', 'cashflow_payback', 'investment_main', 'payment_options', 'included_services', 'extra_costs', 'validity_timeline',
    'project_steps', 'warranties', 'support_maintenance', 'scope_inclusions_exclusions', 'commercial_conditions', 'next_steps', 'company_contacts', 'custom_content', 'pdf_attachment'
  ])),
  ordem integer not null default 0,
  ativo boolean not null default true,
  quebra_pagina public.proposta_bloco_quebra not null default 'auto',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.proposta_modelo_blocos (modelo_id, ordem);

create trigger proposta_identidades_updated_at before update on public.proposta_identidades
  for each row execute function public.tocar_updated_at();
create trigger proposta_modelos_updated_at before update on public.proposta_modelos
  for each row execute function public.tocar_updated_at();
create trigger proposta_modelo_blocos_updated_at before update on public.proposta_modelo_blocos
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.proposta_identidades enable row level security;
alter table public.proposta_modelos enable row level security;
alter table public.proposta_modelo_blocos enable row level security;

-- Identidade: qualquer membro ativo lê (precisa pra pré-visualizar/gerar
-- proposta); só admin cadastra/edita.
create policy "ver identidade da proposta" on public.proposta_identidades for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria identidade da proposta" on public.proposta_identidades for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita identidade da proposta" on public.proposta_identidades for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

-- Modelos: vendedor só vê os publicados; admin vê e gerencia todos
-- (rascunho/arquivado incluídos).
create policy "ver modelos de proposta" on public.proposta_modelos for select to authenticated
  using (public.membro_ativo(empresa_id) and (status = 'publicado' or public.tem_papel(empresa_id, '{admin}')));
create policy "admin cria modelos de proposta" on public.proposta_modelos for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita modelos de proposta" on public.proposta_modelos for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga modelos de proposta" on public.proposta_modelos for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

-- Blocos: mesma visibilidade do modelo a que pertencem.
create policy "ver blocos de proposta" on public.proposta_modelo_blocos for select to authenticated
  using (exists (
    select 1 from public.proposta_modelos m
    where m.id = modelo_id and public.membro_ativo(m.empresa_id) and (m.status = 'publicado' or public.tem_papel(m.empresa_id, '{admin}'))
  ));
create policy "admin cria blocos de proposta" on public.proposta_modelo_blocos for insert to authenticated
  with check (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin}')));
create policy "admin edita blocos de proposta" on public.proposta_modelo_blocos for update to authenticated
  using (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin}')))
  with check (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin}')));
create policy "admin apaga blocos de proposta" on public.proposta_modelo_blocos for delete to authenticated
  using (exists (select 1 from public.proposta_modelos m where m.id = modelo_id and public.tem_papel(m.empresa_id, '{admin}')));

-- ---------------------------------------------------------------------------
-- Storage: imagens da identidade visual (logo, foto de capa), por empresa
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('proposta-marca', 'proposta-marca', false, 10485760)
on conflict (id) do nothing;

-- Caminho no bucket: <empresa_id>/<arquivo>. Extrai o empresa_id do início
-- do caminho; retorna null (e portanto nega o acesso) se não for um uuid.
create or replace function public.empresa_da_pasta_marca(p_caminho text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
begin
  if coalesce(array_length(v_partes, 1), 0) < 2 then
    return null;
  end if;
  begin
    return v_partes[1]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

create policy "marca: ler" on storage.objects for select to authenticated
  using (bucket_id = 'proposta-marca' and public.membro_ativo(public.empresa_da_pasta_marca(name)));
create policy "marca: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'proposta-marca' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "marca: admin atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'proposta-marca' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "marca: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'proposta-marca' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
