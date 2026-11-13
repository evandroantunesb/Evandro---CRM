-- Obra do Solo: pendências da 4b (20261207100000_obra_solo.sql), decisões do Evandro de 13/11/2026.
--
-- O que faz:
--  * Obra cancelada: o checklist não muda mais (marcar, prever, anotar, "não se aplica", enviar foto e gerar link são
--    recusados); apagar foto continua, para o admin limpar o que não deveria estar lá. O cliente já vê "encerrada".
--  * Foto: o caminho é conferido por prefixo exato (`starts_with`); com `like`, o `_` das etapas era coringa.
--  * Empresa que vira Solo (o super-admin troca o plano): cada obra aberta (nem cancelada nem concluída pela regra do
--    PRO) que não tem checklist ganha o checklist (contrato e entrada pelos fatos; entrada estornada fica pendente),
--    como a migration da 4b fez com as obras do Solo que já existiam; obra aberta com checklist ganha o link do
--    cliente, se não tem. Os fluxos de setor que as obras têm ficam como estão.
--  * Empresa que sai do Solo para o PRO: cada obra aberta (não cancelada, com alguma etapa do checklist pendente, ou
--    sem checklist) ganha os setores que a empresa tem, como uma obra nova do PRO, e segue pelo fluxo do PRO; o link
--    do cliente dela é desligado (link do cliente só no Solo). As obras concluídas no Solo ficam como estão.

set lock_timeout = '5s';

