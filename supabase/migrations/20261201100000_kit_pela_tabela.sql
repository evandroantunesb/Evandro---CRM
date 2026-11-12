-- Compras P4b: kit montado com os materiais da tabela de preços e preço de venda pronto (prévia aprovada "Compras P4 ·
-- Kit pela tabela de preços", canvas "Raion — Nova interface"; decisões do Evandro de 09/11/2026).
--
--  * Item do kit ligado ao material (`kit_componentes.material_id`). Item sem material ou sem preço na tabela leva o
--    preço de venda informado pelo vendedor (`preco_venda_manual`).
--  * Preço sugerido do kit = venda sugerida de cada item (melhor custo atual × (1 + margem da categoria), ou o preço à
--    mão) × quantidade + custos internos (instalação por módulo, material CA por kWp, engenharia) + comissão %. Quem
--    calcula é o servidor (`src/lib/compras/precificacao-kit.ts`), com a chave de serviço, depois de a sessão provar
--    acesso ao negócio; o resultado fica como retrato:
--      - `negocio_precificacao`: o preço sugerido (o vendedor vê; base do desconto da P4c);
--      - `negocio_custo_kit`: o custo dos itens pela tabela (o vendedor NÃO vê: só quem vê a tabela de preços).
--    Nenhum dos dois aceita escrita do cliente autenticado.
--  * Obra nova: o previsto de Equipamentos passa a ser o custo do kit pela tabela (retrato da venda), quando existe;
--    sem retrato (negócio antigo), continua o valor do kit (`calculos_solares.kit_preco`). Obras existentes não mudam.

alter table public.kit_componentes
  add column material_id uuid,
  add column preco_venda_manual numeric(12, 2) check (preco_venda_manual is null or preco_venda_manual > 0),
  add constraint kit_componentes_material_fk foreign key (empresa_id, material_id)
    references public.compras_materiais (empresa_id, id);
create index on public.kit_componentes (material_id) where material_id is not null;

create table public.negocio_precificacao (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Nulo = incompleto (algum item sem preço): o vendedor informa o valor como antes.
  preco_sugerido numeric(12, 2) check (preco_sugerido is null or preco_sugerido >= 0),
  -- Itens sem preço e preços velhos, só com descrição e dias (sem custo).
  avisos jsonb not null default '[]'::jsonb check (jsonb_typeof(avisos) = 'array'),
  calculado_em timestamptz not null default now()
);
create index on public.negocio_precificacao (empresa_id);
alter table public.negocio_precificacao enable row level security;
create policy "ver preço sugerido do negócio" on public.negocio_precificacao for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
revoke all on public.negocio_precificacao from anon, authenticated, service_role;
grant select on public.negocio_precificacao to authenticated;
grant select, insert, update, delete on public.negocio_precificacao to service_role;

create table public.negocio_custo_kit (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  custo_itens numeric(12, 2) not null check (custo_itens >= 0),
  -- Algum item entrou sem custo da tabela (preço à mão): o custo é só dos itens com preço.
  parcial boolean not null default false,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  calculado_em timestamptz not null default now()
);
create index on public.negocio_custo_kit (empresa_id);
alter table public.negocio_custo_kit enable row level security;
create policy "ver custo do kit" on public.negocio_custo_kit for select to authenticated
  using (public.pode_ver_precos_compra(empresa_id));
revoke all on public.negocio_custo_kit from anon, authenticated, service_role;
grant select on public.negocio_custo_kit to authenticated;
grant select, insert, update, delete on public.negocio_custo_kit to service_role;

-- Previsto inicial da obra (corpo de 20261105100000_obras_custos.sql): Equipamentos = custo do kit pela tabela.
create or replace function public.orcamento_inicial_obra(p_obra_id uuid)
returns table (categoria text, planejado numeric)
language sql stable security definer set search_path = ''
as $$
  with o as (select * from public.obras where id = p_obra_id),
  p as (select pc.* from public.parametros_calculadora pc join o on pc.empresa_id = o.empresa_id),
  kit as (select cs.kit_preco from public.calculos_solares cs join o on cs.negocio_id = o.negocio_id),
  custo as (select ck.custo_itens from public.negocio_custo_kit ck join o on ck.negocio_id = o.negocio_id),
  modulos as (
    select coalesce(sum(k.quantidade), 0) as n from public.kit_componentes k join o on k.negocio_id = o.negocio_id where k.tipo = 'modulo'
  )
  select 'equipamentos', coalesce((select custo_itens from custo), (select kit_preco from kit), 0)
  union all select 'estrutura_materiais', round(coalesce((select custo_material_ca_por_kwp from p), 0) * coalesce((select potencia_kwp from o), 0), 2)
  union all select 'mao_de_obra', round(coalesce((select custo_instalacao_por_modulo from p), 0) * (select n from modulos), 2)
  union all select 'homologacao', coalesce((select custo_engenharia from p), 0)
  union all select 'frete', coalesce((select custo_frete from p), 0);
$$;
revoke all on function public.orcamento_inicial_obra(uuid) from public, anon, authenticated, service_role;

-- Materiais que o vendedor pode pôr no kit, sem custo nem margem: só se tem preço e há quantos dias. Quem tem acesso
-- comercial à empresa (quem monta kit) lê; o custo continua só com quem vê a tabela de preços.
create or replace function public.materiais_para_kit(p_empresa_id uuid)
returns table (id uuid, nome text, categoria text, unidade text, potencia_w numeric, tem_preco boolean, data_preco date)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.nome, m.categoria, m.unidade, m.potencia_w, p.data_preco is not null, p.data_preco
  from public.compras_materiais m
  left join lateral (
    select max(cp.data_preco) as data_preco from public.compras_precos cp
    where cp.empresa_id = m.empresa_id and cp.material_id = m.id
  ) p on true
  where m.empresa_id = p_empresa_id
    and (select public.tem_acesso_comercial(p_empresa_id))
  order by m.nome;
$$;
revoke all on function public.materiais_para_kit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.materiais_para_kit(uuid) to authenticated;
