-- Leitura de dados financeiros fora do alcance do SDR (bloqueante para produção, revisão do Evandro
-- em 2026-10-14 sobre a PR #188).
--
-- Antes: `registros_pagamento` e as atividades de pagamento eram legíveis por qualquer pessoa que
-- visse o negócio (`pode_ver_negocio`), inclusive o SDR — pela API e pela linha do tempo da ficha
-- (data do recebimento, observação, motivo de estorno/correção).
--
-- Agora a leitura exige, além do acesso ao negócio, papel comercial com acesso a contrato e
-- pagamento: admin, gestor ou vendedor (mesma lista de `PROPOSTA_E_CONTRATO` na interface).
--
-- Só muda AUTORIZAÇÃO DE LEITURA. Nenhum dado é alterado ou apagado; inserts continuam só pelas
-- RPCs `security definer` (que não passam pela RLS), então registro, confirmação, estorno,
-- correção, gamificação e Obra não mudam.
--
-- As policies antigas são SUBSTITUÍDAS (drop + create), não complementadas: policies permissivas
-- se combinam por OR, então somar outra permissiva não restringiria nada.
-- `contratos` e `confirmacoes_pagamento` ficam como estão nesta migration (análise à parte).

-- Papel com acesso a dados financeiros na empresa. Reaproveitável se contratos/confirmações
-- entrarem na mesma regra.
create or replace function public.tem_acesso_financeiro(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_papel(p_empresa_id, '{admin,gestor,vendedor}');
$$;

revoke all on function public.tem_acesso_financeiro(uuid) from public, anon;
grant execute on function public.tem_acesso_financeiro(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- registros_pagamento: única policy de leitura
-- ---------------------------------------------------------------------------

drop policy "ver registros de pagamento" on public.registros_pagamento;
create policy "ver registros de pagamento" on public.registros_pagamento for select to authenticated
  using (public.pode_ver_negocio(negocio_id) and public.tem_acesso_financeiro(empresa_id));

-- ---------------------------------------------------------------------------
-- atividades: mesma regra de antes, exceto as de pagamento (linha inteira, com `dados`)
-- ---------------------------------------------------------------------------

-- Tipos financeiros gravados hoje: pagamento_confirmado, pagamento_estornado (Pro) e
-- pagamento_registrado, pagamento_registro_estornado, pagamento_registro_corrigido (Solo).
-- O prefixo cobre todos e os que vierem com o mesmo nome.
drop policy "ver atividades" on public.atividades;
create policy "ver atividades" on public.atividades for select to authenticated
  using (
    (
      (negocio_id is not null and exists (select 1 from public.negocios n where n.id = atividades.negocio_id))
      or (negocio_id is null and contato_id is not null and public.pode_ver_contato(contato_id))
    )
    and (tipo not like 'pagamento\_%' or public.tem_acesso_financeiro(empresa_id))
  );
