-- Engenharia em Obras (P4): vistoria da distribuidora, medição e conexão.
--
--  * `obra_engenharia_vistorias`: o pedido de vistoria (registrado manualmente; o Raion não acessa o portal) e o seu
--    resultado. Um único registro compartilhado por pedido: não há "vistoria concluída" em dois setores. Vistoria com
--    não conformidade fica guardada e a correção abre um pedido novo. No máximo um pedido em andamento ou aprovado.
--  * Vistoria aprovada NÃO é medição adequada nem conexão: medidor adequado e conexão confirmada são registros
--    próprios, nessa ordem, cada um com data e evidência quando houver.
--  * `obra_engenharia_vistoria_eventos` (imutáveis) e `obra_engenharia_vistoria_arquivos` (relatório, foto, comprovante),
--    no mesmo bucket e pasta dos documentos da Engenharia. Nada se apaga.
--  * Gate G5: pedir vistoria exige protocolo aprovado (ou orçamento emitido) e o Operacional em "Instalação concluída"
--    ou "Concluído". Pedir leva a Engenharia para "Aguardando vistoria" sozinho, pelo caminho e histórico da troca manual.
--  * Gate G6: a Engenharia só entra em "Concluído" com vistoria aprovada e conexão confirmada. Exceção (obra sem conexão
--    nova, por exemplo): só o admin, por RPC própria, com motivo guardado no histórico (o texto não é exibido).
--  * Quem registra (decisão do Evandro de 30/10, "os dois"): a Engenharia pede a vistoria, registra o resultado formal
--    (aprovada / não conformidade), o medidor, a conexão e o cancelamento; a Engenharia ou o Operacional registram o
--    agendamento e a vistoria realizada em campo; o Operacional registra a correção de campo depois da não conformidade.
--    Cada parte pode levar arquivos (fotos, relatório, comprovante).
--  * Leitura dos registros completos e dos arquivos: admin e quem atua em Engenharia ou no Operacional na obra
--    (`pode_ver_vistoria_obra`). Os arquivos ficam no bucket privado `vistoria-arquivos` (`empresa/obra/objeto`),
--    separado dos documentos da Engenharia, que o Operacional continua sem ver. Quem vê a obra sem atuar nesses
--    setores (vendedor, gestor) lê só a situação e as datas, por `situacao_vistoria_obra`.
-- Decisões do Evandro em 30/10/2026 (G5, quem lança, G6 com exceção do admin, etapa automática).
-- Depende de: 20261030120000_engenharia_protocolos.sql (gravar_status_fluxo_obra, hoje_brasilia, protocolos).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.obra_engenharia_vistorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  numero text check (numero is null or length(btrim(numero)) between 1 and 60),
  solicitada_em date not null,
  agendada_para date,
  realizada_em date,
  status text not null default 'solicitada' check (status in ('solicitada', 'agendada', 'realizada', 'aprovada', 'com_nao_conformidade', 'cancelada')),
  medidor_adequado_em date,
  conexao_confirmada_em date,
  registrado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  -- Medidor e conexão só depois da vistoria aprovada; conexão só depois do medidor.
  constraint obra_engenharia_vistorias_medidor check (medidor_adequado_em is null or status = 'aprovada'),
  constraint obra_engenharia_vistorias_conexao check (conexao_confirmada_em is null or medidor_adequado_em is not null)
);
create unique index obra_engenharia_vistorias_uma_ativa on public.obra_engenharia_vistorias (obra_id)
  where status in ('solicitada', 'agendada', 'realizada', 'aprovada');
create index on public.obra_engenharia_vistorias (obra_id, created_at);
create trigger obra_engenharia_vistorias_updated_at before update on public.obra_engenharia_vistorias
  for each row execute function public.tocar_updated_at();

