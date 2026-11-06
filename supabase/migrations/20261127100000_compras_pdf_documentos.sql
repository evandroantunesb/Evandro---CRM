-- Compras, P2b: PDF do pedido, faturamento e entrega no pedido e documentos do cliente (prévia aprovada no canvas
-- "Compras · Pedidos de compra", linha P2b; decisões do Evandro de 06/11/2026).
--
--  * Compras vê todos os dados do cliente da obra (`obras_operacao`), para faturar o kit no nome dele.
--  * Pedido: "faturar em nome de" (cliente, o padrão, ou a própria empresa) e "entregar em" (mesmo endereço do
--    faturamento, o padrão, ou outro endereço com quem recebe e telefone). Faturando para a empresa, que não tem
--    endereço cadastrado, o endereço de entrega é obrigatório.
--  * Frete CIF (por conta da distribuidora, sem valor no pedido) ou FOB (por conta da empresa, com o valor do frete),
--    no pedido e no orçamento.
--    Pedidos existentes: FOB se têm frete, CIF se não têm.
--  * Observações de Compras para o fornecedor no pedido (opcional), impressas no PDF.
--  * Documentos do cliente para a distribuidora: documento com foto, comprovante de residência (fatura de energia) e
--    cartão CNPJ (cliente empresa). Vêm, na ordem, dos anexos do negócio (o vendedor anexa para gerar o contrato), dos
--    itens marcados no checklist da Engenharia ou do que Compras anexar na obra (também "outro documento").
--  * O contrato só é gerado com os documentos anexados no negócio: cliente CPF, documento com foto (CNH) e comprovante
--    de residência; cliente CNPJ, cartão CNPJ e comprovante de residência (mesma trava dos dados do cliente, só para contratos
--    novos ou regerados). Categoria nova nos anexos do negócio: "Cartão CNPJ".
--  * Quem vê os dados e os documentos do cliente na obra: quem escreve em Compras nela (Compras, coordenador, gestor,
--    admin). Administrativo e Operacional ficam para a P2c.
--
-- Depende de: 20261126100000_compras_orcamentos.sql (compras_arquivos, preparar_escrita_compras_obra,
-- gravar_arquivo_compra, criar_pedido_compra), 20261125100000_compras_pedidos.sql (editar_pedido_compra,
-- gravar_itens_pedido_compra, validar_dados_pedido_compra, sincronizar_compras_obra), obras_operacao
-- (20261119100100), contratos_exigir_dados_cliente e pendencias_contrato_contato (20261029190000),
-- engenharia_checklist_modelo e obra_engenharia_* (20261030100000), anexos (20260925000300).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Compras vê todos os dados do cliente da obra
-- ---------------------------------------------------------------------------

