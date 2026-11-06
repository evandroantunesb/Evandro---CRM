-- Compras, P2c: Engenharia e Administrativo usando os documentos do cliente do negócio (prévia aprovada no canvas
-- "Compras · Pedidos de compra", linha P2c; decisões do Evandro de 06/11/2026).
--
--  * Engenharia: nos itens do checklist marcados como documento do cliente (documento com foto, fatura recente e
--    cartão CNPJ), quem atua na Engenharia da obra vê o arquivo mais recente da categoria certa nos anexos do negócio
--    e pode usá-lo como nova versão do item. O app copia o arquivo para a pasta da obra no bucket
--    `engenharia-documentos` (a cópia fica mesmo que o anexo do negócio seja apagado ou trocado) e a RPC registra a
--    versão com a origem; o item vai para "em conferência", como num envio.
--  * Marcar inválido um item cuja versão atual veio do negócio avisa o responsável do negócio no sininho, com o
--    motivo (responsável inativo: os gestores das equipes dele; negócio sem responsável: os admins). Versão enviada
--    pela própria Engenharia não avisa ninguém.
--  * No negócio, quem vê o negócio sabe quais documentos a Engenharia recusou (o anexo recusado e o motivo).
--  * Administrativo da obra (quem atua nele, coordenador, gestor e admin): vê os documentos do cliente (do negócio,
--    da Engenharia ou anexados por Compras), só para leitura, e os dados para a NF do cliente, agora com inscrição
--    estadual e e-mail (sem telefone, decisão da A1). O Operacional continua sem os documentos.
--
-- Depende de: 20261127100000_compras_pdf_documentos.sql (documento_cliente no modelo, documentos_cliente_obra,
-- pode_ler_documento_cliente_*), 20261126100000_compras_orcamentos.sql (compras_arquivos, bucket compras-obra),
-- 20261112100000_engenharia_nao_se_aplica.sql (alterar_item_engenharia), 20261030100000_engenharia_checklist.sql
-- (obra_engenharia_documentos, obra_da_pasta_engenharia), 20261113100000_aviso_pagamento_vendedor.sql (tipos de
-- notificação).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Versão do item da Engenharia vinda do negócio
-- ---------------------------------------------------------------------------

-- `anexo_origem_id` perde a referência se o anexo for apagado; `do_negocio` guarda a origem para sempre.
alter table public.obra_engenharia_documentos
  add column do_negocio boolean not null default false,
  add column anexo_origem_id uuid references public.anexos (id) on delete set null,
  add constraint obra_engenharia_documentos_origem check (anexo_origem_id is null or do_negocio);

-- Quem lê os documentos do cliente na obra: quem escreve em Compras ou atua no Administrativo dela.
create or replace function public.pode_ler_documentos_cliente_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_obra_id is not null and (
    public.autorizacao_setor_obra(p_obra_id, 'compras') is not null
    or public.autorizacao_setor_obra(p_obra_id, 'administrativo') is not null
  );
$$;
revoke all on function public.pode_ler_documentos_cliente_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ler_documentos_cliente_obra(uuid) to authenticated;