create table public.obra_engenharia_vistoria_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  vistoria_id uuid not null,
  tipo text not null check (tipo in (
    'solicitada', 'agendada', 'realizada', 'aprovada', 'nao_conformidade', 'correcao_campo', 'cancelada',
    'medidor_adequado', 'conexao_confirmada'
  )),
  status_de text,
  status_para text not null,
  ocorrido_em date not null,
  descricao text check (descricao is null or length(descricao) <= 4000),
  autor_membro_id uuid,
  created_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, vistoria_id) references public.obra_engenharia_vistorias (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_vistoria_eventos (vistoria_id, created_at);

create table public.obra_engenharia_vistoria_arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  evento_id uuid not null,
  caminho text not null unique,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho > 0),
  tipo_mime text,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, evento_id) references public.obra_engenharia_vistoria_eventos (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_vistoria_arquivos (evento_id);
create index on public.obra_engenharia_vistoria_arquivos (obra_id);

-- Quem vê os registros completos da vistoria: admin e quem atua em Engenharia ou no Operacional na obra (mesma regra
-- de `autorizacao_setor_obra`: coordenador do setor ou participante ativo dele).
create or replace function public.pode_ver_vistoria_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_obra_id is not null and (
    public.autorizacao_setor_obra(p_obra_id, 'engenharia') is not null
    or public.autorizacao_setor_obra(p_obra_id, 'operacional') is not null
  );
$$;

-- Leitura: `pode_ver_vistoria_obra`. Escrita direta revogada (inclusive service_role).
alter table public.obra_engenharia_vistorias enable row level security;
create policy "ver vistorias da engenharia" on public.obra_engenharia_vistorias for select to authenticated
  using (public.pode_ver_vistoria_obra(obra_id));
alter table public.obra_engenharia_vistoria_eventos enable row level security;
create policy "ver eventos das vistorias" on public.obra_engenharia_vistoria_eventos for select to authenticated
  using (public.pode_ver_vistoria_obra(obra_id));
alter table public.obra_engenharia_vistoria_arquivos enable row level security;
create policy "ver arquivos das vistorias" on public.obra_engenharia_vistoria_arquivos for select to authenticated
  using (public.pode_ver_vistoria_obra(obra_id));

-- Arquivos da vistoria: bucket próprio, para o Operacional ler e enviar sem acesso aos documentos da Engenharia.
-- Mesma pasta `empresa/obra/objeto` (lida por `obra_da_pasta_engenharia`, que só confere o formato e a empresa).
create or replace function public.pode_ver_pasta_vistoria(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.pode_ver_vistoria_obra(public.obra_da_pasta_engenharia(p_caminho)), false);
$$;

create or replace function public.pode_enviar_pasta_vistoria(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.cancelada_em is null and public.pode_ver_vistoria_obra(o.id)
    from public.obras o where o.id = public.obra_da_pasta_engenharia(p_caminho)
  ), false);
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('vistoria-arquivos', 'vistoria-arquivos', false, 20971520)
on conflict (id) do nothing;

create policy "vistoria-arquivos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'vistoria-arquivos' and public.pode_ver_pasta_vistoria(name));
create policy "vistoria-arquivos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'vistoria-arquivos' and public.pode_enviar_pasta_vistoria(name));

revoke all on public.obra_engenharia_vistorias, public.obra_engenharia_vistoria_eventos, public.obra_engenharia_vistoria_arquivos from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_vistorias, public.obra_engenharia_vistoria_eventos,
  public.obra_engenharia_vistoria_arquivos from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Histórico
-- ---------------------------------------------------------------------------

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao'
));

-- ---------------------------------------------------------------------------
-- Etapa do setor: gates G3 e G6
-- ---------------------------------------------------------------------------

