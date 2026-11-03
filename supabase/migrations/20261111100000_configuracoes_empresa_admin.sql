-- Configurações da empresa pelo admin (defeito confirmado em 03/11/2026).
--
-- Configurações › Funis e etapas (dias para considerar parado, horas sem contato) e Configurações › Origens (modo de
-- distribuição dos leads e percentual do SDR) gravavam com UPDATE direto em `empresas`, mas a RLS de `empresas` só deixa
-- o super-admin alterar (fundação): para o admin, o UPDATE não dava erro e não mudava nenhuma linha, e a tela dizia
-- "Salvo.". Liberar UPDATE em `empresas` para o admin abriria também nome, CNPJ, situação de cobrança e eletroposto, que
-- são do super-admin. Por isso uma função: o admin ativo da empresa muda só estas quatro colunas, e só da própria empresa.
-- Parâmetro nulo = não muda. Os limites continuam nos `check` das colunas.

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
  if not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Só o admin altera as configurações da empresa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  update public.empresas set
    dias_considerado_parado = coalesce(p_dias_considerado_parado::smallint, dias_considerado_parado),
    horas_considerado_sem_contato = coalesce(p_horas_considerado_sem_contato::smallint, horas_considerado_sem_contato),
    modo_distribuicao_leads = coalesce(p_modo_distribuicao_leads, modo_distribuicao_leads),
    percentual_leads_sdr = coalesce(p_percentual_leads_sdr::smallint, percentual_leads_sdr)
  where id = p_empresa_id;
end;
$$;
revoke all on function public.salvar_configuracoes_empresa(uuid, integer, integer, public.modo_distribuicao_leads, integer) from public, anon;
grant execute on function public.salvar_configuracoes_empresa(uuid, integer, integer, public.modo_distribuicao_leads, integer) to authenticated;
