-- Onboarding, subprojeto 1: telas por empresa (desenho em docs/superpowers/specs/2026-11-10-telas-por-empresa-design.md;
-- decisões do Evandro de 10/11/2026; quadro aprovado "Onboarding PRO · passos 4 e 5").
--
-- O que faz:
--  * `empresa_telas`: as telas opcionais que o admin desligou (Painel, Leads a distribuir, Forecast, Obras, Engenharia,
--    Gamificação, Eletroposto e Captura). Sem linha = nada desligado. Os membros leem; só o admin grava. Desligar só
--    esconde a tela no app: nada no banco para de funcionar e nenhum dado é apagado.
--  * `produto_da_empresa`: o plano (solo/pro) para os membros da empresa (`planos_empresa` só é lido pelo
--    super-admin). Empresa sem plano = PRO, como sempre foi.
-- Nenhuma tabela, política ou função existente é alterada.

set lock_timeout = '5s';

create table public.empresa_telas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  desligadas text[] not null default '{}'
    check (desligadas <@ array['painel', 'leads', 'forecast', 'obras', 'engenharia', 'gamificacao', 'eletroposto', 'captura']::text[]),
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Empresa não muda e o autor é sempre quem está logado.
create or replace function public.preparar_empresa_telas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa das telas não muda' using errcode = 'check_violation';
  end if;
  new.atualizado_por := public.meu_membro_id(new.empresa_id);
  return new;
end;
$$;
revoke all on function public.preparar_empresa_telas() from public, anon, authenticated;
create trigger empresa_telas_preparar before insert or update on public.empresa_telas
  for each row execute function public.preparar_empresa_telas();
create trigger empresa_telas_updated_at before update on public.empresa_telas
  for each row execute function public.tocar_updated_at();
create trigger auditar_empresa_telas after insert or update or delete on public.empresa_telas
  for each row execute function public.auditar();

alter table public.empresa_telas enable row level security;
create policy "membros veem as telas da empresa" on public.empresa_telas for select to authenticated
  using (public.meu_membro_id(empresa_id) is not null);
create policy "admin cria as telas da empresa" on public.empresa_telas for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita as telas da empresa" on public.empresa_telas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin volta as telas ao padrão" on public.empresa_telas for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
revoke all on public.empresa_telas from anon;

/** Plano da empresa para quem é membro dela: 'solo' ou 'pro' (sem plano = 'pro'); nulo para quem não é membro. */
create or replace function public.produto_da_empresa(p_empresa_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when public.meu_membro_id(p_empresa_id) is null then null
    else coalesce((select p.produto::text from public.planos_empresa p where p.empresa_id = p_empresa_id), 'pro')
  end;
$$;
revoke all on function public.produto_da_empresa(uuid) from public, anon;
grant execute on function public.produto_da_empresa(uuid) to authenticated;

reset lock_timeout;
