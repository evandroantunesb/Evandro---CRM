-- Obra de rede com custo (PR 3 de 3 do enquadramento Copel) — decisões do Evandro em 04/11/2026.
--
-- Quando a distribuidora emite orçamento (obra de rede com custo), a Engenharia acompanha no passo 7: documentação
-- enviada ao e-mail do cliente, pagamento à Copel (conforme negociado), o prazo da obra que a Copel informou (o
-- engenheiro escolhe: 30, 60, 90 dias ou ~6 meses) e a obra concluída. O prazo conta do pagamento, em dias úteis.
-- A vistoria do padrão novo só pode ser pedida depois da obra concluída. Sem orçamento (protocolo aprovado), nada
-- muda: segue direto para a ligação.
--  * `obra_engenharia_obra_rede`: uma linha por obra. Escrita só por `registrar_obra_rede_engenharia` (admin,
--    coordenador ou participante ativo da Engenharia, como o protocolo); leitura como os protocolos.
--  * Registro já feito só muda com motivo; o valor anterior e o motivo ficam no histórico da obra.
--  * Trava da vistoria num gatilho de `obra_engenharia_vistorias` (a função de pedir vistoria não muda).
--  * `prazos_engenharia` ganha o prazo `distribuidora_obra_rede`.
-- Depende de: 20261030120000_engenharia_protocolos.sql, 20261030140000_engenharia_vistoria.sql,
-- 20261115100000_engenharia_prazos_copel.sql.

set lock_timeout = '5s';

create table public.obra_engenharia_obra_rede (
  obra_id uuid primary key,
  empresa_id uuid not null,
  documentos_enviados_em date,
  pagamento_em date,
  -- Prazo da obra informado pela distribuidora no orçamento, em dias úteis a partir do pagamento.
  prazo_dias integer check (prazo_dias is null or prazo_dias between 1 and 365),
  concluida_em date,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint obra_engenharia_obra_rede_prazo_com_pagamento check (prazo_dias is null or pagamento_em is not null),
  constraint obra_engenharia_obra_rede_concluida_depois check (concluida_em is null or (pagamento_em is not null and concluida_em >= pagamento_em)),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_obra_rede (atualizado_por);

alter table public.obra_engenharia_obra_rede enable row level security;
create policy "ver obra de rede da engenharia" on public.obra_engenharia_obra_rede for select to authenticated
  using (public.pode_ver_documentos_engenharia(obra_id));
revoke all on public.obra_engenharia_obra_rede from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_obra_rede from authenticated, service_role;

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
  'obra_rede_engenharia'
));

-- A distribuidora emitiu orçamento (obra de rede com custo) em algum protocolo da obra.
create or replace function public.obra_tem_orcamento_conexao(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.obra_engenharia_protocolo_eventos ev
    join public.obra_engenharia_protocolos p on p.id = ev.protocolo_id
    where p.obra_id = p_obra_id and ev.tipo = 'orcamento_emitido'
  );
$$;
revoke all on function public.obra_tem_orcamento_conexao(uuid) from public, anon, authenticated, service_role;