-- Corpo de 20261119100100_setor_administrativo.sql (mesmo retorno) + Compras em todos os campos do cliente.
create or replace function public.obras_operacao(p_obra_id uuid default null)
returns table (
  obra_id uuid,
  empresa_id uuid,
  numero integer,
  cliente_nome text,
  cidade text,
  uf text,
  potencia_kwp numeric,
  tipo_ligacao public.tipo_ligacao,
  unidade_consumidora text,
  snapshot jsonb,
  snapshot_versao integer,
  pausada_em timestamptz,
  pausa_motivo text,
  cancelada_em timestamptz,
  cancelamento_motivo text,
  alerta_pagamento_estornado_em timestamptz,
  venda_alterada_em timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  cliente_endereco text,
  cliente_telefone text,
  cliente_telefone2 text,
  cliente_documento text,
  cliente_rg text,
  cliente_data_nascimento date,
  cliente_email text,
  cliente_inscricao_estadual text
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id, o.empresa_id, o.numero, o.cliente_nome, o.cidade, o.uf, o.potencia_kwp,
    o.tipo_ligacao, o.unidade_consumidora,
    o.snapshot - 'cliente',
    o.snapshot_versao, o.pausada_em, o.pausa_motivo, o.cancelada_em, o.cancelamento_motivo,
    o.alerta_pagamento_estornado_em, o.venda_alterada_em, o.created_at, o.updated_at,
    case when a.operacional or a.engenharia or a.compras or a.administrativo then cl.dados ->> 'endereco' end,
    case when a.operacional or a.engenharia or a.compras then cl.dados ->> 'telefone' end,
    case when a.operacional or a.engenharia or a.compras then cl.dados ->> 'telefone2' end,
    case when a.engenharia or a.administrativo or a.compras then cl.dados ->> 'documento' end,
    case when a.engenharia or a.compras then cl.dados ->> 'rg' end,
    case when a.engenharia or a.compras then (cl.dados ->> 'data_nascimento')::date end,
    case when a.engenharia or a.compras then cl.dados ->> 'email' end,
    case when a.engenharia or a.compras then cl.dados ->> 'inscricao_estadual' end
  from public.obras o
  left join public.obra_cliente cl on cl.obra_id = o.id
  -- Setores em que EU sou participante ativo desta obra.
  cross join lateral (
    select
      coalesce(bool_or(p.setor = 'operacional'), false) as operacional,
      coalesce(bool_or(p.setor = 'engenharia'), false) as engenharia,
      coalesce(bool_or(p.setor = 'compras'), false) as compras,
      coalesce(bool_or(p.setor = 'administrativo'), false) as administrativo
    from public.obra_participantes p
    where p.obra_id = o.id
      and p.empresa_id = o.empresa_id
      and p.membro_id = public.meu_membro_id(o.empresa_id)
      and p.fim is null
  ) a
  where o.empresa_id in (
      select m.empresa_id from public.empresa_membros m
      where m.user_id = (select auth.uid()) and m.ativo and m.papel = 'operacao'
    )
    and (p_obra_id is null or o.id = p_obra_id)
    and public.pode_ver_obra_operacao(o.id)
  order by o.created_at desc, o.numero desc;
$$;

-- Dados do cliente para o faturamento do pedido (tela de Compras e PDF): quem escreve em Compras na obra.
create or replace function public.dados_faturamento_obra(p_obra_id uuid)
returns table (
  nome text, tipo text, documento text, inscricao_estadual text, rg text, data_nascimento date, email text,
  telefone text, cep text, logradouro text, numero text, bairro text, complemento text, cidade text, uf text,
  endereco text
)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(nullif(btrim(cl.dados ->> 'nome'), ''), o.cliente_nome), cl.dados ->> 'tipo', cl.dados ->> 'documento',
    cl.dados ->> 'inscricao_estadual', cl.dados ->> 'rg', (cl.dados ->> 'data_nascimento')::date, cl.dados ->> 'email',
    cl.dados ->> 'telefone', cl.dados ->> 'cep', cl.dados ->> 'logradouro', cl.dados ->> 'numero', cl.dados ->> 'bairro',
    cl.dados ->> 'complemento', cl.dados ->> 'cidade', cl.dados ->> 'uf', cl.dados ->> 'endereco'
  from public.obras o
  left join public.obra_cliente cl on cl.obra_id = o.id
  where o.id = p_obra_id and public.autorizacao_setor_obra(o.id, 'compras') is not null;
$$;
revoke all on function public.dados_faturamento_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.dados_faturamento_obra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Documentos do cliente no negócio e trava do contrato
-- ---------------------------------------------------------------------------

do $$
declare
  v_nome text;
begin
  select c.conname into v_nome
  from pg_constraint c
  where c.conrelid = 'public.anexos'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%categoria%';
  if v_nome is null then
    raise exception 'Restrição de categoria dos anexos não encontrada.';
  end if;
  execute format('alter table public.anexos drop constraint %I', v_nome);
end;
$$;
alter table public.anexos add constraint anexos_categoria_check
  check (categoria in ('geral', 'cnh', 'fatura_gerador', 'fatura_beneficiario', 'cartao_cnpj'));
create index if not exists anexos_negocio_categoria_idx on public.anexos (negocio_id, categoria, created_at desc);

-- Documentos que faltam no negócio para gerar o contrato (mesma regra de `src/lib/documentos-cliente.ts`).
create or replace function public.pendencias_documentos_contrato(p_negocio_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select array_remove(array[
    case when c.tipo is distinct from 'pj' and not exists (select 1 from public.anexos a where a.negocio_id = n.id and a.categoria = 'cnh')
      then 'documento com foto' end,
    case when c.tipo = 'pj' and not exists (select 1 from public.anexos a where a.negocio_id = n.id and a.categoria = 'cartao_cnpj')
      then 'cartão CNPJ' end,
    case when not exists (select 1 from public.anexos a where a.negocio_id = n.id and a.categoria = 'fatura_gerador')
      then 'comprovante de residência (fatura de energia)' end
  ], null)
  from public.negocios n
  left join public.contatos c on c.id = n.contato_id
  where n.id = p_negocio_id;
$$;
revoke all on function public.pendencias_documentos_contrato(uuid) from public, anon, authenticated, service_role;

-- Corpo de 20261029190000_dados_cliente_contrato.sql + os documentos do cliente (depois dos dados).
create or replace function public.contratos_exigir_dados_cliente()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pendentes text[];
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.conteudo is not distinct from old.conteudo then
    return new;
  end if;
  select public.pendencias_contrato_contato(n.contato_id) into v_pendentes
  from public.negocios n where n.id = new.negocio_id;
  if coalesce(cardinality(v_pendentes), 0) > 0 then
    raise exception 'Para gerar o contrato, preencha os dados do cliente: %.', array_to_string(v_pendentes, ', ')
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_pendentes := public.pendencias_documentos_contrato(new.negocio_id);
  if coalesce(cardinality(v_pendentes), 0) > 0 then
    raise exception 'Para gerar o contrato, anexe os documentos do cliente: %.', array_to_string(v_pendentes, ', ')
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.contratos_exigir_dados_cliente() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Itens do checklist da Engenharia que são documentos do cliente
-- ---------------------------------------------------------------------------

alter table public.engenharia_checklist_modelo add column documento_cliente text
  check (documento_cliente in ('documento_foto', 'comprovante_residencia', 'cartao_cnpj'));
create unique index engenharia_checklist_modelo_documento_cliente
  on public.engenharia_checklist_modelo (empresa_id, documento_cliente) where documento_cliente is not null;

-- Pelo título padrão (o admin pode ter editado: sem o título, o item fica sem marcação e Compras usa as outras fontes).
create or replace function public.documento_cliente_pelo_titulo(p_titulo text)
returns text
language sql immutable set search_path = ''
as $$
  select case lower(btrim(p_titulo))
    when 'documento com foto do titular, legível, com cpf' then 'documento_foto'
    when 'fatura recente da unidade consumidora' then 'comprovante_residencia'
    when 'cartão cnpj' then 'cartao_cnpj'
  end;
$$;
revoke all on function public.documento_cliente_pelo_titulo(text) from public, anon, authenticated, service_role;

update public.engenharia_checklist_modelo m
set documento_cliente = public.documento_cliente_pelo_titulo(m.titulo)
where public.documento_cliente_pelo_titulo(m.titulo) is not null
  and not exists (
    select 1 from public.engenharia_checklist_modelo x
    where x.empresa_id = m.empresa_id and x.documento_cliente = public.documento_cliente_pelo_titulo(m.titulo)
  );

-- Empresa nova (lista padrão): marca o item pelo título, se a empresa ainda não tem esse documento marcado.
create or replace function public.marcar_documento_cliente_modelo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc text := public.documento_cliente_pelo_titulo(new.titulo);
begin
  if new.documento_cliente is null and v_doc is not null and not exists (
    select 1 from public.engenharia_checklist_modelo x where x.empresa_id = new.empresa_id and x.documento_cliente = v_doc
  ) then
    new.documento_cliente := v_doc;
  end if;
  return new;
end;
$$;
revoke all on function public.marcar_documento_cliente_modelo() from public, anon, authenticated, service_role;
create trigger marcar_documento_cliente_modelo before insert on public.engenharia_checklist_modelo
  for each row execute function public.marcar_documento_cliente_modelo();

-- ---------------------------------------------------------------------------
-- 4. Documentos do cliente na obra (para Compras)
-- ---------------------------------------------------------------------------

-- O arquivo mais recente de cada documento, do negócio e da Engenharia. Só para quem escreve em Compras na obra.
create or replace function public.documentos_cliente_obra(p_obra_id uuid)
returns table (documento text, origem text, nome text, caminho text, enviado_em timestamptz)
language sql stable security definer set search_path = ''
as $$
  with obra as (
    select o.id, o.negocio_id from public.obras o
    where o.id = p_obra_id and public.autorizacao_setor_obra(o.id, 'compras') is not null
  )
  select distinct on (d.documento, d.origem) d.documento, d.origem, d.nome, d.caminho, d.enviado_em
  from (
    select case a.categoria when 'cnh' then 'documento_foto' when 'fatura_gerador' then 'comprovante_residencia' else 'cartao_cnpj' end,
           'negocio', a.nome, a.caminho, a.created_at
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

-- Leitura dos arquivos: só os documentos do cliente, por quem escreve em Compras numa obra do negócio.
create or replace function public.pode_ler_documento_cliente_anexo(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.anexos a
    join public.obras o on o.negocio_id = a.negocio_id and o.empresa_id = a.empresa_id
    where a.caminho = p_caminho and a.categoria in ('cnh', 'fatura_gerador', 'cartao_cnpj')
      and public.autorizacao_setor_obra(o.id, 'compras') is not null
  );
$$;
revoke all on function public.pode_ler_documento_cliente_anexo(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ler_documento_cliente_anexo(text) to authenticated;

create or replace function public.pode_ler_documento_cliente_engenharia(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.obra_engenharia_documentos d
    join public.obra_engenharia_itens i on i.id = d.item_id
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    where d.caminho = p_caminho and m.documento_cliente is not null
      and public.autorizacao_setor_obra(d.obra_id, 'compras') is not null
  );
$$;
revoke all on function public.pode_ler_documento_cliente_engenharia(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ler_documento_cliente_engenharia(text) to authenticated;

create policy "anexos: Compras lê documentos do cliente" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ler_documento_cliente_anexo(name));
create policy "engenharia-documentos: Compras lê documentos do cliente" on storage.objects for select to authenticated
  using (bucket_id = 'engenharia-documentos' and public.pode_ler_documento_cliente_engenharia(name));

-- Compras anexa o documento que falta (ou outro documento do cliente) nos arquivos de compra da obra.
alter table public.compras_arquivos drop constraint compras_arquivos_tipo_check;
alter table public.compras_arquivos add constraint compras_arquivos_tipo_check
  check (tipo in ('orcamento', 'confirmacao', 'outro', 'documento_cliente'));
alter table public.compras_arquivos
  add column documento text check (documento in ('documento_foto', 'comprovante_residencia', 'cartao_cnpj', 'outro')),
  add column descricao text check (descricao is null or length(btrim(descricao)) between 2 and 120),
  add constraint compras_arquivos_documento check (
    (tipo = 'documento_cliente') = (documento is not null)
    and ((documento = 'outro') is true) = (descricao is not null)
  );
alter table public.compras_arquivos drop constraint compras_arquivos_pedido;
alter table public.compras_arquivos add constraint compras_arquivos_pedido check (
  (tipo = 'confirmacao' and pedido_id is not null)
  or (tipo in ('orcamento', 'documento_cliente') and pedido_id is null and fornecedor is null)
  or tipo = 'outro'
);

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao',
  'passo_engenharia_registrado', 'enquadramento_engenharia_salvo',
  'entrega_contratada_ajustada', 'entrega_material_prevista',
  'orcamento_ajustado', 'custo_lancado', 'custo_estornado',
  'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida',
  'escalonamento_aberto', 'escalonamento_fechado',
  'obra_rede_engenharia',
  'conta_pagar_lancada', 'conta_paga', 'conta_cancelada', 'conta_estornada', 'nf_fornecedor_anexada', 'nf_cliente_anexada',
  'pedido_compra_criado', 'pedido_compra_editado', 'pedido_compra_cancelado', 'pedido_compra_faturado',
  'pedido_compra_recebido', 'pedido_compra_nf_desfeita',
  'orcamento_compra_anexado', 'orcamento_compra_editado', 'orcamento_compra_descartado', 'arquivo_compra_anexado',
  'documento_cliente_compra_anexado'
));

create or replace function public.anexar_documento_cliente_compra(
  p_obra_id uuid, p_documento text, p_caminho text, p_nome text, p_descricao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_compras_obra(p_obra_id);
  v_descricao text := nullif(btrim(p_descricao), '');
  v_id uuid;
begin
  if p_documento is null or p_documento not in ('documento_foto', 'comprovante_residencia', 'cartao_cnpj', 'outro') then
    raise exception 'Escolha o documento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_documento = 'outro' and (v_descricao is null or length(v_descricao) < 2 or length(v_descricao) > 120) then
    raise exception 'Diga que documento é (de 2 a 120 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Mesmas conferências de `gravar_arquivo_compra` (pasta desta obra, arquivo enviado e ainda não usado), gravando já
  -- o documento (a restrição exige o documento junto com o tipo).
  if p_caminho is null or nullif(btrim(p_nome), '') is null or length(btrim(p_nome)) > 200 then
    raise exception 'Envie o arquivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if public.pasta_compras_obra(p_caminho) is distinct from p_obra_id
     or not exists (select 1 from storage.objects s where s.bucket_id = 'compras-obra' and s.name = p_caminho)
     or exists (select 1 from public.compras_arquivos a where a.caminho = p_caminho) then
    raise exception 'O arquivo enviado não é desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.compras_arquivos (empresa_id, obra_id, tipo, documento, descricao, caminho, nome, enviado_por)
  select o.empresa_id, o.id, 'documento_cliente', p_documento, case when p_documento = 'outro' then v_descricao end,
         p_caminho, btrim(p_nome), public.meu_membro_id(o.empresa_id)
  from public.obras o where o.id = p_obra_id
  returning id into v_id;
  perform public.registrar_historico_obra(p_obra_id, 'documento_cliente_compra_anexado', 'compras', jsonb_build_object(
    'arquivo_id', v_id, 'documento', p_documento, 'autorizacao', v_aut
  ));
  return v_id;
end;
$$;
revoke all on function public.anexar_documento_cliente_compra(uuid, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.anexar_documento_cliente_compra(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Faturamento e entrega no pedido
-- ---------------------------------------------------------------------------

alter table public.compras_pedidos add column frete_modalidade text not null default 'cif' check (frete_modalidade in ('cif', 'fob'));
update public.compras_pedidos set frete_modalidade = 'fob' where frete > 0;
alter table public.compras_pedidos add constraint compras_pedidos_frete_cif check (frete_modalidade = 'fob' or frete = 0);

alter table public.compras_pedidos
  add column faturar_para text not null default 'cliente' check (faturar_para in ('cliente', 'empresa')),
  add column entrega_endereco text check (entrega_endereco is null or length(btrim(entrega_endereco)) between 5 and 300),
  add column entrega_recebe text check (entrega_recebe is null or length(btrim(entrega_recebe)) between 2 and 120),
  add column entrega_telefone text check (entrega_telefone is null or length(btrim(entrega_telefone)) between 8 and 30),
  add column observacao text check (observacao is null or length(btrim(observacao)) between 1 and 500),
  add constraint compras_pedidos_entrega check (
    (entrega_endereco is null) = (entrega_recebe is null)
    and (entrega_endereco is not null or entrega_telefone is null)
    and (faturar_para = 'cliente' or entrega_endereco is not null)
  );

-- Faturamento e entrega informados → valores gravados (nulos = mesmo endereço do faturamento).
create or replace function public.validar_entrega_pedido_compra(
  p_faturar_para text, p_endereco text, p_recebe text, p_telefone text
)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_faturar_para is null or p_faturar_para not in ('cliente', 'empresa') then
    raise exception 'Escolha em nome de quem faturar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_endereco), '') is null then
    if p_faturar_para = 'empresa' then
      raise exception 'Faturando para a empresa, informe o endereço de entrega.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    return;
  end if;
  if length(btrim(p_endereco)) < 5 or length(btrim(p_endereco)) > 300 then
    raise exception 'Informe o endereço de entrega (de 5 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_recebe), '') is null or length(btrim(p_recebe)) < 2 or length(btrim(p_recebe)) > 120 then
    raise exception 'Informe quem recebe a entrega.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_telefone), '') is not null and (length(btrim(p_telefone)) < 8 or length(btrim(p_telefone)) > 30) then
    raise exception 'Confira o telefone de quem recebe.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_entrega_pedido_compra(text, text, text, text) from public, anon, authenticated, service_role;

-- Corpo de 20261126100000_compras_orcamentos.sql + faturamento e entrega (opcionais: o padrão é o cliente, no endereço
-- dele). A assinatura antiga sai; quem chama sem os campos novos continua funcionando.
drop function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, uuid);
create function public.criar_pedido_compra(
  p_obra_id uuid,
  p_fornecedor text,
  p_categoria text,
  p_entrega_prevista date,
  p_vencimento date,
  p_numero_fornecedor text,
  p_frete numeric,
  p_itens jsonb,
  p_orcamento_id uuid default null,
  p_faturar_para text default 'cliente',
  p_entrega_endereco text default null,
  p_entrega_recebe text default null,
  p_entrega_telefone text default null,
  p_frete_modalidade text default null,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_obra public.obras;
  v_numero integer;
  v_pedido public.compras_pedidos;
  v_total numeric;
  -- Sem modalidade (quem chama como antes): FOB se há frete, CIF se não. Em CIF o frete é sempre zero.
  v_modalidade text := coalesce(p_frete_modalidade, case when coalesce(p_frete, 0) > 0 then 'fob' else 'cif' end);
  v_frete numeric := case when coalesce(p_frete_modalidade, case when coalesce(p_frete, 0) > 0 then 'fob' else 'cif' end) = 'cif' then 0 else round(coalesce(p_frete, 0), 2) end;
  v_orcamento public.compras_orcamentos;
  v_com_entrega boolean := nullif(btrim(p_entrega_endereco), '') is not null;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'compras', true);
  if exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras' and f.status = 'a_comprar') then
    raise exception 'Clique em "Iniciar compra" antes de fazer o pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_dados_pedido_compra(p_fornecedor, p_categoria, p_entrega_prevista, p_vencimento, p_numero_fornecedor, p_frete);
  perform public.validar_entrega_pedido_compra(p_faturar_para, p_entrega_endereco, p_entrega_recebe, p_entrega_telefone);
  if length(btrim(p_observacao)) > 500 then
    raise exception 'As observações têm no máximo 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_modalidade not in ('cif', 'fob') then
    raise exception 'Escolha o frete: CIF ou FOB.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_obra from public.obras where id = p_obra_id;

  if p_orcamento_id is not null then
    select * into v_orcamento from public.compras_orcamentos where id = p_orcamento_id and obra_id = p_obra_id for update;
    if not found or v_orcamento.descartado_em is not null then
      raise exception 'Este orçamento não está disponível nesta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if exists (select 1 from public.compras_pedidos p where p.id = v_orcamento.pedido_id and p.cancelado_em is null) then
      raise exception 'Este orçamento já virou pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  update public.empresas set seq_pedido_compra = seq_pedido_compra + 1
  where id = v_obra.empresa_id returning seq_pedido_compra into v_numero;

  -- Total provisório: o real sai dos itens logo abaixo.
  insert into public.compras_pedidos (
    empresa_id, obra_id, numero, fornecedor, categoria, entrega_prevista, vencimento, numero_fornecedor, frete,
    valor_total, criado_por, faturar_para, entrega_endereco, entrega_recebe, entrega_telefone, frete_modalidade, observacao
  )
  values (
    v_obra.empresa_id, p_obra_id, v_numero, btrim(p_fornecedor), p_categoria, p_entrega_prevista, p_vencimento,
    nullif(btrim(p_numero_fornecedor), ''), v_frete, 0.01, public.meu_membro_id(v_obra.empresa_id), p_faturar_para,
    case when v_com_entrega then btrim(p_entrega_endereco) end,
    case when v_com_entrega then btrim(p_entrega_recebe) end,
    case when v_com_entrega then nullif(btrim(p_entrega_telefone), '') end, v_modalidade, nullif(btrim(p_observacao), '')
  )
  returning * into v_pedido;

  v_total := public.gravar_itens_pedido_compra(v_pedido, p_itens, v_obra.snapshot -> 'kit') + v_frete;
  if v_total <= 0 then
    raise exception 'O total do pedido precisa ser maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.compras_pedidos set valor_total = v_total where id = v_pedido.id;

  if p_orcamento_id is not null then
    update public.compras_orcamentos set pedido_id = v_pedido.id where id = p_orcamento_id;
  end if;

  perform public.registrar_historico_obra(p_obra_id, 'pedido_compra_criado', 'compras', jsonb_build_object(
    'pedido_id', v_pedido.id, 'numero', v_numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_aut,
    'orcamento_id', p_orcamento_id
  ));
  perform public.sincronizar_compras_obra(p_obra_id, v_aut);
  return v_pedido.id;
end;
$$;
revoke all on function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, uuid, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, uuid, text, text, text, text, text, text) to authenticated;

-- Corpo de 20261125100000_compras_pedidos.sql + faturamento e entrega (mesmos padrões do criar).
drop function public.editar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb);
create function public.editar_pedido_compra(
  p_pedido_id uuid,
  p_fornecedor text,
  p_categoria text,
  p_entrega_prevista date,
  p_vencimento date,
  p_numero_fornecedor text,
  p_frete numeric,
  p_itens jsonb,
  p_faturar_para text default 'cliente',
  p_entrega_endereco text default null,
  p_entrega_recebe text default null,
  p_entrega_telefone text default null,
  p_frete_modalidade text default null,
  p_observacao text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_p record := public.preparar_escrita_pedido_compra(p_pedido_id);
  v_pedido public.compras_pedidos := v_p.pedido;
  -- Sem modalidade (quem chama como antes): FOB se há frete, CIF se não. Em CIF o frete é sempre zero.
  v_modalidade text := coalesce(p_frete_modalidade, case when coalesce(p_frete, 0) > 0 then 'fob' else 'cif' end);
  v_frete numeric := case when coalesce(p_frete_modalidade, case when coalesce(p_frete, 0) > 0 then 'fob' else 'cif' end) = 'cif' then 0 else round(coalesce(p_frete, 0), 2) end;
  v_total numeric;
  v_com_entrega boolean := nullif(btrim(p_entrega_endereco), '') is not null;
begin
  if v_pedido.nf_registrada_em is not null then
    raise exception 'Pedido com nota fiscal não se edita: cancele a conta no Financeiro para corrigir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.compras_pedido_itens i where i.pedido_id = p_pedido_id and i.quantidade_recebida > 0) then
    raise exception 'Pedido com material recebido não se edita.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_dados_pedido_compra(p_fornecedor, p_categoria, p_entrega_prevista, p_vencimento, p_numero_fornecedor, p_frete);
  perform public.validar_entrega_pedido_compra(p_faturar_para, p_entrega_endereco, p_entrega_recebe, p_entrega_telefone);
  if length(btrim(p_observacao)) > 500 then
    raise exception 'As observações têm no máximo 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_modalidade not in ('cif', 'fob') then
    raise exception 'Escolha o frete: CIF ou FOB.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.compras_pedidos set
    fornecedor = btrim(p_fornecedor), categoria = p_categoria, entrega_prevista = p_entrega_prevista,
    vencimento = p_vencimento, numero_fornecedor = nullif(btrim(p_numero_fornecedor), ''), frete = v_frete,
    faturar_para = p_faturar_para, frete_modalidade = v_modalidade, observacao = nullif(btrim(p_observacao), ''),
    entrega_endereco = case when v_com_entrega then btrim(p_entrega_endereco) end,
    entrega_recebe = case when v_com_entrega then btrim(p_entrega_recebe) end,
    entrega_telefone = case when v_com_entrega then nullif(btrim(p_entrega_telefone), '') end
  where id = p_pedido_id
  returning * into v_pedido;
  delete from public.compras_pedido_itens where pedido_id = p_pedido_id;
  v_total := public.gravar_itens_pedido_compra(
    v_pedido, p_itens, (select o.snapshot -> 'kit' from public.obras o where o.id = v_pedido.obra_id)
  ) + v_frete;
  if v_total <= 0 then
    raise exception 'O total do pedido precisa ser maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.compras_pedidos set valor_total = v_total where id = p_pedido_id;

  perform public.registrar_historico_obra(v_pedido.obra_id, 'pedido_compra_editado', 'compras', jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_pedido.numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_p.aut
  ));
  perform public.sincronizar_compras_obra(v_pedido.obra_id, v_p.aut);
end;
$$;
revoke all on function public.editar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.editar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Frete CIF ou FOB no orçamento (o "Gerar pedido deste" leva os dois ao pedido)
-- ---------------------------------------------------------------------------

alter table public.compras_orcamentos
  add column frete_modalidade text not null default 'cif' check (frete_modalidade in ('cif', 'fob')),
  add column frete numeric(12, 2) not null default 0 check (frete >= 0),
  add constraint compras_orcamentos_frete_cif check (frete_modalidade = 'fob' or frete = 0);

-- Devolve o frete gravado (CIF = zero).
create or replace function public.validar_frete_orcamento_compra(p_modalidade text, p_frete numeric)
returns numeric
language plpgsql immutable set search_path = ''
as $$
begin
  if p_modalidade is null or p_modalidade not in ('cif', 'fob') then
    raise exception 'Escolha o frete: CIF ou FOB.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_modalidade = 'cif' then
    return 0;
  end if;
  if p_frete is null or round(p_frete, 2) < 0 then
    raise exception 'Informe o valor do frete.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return round(p_frete, 2);
end;
$$;
revoke all on function public.validar_frete_orcamento_compra(text, numeric) from public, anon, authenticated, service_role;

-- Corpos de 20261126100000_compras_orcamentos.sql + frete (opcional: o padrão é CIF). As assinaturas antigas saem.
drop function public.anexar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, text);
drop function public.editar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text);

