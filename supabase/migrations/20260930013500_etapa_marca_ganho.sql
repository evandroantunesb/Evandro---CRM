-- Permite marcar uma etapa do Kanban como "fecha o negócio": mover um negócio
-- pra ela passa a marcar o status (ganho ou perdido) automaticamente, sem
-- precisar clicar em "Marcar como ganho/perdido" à parte. Pedido do Evandro
-- em 2026-09-30: uma etapa chamada "Ganho" no funil dele não estava fechando
-- o negócio de verdade — "ganho é ganho". Continua opcional (default null) e
-- não muda nenhum funil existente.
--
-- Perdido automático usa um motivo padrão ("Perdido automaticamente pela
-- etapa"), criado sob demanda por empresa, já que mover no Kanban não passa
-- por um motivo específico.

alter table public.etapas add column fecha_como public.status_negocio;
alter table public.etapas add constraint etapas_fecha_como_valido check (fecha_como is null or fecha_como <> 'aberto');

create or replace function public.preparar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
  v_etapa record;
  v_contato record;
  v_faltando text[] := '{}';
  v_fecha_como public.status_negocio;
  v_motivo_padrao uuid;
begin
  if tg_op = 'INSERT' then
    update public.empresas set seq_negocio = seq_negocio + 1
      where id = new.empresa_id
      returning seq_negocio into new.numero;
    new.criado_por := v_eu;
    -- Quem cria é o responsável, a não ser que outro tenha sido escolhido.
    new.responsavel_id := coalesce(new.responsavel_id, v_eu);
    if new.etapa_id is null then
      select id into new.etapa_id from public.etapas
        where funil_id = new.funil_id and inicial and ativa;
      if new.etapa_id is null then
        select id into new.etapa_id from public.etapas
          where funil_id = new.funil_id and ativa order by ordem limit 1;
      end if;
    end if;
    new.etapa_desde := now();
    new.status := 'aberto';
    new.motivo_perda_id := null;
    new.motivo_perda_detalhe := null;
  else
    new.numero := old.numero;
    new.criado_por := old.criado_por;
    new.empresa_id := old.empresa_id;
    if new.etapa_id is distinct from old.etapa_id then
      new.etapa_desde := now();
      -- Só fecha automaticamente se o negócio ainda estava aberto — nunca
      -- sobrescreve um ganho/perdido já registrado.
      if new.status = 'aberto' then
        select fecha_como into v_fecha_como from public.etapas where id = new.etapa_id;
        if v_fecha_como = 'ganho' then
          new.status := 'ganho';
        elsif v_fecha_como = 'perdido' then
          insert into public.motivos_perda (empresa_id, nome)
            values (new.empresa_id, 'Perdido automaticamente pela etapa')
            on conflict (empresa_id, nome) do update set nome = excluded.nome
            returning id into v_motivo_padrao;
          new.status := 'perdido';
          new.motivo_perda_id := v_motivo_padrao;
        end if;
      end if;
    end if;
    if new.status is distinct from old.status then
      new.fechado_em := case when new.status = 'aberto' then null else now() end;
    end if;
  end if;

  if not exists (select 1 from public.etapas where id = new.etapa_id and funil_id = new.funil_id and empresa_id = new.empresa_id) then
    raise exception 'Etapa não pertence ao funil' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.contatos where id = new.contato_id and empresa_id = new.empresa_id) then
    raise exception 'Contato de outra empresa' using errcode = 'check_violation';
  end if;
  if new.origem_id is not null and not exists (select 1 from public.origens where id = new.origem_id and empresa_id = new.empresa_id) then
    raise exception 'Origem de outra empresa' using errcode = 'check_violation';
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.empresa_membros where id = new.responsavel_id and empresa_id = new.empresa_id and ativo
  ) then
    raise exception 'Responsável precisa ser um usuário ativo da empresa' using errcode = 'check_violation';
  end if;

  -- Perda: motivo obrigatório. Aberto ou ganho: sem motivo.
  if new.status = 'perdido' then
    if new.motivo_perda_id is null then
      raise exception 'Escolha o motivo da perda.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if not exists (select 1 from public.motivos_perda where id = new.motivo_perda_id and empresa_id = new.empresa_id) then
      raise exception 'Motivo de outra empresa' using errcode = 'check_violation';
    end if;
  else
    new.motivo_perda_id := null;
    new.motivo_perda_detalhe := null;
  end if;

  if new.status = 'ganho' and coalesce(new.valor, 0) <= 0
     and (tg_op = 'INSERT' or old.status is distinct from 'ganho' or new.valor is distinct from old.valor) then
    raise exception 'Informe o valor do negócio antes de marcar como ganho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Campos obrigatórios da etapa: conferidos ao entrar nela.
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    select nome, campos_obrigatorios into v_etapa from public.etapas where id = new.etapa_id;
    if cardinality(v_etapa.campos_obrigatorios) > 0 then
      select telefone, email, documento, cidade into v_contato from public.contatos where id = new.contato_id;
      if 'valor' = any (v_etapa.campos_obrigatorios) and coalesce(new.valor, 0) <= 0 then
        v_faltando := array_append(v_faltando, 'valor');
      end if;
      if 'origem' = any (v_etapa.campos_obrigatorios) and new.origem_id is null then
        v_faltando := array_append(v_faltando, 'origem');
      end if;
      if 'descricao' = any (v_etapa.campos_obrigatorios) and nullif(trim(new.descricao), '') is null then
        v_faltando := array_append(v_faltando, 'descrição');
      end if;
      if 'contato_telefone' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.telefone), '') is null then
        v_faltando := array_append(v_faltando, 'telefone do contato');
      end if;
      if 'contato_email' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.email::text), '') is null then
        v_faltando := array_append(v_faltando, 'e-mail do contato');
      end if;
      if 'contato_documento' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.documento), '') is null then
        v_faltando := array_append(v_faltando, 'CPF/CNPJ do contato');
      end if;
      if 'contato_cidade' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.cidade), '') is null then
        v_faltando := array_append(v_faltando, 'cidade do contato');
      end if;
      if cardinality(v_faltando) > 0 then
        raise exception 'Para entrar em "%", preencha: %.', v_etapa.nome, array_to_string(v_faltando, ', ')
          using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    end if;
  end if;
  return new;
end;
$$;
