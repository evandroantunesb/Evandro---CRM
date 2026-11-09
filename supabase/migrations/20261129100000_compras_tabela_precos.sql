-- Compras P3: tabela de preços de material (desenho aprovado "Tabela de preços" e "Enviar tabela de preços", canvas
-- "Compras · Pedidos de compra"; decisões do Evandro de 09/11/2026).
--
--  * Material: nome, categoria (lista fixa) e unidade, por empresa. Nome único na empresa (sem diferenciar maiúsculas).
--  * Preço: material + fornecedor (nome livre, comparado sem maiúsculas e espaços repetidos) + preço de custo + data.
--    Só acréscimo: nada se edita nem se apaga. O preço atual de cada material num fornecedor é o de data mais recente
--    (empate: o lançado por último); os anteriores são o histórico. Pedidos de compra guardam o próprio valor e não
--    mudam quando chega uma tabela nova.
--  * Tabela recebida: fornecedor, data, validade opcional, planilha original (bucket privado `compras-precos`) e as
--    contagens do que mudou. Todos os preços válidos da planilha entram (os iguais confirmam a data do preço).
--  * Mapa de colunas lembrado por fornecedor (qual coluna é material, código, unidade e preço).
--  * Preço lançado à mão (fornecedor sem tabela): fica no histórico sem tabela de origem.
--  * Quem vê: admin, gestor, quem atua em Compras (ou no setor que atende no lugar dele) e o Administrativo. Quem
--    altera: admin, gestor e quem atua em Compras. O Operacional fica de fora.
--  * Margem e venda sugerida ficam para a P4 (são parâmetro da calculadora).

-- ---------------------------------------------------------------------------
-- 1. Acesso
-- ---------------------------------------------------------------------------

create or replace function public.pode_editar_precos_compra(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_papel(p_empresa_id, '{admin,gestor}') or public.atuo_em_compras(p_empresa_id);
$$;
revoke all on function public.pode_editar_precos_compra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_editar_precos_compra(uuid) to authenticated;

create or replace function public.pode_ver_precos_compra(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.pode_editar_precos_compra(p_empresa_id)
    or (
      public.tem_papel(p_empresa_id, '{operacao}')
      and exists (
        select 1 from public.membro_setores_obra s
        where s.empresa_id = p_empresa_id
          and s.membro_id = public.meu_membro_id(p_empresa_id)
          and s.setor = 'administrativo'
      )
    );
$$;
revoke all on function public.pode_ver_precos_compra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_precos_compra(uuid) to authenticated;

-- Fornecedor é nome livre: "Solar  Sul" e "solar sul" são o mesmo.
create or replace function public.chave_fornecedor(p_nome text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select lower(regexp_replace(btrim(p_nome), '\s+', ' ', 'g'));
$$;
revoke all on function public.chave_fornecedor(text) from public, anon, authenticated, service_role;
grant execute on function public.chave_fornecedor(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------

create table public.compras_materiais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 120),
  categoria text not null default 'outros'
    check (categoria in ('modulos', 'inversores', 'baterias', 'estrutura', 'cabos_protecao', 'outros')),
  unidade text not null default 'un' check (length(btrim(unidade)) between 1 and 20),
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index compras_materiais_nome on public.compras_materiais (empresa_id, lower(btrim(nome)));
create trigger compras_materiais_updated_at before update on public.compras_materiais
  for each row execute function public.tocar_updated_at();
create trigger auditar_compras_materiais after insert or update or delete on public.compras_materiais
  for each row execute function public.auditar();

create table public.compras_tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  fornecedor text not null check (length(btrim(fornecedor)) between 2 and 120),
  fornecedor_chave text generated always as (public.chave_fornecedor(fornecedor)) stored,
  data_tabela date not null,
  valido_ate date,
  caminho text not null unique,
  nome_arquivo text not null check (length(btrim(nome_arquivo)) between 1 and 200),
  linhas_lidas integer not null check (linhas_lidas >= 0),
  ignoradas integer not null default 0 check (ignoradas >= 0),
  novos integer not null default 0,
  subiram integer not null default 0,
  baixaram integer not null default 0,
  iguais integer not null default 0,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  unique (empresa_id, id),
  constraint compras_tabelas_preco_validade check (valido_ate is null or valido_ate >= data_tabela)
);
create index on public.compras_tabelas_preco (empresa_id, fornecedor_chave, data_tabela desc, created_at desc);
create trigger auditar_compras_tabelas_preco after insert or update or delete on public.compras_tabelas_preco
  for each row execute function public.auditar();

-- Sem auditoria por linha: a própria tabela é o histórico (só acréscimo, com quem lançou e quando).
create table public.compras_precos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  material_id uuid not null,
  fornecedor text not null check (length(btrim(fornecedor)) between 2 and 120),
  fornecedor_chave text generated always as (public.chave_fornecedor(fornecedor)) stored,
  -- Como o material aparece na planilha do fornecedor (para reconhecer a linha na próxima tabela).
  codigo_fornecedor text check (codigo_fornecedor is null or length(btrim(codigo_fornecedor)) between 1 and 60),
  descricao_fornecedor text check (descricao_fornecedor is null or length(btrim(descricao_fornecedor)) between 1 and 200),
  preco numeric(12, 2) not null check (preco > 0),
  data_preco date not null,
  -- Nulo = lançado à mão.
  tabela_id uuid,
  lancado_por uuid,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, material_id) references public.compras_materiais (empresa_id, id),
  foreign key (empresa_id, tabela_id) references public.compras_tabelas_preco (empresa_id, id)
);
create index on public.compras_precos (empresa_id, material_id, fornecedor_chave, data_preco desc, created_at desc);
create index on public.compras_precos (empresa_id, fornecedor_chave, codigo_fornecedor);
create index on public.compras_precos (tabela_id) where tabela_id is not null;