-- Documento do cliente de cada categoria de anexo do negócio.
create or replace function public.documento_cliente_da_categoria(p_categoria text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_categoria
    when 'cnh' then 'documento_foto'
    when 'fatura_gerador' then 'comprovante_residencia'
    when 'cartao_cnpj' then 'cartao_cnpj'
  end;
$$;
revoke all on function public.documento_cliente_da_categoria(text) from public, anon, authenticated, service_role;

-- Para a Engenharia: o anexo mais recente de cada documento do cliente no negócio da obra. Só para admin e quem atua
-- na Engenharia da obra (os mesmos que veem os documentos do checklist).
create or replace function public.documentos_negocio_engenharia(p_obra_id uuid)
returns table (documento text, anexo_id uuid, nome text, caminho text, enviado_por uuid, enviado_em timestamptz)
language sql stable security definer set search_path = ''
as $$
  select distinct on (public.documento_cliente_da_categoria(a.categoria))
    public.documento_cliente_da_categoria(a.categoria), a.id, a.nome, a.caminho, a.enviado_por, a.created_at
  from public.obras o
  join public.anexos a on a.negocio_id = o.negocio_id and a.empresa_id = o.empresa_id
  where o.id = p_obra_id and a.categoria in ('cnh', 'fatura_gerador', 'cartao_cnpj')
    and public.pode_ver_documentos_engenharia(o.id)
  order by public.documento_cliente_da_categoria(a.categoria), a.created_at desc, a.id desc;
$$;
revoke all on function public.documentos_negocio_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.documentos_negocio_engenharia(uuid) to authenticated;

-- Registra como nova versão do item a cópia (já na pasta da obra) de um anexo do negócio. Mesmas regras de
-- `registrar_documento_engenharia`, mais: o item é documento do cliente, o anexo é do negócio da obra e da categoria
-- do item, a cópia tem o tamanho do original e o anexo ainda não é a versão atual do item.
create or replace function public.usar_documento_negocio_engenharia(p_item_id uuid, p_anexo_id uuid, p_caminho text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_item public.obra_engenharia_itens;
  v_documento text;
  v_anexo public.anexos;
  v_objeto record;
  v_original bigint;
  v_atual uuid;
  v_versao integer;
  v_id uuid;
begin
  select obra_id into v_obra from public.obra_engenharia_itens where id = p_item_id;
  -- Sem item: preparar_escrita_obra responde "sem permissão" (mesma resposta para o que a pessoa não vê).
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_item from public.obra_engenharia_itens where id = p_item_id for update;

  select m.documento_cliente into v_documento from public.engenharia_checklist_modelo m where m.id = v_item.modelo_id;
  if v_documento is null then
    raise exception 'Este item não é documento do cliente.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select a.* into v_anexo
  from public.anexos a
  join public.obras o on o.negocio_id = a.negocio_id and o.empresa_id = a.empresa_id
  where a.id = p_anexo_id and o.id = v_item.obra_id;
  if not found or public.documento_cliente_da_categoria(v_anexo.categoria) is distinct from v_documento then
    raise exception 'Arquivo do negócio não encontrado para este item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select d.anexo_origem_id into v_atual from public.obra_engenharia_documentos d where d.item_id = v_item.id order by d.versao desc limit 1;
  if v_atual = v_anexo.id then
    raise exception 'Este arquivo do negócio já é a versão atual do item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if public.obra_da_pasta_engenharia(p_caminho) is distinct from v_item.obra_id then
    raise exception 'O arquivo não está na pasta desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select o.metadata into v_objeto
  from storage.objects o
  where o.bucket_id = 'engenharia-documentos' and o.name = p_caminho and o.owner_id = (select auth.uid())::text;
  if not found then
    raise exception 'Arquivo não encontrado no armazenamento. Tente de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select (o.metadata ->> 'size')::bigint into v_original
  from storage.objects o where o.bucket_id = 'anexos' and o.name = v_anexo.caminho;
  if coalesce((v_objeto.metadata ->> 'size')::bigint, 0) <= 0 or (v_objeto.metadata ->> 'size')::bigint is distinct from v_original then
    raise exception 'A cópia não confere com o arquivo do negócio. Tente de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- O item está travado: a próxima versão não corre risco de repetir.
  select coalesce(max(versao), 0) + 1 into v_versao from public.obra_engenharia_documentos where item_id = v_item.id;
  insert into public.obra_engenharia_documentos (
    empresa_id, obra_id, item_id, versao, caminho, nome, tamanho, tipo_mime, enviado_por, do_negocio, anexo_origem_id
  )
  values (
    v_item.empresa_id, v_item.obra_id, v_item.id, v_versao, p_caminho, v_anexo.nome, (v_objeto.metadata ->> 'size')::bigint,
    nullif(v_objeto.metadata ->> 'mimetype', ''), public.meu_membro_id(v_item.empresa_id), true, v_anexo.id
  )
  on conflict (caminho) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Este arquivo já está registrado.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;

  if v_item.status <> 'dispensado' then
    update public.obra_engenharia_itens
    set status = 'em_conferencia', motivo = null, atualizado_por = public.meu_membro_id(v_item.empresa_id), atualizado_em = now()
    where id = v_item.id;
  end if;

  perform public.registrar_historico_obra(v_item.obra_id, 'documento_engenharia_enviado', 'engenharia', jsonb_build_object(
    'item', v_item.titulo,
    'arquivo', v_anexo.nome,
    'versao', v_versao,
    'origem', 'negocio',
    'autorizacao', v_aut
  ));
  return v_id;
end;
$$;
revoke all on function public.usar_documento_negocio_engenharia(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.usar_documento_negocio_engenharia(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Documento do negócio recusado pela Engenharia: aviso ao vendedor
-- ---------------------------------------------------------------------------

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido', 'conquista_desbloqueada',
    'tarefa_setor_concluida', 'tarefa_setor_cancelada', 'tarefa_setor_atribuida', 'tarefa_setor_reaberta',
    'desconto_solicitado', 'desconto_decidido',
    'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida',
    'pagamento_aviso_confirmado', 'pagamento_aviso_devolvido',
    'documento_cliente_recusado'
  ));

-- Quem recebe o aviso do negócio: o responsável ativo; responsável inativo, os gestores ativos das equipes ativas
-- dele; sem responsável, os admins ativos. Nunca quem fez a ação.
create or replace function public.avisar_documento_cliente_recusado(p_item public.obra_engenharia_itens, p_documento text, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(p_item.empresa_id);
  v_obra public.obras;
  v_responsavel uuid;
  v_para uuid[];
  v_mensagem text;
begin
  select * into v_obra from public.obras where id = p_item.obra_id;
  select n.responsavel_id into v_responsavel from public.negocios n where n.id = v_obra.negocio_id;

  if v_responsavel is null then
    v_para := array(select m.id from public.empresa_membros m where m.empresa_id = p_item.empresa_id and m.papel = 'admin' and m.ativo);
  elsif exists (select 1 from public.empresa_membros m where m.id = v_responsavel and m.ativo) then
    v_para := array[v_responsavel];
  else
    v_para := array(
      select g.membro_id
      from public.equipe_membros dele
      join public.equipes eq on eq.id = dele.equipe_id and eq.ativa
      join public.equipe_membros g on g.equipe_id = dele.equipe_id and g.e_gestor
      where dele.membro_id = v_responsavel
    );
  end if;

  v_mensagem := format(
    'Engenharia recusou %s de %s (obra nº %s): %s',
    case p_documento
      when 'documento_foto' then 'o documento com foto'
      when 'comprovante_residencia' then 'o comprovante de residência'
      else 'o cartão CNPJ'
    end,
    v_obra.cliente_nome, v_obra.numero, p_motivo
  );
  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  select distinct p_item.empresa_id, m.id, 'documento_cliente_recusado', left(v_mensagem, 500),
    format('/negocios/%s?aba=proposta#documentos-cliente', v_obra.negocio_id)
  from public.empresa_membros m
  where m.id = any(v_para) and m.empresa_id = p_item.empresa_id and m.ativo and m.id is distinct from v_eu;
end;
$$;
revoke all on function public.avisar_documento_cliente_recusado(public.obra_engenharia_itens, text, text) from public, anon, authenticated, service_role;

-- Corpo de 20261112100000_engenharia_nao_se_aplica.sql + o aviso quando a versão atual inválida veio do negócio.
create or replace function public.alterar_item_engenharia(p_item_id uuid, p_status text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_item public.obra_engenharia_itens;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_documento text;
begin
  select obra_id into v_obra from public.obra_engenharia_itens where id = p_item_id;
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_item from public.obra_engenharia_itens where id = p_item_id for update;

  if p_status is null or p_status not in ('pendente', 'valido', 'invalido', 'dispensado') then
    raise exception 'Situação inválida para o item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_status in ('invalido', 'dispensado') then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if length(v_motivo) > 500 then
      raise exception 'Motivo muito longo (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  else
    v_motivo := null;
  end if;
  if p_status = 'valido' and not exists (select 1 from public.obra_engenharia_documentos d where d.item_id = v_item.id) then
    raise exception 'Anexe o arquivo antes de marcar o item como válido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_item.status = p_status and v_item.motivo is not distinct from v_motivo then
    return;
  end if;

  update public.obra_engenharia_itens
  set status = p_status, motivo = v_motivo, atualizado_por = public.meu_membro_id(v_item.empresa_id), atualizado_em = now()
  where id = v_item.id;

  perform public.registrar_historico_obra(v_item.obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
    'item', v_item.titulo,
    'de', v_item.status,
    'para', p_status,
    'motivo', v_motivo,
    'autorizacao', v_aut
  ));

  if p_status = 'invalido' then
    select m.documento_cliente into v_documento
    from public.engenharia_checklist_modelo m
    where m.id = v_item.modelo_id and m.documento_cliente is not null
      and (select d.do_negocio from public.obra_engenharia_documentos d where d.item_id = v_item.id order by d.versao desc limit 1);
    if v_documento is not null then
      perform public.avisar_documento_cliente_recusado(v_item, v_documento, v_motivo);
    end if;
  end if;
end;
$$;
revoke all on function public.alterar_item_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_item_engenharia(uuid, text, text) to authenticated;

-- No negócio: documentos recusados pela Engenharia (item inválido com a versão atual vinda de um anexo do negócio),
-- o mais recente por documento. O app compara `anexo_id` com o anexo atual da categoria: anexado outro, a recusa
-- deixa de valer. Só para quem vê o negócio.
create or replace function public.documentos_recusados_negocio(p_negocio_id uuid)
returns table (documento text, anexo_id uuid, motivo text, recusado_por uuid, recusado_em timestamptz)
language sql stable security definer set search_path = ''
as $$
  select distinct on (m.documento_cliente) m.documento_cliente, d.anexo_origem_id, i.motivo, i.atualizado_por, i.atualizado_em
  from public.obras o
  join public.obra_engenharia_itens i on i.obra_id = o.id and i.status = 'invalido'
  join public.engenharia_checklist_modelo m on m.id = i.modelo_id and m.documento_cliente is not null
  join lateral (
    select x.do_negocio, x.anexo_origem_id from public.obra_engenharia_documentos x where x.item_id = i.id order by x.versao desc limit 1
  ) d on d.do_negocio and d.anexo_origem_id is not null
  where o.negocio_id = p_negocio_id and public.pode_ver_negocio(p_negocio_id)
  order by m.documento_cliente, i.atualizado_em desc;
$$;
revoke all on function public.documentos_recusados_negocio(uuid) from public, anon, authenticated, service_role;
grant execute on function public.documentos_recusados_negocio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Administrativo: documentos do cliente e dados para a NF
-- ---------------------------------------------------------------------------

-- Corpo de 20261127100000_compras_pdf_documentos.sql, agora também para o Administrativo da obra.
create or replace function public.documentos_cliente_obra(p_obra_id uuid)
returns table (documento text, origem text, nome text, caminho text, enviado_em timestamptz)
language sql stable security definer set search_path = ''
as $$
  with obra as (
    select o.id, o.negocio_id from public.obras o
    where o.id = p_obra_id and public.pode_ler_documentos_cliente_obra(o.id)
  )
  select distinct on (d.documento, d.origem) d.documento, d.origem, d.nome, d.caminho, d.enviado_em
  from (
    select public.documento_cliente_da_categoria(a.categoria), 'negocio', a.nome, a.caminho, a.created_at
    from obra join public.anexos a on a.negocio_id = obra.negocio_id
    where a.categoria in ('cnh', 'fatura_gerador', 'cartao_cnpj')
    union all
    select m.documento_cliente, 'engenharia', d.nome, d.caminho, d.created_at
    from obra
    join public.obra_engenharia_itens i on i.obra_id = obra.id
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    join public.obra_engenharia_documentos d on d.item_id = i.id
    where m.documento_cliente is not null
  ) d (documento, origem, nome, caminho, enviado_em)
  order by d.documento, d.origem, d.enviado_em desc;
$$;
revoke all on function public.documentos_cliente_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.documentos_cliente_obra(uuid) to authenticated;

-- Documentos do cliente que Compras anexou na obra (a RLS de `compras_arquivos` não inclui o Administrativo).
create or replace function public.documentos_cliente_compras_obra(p_obra_id uuid)
returns table (documento text, descricao text, nome text, caminho text, enviado_em timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.documento, a.descricao, a.nome, a.caminho, a.created_at
  from public.compras_arquivos a
  where a.obra_id = p_obra_id and a.tipo = 'documento_cliente' and public.pode_ler_documentos_cliente_obra(p_obra_id)
  order by a.created_at desc, a.id desc;
$$;
revoke all on function public.documentos_cliente_compras_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.documentos_cliente_compras_obra(uuid) to authenticated;

-- Dados para a NF do cliente: quem atua no Administrativo da obra (coordenador, gestor e admin inclusive).
create or replace function public.dados_nf_cliente_obra(p_obra_id uuid)
returns table (
  nome text, tipo text, documento text, inscricao_estadual text, email text, cep text, logradouro text, numero text,
  bairro text, complemento text, cidade text, uf text, endereco text
)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(nullif(btrim(cl.dados ->> 'nome'), ''), o.cliente_nome), cl.dados ->> 'tipo', cl.dados ->> 'documento',
    cl.dados ->> 'inscricao_estadual', cl.dados ->> 'email', cl.dados ->> 'cep', cl.dados ->> 'logradouro',
    cl.dados ->> 'numero', cl.dados ->> 'bairro', cl.dados ->> 'complemento', cl.dados ->> 'cidade', cl.dados ->> 'uf',
    cl.dados ->> 'endereco'
  from public.obras o
  left join public.obra_cliente cl on cl.obra_id = o.id
  where o.id = p_obra_id and public.autorizacao_setor_obra(o.id, 'administrativo') is not null;
$$;
revoke all on function public.dados_nf_cliente_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.dados_nf_cliente_obra(uuid) to authenticated;

-- Leitura dos arquivos. Anexos do negócio (só os três documentos): Compras e Administrativo de uma obra do negócio e
-- a Engenharia dela (para ver e copiar o arquivo).
create or replace function public.pode_ler_documento_cliente_anexo(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.anexos a
    join public.obras o on o.negocio_id = a.negocio_id and o.empresa_id = a.empresa_id
    where a.caminho = p_caminho and a.categoria in ('cnh', 'fatura_gerador', 'cartao_cnpj')
      and (public.pode_ler_documentos_cliente_obra(o.id) or public.pode_ver_documentos_engenharia(o.id))
  );
$$;

create or replace function public.pode_ler_documento_cliente_engenharia(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.obra_engenharia_documentos d
    join public.obra_engenharia_itens i on i.id = d.item_id
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    where d.caminho = p_caminho and m.documento_cliente is not null
      and public.pode_ler_documentos_cliente_obra(d.obra_id)
  );
$$;

-- Documentos do cliente anexados por Compras: também o Administrativo da obra.
create or replace function public.pode_ler_documento_cliente_compras(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.compras_arquivos a
    where a.caminho = p_caminho and a.tipo = 'documento_cliente'
      and public.autorizacao_setor_obra(a.obra_id, 'administrativo') is not null
  );
$$;
revoke all on function public.pode_ler_documento_cliente_compras(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ler_documento_cliente_compras(text) to authenticated;

create policy "compras-obra: Administrativo lê documentos do cliente" on storage.objects for select to authenticated
  using (bucket_id = 'compras-obra' and public.pode_ler_documento_cliente_compras(name));
