-- Status de 3 estados pro vendedor/representante (ativo/inativo/desligado),
-- pedido do Evandro junto com o cadastro direto (sem convite por e-mail).
-- `ativo` continua existindo e é quem toda a RLS/lógica de negócio já usa
-- (pode_ver_responsavel, tem_papel, o rodízio de leads etc.) — o gatilho
-- abaixo mantém as duas colunas em sincronia, então nada mais precisa mudar.

create type public.status_membro as enum ('ativo', 'inativo', 'desligado');

alter table public.empresa_membros add column status public.status_membro not null default 'ativo';
update public.empresa_membros set status = (case when ativo then 'ativo' else 'inativo' end)::public.status_membro;

create or replace function public.sincronizar_ativo_membro()
returns trigger
language plpgsql
as $$
begin
  new.ativo := (new.status = 'ativo');
  return new;
end;
$$;

create trigger empresa_membros_sincronizar_ativo before insert or update of status on public.empresa_membros
  for each row execute function public.sincronizar_ativo_membro();
