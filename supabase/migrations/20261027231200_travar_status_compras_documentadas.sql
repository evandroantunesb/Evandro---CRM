-- A tela antiga de status continua útil para obras anteriores. Quando uma obra já entrou
-- no fluxo documentado de Compras, ela não pode antecipar o pedido nem o faturamento.
create or replace function public.travar_status_compras_documentadas()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_orcamento public.obra_compras_documentos;
begin
  if new.setor <> 'compras' or new.status = old.status then
    return new;
  end if;
  select * into v_orcamento from public.obra_compras_documentos d
    where d.obra_id = new.obra_id and d.tipo = 'orcamento'
    order by d.versao desc limit 1;
  if not found then
    return new;
  end if;
  if new.status = 'pedido_realizado'
     and (v_orcamento.revisao <> 'aprovado' or not exists (
       select 1 from public.obra_compras_documentos p
       where p.tipo = 'pedido' and p.orcamento_id = v_orcamento.id
     )) then
    raise exception 'Anexe o pedido vinculado ao orçamento técnico aprovado antes de avançar Compras.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if new.status = 'faturado_fornecedor' then
    raise exception 'O faturamento será liberado após os comprovantes financeiros e a nota do fornecedor.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
revoke all on function public.travar_status_compras_documentadas() from public, anon, authenticated, service_role;
create trigger obra_fluxos_travar_compras_documentadas before update of status on public.obra_fluxos
  for each row execute function public.travar_status_compras_documentadas();