create function public.anexar_orcamento_compra(
  p_obra_id uuid,
  p_fornecedor text,
  p_valor numeric,
  p_cobertura text,
  p_itens text,
  p_entrega_prevista date,
  p_valido_ate date,
  p_condicao_pagamento text,
  p_observacao text,
  p_caminho text,
  p_nome text,
  p_frete_modalidade text default 'cif',
  p_frete numeric default 0
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_compras_obra(p_obra_id);
  v_arquivo uuid;
  v_orcamento public.compras_orcamentos;
  v_frete numeric := public.validar_frete_orcamento_compra(p_frete_modalidade, p_frete);
begin
  perform public.validar_dados_orcamento_compra(
    p_fornecedor, p_valor, p_cobertura, p_itens, p_entrega_prevista, p_valido_ate, p_condicao_pagamento, p_observacao
  );
  v_arquivo := public.gravar_arquivo_compra(p_obra_id, 'orcamento', null, null, p_caminho, p_nome);
  insert into public.compras_orcamentos (
    empresa_id, obra_id, fornecedor, valor_total, cobertura, itens_descricao, entrega_prevista, valido_ate,
    condicao_pagamento, observacao, arquivo_id, criado_por, frete_modalidade, frete
  )
  select o.empresa_id, o.id, btrim(p_fornecedor), round(p_valor, 2), p_cobertura,
         case when p_cobertura = 'parte' then btrim(p_itens) end, p_entrega_prevista, p_valido_ate,
         nullif(btrim(p_condicao_pagamento), ''), nullif(btrim(p_observacao), ''), v_arquivo, public.meu_membro_id(o.empresa_id),
         p_frete_modalidade, v_frete
  from public.obras o where o.id = p_obra_id
  returning * into v_orcamento;

  perform public.registrar_historico_obra(p_obra_id, 'orcamento_compra_anexado', 'compras', jsonb_build_object(
    'orcamento_id', v_orcamento.id, 'fornecedor', v_orcamento.fornecedor, 'autorizacao', v_aut
  ));
  return v_orcamento.id;
end;
$$;
revoke all on function public.anexar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, text, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.anexar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, text, text, numeric) to authenticated;

