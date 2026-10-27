-- A vistoria do vendedor é pré-requisito para concluir uma venda solar.
-- Eletropostos e negócios solares já ganhos não são alterados retroativamente.


alter table public.anexos drop constraint if exists anexos_categoria_check;
alter table public.anexos add constraint anexos_categoria_check
  check (categoria in ('geral', 'cnh', 'fatura_gerador', 'fatura_beneficiario',
                      'vistoria_medidor', 'vistoria_telhado'));

create table public.vistorias_tecnicas (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  visita_realizada boolean not null default false,
  medidor_inspecionado boolean not null default false,
  telhado_inspecionado boolean not null default false,
  observacoes text not null default '' check (length(observacoes) <= 3000),
  confirmada_em timestamptz,
  confirmada_por uuid references public.empresa_membros (id),
  updated_at timestamptz not null default now(),
  constraint vistoria_confirmacao_coerente check ((confirmada_em is null) = (confirmada_por is null))
);
create index vistorias_tecnicas_empresa_idx on public.vistorias_tecnicas (empresa_id);
alter table public.vistorias_tecnicas enable row level security;
create policy "ver vistoria do negocio" on public.vistorias_tecnicas
  for select to authenticated using (
    public.tem_acesso_comercial(empresa_id) and public.pode_ver_negocio(negocio_id)
  );
revoke insert, update, delete, truncate on public.vistorias_tecnicas from anon, authenticated, service_role;

create or replace function public.salvar_vistoria_tecnica(
  p_negocio_id uuid,
  p_visita_realizada boolean,
  p_medidor_inspecionado boolean,
  p_telhado_inspecionado boolean,
  p_observacoes text,
  p_confirmar boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_membro uuid;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found or v_negocio.tipo <> 'solar' or v_negocio.arquivado_em is not null then
    raise exception 'Negócio solar indisponível para vistoria' using errcode = 'check_violation';
  end if;
  v_membro := public.meu_membro_id(v_negocio.empresa_id);
  if v_membro is null or v_negocio.responsavel_id is distinct from v_membro
     or not public.tem_papel(v_negocio.empresa_id, '{vendedor}') then
    raise exception 'Só o vendedor responsável pode registrar a vistoria' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(p_observacoes, '')) > 3000 then
    raise exception 'Observações da vistoria excedem o limite' using errcode = 'check_violation';
  end if;
  if v_negocio.status = 'ganho' and not p_confirmar then
    raise exception 'A vistoria de uma venda ganha deve permanecer confirmada'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_confirmar then
    if not (coalesce(p_visita_realizada, false) and coalesce(p_medidor_inspecionado, false)
            and coalesce(p_telhado_inspecionado, false)) then
      raise exception 'Confirme a visita, o medidor e o telhado'
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- Serializa a exclusão de fotos com a confirmação desta vistoria.
    perform 1 from public.anexos a where a.negocio_id = p_negocio_id
      and a.categoria in ('vistoria_medidor', 'vistoria_telhado') for share;
    if not exists (
      select 1 from public.anexos a where a.empresa_id = v_negocio.empresa_id
        and a.negocio_id = p_negocio_id and a.categoria = 'vistoria_medidor'
        and a.tipo_mime like 'image/%'
    ) or not exists (
      select 1 from public.anexos a where a.empresa_id = v_negocio.empresa_id
        and a.negocio_id = p_negocio_id and a.categoria = 'vistoria_telhado'
        and a.tipo_mime like 'image/%'
    ) then
      raise exception 'Anexe fotos do medidor e do telhado antes de confirmar'
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  insert into public.vistorias_tecnicas (
    negocio_id, empresa_id, visita_realizada, medidor_inspecionado,
    telhado_inspecionado, observacoes, confirmada_em, confirmada_por
  ) values (
    p_negocio_id, v_negocio.empresa_id, coalesce(p_visita_realizada, false),
    coalesce(p_medidor_inspecionado, false), coalesce(p_telhado_inspecionado, false),
    coalesce(p_observacoes, ''), case when p_confirmar then now() end,
    case when p_confirmar then v_membro end
  ) on conflict (negocio_id) do update set
    visita_realizada = excluded.visita_realizada,
    medidor_inspecionado = excluded.medidor_inspecionado,
    telhado_inspecionado = excluded.telhado_inspecionado,
    observacoes = excluded.observacoes,
    confirmada_em = excluded.confirmada_em,
    confirmada_por = excluded.confirmada_por,
    updated_at = now();
end;
$$;
revoke all on function public.salvar_vistoria_tecnica(uuid, boolean, boolean, boolean, text, boolean)
  from public, anon, service_role;
grant execute on function public.salvar_vistoria_tecnica(uuid, boolean, boolean, boolean, text, boolean)
  to authenticated;

-- O cliente não pode apagar a última evidência de uma vistoria já confirmada.
create or replace function public.proteger_fotos_vistoria_confirmada()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.categoria in ('vistoria_medidor', 'vistoria_telhado')
     and exists (select 1 from public.vistorias_tecnicas v
                 where v.negocio_id = old.negocio_id and v.confirmada_em is not null)
     and not exists (select 1 from public.anexos a
                     where a.negocio_id = old.negocio_id and a.id <> old.id
                       and a.categoria = old.categoria and a.tipo_mime like 'image/%') then
    raise exception 'Mantenha ao menos uma foto de cada item da vistoria confirmada'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
revoke all on function public.proteger_fotos_vistoria_confirmada() from public, anon, authenticated, service_role;
create trigger anexos_proteger_fotos_vistoria before delete on public.anexos
  for each row execute function public.proteger_fotos_vistoria_confirmada();

-- Nome após os demais gatilhos BEFORE: verifica também o ganho automático da etapa.
create or replace function public.exigir_vistoria_para_ganho_solar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'solar' and new.status = 'ganho' and old.status is distinct from 'ganho'
     and not exists (select 1 from public.vistorias_tecnicas v
                     where v.negocio_id = new.id and v.empresa_id = new.empresa_id
                       and v.confirmada_em is not null) then
    raise exception 'Confirme a vistoria técnica com fotos antes de marcar a venda solar como ganha'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.exigir_vistoria_para_ganho_solar() from public, anon, authenticated, service_role;
create trigger zz_negocios_exigir_vistoria_solar before update on public.negocios
  for each row execute function public.exigir_vistoria_para_ganho_solar();
