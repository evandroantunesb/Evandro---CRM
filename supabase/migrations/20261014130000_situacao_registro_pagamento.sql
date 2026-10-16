-- Raion Solo — PR 2 (interface): por que o botão "Marcar como pago" está ou não disponível.
-- Issue #187, regra 5: se a empresa Solo tiver mais de um usuário ativo, a ficha avisa em vez
-- de esconder o botão em silêncio. O plano (`planos_empresa`) só é legível pelo super-admin,
-- então a interface pergunta ao banco — com a MESMA regra de `registrar_pagamento_negocio`.
--
-- Só leitura, sem nova permissão: devolve 'permitido', 'varios_usuarios' (plano Solo com mais
-- de um vínculo ativo) ou 'indisponivel' (Pro, sem acesso ao negócio ou quem pergunta não é
-- admin). Quem não é admin da empresa recebe sempre 'indisponivel': não descobre o plano.
-- A autorização real continua nas RPCs da PR 1.

create or replace function public.situacao_registro_pagamento(p_negocio_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when not (public.tem_papel(n.empresa_id, '{admin}') and public.pode_ver_negocio(n.id)) then 'indisponivel'
      when public.empresa_solo_autonoma(n.empresa_id) then 'permitido'
      when exists (select 1 from public.planos_empresa p where p.empresa_id = n.empresa_id and p.produto = 'solo') then 'varios_usuarios'
      else 'indisponivel'
    end
    from public.negocios n where n.id = p_negocio_id
  ), 'indisponivel');
$$;

revoke all on function public.situacao_registro_pagamento(uuid) from public, anon;
grant execute on function public.situacao_registro_pagamento(uuid) to authenticated;