create table public.compras_mapas_colunas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  fornecedor_chave text not null,
  mapa jsonb not null check (jsonb_typeof(mapa) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, fornecedor_chave)
);

alter table public.compras_materiais enable row level security;
alter table public.compras_tabelas_preco enable row level security;
alter table public.compras_precos enable row level security;
alter table public.compras_mapas_colunas enable row level security;
create policy "ver materiais de compra" on public.compras_materiais for select to authenticated
  using (public.pode_ver_precos_compra(empresa_id));
create policy "ver tabelas de preço" on public.compras_tabelas_preco for select to authenticated
  using (public.pode_ver_precos_compra(empresa_id));
create policy "ver preços de material" on public.compras_precos for select to authenticated
  using (public.pode_ver_precos_compra(empresa_id));
create policy "ver mapas de colunas" on public.compras_mapas_colunas for select to authenticated
  using (public.pode_editar_precos_compra(empresa_id));
-- Só as funções escrevem.
revoke all on public.compras_materiais, public.compras_tabelas_preco, public.compras_precos, public.compras_mapas_colunas
  from anon, authenticated, service_role;
grant select on public.compras_materiais, public.compras_tabelas_preco, public.compras_precos, public.compras_mapas_colunas
  to authenticated, service_role;

-- Preço atual de cada material em cada fornecedor. Confere quem vê uma vez (InitPlan), em vez da RLS linha a linha.
create or replace function public.precos_atuais_compra(p_empresa_id uuid)
returns table (
  material_id uuid, fornecedor text, fornecedor_chave text, preco numeric, data_preco date,
  codigo_fornecedor text, descricao_fornecedor text, tabela_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select distinct on (p.material_id, p.fornecedor_chave)
    p.material_id, p.fornecedor, p.fornecedor_chave, p.preco, p.data_preco, p.codigo_fornecedor, p.descricao_fornecedor, p.tabela_id
  from public.compras_precos p
  where p.empresa_id = p_empresa_id
    and (select public.pode_ver_precos_compra(p_empresa_id))
  order by p.material_id, p.fornecedor_chave, p.data_preco desc, p.created_at desc;
$$;
revoke all on function public.precos_atuais_compra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.precos_atuais_compra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Planilhas (bucket privado `compras-precos`, pasta `empresa/arquivo`)
-- ---------------------------------------------------------------------------

create or replace function public.pasta_compras_precos(p_caminho text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_empresa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 2 or v_partes[2] = '' then
    return null;
  end if;
  begin
    v_empresa := v_partes[1]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return (select e.id from public.empresas e where e.id = v_empresa);
end;
$$;
revoke all on function public.pasta_compras_precos(text) from public, anon, authenticated, service_role;

create or replace function public.pode_ver_pasta_compras_precos(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.pode_ver_precos_compra(public.pasta_compras_precos(p_caminho)), false);
$$;
revoke all on function public.pode_ver_pasta_compras_precos(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_compras_precos(text) to authenticated;

create or replace function public.pode_enviar_pasta_compras_precos(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.pode_editar_precos_compra(public.pasta_compras_precos(p_caminho)), false);
$$;
revoke all on function public.pode_enviar_pasta_compras_precos(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_compras_precos(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-precos', 'compras-precos', false, 10485760, array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'
])
on conflict (id) do nothing;

create policy "compras-precos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'compras-precos' and public.pode_ver_pasta_compras_precos(name));
create policy "compras-precos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'compras-precos' and public.pode_enviar_pasta_compras_precos(name));

-- ---------------------------------------------------------------------------
-- 4. Escrita
-- ---------------------------------------------------------------------------

create or replace function public.validar_material_compra(p_nome text, p_categoria text, p_unidade text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if nullif(btrim(p_nome), '') is null or length(btrim(p_nome)) < 2 or length(btrim(p_nome)) > 120 then
    raise exception 'Informe o nome do material (de 2 a 120 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_categoria is null or p_categoria not in ('modulos', 'inversores', 'baterias', 'estrutura', 'cabos_protecao', 'outros') then
    raise exception 'Escolha a categoria do material.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_unidade), '') is null or length(btrim(p_unidade)) > 20 then
    raise exception 'Informe a unidade (até 20 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_material_compra(text, text, text) from public, anon, authenticated, service_role;

create or replace function public.exigir_editar_precos_compra(p_empresa_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_empresa_id is null or not public.pode_editar_precos_compra(p_empresa_id) then
    raise exception 'Só quem atua em Compras, o gestor e o admin alteram a tabela de preços.'
      using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.exigir_editar_precos_compra(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_material_compra(p_empresa_id uuid, p_nome text, p_categoria text, p_unidade text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_editar_precos_compra(p_empresa_id);
  perform public.validar_material_compra(p_nome, p_categoria, p_unidade);
  insert into public.compras_materiais (empresa_id, nome, categoria, unidade, criado_por)
  values (p_empresa_id, regexp_replace(btrim(p_nome), '\s+', ' ', 'g'), p_categoria, btrim(p_unidade), public.meu_membro_id(p_empresa_id))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe um material com esse nome.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
end;
$$;
revoke all on function public.criar_material_compra(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.criar_material_compra(uuid, text, text, text) to authenticated;

create or replace function public.editar_material_compra(p_material_id uuid, p_nome text, p_categoria text, p_unidade text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := (select m.empresa_id from public.compras_materiais m where m.id = p_material_id);
begin
  perform public.exigir_editar_precos_compra(v_empresa);
  perform public.validar_material_compra(p_nome, p_categoria, p_unidade);
  update public.compras_materiais
  set nome = regexp_replace(btrim(p_nome), '\s+', ' ', 'g'), categoria = p_categoria, unidade = btrim(p_unidade)
  where id = p_material_id;
exception when unique_violation then
  raise exception 'Já existe um material com esse nome.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
end;
$$;
revoke all on function public.editar_material_compra(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.editar_material_compra(uuid, text, text, text) to authenticated;

create or replace function public.validar_preco_compra(p_fornecedor text, p_preco numeric, p_data date, p_codigo text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if nullif(btrim(p_fornecedor), '') is null or length(btrim(p_fornecedor)) < 2 or length(btrim(p_fornecedor)) > 120 then
    raise exception 'Informe o fornecedor (de 2 a 120 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_preco is null or round(p_preco, 2) <= 0 or p_preco >= 10000000000 then
    raise exception 'Informe o preço de custo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data is null then
    raise exception 'Informe a data do preço.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(p_codigo)) > 60 then
    raise exception 'O código do fornecedor tem no máximo 60 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_preco_compra(text, numeric, date, text) from public, anon, authenticated, service_role;

-- Preço lançado à mão (fornecedor que não manda tabela).
create or replace function public.lancar_preco_compra(
  p_material_id uuid, p_fornecedor text, p_preco numeric, p_data date, p_codigo text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := (select m.empresa_id from public.compras_materiais m where m.id = p_material_id);
begin
  perform public.exigir_editar_precos_compra(v_empresa);
  perform public.validar_preco_compra(p_fornecedor, p_preco, p_data, p_codigo);
  if p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do preço não pode ser futura.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.compras_precos (empresa_id, material_id, fornecedor, codigo_fornecedor, preco, data_preco, lancado_por)
  values (v_empresa, p_material_id, regexp_replace(btrim(p_fornecedor), '\s+', ' ', 'g'), nullif(btrim(p_codigo), ''),
          round(p_preco, 2), p_data, public.meu_membro_id(v_empresa));
end;
$$;
revoke all on function public.lancar_preco_compra(uuid, text, numeric, date, text) from public, anon, authenticated, service_role;
grant execute on function public.lancar_preco_compra(uuid, text, numeric, date, text) to authenticated;

-- Importa a tabela de um fornecedor, tudo ou nada. A planilha já foi enviada ao bucket pelo navegador.
-- p_itens: [{ "material_id": uuid } ou { "novo": { "nome", "categoria", "unidade" } }, mais "codigo", "descricao" e
-- "preco"]. Material novo com nome já cadastrado usa o existente. Devolve as contagens.
create or replace function public.importar_tabela_precos(
  p_empresa_id uuid, p_fornecedor text, p_data_tabela date, p_caminho text, p_nome_arquivo text,
  p_linhas_lidas integer, p_ignoradas integer, p_mapa jsonb, p_itens jsonb, p_valido_ate date default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro uuid;
  v_fornecedor text := regexp_replace(btrim(p_fornecedor), '\s+', ' ', 'g');
  v_chave text := public.chave_fornecedor(p_fornecedor);
  v_tabela uuid;
  v_item jsonb;
  v_material uuid;
  v_nome text;
  v_preco numeric;
  v_codigo text;
  v_descricao text;
  v_anterior numeric;
  v_vistos uuid[] := '{}';
  v_novos integer := 0;
  v_subiram integer := 0;
  v_baixaram integer := 0;
  v_iguais integer := 0;
begin
  perform public.exigir_editar_precos_compra(p_empresa_id);
  v_membro := public.meu_membro_id(p_empresa_id);
  perform public.validar_preco_compra(p_fornecedor, 1, p_data_tabela, null);
  if p_data_tabela > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da tabela não pode ser futura.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_valido_ate is not null and p_valido_ate < p_data_tabela then
    raise exception 'A validade não pode ser antes da data da tabela.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_nome_arquivo), '') is null or length(btrim(p_nome_arquivo)) > 200
     or public.pasta_compras_precos(p_caminho) is distinct from p_empresa_id
     or not exists (select 1 from storage.objects s where s.bucket_id = 'compras-precos' and s.name = p_caminho)
     or exists (select 1 from public.compras_tabelas_preco t where t.caminho = p_caminho) then
    raise exception 'Envie a planilha do fornecedor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum preço para importar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if jsonb_array_length(p_itens) > 5000 then
    raise exception 'A tabela tem mais de 5.000 preços. Divida a planilha.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce(p_linhas_lidas, -1) < jsonb_array_length(p_itens) or coalesce(p_ignoradas, -1) < 0 then
    raise exception 'Contagem de linhas inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_mapa is null or jsonb_typeof(p_mapa) <> 'object' or length(p_mapa::text) > 2000 then
    raise exception 'Indique as colunas da planilha.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.compras_tabelas_preco (
    empresa_id, fornecedor, data_tabela, valido_ate, caminho, nome_arquivo, linhas_lidas, ignoradas, enviado_por
  )
  values (p_empresa_id, v_fornecedor, p_data_tabela, p_valido_ate, p_caminho, btrim(p_nome_arquivo), p_linhas_lidas, p_ignoradas, v_membro)
  returning id into v_tabela;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Linha da tabela inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_descricao := nullif(btrim(v_item ->> 'descricao'), '');
    v_codigo := nullif(btrim(v_item ->> 'codigo'), '');
    if v_descricao is null or length(v_descricao) > 200 then
      raise exception 'Linha sem material (ou com mais de 200 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    begin
      v_preco := round((v_item ->> 'preco')::numeric, 2);
    exception when invalid_text_representation then
      v_preco := null;
    end;
    perform public.validar_preco_compra(v_fornecedor, v_preco, p_data_tabela, v_codigo);

    if v_item ? 'material_id' then
      begin
        v_material := (v_item ->> 'material_id')::uuid;
      exception when invalid_text_representation then
        v_material := null;
      end;
      if v_material is null or not exists (
        select 1 from public.compras_materiais m where m.id = v_material and m.empresa_id = p_empresa_id
      ) then
        raise exception 'Material de "%" não encontrado.', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif jsonb_typeof(v_item -> 'novo') = 'object' then
      v_nome := regexp_replace(btrim(v_item -> 'novo' ->> 'nome'), '\s+', ' ', 'g');
      perform public.validar_material_compra(v_nome, v_item -> 'novo' ->> 'categoria', v_item -> 'novo' ->> 'unidade');
      select m.id into v_material from public.compras_materiais m
      where m.empresa_id = p_empresa_id and lower(btrim(m.nome)) = lower(v_nome);
      if v_material is null then
        insert into public.compras_materiais (empresa_id, nome, categoria, unidade, criado_por)
        values (p_empresa_id, v_nome, v_item -> 'novo' ->> 'categoria', btrim(v_item -> 'novo' ->> 'unidade'), v_membro)
        returning id into v_material;
      end if;
    else
      raise exception 'Escolha o material de "%".', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;

    if v_material = any (v_vistos) then
      raise exception 'O material de "%" aparece mais de uma vez nesta tabela.', v_descricao
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_vistos := v_vistos || v_material;

    select p.preco into v_anterior from public.compras_precos p
    where p.empresa_id = p_empresa_id and p.material_id = v_material and p.fornecedor_chave = v_chave
    order by p.data_preco desc, p.created_at desc
    limit 1;
    if v_anterior is null then
      v_novos := v_novos + 1;
    elsif v_preco > v_anterior then
      v_subiram := v_subiram + 1;
    elsif v_preco < v_anterior then
      v_baixaram := v_baixaram + 1;
    else
      v_iguais := v_iguais + 1;
    end if;
    v_anterior := null;

    insert into public.compras_precos (
      empresa_id, material_id, fornecedor, codigo_fornecedor, descricao_fornecedor, preco, data_preco, tabela_id, lancado_por
    )
    values (p_empresa_id, v_material, v_fornecedor, v_codigo, v_descricao, v_preco, p_data_tabela, v_tabela, v_membro);
  end loop;

  update public.compras_tabelas_preco
  set novos = v_novos, subiram = v_subiram, baixaram = v_baixaram, iguais = v_iguais
  where id = v_tabela;

  insert into public.compras_mapas_colunas (empresa_id, fornecedor_chave, mapa)
  values (p_empresa_id, v_chave, p_mapa)
  on conflict (empresa_id, fornecedor_chave) do update set mapa = excluded.mapa, updated_at = now();

  return jsonb_build_object(
    'tabela_id', v_tabela, 'novos', v_novos, 'subiram', v_subiram, 'baixaram', v_baixaram, 'iguais', v_iguais
  );
end;
$$;
revoke all on function public.importar_tabela_precos(uuid, text, date, text, text, integer, integer, jsonb, jsonb, date)
  from public, anon, authenticated, service_role;
grant execute on function public.importar_tabela_precos(uuid, text, date, text, text, integer, integer, jsonb, jsonb, date)
  to authenticated;
