-- Prazos pela Operação e funil pelo gestor (etapas D e E dos Perfis e setores).
--
-- Decisões do Evandro (05/11/2026):
--  D. Prazos
--   * Prazos das etapas da obra (`obra_prazos_etapas`): o coordenador de cada setor edita os das etapas do setor
--     (Engenharia: projeto, homologação, vistoria, conexão; Compras: compra, entrega do material; Operacional:
--     instalação). Admin e gestor continuam editando todos.
--   * Entrega contratada padrão (`obra_prazos_etapas.entrega_contratada`) e o ajuste da entrega contratada de cada
--     obra (`ajustar_entrega_contratada_obra`): também o coordenador do Operacional.
--   * Prazos da Engenharia (`engenharia_prazos`, internos e da distribuidora): também o coordenador da Engenharia.
--   * O gestor coordena todos os setores desde 20261122100000: entra em todos estes, inclusive nos prazos da
--     Engenharia (antes só do admin).
--  E. Funil: o gestor faz tudo o que o admin faz em Configurações › Funil (funis, etapas e as regras de parado e sem
--     contato da empresa). Modo de distribuição dos leads e percentual do SDR (Configurações › Origens) seguem do admin.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Quem coordena um setor da empresa (interno)
-- ---------------------------------------------------------------------------

-- Admin e gestor coordenam todos os setores; `operacao` só os que tem com capacidade 'coordenar'.
create or replace function public.coordena_setor(p_empresa_id uuid, p_setor public.setor_obra)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    p_setor is not null and p_setor <> 'comercial' and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or (
        public.tem_papel(p_empresa_id, '{operacao}')
        and exists (
          select 1 from public.membro_setores_obra s
          where s.empresa_id = p_empresa_id and s.membro_id = public.meu_membro_id(p_empresa_id)
            and s.setor = p_setor and s.capacidade = 'coordenar'
        )
      )
    ),
    false
  );
$$;
revoke all on function public.coordena_setor(uuid, public.setor_obra) from public, anon, authenticated, service_role;
grant execute on function public.coordena_setor(uuid, public.setor_obra) to authenticated;

-- Setor dono de cada prazo de `obra_prazos_etapas` (a entrega contratada é do Operacional).
create or replace function public.setor_prazo_obra(p_chave text)
returns public.setor_obra
language sql immutable set search_path = ''
as $$
  select case p_chave
    when 'projeto' then 'engenharia'
    when 'homologacao' then 'engenharia'
    when 'vistoria' then 'engenharia'
    when 'conexao' then 'engenharia'
    when 'compra' then 'compras'
    when 'entrega_material' then 'compras'
    when 'instalacao' then 'operacional'
    when 'entrega_contratada' then 'operacional'
  end::public.setor_obra;
$$;
revoke all on function public.setor_prazo_obra(text) from public, anon, authenticated, service_role;
grant execute on function public.setor_prazo_obra(text) to authenticated;

-- ---------------------------------------------------------------------------
-- D. Prazos
-- ---------------------------------------------------------------------------

drop policy "admin e gestor editam prazos das etapas" on public.obra_prazos_etapas;
create policy "quem coordena o setor edita os prazos das etapas" on public.obra_prazos_etapas for update to authenticated
  using (public.coordena_setor(empresa_id, public.setor_prazo_obra(chave)))
  with check (public.coordena_setor(empresa_id, public.setor_prazo_obra(chave)));

drop policy "admin edita prazo da engenharia" on public.engenharia_prazos;
create policy "quem coordena a engenharia edita os prazos" on public.engenharia_prazos for update to authenticated
  using (public.coordena_setor(empresa_id, 'engenharia'))
  with check (public.coordena_setor(empresa_id, 'engenharia'));

-- Corpo de 20261104100000 + o coordenador do Operacional (admin e gestor já entravam).
create or replace function public.ajustar_entrega_contratada_obra(p_obra_id uuid, p_data date, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  select * into v_obra from public.obras where id = p_obra_id for update;
  if not found or not public.coordena_setor(v_obra.empresa_id, 'operacional') then
    raise exception 'Só o coordenador do Operacional, o gestor ou o admin ajusta a entrega contratada.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data is null then
    raise exception 'Informe a nova data de entrega.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'Explique o motivo do ajuste (de 3 a 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data = v_obra.entrega_contratada then
    return;
  end if;

  update public.obras set entrega_contratada = p_data where id = p_obra_id;
  perform public.registrar_historico_obra(p_obra_id, 'entrega_contratada_ajustada', null, jsonb_build_object(
    'de', v_obra.entrega_contratada, 'para', p_data, 'motivo', v_motivo
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- E. Funil pelo gestor
-- ---------------------------------------------------------------------------

drop policy "admin cria funis" on public.funis;
create policy "admin e gestor criam funis" on public.funis for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
drop policy "admin edita funis" on public.funis;
create policy "admin e gestor editam funis" on public.funis for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));

drop policy "admin cria etapas" on public.etapas;
create policy "admin e gestor criam etapas" on public.etapas for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
drop policy "admin edita etapas" on public.etapas;
create policy "admin e gestor editam etapas" on public.etapas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));

-- Corpo de 20261111100000: o gestor muda as duas regras do funil (parado, sem contato); distribuição dos leads e
-- percentual do SDR (Origens) continuam só do admin.
create or replace function public.salvar_configuracoes_empresa(
  p_empresa_id uuid,
  p_dias_considerado_parado integer default null,
  p_horas_considerado_sem_contato integer default null,
  p_modo_distribuicao_leads public.modo_distribuicao_leads default null,
  p_percentual_leads_sdr integer default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (
    public.tem_papel(p_empresa_id, '{admin}')
    or (
      public.tem_papel(p_empresa_id, '{gestor}')
      and p_modo_distribuicao_leads is null and p_percentual_leads_sdr is null
    )
  ) then
    raise exception 'Só o admin altera estas configurações da empresa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  update public.empresas set
    dias_considerado_parado = coalesce(p_dias_considerado_parado::smallint, dias_considerado_parado),
    horas_considerado_sem_contato = coalesce(p_horas_considerado_sem_contato::smallint, horas_considerado_sem_contato),
    modo_distribuicao_leads = coalesce(p_modo_distribuicao_leads, modo_distribuicao_leads),
    percentual_leads_sdr = coalesce(p_percentual_leads_sdr::smallint, percentual_leads_sdr)
  where id = p_empresa_id;
end;
$$;

reset lock_timeout;
