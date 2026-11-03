-- Emissão preservada da proposta (M2 P0): cada proposta emitida é uma linha IMUTÁVEL com os dados exatos que
-- o cliente vê (jsonb) e o PDF final guardado em bucket privado, com link próprio. Nada é recalculado nem relido do
-- negócio, do kit ou do cálculo depois de emitir; corrigir = emitir uma nova versão.
--
-- Migration ADITIVA: não altera `propostas` nem nenhuma outra tabela. Propostas antigas (sem emissão) continuam
-- sem dados preservados (link com aviso, PDF 409).
--
-- Preço e condições são dado comercial/financeiro: leitura e emissão exigem papel comercial (admin, gestor ou
-- vendedor, `tem_acesso_financeiro`), além de enxergar o negócio. O SDR não lê nem emite.

create table public.propostas_emissoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Sem cascata pelo negócio (NO ACTION, como os pagamentos): negócio com proposta emitida não pode ser apagado (só
  -- arquivado), então o registro do que o cliente recebeu não some por um DELETE do negócio. A remoção da EMPRESA
  -- continua em cascata (empresa_id acima); a conferência de NO ACTION só ocorre no fim do comando.
  negocio_id uuid not null references public.negocios (id),
  versao integer not null check (versao > 0),
  -- Token do link público da VERSÃO (cada emissão tem o seu): a posse do token autoriza a leitura, como em `propostas`.
  token text not null unique default gen_random_uuid()::text,
  tipo text not null default 'simples' check (tipo in ('simples')),
  -- Tudo o que a página pública e o PDF exibem (cliente, sistema, kit, preço, condições, validade, identidade).
  dados jsonb not null check (jsonb_typeof(dados) = 'object'),
  dados_sha256 text not null check (dados_sha256 ~ '^[0-9a-f]{64}$'),
  -- Validade informada pelo vendedor na emissão (sem padrão: nunca inventada pelo sistema).
  validade_ate date not null,
  -- Caminho no bucket 'propostas-emitidas': <empresa_id>/<negocio_id>/<id>.pdf
  pdf_caminho text not null check (pdf_caminho = empresa_id::text || '/' || negocio_id::text || '/' || id::text || '.pdf'),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes integer not null check (pdf_bytes > 0),
  -- Versão do layout que gerou o PDF (para saber qual renderizador produziu aquele arquivo).
  renderizador text not null check (length(trim(renderizador)) > 0),
  emitida_em timestamptz not null default now(),
  emitida_por uuid not null references public.empresa_membros (id),
  unique (negocio_id, versao)
);
create index on public.propostas_emissoes (empresa_id);

-- ---------------------------------------------------------------------------
-- Imutabilidade: nenhum UPDATE nem DELETE direto, para ninguém (inclusive service_role).
-- Só a remoção em CASCATA da EMPRESA é permitida: ela roda dentro de um gatilho de integridade referencial
-- (pg_trigger_depth() > 1) e a empresa já não existe quando a linha é apagada. Qualquer outro DELETE/UPDATE, de
-- sessão ou aninhado em outro gatilho, é recusado.
-- ---------------------------------------------------------------------------

create or replace function public.recusar_alteracao_emissao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 and not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old;
  end if;
  raise exception 'Proposta emitida não pode ser alterada nem apagada: emita uma nova versão.'
    using errcode = 'check_violation', hint = 'mensagem_usuario';
end;
$$;

create trigger propostas_emissoes_imutavel
  before update or delete on public.propostas_emissoes
  for each row execute function public.recusar_alteracao_emissao();

create or replace function public.recusar_truncate_emissao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Proposta emitida não pode ser apagada.' using errcode = 'check_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- INSERT: o servidor não confia nos campos que o cliente da API envia. Quem insere (mesmo com o JWT do usuário, direto
-- em /rest/v1) não escolhe o token (sempre sorteado aqui), nem a versão (sempre a próxima do negócio, sob trava), e
-- os campos relacionais precisam bater com o que está dentro de `dados` (que é o que o cliente vê).
-- ---------------------------------------------------------------------------

create or replace function public.conferir_emissao_proposta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_proxima integer;
  v_validade date;
  v_emitida timestamptz;
