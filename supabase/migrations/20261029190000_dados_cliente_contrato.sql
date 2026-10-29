-- Dados do cliente obrigatórios para gerar o contrato e levados até a Obra.
--
-- Decisões do Evandro (29/10/2026):
--  * Para gerar o contrato, o cliente precisa ter: nome completo, CPF, RG, data de nascimento, e-mail,
--    telefone, CEP, rua, número, bairro e cidade. Cliente com CNPJ: sem RG e nascimento; inscrição estadual
--    opcional. O vendedor preenche à mão na ficha do negócio.
--  * A trava vale só para contratos novos (ou regerados): contrato já gerado não é bloqueado nem alterado.
--  * Na Obra: Engenharia vê CPF, RG, nascimento, endereço, telefone e e-mail; Operacional, endereço e
--    telefone; Compras, o endereço (para cotar o kit).
--  * Obras existentes são de teste e ficam como estão (sem preenchimento retroativo).
--
-- O que faz:
--  * `contatos`: rg, data_nascimento, cep, logradouro, numero, bairro, complemento, inscricao_estadual.
--    `endereco` (texto único) continua: o app o monta a partir dos campos novos.
--  * `pendencias_contrato_contato(contato)`: lista os rótulos que faltam (mesma regra de
--    `src/lib/dados-cliente-contrato.ts`). Interna, sem execução pela API.
--  * Gatilho em `contratos`: usuário do app (`authenticated`) não cria nem regera contrato com dado do
--    cliente faltando. Mudança só de status (assinar, enviar) não passa pela trava. Rotinas de servidor
--    (service_role, migrations) não passam por ela.
--  * `obra_snapshot_tecnico`: o bloco `cliente` (guardado em `obra_cliente`, fora da API) leva os campos novos.
--  * `obras_operacao`: novas colunas e a matriz por setor acima.
-- O que NÃO faz: não muda contratos existentes, quem vê contato, negócio ou obra, nem obras já criadas.
-- Depende de: contatos, contratos, negocios, obra_snapshot_tecnico, obras_operacao, obra_cliente,
-- pode_ver_obra_operacao, meu_membro_id (já existentes).

set lock_timeout = '3s';

alter table public.contatos
  add column rg text check (length(rg) <= 30),
  -- Limite superior (não no futuro) fica no app: CHECK com a data atual não é estável num restore.
  add column data_nascimento date check (data_nascimento >= date '1900-01-01'),
  add column cep text check (cep ~ '^[0-9]{8}$'),
  add column logradouro text check (length(logradouro) <= 200),
  add column numero text check (length(numero) <= 20),
  add column bairro text check (length(bairro) <= 120),
  add column complemento text check (length(complemento) <= 120),
  add column inscricao_estadual text check (length(inscricao_estadual) <= 30);

-- ---------------------------------------------------------------------------
-- Pendências para o contrato
-- ---------------------------------------------------------------------------

