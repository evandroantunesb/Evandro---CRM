-- Captura de leads (formulário público, sem login): limite de envios por origem da requisição.
--
-- Cada envio válido cria contato, negócio e sugestão de responsável. Sem limite, quem tem o link de um formulário ativo
-- enche o funil da empresa de negócios falsos. Até 5 envios por origem a cada 10 minutos em cada formulário; acima
-- disso, o servidor recusa sem criar nada. A origem é um hash (formulário + IP) calculado no servidor: o IP não é
-- guardado. As linhas valem por um dia e são apagadas pelos próprios envios seguintes do formulário.
--
-- Só o servidor (service_role, em enviarCaptura) usa a tabela e a função.

set lock_timeout = '5s';

create table public.captura_envios (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  formulario_id uuid not null references public.formularios (id) on delete cascade,
  origem text not null check (length(origem) = 64),
  created_at timestamptz not null default now()
);
create index captura_envios_formulario_origem on public.captura_envios (formulario_id, origem, created_at);
create index on public.captura_envios (empresa_id);

-- Sem política: anon e authenticated não leem nem escrevem.
alter table public.captura_envios enable row level security;
revoke all on table public.captura_envios from public, anon, authenticated;
grant select, insert, delete on table public.captura_envios to service_role;

/**
 * Registra um envio e devolve true; devolve false (sem registrar) quando a origem já fez 5 envios nos últimos 10
 * minutos neste formulário. A trava por formulário + origem faz dois envios simultâneos contarem um de cada vez.
 */
create or replace function public.registrar_envio_captura(p_formulario_id uuid, p_origem text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select f.empresa_id into v_empresa from public.formularios f where f.id = p_formulario_id;
  if v_empresa is null then
    raise exception 'Formulário não encontrado.' using errcode = 'no_data_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_formulario_id::text || ':' || p_origem, 0));

  delete from public.captura_envios e where e.formulario_id = p_formulario_id and e.created_at < now() - interval '1 day';

  if (
    select count(*) from public.captura_envios e
    where e.formulario_id = p_formulario_id and e.origem = p_origem and e.created_at > now() - interval '10 minutes'
  ) >= 5 then
    return false;
  end if;

  insert into public.captura_envios (empresa_id, formulario_id, origem) values (v_empresa, p_formulario_id, p_origem);
  return true;
end;
$$;

revoke all on function public.registrar_envio_captura(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_envio_captura(uuid, text) to service_role;

reset lock_timeout;
