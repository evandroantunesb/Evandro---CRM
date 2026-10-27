-- Fotos de vistoria só contam quando correspondem a um objeto no Storage.
-- `registrarAnexo` já faz esta conferência; o gatilho fecha a mesma regra na API SQL.
create or replace function public.validar_foto_vistoria_no_storage()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.categoria in ('vistoria_medidor', 'vistoria_telhado')
     and not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'anexos' and o.name = new.caminho
         and o.metadata ->> 'mimetype' like 'image/%'
         and o.metadata ->> 'mimetype' = new.tipo_mime
     ) then
    raise exception 'Envie uma foto válida antes de registrá-la na vistoria'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.validar_foto_vistoria_no_storage() from public, anon, authenticated, service_role;
create trigger anexos_validar_foto_vistoria before insert or update of categoria, caminho, tipo_mime on public.anexos
  for each row execute function public.validar_foto_vistoria_no_storage();