-- Troca manual de etapa (mesma assinatura e regras de antes) + G6: concluir a Engenharia exige conexão confirmada.
create or replace function public.alterar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_atual text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, true);
  if p_status is null or not (
    (p_setor = 'compras' and p_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor'))
    or (p_setor = 'engenharia' and p_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
    or (p_setor = 'operacional' and p_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  ) then
    raise exception 'Status inválido para este setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_setor = 'engenharia' then
    select status into v_atual from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia';
    -- G3: sair do projeto exige protocolo.
    if p_status not in ('a_iniciar', 'projeto_em_elaboracao') and v_atual in ('a_iniciar', 'projeto_em_elaboracao') and not exists (
      select 1 from public.obra_engenharia_protocolos p
      where p.obra_id = p_obra_id and p.status not in ('cancelado', 'indeferido')
    ) then
      raise exception 'Registre o protocolo da concessionária antes de avançar a Engenharia.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- G6: concluir exige vistoria aprovada com conexão confirmada.
    if p_status = 'concluido' and v_atual is distinct from 'concluido' and not exists (
      select 1 from public.obra_engenharia_vistorias v
      where v.obra_id = p_obra_id and v.status = 'aprovada' and v.conexao_confirmada_em is not null
    ) then
      raise exception 'Para concluir a Engenharia, registre a vistoria aprovada e a conexão confirmada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  perform public.gravar_status_fluxo_obra(p_obra_id, p_setor, p_status, v_aut, 'manual');
end;
$$;

-- Exceção ao G6 (obra sem conexão nova, por exemplo): só o admin, com motivo. O motivo fica no histórico, sem exibição.
create or replace function public.concluir_engenharia_sem_conexao(p_obra_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', true);
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_aut is distinct from 'admin' then
    raise exception 'Só o administrador conclui a Engenharia sem a conexão confirmada.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if length(v_motivo) not between 10 and 500 then
    raise exception 'Explique o motivo (10 a 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia' and status = 'concluido') then
    raise exception 'A Engenharia desta obra já está concluída.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  perform public.registrar_historico_obra(p_obra_id, 'engenharia_concluida_excecao', 'engenharia', jsonb_build_object(
    'motivo', v_motivo,
    'autorizacao', v_aut
  ));
  perform public.gravar_status_fluxo_obra(p_obra_id, 'engenharia', 'concluido', v_aut, 'excecao');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs da vistoria
-- ---------------------------------------------------------------------------

-- Registra o pedido de vistoria feito à distribuidora (gate G5) e leva a Engenharia para "Aguardando vistoria" se ela
-- ainda estava antes disso. Obra pausada não aceita (muda a etapa).
create or replace function public.solicitar_vistoria_engenharia(
  p_obra_id uuid,
  p_solicitada_em date,
  p_numero text default null,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', true);
  v_empresa uuid;
  v_numero text := nullif(btrim(coalesce(p_numero, '')), '');
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_vistoria uuid;
  v_etapa text;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;

  if p_solicitada_em is null or p_solicitada_em > public.hoje_brasilia() then
    raise exception 'Informe a data do pedido (não pode ser futura).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_numero is not null and length(v_numero) > 60 then
    raise exception 'Número muito longo (máximo 60 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obs is not null and length(v_obs) > 1000 then
    raise exception 'Observação muito longa (máximo 1000 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Gate G5: protocolo aprovado (ou orçamento emitido) e instalação concluída.
  if not exists (
    select 1 from public.obra_engenharia_protocolos
    where obra_id = p_obra_id and status in ('aprovado', 'orcamento_emitido', 'encerrado')
  ) then
    raise exception 'A vistoria só pode ser pedida com o protocolo aprovado (ou orçamento de conexão emitido).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (
    select 1 from public.obra_fluxos
    where obra_id = p_obra_id and setor = 'operacional' and status in ('instalacao_concluida', 'concluido')
  ) then
    raise exception 'A vistoria só pode ser pedida com a instalação concluída pelo Operacional.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (
    select 1 from public.obra_engenharia_vistorias
    where obra_id = p_obra_id and status in ('solicitada', 'agendada', 'realizada', 'aprovada')
  ) then
    raise exception 'Esta obra já tem uma vistoria em andamento ou aprovada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_vistorias (empresa_id, obra_id, numero, solicitada_em, registrado_por)
  values (v_empresa, p_obra_id, v_numero, p_solicitada_em, public.meu_membro_id(v_empresa))
  returning id into v_vistoria;

  insert into public.obra_engenharia_vistoria_eventos (empresa_id, obra_id, vistoria_id, tipo, status_de, status_para, ocorrido_em, descricao, autor_membro_id)
  values (v_empresa, p_obra_id, v_vistoria, 'solicitada', null, 'solicitada', p_solicitada_em, v_obs, public.meu_membro_id(v_empresa));

  perform public.registrar_historico_obra(p_obra_id, 'vistoria_engenharia_solicitada', 'engenharia', jsonb_build_object('autorizacao', v_aut));

  select status into v_etapa from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia';
  if v_etapa not in ('aguardando_vistoria', 'concluido') then
    perform public.gravar_status_fluxo_obra(p_obra_id, 'engenharia', 'aguardando_vistoria', v_aut, 'vistoria');
  end if;
  return v_vistoria;
