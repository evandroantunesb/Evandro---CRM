-- Onboarding, subprojeto 2: marca e cores da empresa no app (desenho em
-- docs/superpowers/specs/2026-11-10-marca-cores-design.md; decisões do Evandro de 10/11/2026).
--
-- O que faz:
--  * `marca_da_empresa`: as cores e as logos da identidade da proposta (`proposta_identidades`) para qualquer membro
--    ativo da empresa, inclusive quem não tem acesso comercial, para o app mostrar a marca a todos. O resto da
--    identidade (WhatsApp, rodapé, capa) continua só para o comercial.
-- Nenhuma tabela, política ou função existente é alterada. A logo é lida pela política existente "marca: ler".

/** Cores e logos da empresa para quem é membro ativo dela; nenhuma linha para os demais. */
create or replace function public.marca_da_empresa(p_empresa_id uuid)
returns table (cor_primaria text, cor_destaque text, logo_url text, logo_escuro_url text)
language sql stable security definer set search_path = ''
as $$
  select pi.cor_primaria, pi.cor_destaque, pi.logo_url, pi.logo_escuro_url
  from public.proposta_identidades pi
  where pi.empresa_id = p_empresa_id
    and public.meu_membro_id(p_empresa_id) is not null;
$$;
revoke all on function public.marca_da_empresa(uuid) from public, anon;
grant execute on function public.marca_da_empresa(uuid) to authenticated;
