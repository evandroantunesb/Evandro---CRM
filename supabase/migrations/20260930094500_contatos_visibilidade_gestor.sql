-- Contatos: gestor passa a ver a carteira inteira da empresa (como o admin já via),
-- não só os contatos ligados aos negócios da própria equipe. Vendedor continua vendo
-- só os que cadastrou ou que estão ligados a negócios que ele enxerga (pode_ver_responsavel
-- já cobre o caso de um negócio ser reatribuído a ele). Pedido do Evandro em 2026-09-30.
create or replace function public.pode_ver_contato_linha(p_empresa_id uuid, p_contato_id uuid, p_criado_por uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.membro_ativo(p_empresa_id)
    and (
      public.tem_papel(p_empresa_id, '{admin,gestor}')
      or p_criado_por = public.meu_membro_id(p_empresa_id)
      or exists (
        select 1 from public.negocios n
        where n.contato_id = p_contato_id
          and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id)
      )
    );
$$;

-- Exclusão de contato: além do admin, o gestor também pode excluir.
drop policy if exists "admin apaga contatos" on public.contatos;
create policy "gestor apaga contatos" on public.contatos for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'));
