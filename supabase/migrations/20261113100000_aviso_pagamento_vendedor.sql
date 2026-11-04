-- Pagamento informado pelo vendedor (Pro) — decisões do Evandro em 03/11/2026.
--
-- O vendedor avisa que o cliente pagou (data, comprovante obrigatório e observação); o admin, o gestor ou qualquer
-- pessoa do setor Operacional confere e confirma, ou devolve com motivo ("não encontrei o pagamento").
--  * `avisos_pagamento`: um aviso por linha, por contrato. Nada é apagado nem sobrescrito: devolver, cancelar ou
--    confirmar só encerra o aviso (situação + quem + quando), uma única vez. No máximo um aviso aberto por contrato.
--  * Comprovante no bucket privado `comprovantes-pagamento`, em `empresa/contrato/objeto`. Lê quem vê o negócio e,
--    enquanto o aviso está aberto, quem é do Operacional.
--  * O Operacional (papel `operacao`, blindado do comercial) não abre ficha, proposta nem contrato: recebe só a lista
--    de `pagamentos_a_confirmar` (número, cliente, cidade, valor, condição do contrato, data, comprovante, quem
--    informou) e confirma só pagamento informado.
--  * `confirmar_pagamento()` passa a aceitar o Operacional e encerra o aviso aberto. Evento, beneficiário (congelado
--    na assinatura), pontos, comissão e criação da Obra não mudam. Estorno continua só com admin e gestor. Gestor e
--    admin continuam confirmando direto, sem aviso.
--  * Avisar não gera evento nem ponto. O vendedor recebe notificação quando o aviso é confirmado ou devolvido.
-- Depende de: confirmar_pagamento (20261109100000), registros_pagamento (20261014120000), membro_atua_no_setor
-- (20261029210000), negocio_arquivado_bloquear_filho (20261016200000), notificacoes_tipo_check (20261107100000).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Notificações para quem informou
-- ---------------------------------------------------------------------------

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido', 'conquista_desbloqueada',
    'tarefa_setor_concluida', 'tarefa_setor_cancelada', 'tarefa_setor_atribuida', 'tarefa_setor_reaberta',
    'desconto_solicitado', 'desconto_decidido',
    'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida',
    'pagamento_aviso_confirmado', 'pagamento_aviso_devolvido'
  ));

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table public.avisos_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  contrato_id uuid not null references public.contratos (id),
  negocio_id uuid not null references public.negocios (id),
  -- Data em que o cliente pagou, informada pelo vendedor; `informado_em` é sempre o horário do servidor.
  data_pagamento date not null,
  observacao text check (observacao is null or length(observacao) <= 500),
  comprovante_caminho text not null unique,
  comprovante_nome text not null check (length(btrim(comprovante_nome)) between 1 and 200),
  comprovante_tamanho bigint not null check (comprovante_tamanho > 0),
  comprovante_tipo text,
  informado_por_membro_id uuid not null references public.empresa_membros (id),
  informado_por_user_id uuid not null,
  informado_em timestamptz not null default now(),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'confirmado', 'devolvido', 'cancelado')),
  encerrado_por_membro_id uuid references public.empresa_membros (id),
  encerrado_por_user_id uuid,
  encerrado_em timestamptz,
  motivo_devolucao text check (motivo_devolucao is null or length(motivo_devolucao) <= 500),
  confirmacao_id uuid references public.confirmacoes_pagamento (id),
  constraint avisos_pagamento_encerramento_coerente check (
    (situacao = 'aberto' and encerrado_por_membro_id is null and encerrado_por_user_id is null and encerrado_em is null
       and motivo_devolucao is null and confirmacao_id is null)
    or
    (situacao <> 'aberto' and encerrado_por_membro_id is not null and encerrado_por_user_id is not null
       and encerrado_em is not null
       and (situacao = 'devolvido') = (nullif(btrim(motivo_devolucao), '') is not null)
       and (situacao = 'confirmado') = (confirmacao_id is not null))
  )
);