end;
$$;

-- Setor em nome do qual a pessoa registra cada tipo (ou nulo se não pode): agendamento e vistoria realizada, pela
-- Engenharia ou pelo Operacional; correção de campo, pelo Operacional; o resto, pela Engenharia. Admin passa em todos.
create or replace function public.setor_registro_vistoria(p_obra_id uuid, p_tipo text)
returns public.setor_obra
language sql stable security definer set search_path = ''
as $$
  select case
    when p_tipo in ('agendada', 'realizada') then
      case
        when public.autorizacao_setor_obra(p_obra_id, 'engenharia') is not null then 'engenharia'::public.setor_obra
        when public.autorizacao_setor_obra(p_obra_id, 'operacional') is not null then 'operacional'::public.setor_obra
      end
    when p_tipo = 'correcao_campo' then
      case when public.autorizacao_setor_obra(p_obra_id, 'operacional') is not null then 'operacional'::public.setor_obra end
    when public.autorizacao_setor_obra(p_obra_id, 'engenharia') is not null then 'engenharia'::public.setor_obra
  end;
$$;

-- Registra o andamento da vistoria. Transições:
--  solicitada | agendada → agendada (ou reagendada) | realizada | aprovada | nao_conformidade | cancelada
--  realizada → aprovada | nao_conformidade | cancelada (o resultado formal vem da distribuidora)
--  com_nao_conformidade → correcao_campo (uma ou mais; a situação não muda: a Engenharia pede vistoria nova)
--  aprovada → medidor_adequado (uma vez) → conexao_confirmada (uma vez)
-- "agendada" leva a data marcada (pode ser futura); as outras, a data do fato (entre o pedido e hoje). Não conformidade,
-- correção de campo e cancelamento exigem descrição. Nenhum registro muda a etapa: concluir a Engenharia segue pela
-- troca manual (G6).
create or replace function public.registrar_evento_vistoria_engenharia(
  p_vistoria_id uuid,
  p_tipo text,
  p_data date,
  p_descricao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_v public.obra_engenharia_vistorias;
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_para text;
  v_evento uuid;
  v_setor public.setor_obra;
begin
  if p_tipo is null or p_tipo not in (
    'agendada', 'realizada', 'aprovada', 'nao_conformidade', 'correcao_campo', 'cancelada', 'medidor_adequado', 'conexao_confirmada'
  ) then
    raise exception 'Tipo de registro inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select obra_id into v_obra from public.obra_engenharia_vistorias where id = p_vistoria_id;
  -- Sem setor autorizado para este tipo, cai na Engenharia: `preparar_escrita_obra` recusa com a mensagem de sempre.
  v_setor := coalesce(public.setor_registro_vistoria(v_obra, p_tipo), case when p_tipo = 'correcao_campo' then 'operacional' else 'engenharia' end::public.setor_obra);
  v_aut := public.preparar_escrita_obra(v_obra, v_setor, false);
  select * into v_v from public.obra_engenharia_vistorias where id = p_vistoria_id for update;

  if not (
    (v_v.status in ('solicitada', 'agendada') and p_tipo in ('agendada', 'realizada', 'aprovada', 'nao_conformidade', 'cancelada'))
    or (v_v.status = 'realizada' and p_tipo in ('aprovada', 'nao_conformidade', 'cancelada'))
    or (v_v.status = 'com_nao_conformidade' and p_tipo = 'correcao_campo')
    or (v_v.status = 'aprovada' and p_tipo = 'medidor_adequado' and v_v.medidor_adequado_em is null)
    or (v_v.status = 'aprovada' and p_tipo = 'conexao_confirmada' and v_v.medidor_adequado_em is not null and v_v.conexao_confirmada_em is null)
  ) then
    raise exception 'Este registro não cabe na situação atual da vistoria.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data is null or p_data < v_v.solicitada_em
     or (p_tipo <> 'agendada' and p_data > public.hoje_brasilia())
     or (p_tipo = 'agendada' and p_data > public.hoje_brasilia() + 365)
     or (p_tipo in ('aprovada', 'nao_conformidade', 'correcao_campo', 'medidor_adequado') and p_data < v_v.realizada_em)
     or (p_tipo = 'conexao_confirmada' and p_data < v_v.medidor_adequado_em) then
    raise exception 'Informe uma data válida (não antes do pedido nem do registro anterior; só a data agendada pode ser futura).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_desc is not null and length(v_desc) > 4000 then
    raise exception 'Texto muito longo (máximo 4000 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo in ('nao_conformidade', 'correcao_campo', 'cancelada') and (v_desc is null or length(v_desc) < 3) then
    raise exception 'Descreva o que foi apontado, o que foi corrigido ou o motivo do cancelamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_para := case p_tipo
    when 'nao_conformidade' then 'com_nao_conformidade'
    when 'correcao_campo' then 'com_nao_conformidade'
    when 'medidor_adequado' then 'aprovada'
    when 'conexao_confirmada' then 'aprovada'
    else p_tipo
  end;

  insert into public.obra_engenharia_vistoria_eventos (empresa_id, obra_id, vistoria_id, tipo, status_de, status_para, ocorrido_em, descricao, autor_membro_id)
  values (v_v.empresa_id, v_v.obra_id, v_v.id, p_tipo, v_v.status, v_para, p_data, v_desc, public.meu_membro_id(v_v.empresa_id))
  returning id into v_evento;

  update public.obra_engenharia_vistorias
  set status = v_para,
      agendada_para = case when p_tipo = 'agendada' then p_data else agendada_para end,
      -- Vistoria realizada em campo marca a data; o resultado formal só a preenche se ninguém registrou antes.
      realizada_em = case
        when p_tipo = 'realizada' then p_data
        when p_tipo in ('aprovada', 'nao_conformidade') then coalesce(realizada_em, p_data)
        else realizada_em
      end,
      medidor_adequado_em = case when p_tipo = 'medidor_adequado' then p_data else medidor_adequado_em end,
      conexao_confirmada_em = case when p_tipo = 'conexao_confirmada' then p_data else conexao_confirmada_em end
  where id = v_v.id;

  perform public.registrar_historico_obra(v_v.obra_id, 'vistoria_engenharia_atualizada', v_setor, jsonb_build_object(
    'tipo', p_tipo,
    'de', v_v.status,
    'para', v_para,
    'autorizacao', v_aut
  ));
  return v_evento;
end;
$$;

-- Anexa ao evento um arquivo que o navegador já enviou à pasta da obra no bucket `vistoria-arquivos` (relatório, foto,
-- comprovante). Quem pode anexar é quem pode registrar aquele tipo de evento. Mesmas conferências dos arquivos do
-- protocolo; nada se apaga.
create or replace function public.registrar_arquivo_vistoria_engenharia(p_evento_id uuid, p_caminho text, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_e public.obra_engenharia_vistoria_eventos;
  v_objeto record;
  v_id uuid;
begin
  select * into v_e from public.obra_engenharia_vistoria_eventos where id = p_evento_id;
  v_obra := v_e.obra_id;
  -- O pedido ("solicitada") é da Engenharia; os demais seguem a regra de quem registra cada tipo.
  v_aut := public.preparar_escrita_obra(
    v_obra,
    coalesce(public.setor_registro_vistoria(v_obra, v_e.tipo), case when v_e.tipo = 'correcao_campo' then 'operacional' else 'engenharia' end::public.setor_obra),
    false
  );

  if public.obra_da_pasta_engenharia(p_caminho) is distinct from v_e.obra_id then
    raise exception 'O arquivo não está na pasta desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_nome, ''))) not between 1 and 200 then
    raise exception 'Nome do arquivo inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select o.metadata into v_objeto
  from storage.objects o
  where o.bucket_id = 'vistoria-arquivos' and o.name = p_caminho and o.owner_id = (select auth.uid())::text;
  if not found then
    raise exception 'Arquivo não encontrado no armazenamento. Envie de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce((v_objeto.metadata ->> 'size')::bigint, 0) <= 0 then
    raise exception 'O arquivo está vazio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_vistoria_arquivos (empresa_id, obra_id, evento_id, caminho, nome, tamanho, tipo_mime, enviado_por)
  values (v_e.empresa_id, v_e.obra_id, v_e.id, p_caminho, btrim(p_nome), (v_objeto.metadata ->> 'size')::bigint,
    nullif(v_objeto.metadata ->> 'mimetype', ''), public.meu_membro_id(v_e.empresa_id))
  on conflict (caminho) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Este arquivo já está registrado.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;
  return v_id;
end;
$$;

-- Situação da vistoria mais recente para quem vê a obra (Operacional, vendedor, gestor): só situação e datas, sem
-- número, textos nem arquivos. Sem acesso à obra (ou sem vistoria), nenhuma linha.
create or replace function public.situacao_vistoria_obra(p_obra_id uuid)
returns table (
  status text,
  solicitada_em date,
  agendada_para date,
  realizada_em date,
  medidor_adequado_em date,
  conexao_confirmada_em date
)
language sql stable security definer set search_path = ''
as $$
  select v.status, v.solicitada_em, v.agendada_para, v.realizada_em, v.medidor_adequado_em, v.conexao_confirmada_em
  from public.obra_engenharia_vistorias v
  where v.obra_id = p_obra_id
    and (public.pode_ver_obra(p_obra_id) or public.pode_ver_obra_operacao(p_obra_id) or public.pode_ver_vistoria_obra(p_obra_id))
  order by v.created_at desc
  limit 1;
$$;

revoke all on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) to authenticated;
revoke all on function public.concluir_engenharia_sem_conexao(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.concluir_engenharia_sem_conexao(uuid, text) to authenticated;
revoke all on function public.solicitar_vistoria_engenharia(uuid, date, text, text) from public, anon, authenticated, service_role;
grant execute on function public.solicitar_vistoria_engenharia(uuid, date, text, text) to authenticated;
revoke all on function public.registrar_evento_vistoria_engenharia(uuid, text, date, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_evento_vistoria_engenharia(uuid, text, date, text) to authenticated;
revoke all on function public.registrar_arquivo_vistoria_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_arquivo_vistoria_engenharia(uuid, text, text) to authenticated;
revoke all on function public.situacao_vistoria_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.situacao_vistoria_obra(uuid) to authenticated;
-- Usadas nas policies (tabelas e Storage): só `authenticated`. A regra de quem registra é interna.
revoke all on function public.pode_ver_vistoria_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_vistoria_obra(uuid) to authenticated;
revoke all on function public.pode_ver_pasta_vistoria(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_vistoria(text) to authenticated;
revoke all on function public.pode_enviar_pasta_vistoria(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_vistoria(text) to authenticated;
revoke all on function public.setor_registro_vistoria(uuid, text) from public, anon, authenticated, service_role;

reset lock_timeout;
