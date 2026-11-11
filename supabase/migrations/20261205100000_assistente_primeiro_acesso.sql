-- Onboarding, subprojeto 3: assistente de primeiro acesso (desenho em
-- docs/superpowers/specs/2026-11-11-assistente-primeiro-acesso-design.md; decisões do Evandro de 10–11/11/2026).
--
-- O que faz:
--  * `empresa_onboarding`: em que passo o assistente da empresa está, os passos pulados e quando foi concluído. O
--    super-admin cria a linha junto com a empresa nova; sem linha, o assistente não se aplica (empresas de antes).
--    Só o admin da empresa lê e avança; concluído não volta a pendente.
--  * `empresa_tela_entrada.faixa_caminho` e `.faixa_usa_entrada`: a foto da faixa do topo de cada tela, própria ou a
--    mesma da tela de entrada (padrão).
--  * `salvar_cnpj_empresa`: o admin grava o CNPJ da própria empresa (a tabela `empresas` só aceita escrita do
--    super-admin).
-- Nenhuma política existente é alterada.

set lock_timeout = '5s';

create table public.empresa_onboarding (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  passo_atual smallint not null default 1 check (passo_atual between 1 and 12),
  pulados smallint[] not null default '{}',
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Empresa não muda; concluído não volta a pendente.
create or replace function public.preparar_empresa_onboarding()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa do assistente não muda' using errcode = 'check_violation';
  end if;
  if old.concluido_em is not null and new.concluido_em is null then
    raise exception 'O assistente já foi concluído.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.preparar_empresa_onboarding() from public, anon, authenticated;
create trigger empresa_onboarding_preparar before update on public.empresa_onboarding
  for each row execute function public.preparar_empresa_onboarding();
create trigger empresa_onboarding_updated_at before update on public.empresa_onboarding
  for each row execute function public.tocar_updated_at();
create trigger auditar_empresa_onboarding after insert or update or delete on public.empresa_onboarding
  for each row execute function public.auditar();

alter table public.empresa_onboarding enable row level security;
create policy "admin vê o assistente" on public.empresa_onboarding for select to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
create policy "admin avança o assistente" on public.empresa_onboarding for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "super-admin cria o assistente" on public.empresa_onboarding for insert to authenticated
  with check (public.e_plataforma_admin());
revoke all on public.empresa_onboarding from anon;

alter table public.empresa_tela_entrada
  add column faixa_caminho text,
  -- As linhas que já existem ficam com false: a faixa delas continua a paisagem do Raion até o admin escolher
  -- (decisão do Evandro de 11/11/2026). As novas nascem com true ("usar a mesma imagem da tela de entrada").
  add column faixa_usa_entrada boolean not null default false,
  add constraint empresa_tela_entrada_faixa_da_propria_pasta
    check (faixa_caminho is null or faixa_caminho like empresa_id::text || '/%');
alter table public.empresa_tela_entrada alter column faixa_usa_entrada set default true;

/** CNPJ da empresa pelo admin dela: 14 dígitos, ou vazio para limpar. */
create or replace function public.salvar_cnpj_empresa(p_empresa_id uuid, p_cnpj text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
begin
  if p_empresa_id is null or not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Só o admin da empresa altera o CNPJ.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_cnpj is not null and length(v_cnpj) <> 14 then
    raise exception 'O CNPJ tem 14 dígitos.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.empresas set cnpj = v_cnpj where id = p_empresa_id;
end;
$$;
revoke all on function public.salvar_cnpj_empresa(uuid, text) from public, anon;
grant execute on function public.salvar_cnpj_empresa(uuid, text) to authenticated;

reset lock_timeout;