begin
  -- Este gatilho roda ANTES da RLS (security definer): quem não enxerga o negócio é recusado aqui, sem pista alguma
  -- (nem contagem de versões, nem trava no negócio alheio). Service role (sem auth.uid) não passa por esta checagem.
  if auth.uid() is not null
     and not (public.pode_ver_negocio(new.negocio_id) and public.tem_acesso_financeiro(new.empresa_id)) then
    raise exception 'Não foi possível emitir a proposta.' using errcode = 'insufficient_privilege';
  end if;

  -- Serializa as emissões do mesmo negócio.
  perform pg_advisory_xact_lock(hashtextextended('propostas_emissoes:' || new.negocio_id::text, 0));

  new.token := gen_random_uuid()::text;

  select coalesce(max(e.versao), 0) + 1 into v_proxima from public.propostas_emissoes e where e.negocio_id = new.negocio_id;
  if new.versao <> v_proxima then
    raise exception 'A versão da proposta precisa ser a próxima do negócio.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  begin
    v_validade := (new.dados -> 'comercial' ->> 'validadeAte')::date;
    v_emitida := (new.dados -> 'emissao' ->> 'emitidaEm')::timestamptz;
    if (new.dados -> 'emissao' ->> 'versao')::integer is distinct from new.versao then
      raise exception 'versao' using errcode = 'check_violation';
    end if;
  exception when others then
    raise exception 'Os dados da proposta não conferem com a emissão.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end;
  if v_validade is distinct from new.validade_ate or v_emitida is distinct from new.emitida_em then
    raise exception 'Os dados da proposta não conferem com a emissão.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if new.validade_ate < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A validade da proposta não pode ser anterior a hoje.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- A hora da emissão é a do servidor, com folga para o tempo de gerar o PDF e o relógio do app.
  if new.emitida_em < now() - interval '10 minutes' or new.emitida_em > now() + interval '2 minutes' then
    raise exception 'A hora da emissão não confere.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- A linha só nasce amarrada ao PDF que o app guardou (só o service role envia ao bucket): sem arquivo, sem emissão.
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'propostas-emitidas' and o.name = new.pdf_caminho and (o.metadata ->> 'size')::bigint = new.pdf_bytes
  ) then
    raise exception 'O PDF da proposta não foi encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.conferir_emissao_proposta() from public, anon, authenticated, service_role;

-- O prefixo "0" faz este gatilho rodar antes do de arquivado (ordem alfabética): a checagem de acesso vem primeiro.
create trigger propostas_emissoes_0conferir
  before insert on public.propostas_emissoes
  for each row execute function public.conferir_emissao_proposta();

-- Negócio arquivado é somente leitura: nenhuma proposta nasce nele (como as demais tabelas comerciais).
create trigger propostas_emissoes_arquivado_somente_leitura
  before insert on public.propostas_emissoes
  for each row execute function public.negocio_arquivado_bloquear_filho();

create trigger propostas_emissoes_sem_truncate
  before truncate on public.propostas_emissoes
  for each statement execute function public.recusar_truncate_emissao();

-- ---------------------------------------------------------------------------
-- RLS: só SELECT e INSERT para usuários autenticados; nenhuma policy de UPDATE/DELETE.
-- ---------------------------------------------------------------------------

alter table public.propostas_emissoes enable row level security;

revoke all on public.propostas_emissoes from anon;
revoke update, delete, truncate on public.propostas_emissoes from authenticated;

create policy "ver emissoes de proposta" on public.propostas_emissoes for select to authenticated
  using (public.pode_ver_negocio(negocio_id) and public.tem_acesso_financeiro(empresa_id));

-- O vendedor só emite em nome dele (`emitida_por`) e só para negócio da própria empresa que ele enxerga.
create policy "emitir proposta" on public.propostas_emissoes for insert to authenticated
  with check (
    public.membro_ativo(empresa_id)
    and public.tem_acesso_financeiro(empresa_id)
    and public.pode_ver_negocio(negocio_id)
    and emitida_por = public.meu_membro_id(empresa_id)
    and exists (select 1 from public.negocios n where n.id = propostas_emissoes.negocio_id and n.empresa_id = propostas_emissoes.empresa_id)
  );

-- ---------------------------------------------------------------------------
-- Storage: bucket privado só para os PDFs emitidos (até 10 MB, só PDF).
-- Sem policy de INSERT/UPDATE/DELETE para usuários: o envio é feito só pela ação de emitir (service role), uma vez,
-- e nunca sobrescrito (cada PDF tem o id da emissão no nome). A leitura pública é pela rota do token (service role),
-- que confere o SHA-256 gravado antes de devolver os bytes.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('propostas-emitidas', 'propostas-emitidas', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Caminho: <empresa_id>/<negocio_id>/<emissao_id>.pdf
create or replace function public.pode_ver_pdf_proposta_emitida(p_caminho text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_negocio uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3 then
    return false;
  end if;
  begin
    v_negocio := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
    select 1 from public.negocios n
    where n.id = v_negocio
      and n.empresa_id::text = v_partes[1]
      and public.pode_ver_negocio(n.id)
      and public.tem_acesso_financeiro(n.empresa_id)
  );
end;
$$;

revoke all on function public.pode_ver_pdf_proposta_emitida(text) from public, anon;
grant execute on function public.pode_ver_pdf_proposta_emitida(text) to authenticated;

create policy "propostas emitidas: ler" on storage.objects for select to authenticated
  using (bucket_id = 'propostas-emitidas' and public.pode_ver_pdf_proposta_emitida(name));
