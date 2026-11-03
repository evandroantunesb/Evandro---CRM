-- "Não se aplica" no checklist da Engenharia (resposta do engenheiro, 03/11/2026): qualquer engenheiro que atua na
-- Engenharia da obra marca um documento como "não se aplica", inclusive o obrigatório, sempre com motivo. Antes, só o
-- admin ou o coordenador da Engenharia dispensava item obrigatório.
--
-- alterar_item_engenharia(): idêntica à versão de 20261030100000_engenharia_checklist.sql, exceto que não recusa mais
-- o executor ao dispensar item obrigatório. Continuam: só quem escreve na Engenharia da obra (preparar_escrita_obra),
-- motivo obrigatório (3 a 500 caracteres) e o registro no histórico com quem marcou.
create or replace function public.alterar_item_engenharia(p_item_id uuid, p_status text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_item public.obra_engenharia_itens;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select obra_id into v_obra from public.obra_engenharia_itens where id = p_item_id;
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_item from public.obra_engenharia_itens where id = p_item_id for update;

  if p_status is null or p_status not in ('pendente', 'valido', 'invalido', 'dispensado') then
    raise exception 'Situação inválida para o item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_status in ('invalido', 'dispensado') then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if length(v_motivo) > 500 then
      raise exception 'Motivo muito longo (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  else
    v_motivo := null;
  end if;
  if p_status = 'valido' and not exists (select 1 from public.obra_engenharia_documentos d where d.item_id = v_item.id) then
    raise exception 'Anexe o arquivo antes de marcar o item como válido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_item.status = p_status and v_item.motivo is not distinct from v_motivo then
    return;
  end if;

  update public.obra_engenharia_itens
  set status = p_status, motivo = v_motivo, atualizado_por = public.meu_membro_id(v_item.empresa_id), atualizado_em = now()
  where id = v_item.id;

  perform public.registrar_historico_obra(v_item.obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
    'item', v_item.titulo,
    'de', v_item.status,
    'para', p_status,
    'motivo', v_motivo,
    'autorizacao', v_aut
  ));
end;
$$;

-- Internas: ninguém executa pela API.
revoke all on function public.proteger_engenharia_checklist_modelo() from public, anon, authenticated, service_role;
revoke all on function public.obra_da_pasta_engenharia(text) from public, anon, authenticated, service_role;
-- Usadas nas policies (tabela e Storage): só `authenticated`.
revoke all on function public.pode_ver_documentos_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_documentos_engenharia(uuid) to authenticated;
revoke all on function public.pode_ver_pasta_engenharia(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_engenharia(text) to authenticated;
revoke all on function public.pode_enviar_pasta_engenharia(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_engenharia(text) to authenticated;
-- RPCs de cliente.
revoke all on function public.aplicar_checklist_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.aplicar_checklist_engenharia(uuid) to authenticated;
revoke all on function public.registrar_documento_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_documento_engenharia(uuid, text, text) to authenticated;
revoke all on function public.alterar_item_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_item_engenharia(uuid, text, text) to authenticated;
