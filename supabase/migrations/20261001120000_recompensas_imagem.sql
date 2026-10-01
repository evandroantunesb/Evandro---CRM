-- Imagem nas recompensas da loja de gamificação (pendência registrada em 2026-09-30).

alter table public.recompensas add column imagem_caminho text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('recompensas', 'recompensas', false, 5242880)
on conflict (id) do nothing;

-- Caminho no bucket: <empresa_id>/<arquivo>, igual ao padrão já usado em
-- "proposta-marca" (reaproveita a mesma função de extração de empresa_id).
create policy "recompensas: ler" on storage.objects for select to authenticated
  using (bucket_id = 'recompensas' and public.membro_ativo(public.empresa_da_pasta_marca(name)));
create policy "recompensas: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'recompensas' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "recompensas: admin atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'recompensas' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "recompensas: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'recompensas' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