create unique index avisos_pagamento_aberto_unico on public.avisos_pagamento (contrato_id) where situacao = 'aberto';
create index on public.avisos_pagamento (contrato_id, informado_em desc);
create index on public.avisos_pagamento (negocio_id);
create index on public.avisos_pagamento (empresa_id, situacao);
create index on public.avisos_pagamento (informado_por_membro_id);
create index on public.avisos_pagamento (encerrado_por_membro_id);
create index on public.avisos_pagamento (confirmacao_id);

alter table public.avisos_pagamento enable row level security;

-- Quem vê o negócio vê os avisos dele. O Operacional não lê a tabela: usa `pagamentos_a_confirmar`.
create policy "ver avisos de pagamento" on public.avisos_pagamento for select to authenticated
  using (public.pode_ver_negocio(negocio_id));

-- Escrita só pelas funções abaixo (security definer), mesmo padrão de `confirmacoes_pagamento`.
revoke all on public.avisos_pagamento from anon;
revoke insert, update, delete, truncate on public.avisos_pagamento from authenticated, service_role;

-- Dados do aviso imutáveis; encerra uma única vez; DELETE só em cascata (empresa inteira).
create or replace function public.proteger_aviso_pagamento()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() <= 1 then
      raise exception 'Aviso de pagamento não pode ser apagado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    return old;
  end if;
  if old.situacao <> 'aberto' then
    raise exception 'Aviso de pagamento encerrado é imutável.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if (new.id, new.empresa_id, new.contrato_id, new.negocio_id, new.data_pagamento, new.observacao,
      new.comprovante_caminho, new.comprovante_nome, new.comprovante_tamanho, new.comprovante_tipo,
      new.informado_por_membro_id, new.informado_por_user_id, new.informado_em)
     is distinct from
     (old.id, old.empresa_id, old.contrato_id, old.negocio_id, old.data_pagamento, old.observacao,
      old.comprovante_caminho, old.comprovante_nome, old.comprovante_tamanho, old.comprovante_tipo,
      old.informado_por_membro_id, old.informado_por_user_id, old.informado_em) then
    raise exception 'Dados do aviso de pagamento são imutáveis.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_aviso_pagamento() from public, anon, authenticated, service_role;

create trigger avisos_pagamento_protegido before update or delete on public.avisos_pagamento
  for each row execute function public.proteger_aviso_pagamento();

-- Negócio arquivado não recebe aviso novo (mesma trava de `confirmacoes_pagamento`).
create trigger avisos_pagamento_arquivado_somente_leitura before insert on public.avisos_pagamento
  for each row execute function public.negocio_arquivado_bloquear_filho();

-- ---------------------------------------------------------------------------
-- Quem informa e quem confirma
-- ---------------------------------------------------------------------------

-- Quem chama atua no setor Operacional da empresa (coordenando ou executando).
create or replace function public.atua_no_operacional(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.membro_atua_no_setor(p_empresa_id, public.meu_membro_id(p_empresa_id), 'operacional'), false);
$$;
revoke all on function public.atua_no_operacional(uuid) from public, anon;
grant execute on function public.atua_no_operacional(uuid) to authenticated;

-- Informa: admin, gestor ou vendedor que vê o negócio, com o contrato assinado.
create or replace function public.pode_informar_pagamento(p_contrato_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select c.status = 'assinado'
      and public.tem_papel(n.empresa_id, '{admin,gestor,vendedor}')
      and public.pode_ver_negocio(n.id)
    from public.contratos c join public.negocios n on n.id = c.negocio_id
    where c.id = p_contrato_id
  ), false);
$$;
revoke all on function public.pode_informar_pagamento(uuid) from public, anon;
grant execute on function public.pode_informar_pagamento(uuid) to authenticated;

