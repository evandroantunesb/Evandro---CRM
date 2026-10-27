-- Rollout: empresas existentes ativam a vistoria obrigatória quando preparadas.
-- Empresas criadas pelo onboarding passam true explicitamente na aplicação.
alter table public.empresas add column vistoria_solar_obrigatoria boolean not null default false;

create or replace function public.exigir_vistoria_para_ganho_solar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'solar' and new.status = 'ganho' and old.status is distinct from 'ganho'
     and exists (select 1 from public.empresas e where e.id = new.empresa_id and e.vistoria_solar_obrigatoria)
     and not exists (select 1 from public.vistorias_tecnicas v
                     where v.negocio_id = new.id and v.empresa_id = new.empresa_id
                       and v.confirmada_em is not null) then
    raise exception 'Confirme a vistoria técnica com fotos antes de marcar a venda solar como ganha'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
