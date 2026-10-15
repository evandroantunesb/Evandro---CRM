-- Contratos e confirmações de pagamento do Pro fora do alcance do SDR, no banco (revisão do
-- Evandro em 2026-10-14). Vulnerabilidade preexistente na main:
--   - o SDR que via o negócio criava contrato, editava o conteúdo, marcava "assinado" (com evento
--     `contrato.assinado` e gatilhos de Obra) e apagava o que tinha criado, direto pela API — a
--     regra "SDR não gera contrato" só existia na interface (`PROPOSTA_E_CONTRATO`);
--   - lia o conteúdo dos contratos e as confirmações de pagamento (quem confirmou, beneficiário,
--     motivo do estorno), também pela linha do tempo (atividades `pagamento_*`).
--
-- Regra nova: contrato, confirmação e atividade de pagamento exigem papel admin, gestor ou
-- vendedor NA EMPRESA DO NEGÓCIO, além de ver o negócio. O papel é conferido pelo negócio (não
-- pelo `empresa_id` da linha, que em `contratos` vem do cliente): quem é SDR na empresa do negócio
-- e vendedor em outra não passa informando o `empresa_id` da outra.
--
-- Só autorização (RLS). Nenhum dado é alterado. RPCs e gatilhos `security definer`
-- (confirmar/estornar pagamento, gamificação, bônus do SDR por handoff, Obra) não passam pela RLS
-- e não mudam. Policies SUBSTITUÍDAS (drop + create): permissivas se combinam por OR.
--
-- Compatibilidade com a PR #189 (empilhada sobre o Solo): `tem_acesso_financeiro` e a policy
-- "ver atividades" são idênticas às de lá; reaplicadas, não mudam nada.

-- Papel com acesso a dados financeiros na empresa (mesma lista de PROPOSTA_E_CONTRATO).
create or replace function public.tem_acesso_financeiro(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_papel(p_empresa_id, '{admin,gestor,vendedor}');
$$;

revoke all on function public.tem_acesso_financeiro(uuid) from public, anon;
grant execute on function public.tem_acesso_financeiro(uuid) to authenticated;

-- Vê o negócio E tem papel financeiro na empresa DO NEGÓCIO.
create or replace function public.pode_ver_financeiro_negocio(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.pode_ver_negocio(n.id) and public.tem_acesso_financeiro(n.empresa_id)
    from public.negocios n where n.id = p_negocio_id
  ), false);
$$;

revoke all on function public.pode_ver_financeiro_negocio(uuid) from public, anon;
grant execute on function public.pode_ver_financeiro_negocio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- contratos: leitura e escrita
-- ---------------------------------------------------------------------------

drop policy "ver contrato" on public.contratos;
create policy "ver contrato" on public.contratos for select to authenticated
  using (public.pode_ver_financeiro_negocio(negocio_id));

drop policy "criar contrato" on public.contratos;
create policy "criar contrato" on public.contratos for insert to authenticated
  with check (public.tem_acesso_comercial(empresa_id) and public.pode_ver_financeiro_negocio(negocio_id));

drop policy "editar contrato" on public.contratos;
create policy "editar contrato" on public.contratos for update to authenticated
  using (public.pode_ver_financeiro_negocio(negocio_id)) with check (public.pode_ver_financeiro_negocio(negocio_id));

drop policy "apagar contrato" on public.contratos;
create policy "apagar contrato" on public.contratos for delete to authenticated
  using (
    public.pode_ver_financeiro_negocio(negocio_id)
    and (criado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'))
  );

-- ---------------------------------------------------------------------------
-- confirmacoes_pagamento: leitura (escrita já é só pelas RPCs)
-- ---------------------------------------------------------------------------

drop policy "ver confirmacoes de pagamento" on public.confirmacoes_pagamento;
create policy "ver confirmacoes de pagamento" on public.confirmacoes_pagamento for select to authenticated
  using (public.pode_ver_financeiro_negocio(negocio_id));

-- ---------------------------------------------------------------------------
-- atividades: mesma regra de antes, exceto as de pagamento (linha inteira, com `dados`)
-- ---------------------------------------------------------------------------

-- Na main: pagamento_confirmado e pagamento_estornado (com o motivo). O prefixo cobre também os
-- tipos do Solo. `empresa_id` das atividades é gravado só por RPC/gatilho, então é confiável aqui.
drop policy "ver atividades" on public.atividades;
create policy "ver atividades" on public.atividades for select to authenticated
  using (
    (
      (negocio_id is not null and exists (select 1 from public.negocios n where n.id = atividades.negocio_id))
      or (negocio_id is null and contato_id is not null and public.pode_ver_contato(contato_id))
    )
    and (tipo not like 'pagamento\_%' or public.tem_acesso_financeiro(empresa_id))
  );