create function public.editar_orcamento_compra(
  p_orcamento_id uuid,
  p_fornecedor text,
  p_valor numeric,
  p_cobertura text,
  p_itens text,
  p_entrega_prevista date,
  p_valido_ate date,
  p_condicao_pagamento text,
  p_observacao text,
  p_frete_modalidade text default 'cif',
  p_frete numeric default 0
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_o record := public.preparar_escrita_orcamento_compra(p_orcamento_id);
  v_orcamento public.compras_orcamentos := v_o.orcamento;
  v_frete numeric := public.validar_frete_orcamento_compra(p_frete_modalidade, p_frete);
begin
  perform public.validar_dados_orcamento_compra(
    p_fornecedor, p_valor, p_cobertura, p_itens, p_entrega_prevista, p_valido_ate, p_condicao_pagamento, p_observacao
  );
  update public.compras_orcamentos set
    fornecedor = btrim(p_fornecedor), valor_total = round(p_valor, 2), cobertura = p_cobertura,
    itens_descricao = case when p_cobertura = 'parte' then btrim(p_itens) end,
    entrega_prevista = p_entrega_prevista, valido_ate = p_valido_ate,
    condicao_pagamento = nullif(btrim(p_condicao_pagamento), ''), observacao = nullif(btrim(p_observacao), ''),
    frete_modalidade = p_frete_modalidade, frete = v_frete
  where id = p_orcamento_id
  returning * into v_orcamento;
  perform public.registrar_historico_obra(v_orcamento.obra_id, 'orcamento_compra_editado', 'compras', jsonb_build_object(
    'orcamento_id', p_orcamento_id, 'fornecedor', v_orcamento.fornecedor, 'autorizacao', v_o.aut
  ));
end;
$$;
revoke all on function public.editar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.editar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, numeric) to authenticated;

reset lock_timeout;