-- Contrato da pasta `empresa/contrato/objeto`, ou nulo se o caminho não tem esse formato ou a empresa não confere.
create or replace function public.contrato_da_pasta_comprovante(p_caminho text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_contrato uuid;
  v_empresa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[3] = '' then
    return null;
  end if;
  begin
    v_empresa := v_partes[1]::uuid;
    v_contrato := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return (select c.id from public.contratos c join public.negocios n on n.id = c.negocio_id
          where c.id = v_contrato and n.empresa_id = v_empresa);
end;
$$;
revoke all on function public.contrato_da_pasta_comprovante(text) from public, anon;
grant execute on function public.contrato_da_pasta_comprovante(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage do comprovante
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes-pagamento', 'comprovantes-pagamento', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- Ler: quem vê o negócio do aviso; o Operacional, enquanto o aviso está aberto; e quem enviou, enquanto ainda pode
-- informar (o envio precisa ler o próprio objeto antes do registro).
create or replace function public.pode_ver_comprovante_pagamento(p_caminho text, p_dono text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.avisos_pagamento a
      where a.comprovante_caminho = p_caminho
        and (public.pode_ver_negocio(a.negocio_id) or (a.situacao = 'aberto' and public.atua_no_operacional(a.empresa_id)))
    )
    or (p_dono = (select auth.uid())::text
        and public.pode_informar_pagamento(public.contrato_da_pasta_comprovante(p_caminho)));
$$;
revoke all on function public.pode_ver_comprovante_pagamento(text, text) from public, anon;
grant execute on function public.pode_ver_comprovante_pagamento(text, text) to authenticated;

create policy "comprovantes-pagamento: ler" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes-pagamento' and public.pode_ver_comprovante_pagamento(name, owner_id));
create policy "comprovantes-pagamento: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes-pagamento'
              and public.pode_informar_pagamento(public.contrato_da_pasta_comprovante(name)));

-- ---------------------------------------------------------------------------
-- Informar, cancelar e devolver
-- ---------------------------------------------------------------------------

-- Avisa quem informou (se ainda está ativo e não foi ele quem agiu), com o número do negócio. Interna.
create or replace function public.notificar_aviso_pagamento(p_aviso public.avisos_pagamento, p_tipo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_numero integer;
  v_mensagem text;
begin
  if p_aviso.informado_por_membro_id is not distinct from public.meu_membro_id(p_aviso.empresa_id) then
    return;
  end if;
  if not exists (select 1 from public.empresa_membros m
                 where m.id = p_aviso.informado_por_membro_id and m.empresa_id = p_aviso.empresa_id and m.ativo) then
    return;
  end if;
  select numero into v_numero from public.negocios where id = p_aviso.negocio_id;
  v_mensagem := case p_tipo
    when 'pagamento_aviso_confirmado' then 'Pagamento confirmado: negócio #' || v_numero
    else 'Pagamento não encontrado (negócio #' || v_numero || '): ' || coalesce(p_aviso.motivo_devolucao, '')
  end;
  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  values (p_aviso.empresa_id, p_aviso.informado_por_membro_id, p_tipo, left(v_mensagem, 500),
          '/negocios/' || p_aviso.negocio_id || '?aba=proposta');
end;
$$;
revoke all on function public.notificar_aviso_pagamento(public.avisos_pagamento, text) from public, anon, authenticated, service_role;

-- O vendedor informa que o cliente pagou. O comprovante já foi enviado pelo navegador para a pasta do contrato; o
-- banco confere o objeto (dono, tamanho e tipo reais) em vez de confiar no navegador.
create or replace function public.informar_pagamento(
  p_contrato_id uuid, p_data_pagamento date, p_observacao text, p_caminho text, p_nome text
)
returns public.avisos_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_empresa uuid;
  v_contato_id uuid;
  v_ator uuid := (select auth.uid());
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_nome text := btrim(coalesce(p_nome, ''));
  v_objeto record;
  v_aviso public.avisos_pagamento;
begin
  -- Mesma ordem de travas de confirmar_pagamento (contrato primeiro).
  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select empresa_id, contato_id into v_empresa, v_contato_id from public.negocios where id = v_contrato.negocio_id;

  if not public.tem_papel(v_empresa, '{admin,gestor,vendedor}') or not public.pode_ver_negocio(v_contrato.negocio_id) then
    raise exception 'Você não pode informar o pagamento deste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_contrato.status <> 'assinado' then
    raise exception 'Só é possível informar o pagamento de contrato assinado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.confirmacoes_pagamento where contrato_id = p_contrato_id and estornado_em is null) then
    raise exception 'Pagamento deste contrato já está confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.registros_pagamento where negocio_id = v_contrato.negocio_id and estornado_em is null) then
    raise exception 'Este negócio já tem pagamento registrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.avisos_pagamento where contrato_id = p_contrato_id and situacao = 'aberto') then
    raise exception 'Já há um pagamento informado aguardando confirmação.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_data_pagamento is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data_pagamento > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do pagamento não pode ser no futuro.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(coalesce(v_obs, '')) > 500 then
    raise exception 'A observação passa de 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Comprovante obrigatório (decisão do Evandro): na pasta deste contrato, enviado por quem chama.
  if p_caminho is null or public.contrato_da_pasta_comprovante(p_caminho) is distinct from p_contrato_id then
    raise exception 'Anexe o comprovante do pagamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(v_nome) not between 1 and 200 then
    raise exception 'Nome do comprovante inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select o.metadata into v_objeto
  from storage.objects o
  where o.bucket_id = 'comprovantes-pagamento' and o.name = p_caminho and o.owner_id = v_ator::text;
  if not found then
    raise exception 'Comprovante não encontrado no armazenamento. Envie de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce((v_objeto.metadata ->> 'size')::bigint, 0) <= 0 then
    raise exception 'O comprovante está vazio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.avisos_pagamento where comprovante_caminho = p_caminho) then
    raise exception 'Este comprovante já foi usado. Envie de novo.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.avisos_pagamento
    (empresa_id, contrato_id, negocio_id, data_pagamento, observacao, comprovante_caminho, comprovante_nome,
     comprovante_tamanho, comprovante_tipo, informado_por_membro_id, informado_por_user_id)
  values (v_empresa, v_contrato.id, v_contrato.negocio_id, p_data_pagamento, v_obs, p_caminho, v_nome,
          (v_objeto.metadata ->> 'size')::bigint, nullif(v_objeto.metadata ->> 'mimetype', ''),
          public.meu_membro_id(v_empresa), v_ator)
  returning * into v_aviso;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
  values (v_empresa, v_contrato.negocio_id, v_contato_id, 'pagamento_informado', v_ator,
          jsonb_build_object('contrato_id', v_contrato.id, 'aviso_id', v_aviso.id, 'data_pagamento', p_data_pagamento));

  return v_aviso;
end;
$$;
revoke all on function public.informar_pagamento(uuid, date, text, text, text) from public, anon;
grant execute on function public.informar_pagamento(uuid, date, text, text, text) to authenticated;

-- Quem informou cancela o próprio aviso enquanto ninguém confirmou (ex.: comprovante errado).
create or replace function public.cancelar_aviso_pagamento(p_aviso_id uuid)
returns public.avisos_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_aviso public.avisos_pagamento;
  v_ator uuid := (select auth.uid());
  v_contato_id uuid;
begin
  select * into v_aviso from public.avisos_pagamento where id = p_aviso_id;
  if not found or not public.pode_ver_negocio(v_aviso.negocio_id) then
    raise exception 'Aviso de pagamento não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  perform 1 from public.contratos where id = v_aviso.contrato_id for update;
  select * into v_aviso from public.avisos_pagamento where id = p_aviso_id for update;
  if v_aviso.situacao <> 'aberto' then
    raise exception 'Este aviso já foi encerrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_aviso.informado_por_membro_id is distinct from public.meu_membro_id(v_aviso.empresa_id) then
    raise exception 'Só quem informou pode cancelar o aviso.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  update public.avisos_pagamento
    set situacao = 'cancelado', encerrado_por_membro_id = v_aviso.informado_por_membro_id,
        encerrado_por_user_id = v_ator, encerrado_em = now()
    where id = p_aviso_id
    returning * into v_aviso;

  select contato_id into v_contato_id from public.negocios where id = v_aviso.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
  values (v_aviso.empresa_id, v_aviso.negocio_id, v_contato_id, 'pagamento_aviso_cancelado', v_ator,
          jsonb_build_object('contrato_id', v_aviso.contrato_id, 'aviso_id', v_aviso.id));
  return v_aviso;
end;
$$;
revoke all on function public.cancelar_aviso_pagamento(uuid) from public, anon;
grant execute on function public.cancelar_aviso_pagamento(uuid) to authenticated;

-- Quem confere não encontrou o pagamento: devolve ao vendedor, com motivo. Mesmo grupo que confirma.
create or replace function public.devolver_aviso_pagamento(p_aviso_id uuid, p_motivo text)
returns public.avisos_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_aviso public.avisos_pagamento;
  v_ator uuid := (select auth.uid());
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_contato_id uuid;
begin
  select * into v_aviso from public.avisos_pagamento where id = p_aviso_id;
  if not found
     or not ((public.tem_papel(v_aviso.empresa_id, '{admin,gestor}') and public.pode_ver_negocio(v_aviso.negocio_id))
             or public.atua_no_operacional(v_aviso.empresa_id)) then
    raise exception 'Só gestor, admin ou o Operacional pode devolver o aviso de pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null then
    raise exception 'Informe por que o pagamento não foi confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'O motivo passa de 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform 1 from public.contratos where id = v_aviso.contrato_id for update;
  select * into v_aviso from public.avisos_pagamento where id = p_aviso_id for update;
  if v_aviso.situacao <> 'aberto' then
    raise exception 'Este aviso já foi encerrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.avisos_pagamento
    set situacao = 'devolvido', encerrado_por_membro_id = public.meu_membro_id(v_aviso.empresa_id),
        encerrado_por_user_id = v_ator, encerrado_em = now(), motivo_devolucao = v_motivo
    where id = p_aviso_id
    returning * into v_aviso;

  select contato_id into v_contato_id from public.negocios where id = v_aviso.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
  values (v_aviso.empresa_id, v_aviso.negocio_id, v_contato_id, 'pagamento_aviso_devolvido', v_ator,
          jsonb_build_object('contrato_id', v_aviso.contrato_id, 'aviso_id', v_aviso.id, 'motivo', v_motivo));

  perform public.notificar_aviso_pagamento(v_aviso, 'pagamento_aviso_devolvido');
  return v_aviso;
end;
$$;
revoke all on function public.devolver_aviso_pagamento(uuid, text) from public, anon;
grant execute on function public.devolver_aviso_pagamento(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lista "Pagamentos a confirmar"
-- ---------------------------------------------------------------------------

-- Avisos abertos de contratos assinados. Admin e gestor: dos negócios que veem; Operacional: todos da empresa, só
-- com estas colunas (sem acesso à ficha, à proposta ou ao contrato). `condicao` é a descrição da condição gravada no
-- contrato (nula em contrato anterior à escolha da condição).
create or replace function public.pagamentos_a_confirmar(p_empresa_id uuid)
returns table (
  aviso_id uuid, contrato_id uuid, negocio_id uuid, negocio_numero integer, cliente_nome text, cidade text, uf text,
  valor numeric, condicao text, data_pagamento date, observacao text, comprovante_caminho text, comprovante_nome text,
  informado_por_membro_id uuid, informado_em timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with eu as (
    select public.tem_papel(p_empresa_id, '{admin,gestor}') as gestao, public.atua_no_operacional(p_empresa_id) as operacional
  )
  select a.id, a.contrato_id, a.negocio_id, n.numero, ct.nome, ct.cidade, ct.uf, n.valor,
         c.condicao_pagamento ->> 'descricao', a.data_pagamento, a.observacao, a.comprovante_caminho,
         a.comprovante_nome, a.informado_por_membro_id, a.informado_em
  from public.avisos_pagamento a
  cross join eu
  join public.contratos c on c.id = a.contrato_id
  join public.negocios n on n.id = a.negocio_id
  left join public.contatos ct on ct.id = n.contato_id
  where a.empresa_id = p_empresa_id
    and a.situacao = 'aberto'
    and c.status = 'assinado'
    and (eu.operacional or (eu.gestao and public.pode_ver_negocio(a.negocio_id)))
  order by a.informado_em;
$$;
revoke all on function public.pagamentos_a_confirmar(uuid) from public, anon;
grant execute on function public.pagamentos_a_confirmar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- confirmar_pagamento(): Operacional e encerramento do aviso
-- ---------------------------------------------------------------------------

-- Idêntica à versão de 20261109100000_autoconfirmacao_pagamento.sql, exceto:
--  * quem pode: admin ou gestor que vê o negócio (como antes) OU quem é do Operacional, só com aviso aberto;
--  * com aviso aberto, encerra-o como confirmado e avisa quem informou.
create or replace function public.confirmar_pagamento(p_contrato_id uuid)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_empresa uuid;
  v_contato_id uuid;
  v_ator uuid := (select auth.uid());
  v_meu_membro_id uuid;
  v_benef_user uuid;
  v_evento_id bigint;
  v_conf public.confirmacoes_pagamento;
  v_aviso public.avisos_pagamento;
begin
  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select empresa_id into v_empresa from public.negocios where id = v_contrato.negocio_id;

  select * into v_aviso from public.avisos_pagamento
    where contrato_id = p_contrato_id and situacao = 'aberto' for update;

  if public.tem_papel(v_empresa, '{admin,gestor}') then
    if not public.pode_ver_negocio(v_contrato.negocio_id) then
      raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  elsif public.atua_no_operacional(v_empresa) then
    if v_aviso.id is null then
      raise exception 'O Operacional confirma só pagamento informado pelo vendedor.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  else
    raise exception 'Só gestor, admin ou o Operacional pode confirmar pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_empresa);

  if v_contrato.status <> 'assinado' then
    raise exception 'Só é possível confirmar pagamento de contrato assinado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if exists (select 1 from public.confirmacoes_pagamento where contrato_id = p_contrato_id and estornado_em is null) then
    raise exception 'Pagamento deste contrato já está confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Beneficiário: closer congelado no momento da assinatura (`responsavel_assinatura_id`,
  -- ver trigger `travar_contrato_com_pagamento`), nunca `negocios.responsavel_id` atual —
  -- o negócio pode ter trocado de responsável entre a assinatura e o pagamento.
  if v_contrato.responsavel_assinatura_id is null then
    raise exception 'Contrato sem responsável registrado na assinatura: não é possível determinar o beneficiário.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- O beneficiário precisa ser membro da empresa do negócio (protege também dado legado).
  select user_id into v_benef_user from public.empresa_membros
    where id = v_contrato.responsavel_assinatura_id and empresa_id = v_empresa;
  if v_benef_user is null then
    raise exception 'Responsável da assinatura inválido para crédito.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (v_empresa, 'pagamento.confirmado', v_ator, v_benef_user, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id), v_contrato.perfil_assinatura)
    returning id into v_evento_id;

  insert into public.confirmacoes_pagamento
    (empresa_id, contrato_id, negocio_id, confirmado_por_membro_id, confirmado_por_user_id,
     beneficiario_membro_id, beneficiario_user_id, evento_confirmacao_id)
    values (v_empresa, v_contrato.id, v_contrato.negocio_id, v_meu_membro_id, v_ator,
            v_contrato.responsavel_assinatura_id, v_benef_user, v_evento_id)
    returning * into v_conf;

  select contato_id into v_contato_id from public.negocios where id = v_contrato.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_empresa, v_contrato.negocio_id, v_contato_id, 'pagamento_confirmado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id));

  if v_aviso.id is not null then
    update public.avisos_pagamento
      set situacao = 'confirmado', encerrado_por_membro_id = v_meu_membro_id, encerrado_por_user_id = v_ator,
          encerrado_em = now(), confirmacao_id = v_conf.id
      where id = v_aviso.id
      returning * into v_aviso;
    perform public.notificar_aviso_pagamento(v_aviso, 'pagamento_aviso_confirmado');
  end if;

  return v_conf;
end;
$$;
revoke all on function public.confirmar_pagamento(uuid) from public, anon;
grant execute on function public.confirmar_pagamento(uuid) to authenticated;

reset lock_timeout;