create or replace function public.pendencias_contrato_contato(p_contato_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select array_remove(array[
    case when nullif(trim(c.nome), '') is null then 'nome completo' end,
    case when nullif(trim(c.documento), '') is null then case when c.tipo = 'pj' then 'CNPJ' else 'CPF' end end,
    case when c.tipo <> 'pj' and nullif(trim(c.rg), '') is null then 'RG' end,
    case when c.tipo <> 'pj' and c.data_nascimento is null then 'data de nascimento' end,
    case when nullif(trim(c.email), '') is null then 'e-mail' end,
    case when nullif(trim(c.telefone), '') is null then 'telefone' end,
    case when nullif(trim(c.cep), '') is null then 'CEP' end,
    case when nullif(trim(c.logradouro), '') is null then 'rua' end,
    case when nullif(trim(c.numero), '') is null then 'número' end,
    case when nullif(trim(c.bairro), '') is null then 'bairro' end,
    case when nullif(trim(c.cidade), '') is null then 'cidade' end
  ], null)
  from public.contatos c
  where c.id = p_contato_id;
$$;
revoke all on function public.pendencias_contrato_contato(uuid) from public, anon, authenticated, service_role;

-- Usuário do app = papel `authenticated` no JWT da requisição. service_role (rotinas de servidor, seeds) e
-- conexões diretas ao banco (migrations, testes de banco) não têm esse papel e não passam pela trava.
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
  return new;
end;
$$;
revoke all on function public.contratos_exigir_dados_cliente() from public, anon, authenticated, service_role;

create trigger contratos_exigir_dados_cliente before insert or update on public.contratos
  for each row execute function public.contratos_exigir_dados_cliente();

-- ---------------------------------------------------------------------------
-- Snapshot da obra: bloco `cliente` com os campos novos (igual à de 20261006220000_obras_base.sql,
-- salvo as chaves novas do cliente)
-- ---------------------------------------------------------------------------

create or replace function public.obra_snapshot_tecnico(p_negocio_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'negocio', jsonb_build_object(
      'numero', n.numero,
      'titulo', n.titulo,
      'status', n.status,
      'unidade_consumidora', n.unidade_consumidora,
      'distribuidora', n.qualif_distribuidora,
      'tipo_telhado', n.tipo_telhado,
      'estrutura_telhado', n.estrutura_telhado,
      'padrao_cliente', n.padrao_cliente,
      'consumo_medio_kwh', n.consumo_medio_kwh
    ),
    'contrato_status', (select c.status from public.contratos c where c.negocio_id = n.id),
    'cliente', jsonb_build_object(
      'nome', ct.nome,
      'tipo', ct.tipo,
      'documento', ct.documento,
      'rg', ct.rg,
      'data_nascimento', ct.data_nascimento,
      'inscricao_estadual', ct.inscricao_estadual,
      'telefone', ct.telefone,
      'telefone2', ct.telefone2,
      'email', ct.email,
      'endereco', ct.endereco,
      'cep', ct.cep,
      'logradouro', ct.logradouro,
      'numero', ct.numero,
      'bairro', ct.bairro,
      'complemento', ct.complemento,
      'cidade', ct.cidade,
      'uf', ct.uf
    ),
    'calculo', (
      select jsonb_build_object(
        'kit_nome', cs.kit_nome,
        'potencia_kwp', cs.kit_potencia_kwp,
        'tipo_ligacao', cs.tipo_ligacao,
        'consumo_medio_kwh', cs.consumo_medio_kwh,
        'disponibilidade_kwh', cs.disponibilidade_kwh,
        'produtividade_kwh_kwp_mes', cs.produtividade_kwh_kwp_mes,
        'geracao_estimada_kwh_mes', cs.geracao_estimada_kwh_mes
      )
      from public.calculos_solares cs where cs.negocio_id = n.id
    ),
    'kit', coalesce((
      select jsonb_agg(
        jsonb_build_object('tipo', k.tipo, 'descricao', k.descricao, 'potencia_w', k.potencia_w, 'quantidade', k.quantidade)
        order by k.ordem, k.tipo, k.descricao, k.potencia_w, k.quantidade
      )
      from public.kit_componentes k where k.negocio_id = n.id
    ), '[]'::jsonb)
  )
  from public.negocios n
  join public.contatos ct on ct.id = n.contato_id
  where n.id = p_negocio_id;
$$;
revoke all on function public.obra_snapshot_tecnico(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leitura da operação: novas colunas e matriz por setor (só participante ativo daquela obra)
--   endereço          → operacional, engenharia ou compras
--   telefone(s)       → operacional ou engenharia
--   CPF/CNPJ, RG, nascimento, e-mail, inscrição estadual → engenharia
-- O tipo de retorno muda: a função é recriada.
-- ---------------------------------------------------------------------------

drop function public.obras_operacao(uuid);

create function public.obras_operacao(p_obra_id uuid default null)
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
    case when a.operacional or a.engenharia or a.compras then cl.dados ->> 'endereco' end,
    case when a.operacional or a.engenharia then cl.dados ->> 'telefone' end,
    case when a.operacional or a.engenharia then cl.dados ->> 'telefone2' end,
    case when a.engenharia then cl.dados ->> 'documento' end,
    case when a.engenharia then cl.dados ->> 'rg' end,
    case when a.engenharia then (cl.dados ->> 'data_nascimento')::date end,
    case when a.engenharia then cl.dados ->> 'email' end,
    case when a.engenharia then cl.dados ->> 'inscricao_estadual' end
  from public.obras o
  left join public.obra_cliente cl on cl.obra_id = o.id
  -- Setores em que EU sou participante ativo desta obra.
  cross join lateral (
    select
      coalesce(bool_or(p.setor = 'operacional'), false) as operacional,
      coalesce(bool_or(p.setor = 'engenharia'), false) as engenharia,
      coalesce(bool_or(p.setor = 'compras'), false) as compras
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

revoke all on function public.obras_operacao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.obras_operacao(uuid) to authenticated;

reset lock_timeout;
