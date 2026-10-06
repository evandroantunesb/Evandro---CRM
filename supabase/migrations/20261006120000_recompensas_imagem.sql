-- Imagem opcional das recompensas da loja de gamificação.
--
-- * recompensas.imagem_caminho: caminho do arquivo no bucket privado 'recompensas'
--   (formato <empresa_id>/<recompensa_id>/<arquivo>). Nulo = sem imagem (a tela cai no ícone).
-- * Bucket 'recompensas' privado, até 3 MB por arquivo, só JPEG/PNG/WebP (sem SVG, que pode
--   carregar script). O app lê por URL assinada gerada no servidor.
-- * Só o admin da empresa envia, troca e remove (mesma regra de recompensas); qualquer
--   membro ativo da empresa lê (a loja é de todos).
--
-- A escrita da coluna é feita pela sessão do admin (política "admin edita recompensa", já
-- existente); service_role não escreve em recompensas (20261002230000). Nenhuma política ou
-- RLS de outra tabela é alterada aqui.

alter table public.recompensas add column imagem_caminho text;

-- O arquivo precisa estar na pasta da própria recompensa: impede apontar para a imagem de
-- outra recompensa ou de outra empresa (mesmo que a política do bucket já isole por empresa).
alter table public.recompensas
  add constraint recompensas_imagem_caminho_da_propria_pasta
  check (imagem_caminho is null or imagem_caminho like empresa_id::text || '/' || id::text || '/%');

-- ---------------------------------------------------------------------------
-- Storage: bucket privado das imagens de recompensa
-- ---------------------------------------------------------------------------

-- Se o bucket já existir (criado à mão em algum ambiente), a migration o endireita: privado,
-- 3 MB e só JPEG/PNG/WebP. "do nothing" deixaria um bucket público ou sem limite passar batido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recompensas', 'recompensas', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- As políticas reaproveitam public.empresa_da_pasta_marca(name), criada em
-- 20260927030000_proposta_modelos.sql para o bucket 'proposta-marca'. Apesar do nome, ela é
-- genérica: extrai o uuid da primeira pasta do caminho (aqui, o empresa_id) e devolve null —
-- negando o acesso — quando o caminho não começa com um uuid ou não tem ao menos pasta + arquivo.
-- Caminho no bucket: <empresa_id>/<recompensa_id>/<arquivo>.
--
-- Envio e atualização exigem também que a recompensa da pasta exista na própria empresa:
-- sem isso o admin criaria arquivos em pastas de recompensas inexistentes (ou de outra empresa),
-- que nenhuma exclusão de recompensa limparia. storage.foldername(name) devolve só as pastas do
-- caminho, sem o arquivo ('e/r/f.webp' -> {e,r}); o 2º elemento é o id da recompensa e a
-- comparação é feita como texto (r.id::text), sem cast de uuid que poderia lançar erro com um
-- nome malformado. Leitura e remoção NÃO exigem a recompensa: apagarRecompensa remove a pasta
-- DEPOIS de apagar a linha, então a remoção precisa funcionar para recompensa já inexistente.

create policy "recompensas: ler" on storage.objects for select to authenticated
  using (bucket_id = 'recompensas' and public.membro_ativo(public.empresa_da_pasta_marca(name)));
create policy "recompensas: admin envia" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recompensas'
    and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}')
    and exists (
      select 1 from public.recompensas r
      where r.empresa_id = public.empresa_da_pasta_marca(name) and r.id::text = (storage.foldername(name))[2]
    )
  );
create policy "recompensas: admin atualiza" on storage.objects for update to authenticated
  using (
    bucket_id = 'recompensas'
    and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}')
    and exists (
      select 1 from public.recompensas r
      where r.empresa_id = public.empresa_da_pasta_marca(name) and r.id::text = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'recompensas'
    and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}')
    and exists (
      select 1 from public.recompensas r
      where r.empresa_id = public.empresa_da_pasta_marca(name) and r.id::text = (storage.foldername(name))[2]
    )
  );
create policy "recompensas: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'recompensas' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
