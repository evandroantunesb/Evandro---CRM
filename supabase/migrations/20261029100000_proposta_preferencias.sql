-- Validade padrão da proposta configurável por empresa (pedido do Evandro, 29/10/2026).
-- Precedência na ficha (ver `validadePadraoDoModelo` e uso em negocios/[id]/page.tsx):
-- preferência da empresa > "Validade (dias)" do modelo padrão publicado > VALIDADE_PADRAO_DIAS (10).
-- Mesmo padrão de `regras_temperatura` (20261024100000): RLS direta, admin e gestor editam,
-- sem rota nova no hub de Configurações (admin só) — o gestor chega por um link fora dele.

create table public.proposta_preferencias (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  validade_dias int not null check (validade_dias between 1 and 180),
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger proposta_preferencias_updated_at before update on public.proposta_preferencias
  for each row execute function public.tocar_updated_at();

alter table public.proposta_preferencias enable row level security;

-- Leitura: todo membro ativo da empresa (o vendedor vê o efeito na ficha, mesmo sem editar).
create policy "ver preferencia de validade da proposta" on public.proposta_preferencias
  for select to authenticated
  using (public.membro_ativo(empresa_id));

-- Escrita: só admin e gestor; a linha nasce na primeira vez que alguém define um valor.
create policy "admin e gestor definem validade padrão da proposta" on public.proposta_preferencias
  for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
create policy "admin e gestor atualizam validade padrão da proposta" on public.proposta_preferencias
  for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));

revoke delete, truncate on public.proposta_preferencias from anon, authenticated;
