-- Integridade de `contratos` na escrita direta pela API (reforço da PR #190, revisão do Evandro
-- em 2026-10-15). A #190 tirou o SDR de contratos; esta migration fecha o que o papel financeiro
-- (admin, gestor, vendedor) ainda conseguia gravar por fora do fluxo da interface:
--
--   1. `empresa_id` diferente da empresa real do negócio, no INSERT, e troca de `empresa_id` ou
--      `negocio_id` depois da criação (inclusive de contrato já assinado). Não havia FK composta
--      nem gatilho; `confirmar_pagamento` confere papel e autoconfirmação pelo `empresa_id` da linha.
--   2. INSERT já com status `assinado`: pulava o gatilho que congela o responsável da assinatura e o
--      `trg_registrar_contrato` (evento `contrato.assinado`, Obra), que só rodam no UPDATE.
--   3. INSERT informando `responsavel_assinatura_id` e `perfil_assinatura`: o UPDATE dessas colunas
--      já era revogado, o INSERT não. O gatilho de assinatura faz `coalesce(old..., responsavel do
--      negócio)`, então o valor forjado era mantido: o gestor dono do negócio apontava um colega
--      como beneficiário, assinava, confirmava o PRÓPRIO pagamento (a trava de autoconfirmação só
--      compara com o beneficiário) e creditava pontos ao colega. Reproduzido localmente na `main`.
--
-- Só autorização e integridade. Nenhum dado é alterado ou apagado. Quem restringe é o papel de API
-- (`authenticated`/`anon`): `service_role`, o dono do banco e as funções `security definer`
-- (RPCs, gamificação, Obra, seeds) continuam como antes — para eles vale só a FK composta.
--
-- A FK composta nasce NOT VALID: vale para toda linha nova ou alterada, mas não varre as existentes,
-- então a migration não falha se produção tiver divergência antiga. Rode a auditoria SELECT
-- (docs/auditorias/contratos-empresa-divergente.sql) e, com zero divergências, valide em migration
-- própria (`alter table ... validate constraint contratos_negocio_empresa_fk`).

-- ---------------------------------------------------------------------------
-- FK composta (negocio_id, empresa_id) -> negocios (id, empresa_id)
-- ---------------------------------------------------------------------------

-- `id` já é chave primária; a unicidade do par existe só para servir de alvo da FK composta.
alter table public.negocios add constraint negocios_id_empresa_id_key unique (id, empresa_id);

alter table public.contratos
  add constraint contratos_negocio_empresa_fk
  foreign key (negocio_id, empresa_id) references public.negocios (id, empresa_id) on delete cascade
  not valid;

-- ---------------------------------------------------------------------------
-- Gatilho: o que o cliente da API não pode gravar
-- ---------------------------------------------------------------------------

-- INVOKER de propósito: `current_user` precisa ser o papel da requisição (PostgREST faz
-- SET ROLE authenticated). Em RPC `security definer`, `current_user` é o dono e a restrição de API
-- não se aplica — esse é o caminho legítimo para escrever o que o cliente não pode.
create or replace function public.proteger_integridade_contrato()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_empresa uuid;
  v_api boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    -- Qualquer papel: o contrato é da empresa do negócio. (Se a RLS do chamador esconde o negócio,
    -- não há linha aqui e a FK composta recusa do mesmo jeito.)
    select empresa_id into v_empresa from public.negocios where id = new.negocio_id;
    if v_empresa is not null and v_empresa is distinct from new.empresa_id then
      -- Para o papel de API é falta de permissão (42501, o mesmo código da RLS que este gatilho
      -- antecede); para os demais, violação de integridade.
      raise exception 'A empresa do contrato precisa ser a empresa do negócio.'
        using errcode = case when v_api then 'insufficient_privilege' else 'check_violation' end;
    end if;

    if v_api then
      -- A assinatura nasce do UPDATE de status, que congela o responsável e emite os eventos.
      if new.status = 'assinado' then
        raise exception 'Contrato não pode ser criado já assinado: crie como rascunho e atualize o status.' using errcode = 'check_violation';
      end if;
      if new.responsavel_assinatura_id is not null or new.perfil_assinatura is not null then
        raise exception 'Responsável e perfil da assinatura são definidos pelo banco na assinatura.' using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: o contrato não muda de empresa nem de negócio pela API. Só vale se a chave mudou — um
  -- contrato antigo com divergência continua podendo mudar de status ou de texto.
  if v_api and (new.empresa_id is distinct from old.empresa_id or new.negocio_id is distinct from old.negocio_id) then
    raise exception 'Contrato não pode trocar de empresa nem de negócio.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_integridade_contrato() from public, anon, authenticated;

create trigger contratos_integridade
  before insert or update on public.contratos
  for each row execute function public.proteger_integridade_contrato();

-- ---------------------------------------------------------------------------
-- INSERT: autorização financeira explícita (a #190 mantinha tem_acesso_comercial na empresa_id)
-- ---------------------------------------------------------------------------

drop policy "criar contrato" on public.contratos;
create policy "criar contrato" on public.contratos for insert to authenticated
  with check (public.tem_acesso_financeiro(empresa_id) and public.pode_ver_financeiro_negocio(negocio_id));
