-- "de N do plano" no indicador de Usuários (desenho `PerfisUsuarios`, pendência da B de 05/11/2026).
--
-- O admin da empresa não lê `planos_empresa` (só o super-admin), então o limite de usuários do plano chega por esta
-- função: devolve só o número, e só ao admin ativo da própria empresa. Sem plano, plano sem limite ou quem não é admin
-- da empresa: nulo (o indicador mostra apenas a contagem). O limite não é imposto em nenhum lugar; é informativo.
set lock_timeout = '5s';

create or replace function public.limite_usuarios_empresa(p_empresa_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when public.tem_papel(p_empresa_id, '{admin}') then (select p.limite_usuarios from public.planos_empresa p where p.empresa_id = p_empresa_id)
  end;
$$;
revoke all on function public.limite_usuarios_empresa(uuid) from public, anon;
grant execute on function public.limite_usuarios_empresa(uuid) to authenticated;

reset lock_timeout;