-- Registra uma etapa da obra de rede: 'documentos' (enviados ao e-mail do cliente), 'pagamento' (à Copel, com o prazo
-- da obra em dias úteis) ou 'concluida'. Etapa já registrada só muda com motivo.
create or replace function public.registrar_obra_rede_engenharia(
  p_obra_id uuid,
  p_etapa text,
  p_data date,
  p_prazo_dias integer default null,
  p_motivo text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_atual public.obra_engenharia_obra_rede;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_antes date;
  v_membro uuid;
begin
  if p_etapa is null or p_etapa not in ('documentos', 'pagamento', 'concluida') then
    raise exception 'Etapa da obra de rede inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data is null or p_data > public.hoje_brasilia() then
    raise exception 'Informe a data (não pode ser futura).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not public.obra_tem_orcamento_conexao(p_obra_id) then
    raise exception 'Registre o orçamento emitido pela distribuidora no protocolo antes.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_etapa = 'pagamento' and (p_prazo_dias is null or p_prazo_dias not between 1 and 365) then
    raise exception 'Informe o prazo da obra que a distribuidora deu (em dias úteis).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is not null and (length(v_motivo) < 3 or length(v_motivo) > 500) then
    raise exception 'O motivo precisa ter de 3 a 500 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  v_membro := public.meu_membro_id(v_empresa);
  insert into public.obra_engenharia_obra_rede (obra_id, empresa_id) values (p_obra_id, v_empresa)
  on conflict (obra_id) do nothing;
  select * into v_atual from public.obra_engenharia_obra_rede where obra_id = p_obra_id for update;

  v_antes := case p_etapa when 'documentos' then v_atual.documentos_enviados_em when 'pagamento' then v_atual.pagamento_em
             else v_atual.concluida_em end;
  if v_antes is not null and v_motivo is null then
    raise exception 'Esta etapa já foi registrada. Para corrigir, informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_etapa = 'concluida' and v_atual.pagamento_em is null then
    raise exception 'Registre o pagamento à distribuidora antes da obra concluída.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_etapa = 'concluida' and p_data < v_atual.pagamento_em then
    raise exception 'A obra não pode ter sido concluída antes do pagamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.obra_engenharia_obra_rede set
    documentos_enviados_em = case when p_etapa = 'documentos' then p_data else documentos_enviados_em end,
    pagamento_em = case when p_etapa = 'pagamento' then p_data else pagamento_em end,
    prazo_dias = case when p_etapa = 'pagamento' then p_prazo_dias else prazo_dias end,
    concluida_em = case when p_etapa = 'concluida' then p_data else concluida_em end,
    atualizado_por = v_membro,
    atualizado_em = now()
  where obra_id = p_obra_id;

  -- O motivo da correção é texto livre e fica só aqui; a tela do histórico mostra a etapa e as datas.
  perform public.registrar_historico_obra(p_obra_id, 'obra_rede_engenharia', 'engenharia', jsonb_strip_nulls(jsonb_build_object(
    'etapa', p_etapa,
    'data', p_data,
    'de', v_antes,
    'prazo_dias', case when p_etapa = 'pagamento' then p_prazo_dias end,
    'motivo', v_motivo,
    'autorizacao', v_aut
  )));
end;
$$;
revoke all on function public.registrar_obra_rede_engenharia(uuid, text, date, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_obra_rede_engenharia(uuid, text, date, integer, text) to authenticated;

-- Vistoria do padrão novo só depois da obra de rede, quando houve orçamento.
create or replace function public.travar_vistoria_sem_obra_rede()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.obra_tem_orcamento_conexao(new.obra_id) and not exists (
    select 1 from public.obra_engenharia_obra_rede r where r.obra_id = new.obra_id and r.concluida_em is not null
  ) then
    raise exception 'Com orçamento de conexão, a vistoria só pode ser pedida depois da obra de rede concluída pela distribuidora.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.travar_vistoria_sem_obra_rede() from public, anon, authenticated, service_role;
create trigger obra_engenharia_vistorias_obra_rede before insert on public.obra_engenharia_vistorias
  for each row execute function public.travar_vistoria_sem_obra_rede();

-- ---------------------------------------------------------------------------
-- Prazos: mesma função de 20261115100000, com o prazo da obra de rede
-- ---------------------------------------------------------------------------

create or replace function public.prazos_engenharia(p_empresa_id uuid)
returns table (obra_id uuid, chave text, inicio date, limite date, dias_restantes integer, contagem text)
language sql stable set search_path = ''
as $$
  with prazo as (
    select p.chave, p.dias_uteis as dias, p.contagem from public.engenharia_prazos p
    where p.empresa_id = p_empresa_id and p.dias_uteis is not null
  ),
  ultima_vistoria as (
    select distinct on (v.obra_id) v.*
    from public.obra_engenharia_vistorias v
    where v.empresa_id = p_empresa_id and v.status <> 'cancelada'
    order by v.obra_id, v.created_at desc
  ),
  marcos as (
    -- Etapa interna: desde a entrada na etapa.
    select f.obra_id, f.status as chave, f.status as regra, (f.status_desde at time zone 'America/Sao_Paulo')::date as inicio, null::date as fixo
    from public.obra_fluxos f
    where f.empresa_id = p_empresa_id and f.setor = 'engenharia' and f.status in ('a_iniciar', 'projeto_em_elaboracao')
    union all
    -- ART (TRT): do pagamento confirmado (a obra nasce com ele) até o item da ART resolvido; sem checklist aplicado,
    -- até o protocolo. Nunca de antes de 04/11/2026 (sem atraso retroativo nas obras anteriores à regra). A data vem do
    -- fluxo da Engenharia, que nasce com a obra (o papel `operacao` não lê `obras`; a função roda como quem chama).
    select f.obra_id, 'art', 'art', greatest((f.created_at at time zone 'America/Sao_Paulo')::date, date '2026-11-04'), null
    from public.obra_fluxos f
    where f.empresa_id = p_empresa_id and f.setor = 'engenharia'
      and not exists (
        select 1 from public.obra_engenharia_itens i
        where i.obra_id = f.obra_id and i.titulo ilike 'ART %' and i.status in ('valido', 'dispensado')
      )
      and (
        exists (select 1 from public.obra_engenharia_itens i where i.obra_id = f.obra_id and i.titulo ilike 'ART %')
        or (
          not exists (select 1 from public.obra_engenharia_itens i where i.obra_id = f.obra_id)
          and not exists (select 1 from public.obra_engenharia_protocolos p where p.obra_id = f.obra_id)
        )
      )
    union all
    -- Exigência aberta: conta da data em que a distribuidora a emitiu (o evento), não de quando foi digitada. O prazo
    -- interno digitado vence o padrão. A mais urgente da obra: o menor vencimento efetivo.
    (select distinct on (e.obra_id) e.obra_id, 'exigencia', 'exigencia', ev.ocorrido_em,
      coalesce(e.prazo_interno, public.somar_dias_prazo(p_empresa_id, ev.ocorrido_em, pr.dias, pr.contagem)) as fixo
    from public.obra_engenharia_exigencias e
    join public.obra_engenharia_protocolo_eventos ev on ev.id = e.evento_id
    left join prazo pr on pr.chave = 'exigencia'
    where e.empresa_id = p_empresa_id and e.status = 'aberta'
    order by e.obra_id, fixo nulls last, ev.ocorrido_em)
    union all
    -- Correção de campo: desde a não conformidade, enquanto não houver a correção registrada.
    select v.obra_id, 'correcao_campo', 'correcao_campo', (
      select max(ev.ocorrido_em) from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'nao_conformidade'
    ), null
    from ultima_vistoria v
    where v.status = 'com_nao_conformidade'
      and not exists (select 1 from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'correcao_campo')
    union all
    -- Distribuidora analisa: do protocolo ou do último reenvio (com exigência aberta, a vez é nossa). Zona rural no
    -- enquadramento usa o prazo rural.
    select p.obra_id, 'distribuidora_analise',
      case when exists (select 1 from public.obra_engenharia_enquadramento q where q.obra_id = p.obra_id and q.zona = 'rural')
           then 'distribuidora_analise_rural' else 'distribuidora_analise' end,
      greatest(p.protocolado_em, (
        select max(ev.ocorrido_em) from public.obra_engenharia_protocolo_eventos ev where ev.protocolo_id = p.id and ev.tipo = 'reenvio'
      )), null
    from public.obra_engenharia_protocolos p
    where p.empresa_id = p_empresa_id and p.status in ('protocolado', 'em_analise')
    union all
    -- Distribuidora faz a vistoria: do pedido até a vistoria realizada.
    select v.obra_id, 'distribuidora_vistoria', 'distribuidora_vistoria', v.solicitada_em, null
    from ultima_vistoria v
    where v.status in ('solicitada', 'agendada')
    union all
    -- Distribuidora liga: da vistoria aprovada até a conexão confirmada.
    select v.obra_id, 'distribuidora_conexao', 'distribuidora_conexao', coalesce((
      select max(ev.ocorrido_em) from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'aprovada'
    ), v.realizada_em), null
    from ultima_vistoria v
    where v.status = 'aprovada' and v.conexao_confirmada_em is null
    union all
    -- Obra de rede da distribuidora (orçamento com custo): do pagamento à Copel, no prazo que ela informou, em dias
    -- úteis, até a obra concluída. O vencimento é da obra (não há prazo configurado).
    select r.obra_id, 'distribuidora_obra_rede', 'distribuidora_obra_rede', r.pagamento_em,
      public.somar_dias_uteis(p_empresa_id, r.pagamento_em, r.prazo_dias)
    from public.obra_engenharia_obra_rede r
    where r.empresa_id = p_empresa_id and r.pagamento_em is not null and r.prazo_dias is not null and r.concluida_em is null
  ),
  vencimentos as (
    select m.obra_id, m.chave, m.inicio, coalesce(pr.contagem, 'uteis') as contagem,
      coalesce(m.fixo, public.somar_dias_prazo(p_empresa_id, m.inicio, pr.dias, pr.contagem)) as limite
    from marcos m
    left join prazo pr on pr.chave = m.regra
    where m.inicio is not null and (m.fixo is not null or pr.dias is not null)
  )
  select x.obra_id, x.chave, x.inicio, x.limite, public.prazo_restante(p_empresa_id, x.limite, public.hoje_brasilia(), x.contagem), x.contagem
  from vencimentos x
  where public.engenharia_em_curso(x.obra_id);
$$;
revoke all on function public.prazos_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.prazos_engenharia(uuid) to authenticated;

reset lock_timeout;