-- Admin da empresa numa obra do Solo NÃO cancelada (todas as alterações do checklist, menos apagar foto).
create or replace function public.exigir_admin_obra_solo(p_obra_id uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_cancelada timestamptz;
begin
  select o.empresa_id, o.cancelada_em into v_empresa, v_cancelada from public.obras o
  where o.id = p_obra_id and exists (select 1 from public.obra_checklist c where c.obra_id = o.id);
  if v_empresa is null or not public.tem_papel(v_empresa, '{admin}') then
    raise exception 'Só o admin da empresa altera o checklist da obra.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  if v_cancelada is not null then
    raise exception 'A obra foi cancelada: o checklist não muda mais.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return v_empresa;
end;
$$;
revoke all on function public.exigir_admin_obra_solo(uuid) from public, anon, authenticated, service_role;

-- Apagar foto vale também na obra cancelada: confere só o admin da empresa numa obra do Solo.
create or replace function public.apagar_foto_etapa_obra(p_foto_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_foto public.obra_checklist_fotos;
begin
  select * into v_foto from public.obra_checklist_fotos where id = p_foto_id;
  if not found or not public.tem_papel(v_foto.empresa_id, '{admin}') then
    raise exception 'Só o admin da empresa altera o checklist da obra.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  delete from public.obra_checklist_fotos where id = p_foto_id;
  perform public.registrar_historico_obra(v_foto.obra_id, 'checklist_alterado', null, jsonb_build_object('etapa', v_foto.etapa, 'acao', 'foto_apagada'));
  return v_foto.caminho;
end;
$$;
revoke all on function public.apagar_foto_etapa_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.apagar_foto_etapa_obra(uuid) to authenticated;

-- Registra a foto já enviada ao Storage (até 10 por etapa). Prefixo exato: `empresa/obra/etapa/arquivo`.
create or replace function public.registrar_foto_etapa_obra(p_obra_id uuid, p_etapa public.etapa_checklist_obra, p_caminho text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := public.exigir_admin_obra_solo(p_obra_id);
  v_id uuid;
begin
  if p_caminho is null
     or not starts_with(p_caminho, v_empresa::text || '/' || p_obra_id::text || '/' || p_etapa::text || '/')
     or (storage.foldername(p_caminho))[4] is not null
     or not exists (select 1 from storage.objects s where s.bucket_id = 'obra-fotos' and s.name = p_caminho) then
    raise exception 'Foto inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Trava a etapa: dois envios ao mesmo tempo não passam do limite.
  perform 1 from public.obra_checklist where obra_id = p_obra_id and etapa = p_etapa for update;
  if (select count(*) from public.obra_checklist_fotos f where f.obra_id = p_obra_id and f.etapa = p_etapa) >= 10 then
    raise exception 'Cada etapa aceita até 10 fotos.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_checklist_fotos (obra_id, empresa_id, etapa, caminho, enviada_por)
  values (p_obra_id, v_empresa, p_etapa, p_caminho, public.meu_membro_id(v_empresa))
  returning id into v_id;
  perform public.registrar_historico_obra(p_obra_id, 'checklist_alterado', null, jsonb_build_object('etapa', p_etapa, 'acao', 'foto_enviada'));
  return v_id;
end;
$$;
revoke all on function public.registrar_foto_etapa_obra(uuid, public.etapa_checklist_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_foto_etapa_obra(uuid, public.etapa_checklist_obra, text) to authenticated;

-- Obra concluída pela regra do PRO (`situacaoObra` em src/lib/obras/derivados.ts): Compras e Operacional presentes,
-- todo setor recebido no status final e os 2 marcos fixos resolvidos.
create or replace function public.obra_concluida_pro(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras')
     and exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'operacional')
     and not exists (
       select 1 from public.obra_fluxos f
       where f.obra_id = p_obra_id
         and f.status <> case when f.setor = 'compras' then 'material_entregue' else 'concluido' end
     )
     and (
       select count(*) from public.obra_marcos m
       where m.obra_id = p_obra_id and m.marco in ('nf_cliente', 'garantia') and m.status in ('concluido', 'nao_se_aplica')
     ) = 2;
$$;
revoke all on function public.obra_concluida_pro(uuid) from public, anon, authenticated, service_role;

-- Troca de plano da empresa (só o super-admin grava `planos_empresa`): ajusta as obras abertas.
create or replace function public.obras_ao_trocar_plano()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := coalesce(new.empresa_id, old.empresa_id);
  v_era_solo boolean := tg_op <> 'INSERT' and old.produto = 'solo';
  v_e_solo boolean := tg_op <> 'DELETE' and new.produto = 'solo';
begin
  if v_e_solo and not v_era_solo then
    -- Obras abertas sem checklist: checklist como na 4b (contrato e entrada pelos fatos; entrada estornada pendente).
    insert into public.obra_checklist (obra_id, empresa_id, etapa, feita_em)
    select o.id, o.empresa_id, e.etapa,
           case e.etapa
             when 'contrato' then public.data_assinatura_contrato(o.negocio_id, c.updated_at)
             when 'entrada' then case when o.alerta_pagamento_estornado_em is null
                                      then (cp.confirmado_em at time zone 'America/Sao_Paulo')::date end
           end
    from public.obras o
    join public.contratos c on c.id = o.contrato_id
    left join public.confirmacoes_pagamento cp on cp.id = o.confirmacao_pagamento_id
    cross join unnest(enum_range(null::public.etapa_checklist_obra)) as e(etapa)
    where o.empresa_id = v_empresa
      and o.cancelada_em is null
      and not exists (select 1 from public.obra_checklist x where x.obra_id = o.id)
      and not public.obra_concluida_pro(o.id);

    update public.obras o set link_cliente = gen_random_uuid()::text
    where o.empresa_id = v_empresa
      and o.link_cliente is null
      and o.cancelada_em is null
      and exists (select 1 from public.obra_checklist x where x.obra_id = o.id);

  elsif v_era_solo and not v_e_solo then
    -- Obras abertas do Solo: os setores que a empresa tem agora (como uma obra nova do PRO) e sem o link do cliente.
    with abertas as (
      select o.id
      from public.obras o
      where o.empresa_id = v_empresa
        and o.cancelada_em is null
        and (
          not exists (select 1 from public.obra_checklist x where x.obra_id = o.id)
          or exists (
            select 1 from public.obra_checklist x
            where x.obra_id = o.id and x.feita_em is null and x.nao_se_aplica_motivo is null
          )
        )
    ),
    fluxos as (
      insert into public.obra_fluxos (obra_id, empresa_id, setor, status)
      select a.id, v_empresa, s.setor,
             case s.setor
               when 'compras' then 'a_comprar'
               when 'engenharia' then 'a_iniciar'
               when 'operacional' then 'aguardando_liberacao'
               when 'administrativo' then 'pagando_fornecedores'
             end
      from abertas a
      cross join unnest(public.setores_da_obra(v_empresa)) as s(setor)
      where not exists (select 1 from public.obra_fluxos f where f.obra_id = a.id and f.setor = s.setor)
      returning 1
    )
    update public.obras o set link_cliente = null
    from abertas a
    where o.id = a.id and o.link_cliente is not null;
  end if;
  return null;
end;
$$;
revoke all on function public.obras_ao_trocar_plano() from public, anon, authenticated, service_role;

create trigger planos_empresa_obras_ao_trocar_plano
  after insert or update of produto or delete on public.planos_empresa
  for each row execute function public.obras_ao_trocar_plano();
