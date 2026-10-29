-- Validade padrão da proposta, definida por admin e gestor.
--
-- O que faz:
--  * `proposta_preferencias`: uma linha por empresa com `validade_dias` (1 a 180). Na ficha do negócio, a data
--    "Válida até" da proposta já vem preenchida com hoje + esse número de dias. Sem linha, a ficha usa a validade do
--    modelo padrão e, sem ela, 10 dias (decisão do Evandro, 29/10/2026).
--  * Admin e gestor criam e alteram a linha da própria empresa; quem tem acesso comercial lê. Autor gravado na
--    linha (não dá para forjar) e histórico na auditoria existente (`auditar`).
-- O que NÃO faz: não muda proposta já emitida (a validade de cada versão continua congelada na emissão), não muda
-- o modelo de proposta e não dá ao gestor acesso aos modelos.
-- Depende de: tem_papel, tem_acesso_comercial, meu_membro_id, tocar_updated_at, auditar (já existentes).

set lock_timeout = '3s';

create table public.proposta_preferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  validade_dias smallint not null check (validade_dias between 1 and 180),
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Empresa não muda e o autor é sempre quem está logado.
create or replace function public.preparar_proposta_preferencias()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da preferência não muda' using errcode = 'check_violation';
  end if;
  new.atualizado_por := public.meu_membro_id(new.empresa_id);
  return new;
end;
$$;
create trigger proposta_preferencias_preparar before insert or update on public.proposta_preferencias
  for each row execute function public.preparar_proposta_preferencias();
create trigger proposta_preferencias_updated_at before update on public.proposta_preferencias
  for each row execute function public.tocar_updated_at();
create trigger auditar_proposta_preferencias after insert or update or delete on public.proposta_preferencias
  for each row execute function public.auditar();

alter table public.proposta_preferencias enable row level security;
create policy "acesso comercial vê preferências de proposta" on public.proposta_preferencias for select to authenticated
  using (public.tem_acesso_comercial(empresa_id));
create policy "admin e gestor criam preferências de proposta" on public.proposta_preferencias for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
create policy "admin e gestor editam preferências de proposta" on public.proposta_preferencias for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
-- Sem DELETE pela API: para voltar ao padrão, grava-se outro número.
revoke delete, truncate on public.proposta_preferencias from anon, authenticated;
revoke all on public.proposta_preferencias from anon;
