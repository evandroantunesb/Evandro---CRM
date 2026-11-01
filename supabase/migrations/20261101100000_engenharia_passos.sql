-- Engenharia em Obras (P6b): os oito passos guiados da obra (spec v1.3, seções 22, 23 e OB-06).
--
--  * Os passos 1, 4, 6 e 8 já têm fato registrado (responsável, checklist, protocolo, vistoria e conexão). Os passos
--    2 (enquadrar sistema), 3 (conferir dados técnicos), 5 (revisar para protocolo) e 7 (condições de conexão) não
--    tinham: `obra_engenharia_passo_registros` guarda a confirmação formal de cada um, com autor e data.
--  * Só inserção: nada se altera nem se apaga. O estado do passo é o registro mais recente. Ações: `confirmado`;
--    `reaberto` (com motivo); `nao_se_aplica` (com motivo, só no passo 7: aprovação sem orçamento, por exemplo).
--  * Quem registra: a mesma porta do checklist (`preparar_escrita_obra`): admin, coordenador da Engenharia ou
--    participante ativo da Engenharia na obra. Obra cancelada recusa; pausada aceita.
--  * Travas só da confirmação (seção 32.6): passo 5 exige o checklist apto (mesma conferência do gate G2); passo 7
--    exige protocolo aprovado, com orçamento emitido ou encerrado. Consultar e anexar nunca são bloqueados.
--  * "Revisão desatualizada" (OB-07) não é gravada: a tela compara a confirmação do passo 5 com as mudanças do checklist.
--  * Leitura: quem vê a obra (como o checklist). O histórico da obra registra o passo e a ação, sem a observação.
-- Decisões do Evandro em 31/10/2026 (opção A para os passos sem registro; D1 a D5 como propostos).
-- Depende de: 20261030100000_engenharia_checklist.sql, 20261030120000_engenharia_protocolos.sql,
-- 20261030140000_engenharia_vistoria.sql (lista de tipos do histórico).

set lock_timeout = '3s';

create table public.obra_engenharia_passo_registros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  passo smallint not null check (passo in (2, 3, 5, 7)),
  acao text not null check (acao in ('confirmado', 'reaberto', 'nao_se_aplica')),
  observacao text check (observacao is null or length(observacao) between 3 and 500),
  autor_membro_id uuid,
  created_at timestamptz not null default now(),
  constraint obra_engenharia_passo_registros_nao_se_aplica check (acao <> 'nao_se_aplica' or passo = 7),
  -- Reabrir e "não se aplica" sempre dizem por quê.
  constraint obra_engenharia_passo_registros_motivo check (acao = 'confirmado' or observacao is not null),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_passo_registros (obra_id, passo, created_at);

alter table public.obra_engenharia_passo_registros enable row level security;
create policy "ver passos da engenharia" on public.obra_engenharia_passo_registros for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
revoke all on public.obra_engenharia_passo_registros from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_passo_registros from authenticated, service_role;

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao',
  'passo_engenharia_registrado'
));

-- Confirma, reabre ou marca "não se aplica" um dos passos sem fato próprio. Trava a obra (preparar_escrita_obra), então
-- dois registros do mesmo passo nunca correm juntos.
create or replace function public.registrar_passo_engenharia(p_obra_id uuid, p_passo smallint, p_acao text, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_atual text;
  v_id uuid;
begin
  if p_passo is null or p_passo not in (2, 3, 5, 7) then
    raise exception 'Passo inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao is null or p_acao not in ('confirmado', 'reaberto', 'nao_se_aplica') then
    raise exception 'Ação inválida para o passo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao = 'nao_se_aplica' and p_passo <> 7 then
    raise exception 'Só as condições de conexão podem ser marcadas como "não se aplica".' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao in ('reaberto', 'nao_se_aplica') and (v_obs is null or length(v_obs) < 3) then
    raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obs is not null and length(v_obs) < 3 then
    raise exception 'Observação muito curta (mínimo 3 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(v_obs) > 500 then
    raise exception 'Observação muito longa (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  select acao into v_atual from public.obra_engenharia_passo_registros
  where obra_id = p_obra_id and passo = p_passo order by created_at desc, id desc limit 1;

  -- Reabrir só o que está fechado; "não se aplica" não se repete. Confirmar de novo é permitido: no passo 5 é a nova
  -- revisão depois de o checklist mudar.
  if p_acao = 'reaberto' and v_atual is distinct from 'confirmado' and v_atual is distinct from 'nao_se_aplica' then
    raise exception 'Este passo não está concluído.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao = 'nao_se_aplica' and v_atual = 'nao_se_aplica' then
    raise exception 'Este passo já está marcado como "não se aplica".' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Passo 5: mesma conferência do gate G2 (registrar_protocolo_engenharia).
  if p_passo = 5 and p_acao = 'confirmado' then
    if not exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id)
       or exists (
         select 1 from public.obra_engenharia_itens
         where obra_id = p_obra_id and obrigatorio and status not in ('valido', 'dispensado')
       ) then
      raise exception 'Aplique o checklist e resolva os itens obrigatórios antes de concluir a revisão.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;
  -- Passo 7: só depois da resposta da distribuidora.
  if p_passo = 7 and p_acao in ('confirmado', 'nao_se_aplica') and not exists (
    select 1 from public.obra_engenharia_protocolos
    where obra_id = p_obra_id and status in ('aprovado', 'orcamento_emitido', 'encerrado')
  ) then
    raise exception 'Registre a aprovação ou o orçamento da distribuidora no protocolo antes deste passo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_passo_registros (empresa_id, obra_id, passo, acao, observacao, autor_membro_id)
  values (v_empresa, p_obra_id, p_passo, p_acao, v_obs, public.meu_membro_id(v_empresa))
  returning id into v_id;

  perform public.registrar_historico_obra(p_obra_id, 'passo_engenharia_registrado', 'engenharia', jsonb_build_object(
    'passo', p_passo,
    'acao', p_acao,
    'autorizacao', v_aut
  ));
  return v_id;
end;
$$;

revoke all on function public.registrar_passo_engenharia(uuid, smallint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_passo_engenharia(uuid, smallint, text, text) to authenticated;
