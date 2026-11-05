-- Tela de entrada por empresa (Configurações › Empresa › Tela de entrada; desenho aprovado
-- "Configurações · Tela de entrada" e "Acesso · Entrar").
--
-- * empresa_tela_entrada: uma linha por empresa com a imagem de fundo, a frase principal (até 60
--   caracteres) e o texto de apoio (até 140). Campo nulo = o padrão do Raion para aquele campo; sem
--   linha = tudo no padrão ("Voltar ao padrão" apaga a linha). Só o admin da empresa lê e grava.
-- * Entrar e Recuperar senha são telas sem login: o aparelho lembra a empresa do último login (cookie
--   raion_empresa) e o SERVIDOR lê só a frase, o texto e a imagem dela com a chave de serviço, como as
--   outras telas públicas (captura, proposta, contrato). Nenhuma função fica executável sem login (#276).
-- * Bucket 'tela-entrada' PÚBLICO (decisão do Evandro, 04/11/2026): a imagem aparece antes do login.
--   Até 3 MB (o navegador reduz a foto para no máximo 2400 px antes de enviar), só JPEG/PNG/WebP (sem
--   SVG, que pode carregar script). Só o admin envia, troca e remove, e só na pasta da própria empresa.
--
-- Nenhuma tabela, política ou função existente é alterada.

create table public.empresa_tela_entrada (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  imagem_caminho text,
  frase text check (frase is null or char_length(frase) between 1 and 60),
  texto text check (texto is null or char_length(texto) between 1 and 140),
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O arquivo precisa estar na pasta da própria empresa: impede apontar para a imagem de outra.
  constraint empresa_tela_entrada_imagem_da_propria_pasta
    check (imagem_caminho is null or imagem_caminho like empresa_id::text || '/%')
);

-- Empresa não muda e o autor é sempre quem está logado.
create or replace function public.preparar_empresa_tela_entrada()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da tela de entrada não muda' using errcode = 'check_violation';
  end if;
  new.atualizado_por := public.meu_membro_id(new.empresa_id);
  return new;
end;
$$;
create trigger empresa_tela_entrada_preparar before insert or update on public.empresa_tela_entrada
  for each row execute function public.preparar_empresa_tela_entrada();
create trigger empresa_tela_entrada_updated_at before update on public.empresa_tela_entrada
  for each row execute function public.tocar_updated_at();
create trigger auditar_empresa_tela_entrada after insert or update or delete on public.empresa_tela_entrada
  for each row execute function public.auditar();

alter table public.empresa_tela_entrada enable row level security;
create policy "admin vê a tela de entrada" on public.empresa_tela_entrada for select to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
create policy "admin cria a tela de entrada" on public.empresa_tela_entrada for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita a tela de entrada" on public.empresa_tela_entrada for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin volta a tela de entrada ao padrão" on public.empresa_tela_entrada for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
revoke all on public.empresa_tela_entrada from anon;

-- ---------------------------------------------------------------------------
-- Storage: bucket público das imagens da tela de entrada
-- ---------------------------------------------------------------------------

-- Se o bucket já existir (criado à mão em algum ambiente), a migration o endireita.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tela-entrada', 'tela-entrada', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Caminho no bucket: <empresa_id>/<arquivo>. public.empresa_da_pasta_marca(name) (criada em
-- 20260927030000_proposta_modelos.sql) extrai o uuid da primeira pasta e devolve null, negando o
-- acesso, quando o caminho não começa com um uuid ou não tem pasta + arquivo. Ser público só libera
-- abrir o arquivo pelo endereço; listar, enviar, trocar e remover seguem as políticas abaixo.
create policy "tela-entrada: admin lista" on storage.objects for select to authenticated
  using (bucket_id = 'tela-entrada' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "tela-entrada: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'tela-entrada' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "tela-entrada: admin atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'tela-entrada' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'))
  with check (bucket_id = 'tela-entrada' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
create policy "tela-entrada: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'tela-entrada' and public.tem_papel(public.empresa_da_pasta_marca(name), '{admin}'));
