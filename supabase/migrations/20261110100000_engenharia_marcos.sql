-- Marcos da trajetória da Engenharia (decisão do Evandro, 03/11/2026: padrão 25 obras / 250 kWp, editáveis).
--
-- "Sua trajetória" e "Trajetória da equipe" mostram a barra até o próximo marco: a cada `obras` obras ou a cada `kwp`
-- kWp com a Engenharia concluída. Uma linha por empresa, que nasce com ela (as atuais recebem o padrão aqui). Quem é
-- da empresa lê; só o admin muda os dois números, em Configurações › Engenharia. A trajetória em si não muda: os marcos
-- só dividem o total que `trajetoria_engenharia` já devolve.

create table public.engenharia_marcos (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  obras integer not null default 25 check (obras between 1 and 10000),
  kwp integer not null default 250 check (kwp between 1 and 100000),
  updated_at timestamptz not null default now()
);
create trigger engenharia_marcos_updated_at before update on public.engenharia_marcos
  for each row execute function public.tocar_updated_at();
create trigger auditar_engenharia_marcos after insert or update or delete on public.engenharia_marcos
  for each row execute function public.auditar();

alter table public.engenharia_marcos enable row level security;
create policy "ver marcos da engenharia" on public.engenharia_marcos for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin edita marcos da engenharia" on public.engenharia_marcos for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
-- A linha nasce com a empresa; o admin só muda os números.
revoke insert, update, delete, truncate, references, trigger on public.engenharia_marcos from anon, authenticated;
grant update (obras, kwp) on public.engenharia_marcos to authenticated;
revoke all on public.engenharia_marcos from anon;

create or replace function public.criar_marcos_engenharia_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.engenharia_marcos (empresa_id) values (new.id) on conflict (empresa_id) do nothing;
  return null;
end;
$$;
revoke all on function public.criar_marcos_engenharia_empresa() from public, anon, authenticated, service_role;
create trigger empresas_marcos_engenharia after insert on public.empresas
  for each row execute function public.criar_marcos_engenharia_empresa();

insert into public.engenharia_marcos (empresa_id) select id from public.empresas on conflict (empresa_id) do nothing;
