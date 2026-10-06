-- Foto (avatar) opcional do usuário, global: vale em todas as empresas em que ele atua.
--
-- * perfis.avatar_caminho: caminho do arquivo no bucket privado 'avatares'
--   (formato <user_id>/<uuid>.<webp|jpg|png>). Nulo = sem foto (a tela cai nas iniciais).
-- * Bucket 'avatares' privado, até 3 MB por arquivo, só JPEG/PNG/WebP (sem SVG, que pode
--   carregar script). O app lê por URL assinada gerada no servidor, com a sessão de quem vê.
-- * Cada usuário envia, troca e remove só a própria foto. Lê a foto quem é o próprio dono ou
--   compartilha empresa com ele (mesma regra de leitura de perfis). O super-admin NÃO ganha
--   acesso extra: ele só vê foto de quem também compartilha empresa com ele.
--
-- A escrita da coluna é feita pela sessão do próprio usuário (política "editar o próprio perfil",
-- já existente em 20260925000100_fundacao.sql). Nenhuma política ou RLS de outra tabela é
-- alterada aqui.

alter table public.perfis add column avatar_caminho text;

-- A política de UPDATE de perfis é livre para o próprio usuário; sem esta amarra ele poderia
-- apontar a coluna para a foto de outra pessoa. O arquivo precisa estar na pasta do próprio
-- perfil (<id do perfil>/<uuid>.<webp|jpg|png>), sem subpastas nem '..'.
alter table public.perfis
  add constraint perfis_avatar_caminho_da_propria_pasta
  check (
    avatar_caminho is null
    or avatar_caminho ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$')
  );

-- ---------------------------------------------------------------------------
-- Storage: bucket privado dos avatares
-- ---------------------------------------------------------------------------

-- Se o bucket já existir (criado à mão em algum ambiente), a migration o endireita: privado,
-- 3 MB e só JPEG/PNG/WebP. "do nothing" deixaria um bucket público ou sem limite passar batido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Leitura: o dono da pasta ou quem compartilha empresa com ele (public.compartilha_empresa).
-- A pasta chega como texto e só vira uuid DEPOIS de validar o formato: um nome malformado
-- (qualquer coisa que alguém consiga subir ou já esteja no bucket) devolve false em vez de
-- lançar erro de cast e derrubar a consulta inteira. O CASE garante a ordem da avaliação
-- (o Postgres pode reordenar um AND). Sem e_plataforma_admin() de propósito.
create or replace function public.pode_ver_avatar(p_pasta text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case
      when p_pasta = (select auth.uid())::text then true
      when p_pasta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.compartilha_empresa(p_pasta::uuid)
      else false
    end,
    false
  );
$$;

-- Envio e atualização: o nome inteiro é ancorado em <auth.uid()>/<uuid>.<ext>. Isso nega
-- subpastas, '..', extensões fora de webp/jpg/png e nomes que não sejam uuid, e garante que
-- ninguém escreve na pasta de outro usuário. Remoção: basta a pasta ser a do próprio usuário
-- (storage.foldername devolve só as pastas do caminho; o 1º elemento é o user_id), para que
-- arquivos antigos ou fora do padrão ainda possam ser limpos pelo dono.
create policy "avatares: ler" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and public.pode_ver_avatar((storage.foldername(name))[1]));
create policy "avatares: dono envia" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$')
  );
create policy "avatares: dono atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatares'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$')
  );
create policy "avatares: dono remove" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
