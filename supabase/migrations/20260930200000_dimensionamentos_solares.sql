-- Unificação do motor de dimensionamento solar (pedido do Evandro em
-- 2026-09-30, após o diagnóstico apontar 3 superfícies de cálculo
-- divergentes): esta tabela vira o snapshot único e autoritativo por
-- negócio, gravado só pela action `salvarDimensionamento`
-- (src/lib/acoes/dimensionamento.ts), que sempre roda o mesmo motor
-- (`src/lib/dimensionamento.ts`) no servidor antes de persistir — nunca
-- confia em quantidade/potência/overload calculados no cliente.
--
-- Guarda a referência aos equipamentos do catálogo (`equipamentos_empresa`)
-- realmente usados, resolvendo a perda de rastreabilidade do kit antigo
-- (`kit_componentes`, que só guarda texto solto). `kit_componentes` continua
-- existindo para os itens que não entram na fórmula elétrica (bateria,
-- estrutura, outros).
create type public.tipo_validacao_dimensionamento as enum ('valido', 'valido_com_alerta');
create type public.tipo_validacao_eletrica_dimensionamento as enum ('valido', 'nao_verificado');
create type public.origem_produtividade_dimensionamento as enum ('padrao', 'pvgis', 'nasa');
create type public.origem_tarifa_dimensionamento as enum ('manual', 'aneel');

create table public.dimensionamentos_solares (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null unique references public.negocios (id) on delete cascade,
  modulo_equipamento_id uuid not null references public.equipamentos_empresa (id) on delete restrict,
  inversor_equipamento_id uuid not null references public.equipamentos_empresa (id) on delete restrict,
  quantidade_modulos integer not null check (quantidade_modulos > 0),
  potencia_dc_kwp numeric(8, 2) not null check (potencia_dc_kwp > 0),
  potencia_ac_kw numeric(8, 2) not null check (potencia_ac_kw > 0),
  overload_pct numeric(6, 4) not null,
  validacao public.tipo_validacao_dimensionamento not null,
  validacao_eletrica public.tipo_validacao_eletrica_dimensionamento not null,
  -- Entradas usadas no dimensionamento, guardadas junto do resultado para a
  -- edição/proposta nunca precisar adivinhar o que gerou este snapshot.
  margem_dimensionamento_pct numeric(4, 3) not null check (margem_dimensionamento_pct >= 0 and margem_dimensionamento_pct <= 1),
  overload_maximo_pct numeric(4, 3) not null check (overload_maximo_pct >= 0 and overload_maximo_pct <= 1),
  temperatura_minima_projeto_c numeric(4, 1) not null,
  consumo_medio_kwh numeric(10, 2) not null check (consumo_medio_kwh > 0),
  valor_fatura_medio numeric(12, 2),
  produtividade_kwh_kwp_mes numeric(6, 2) not null check (produtividade_kwh_kwp_mes > 0),
  origem_produtividade public.origem_produtividade_dimensionamento not null default 'padrao',
  tarifa_kwh numeric(8, 4) not null check (tarifa_kwh > 0),
  origem_tarifa public.origem_tarifa_dimensionamento not null default 'manual',
  tipo_ligacao public.tipo_ligacao not null default 'trifasico',
  disponibilidade_kwh numeric(6, 2) not null check (disponibilidade_kwh >= 0),
  -- Preço do negócio no momento do cálculo, só para o payback não mudar
  -- sozinho se o valor do negócio for editado depois (mesmo motivo de
  -- `calculos_solares.kit_preco`).
  preco_negocio numeric(12, 2) not null check (preco_negocio >= 0),
  -- Resultado financeiro (mesma fórmula de `calcular()` em src/lib/calculadora.ts),
  -- calculado uma única vez ao salvar — a proposta só lê estes campos.
  geracao_estimada_kwh_mes numeric(10, 2) not null,
  economia_mensal numeric(12, 2) not null,
  payback_meses numeric(6, 1),
  criado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.dimensionamentos_solares (empresa_id, modulo_equipamento_id);
create index on public.dimensionamentos_solares (empresa_id, inversor_equipamento_id);

create trigger dimensionamentos_solares_updated_at before update on public.dimensionamentos_solares
  for each row execute function public.tocar_updated_at();

alter table public.dimensionamentos_solares enable row level security;

-- Mesmo padrão de acesso de `calculos_solares`: quem vê o negócio calcula e
-- recalcula (ferramenta de trabalho do vendedor); apagar fica para quem
-- calculou ou o admin.
create policy "ver dimensionamento" on public.dimensionamentos_solares for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
create policy "criar dimensionamento" on public.dimensionamentos_solares for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "editar dimensionamento" on public.dimensionamentos_solares for update to authenticated
  using (public.pode_ver_negocio(negocio_id)) with check (public.pode_ver_negocio(negocio_id));
create policy "apagar dimensionamento" on public.dimensionamentos_solares for delete to authenticated
  using (
    public.pode_ver_negocio(negocio_id)
    and (criado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'))
  );
