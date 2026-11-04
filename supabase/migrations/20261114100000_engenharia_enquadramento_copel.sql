-- Enquadramento Copel (PR 1 de 3) — decisões do Evandro em 03 e 04/11/2026, a partir das respostas do engenheiro.
--
--  * Tipo de solicitação em lista única: além de nova conexão, ampliação e regularização (geração), entram troca de
--    titularidade, aumento de carga, ligação nova e cadastro de compensação.
--  * Perguntas novas, separadas do tipo: tensão (baixa, média, verificar) e zona (urbana, rural, verificar).
--  * Checklist padrão novo, com as condições de cada item (`condicoes`, mesma regra de 20261101120000). Vale para
--    empresas novas e substitui a lista genérica nas empresas que nunca editaram o modelo (o modelo é exatamente a
--    lista de 20261030100000): os itens que saem são desativados (nada é apagado; obras já aplicadas os mantêm), os
--    que continuam ganham grupo, ordem, obrigatoriedade e condição novos, e os novos entram. Quem editou mantém o seu.
--  * Obras com checklist aplicado não mudam aqui. Ao salvar o enquadramento depois, vale a regra de sempre
--    (reconciliar_checklist_engenharia): entram os itens ativos que passaram a valer.
--  * A ficha completa (passo 2) passa a incluir tensão e zona.
-- O canal (PEW ou site da Copel) é só informativo e calculado na tela.
-- Depende de: 20261030100000_engenharia_checklist.sql, 20261101120000_engenharia_enquadramento.sql.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Opções (só acréscimos: as respostas gravadas continuam válidas)
-- ---------------------------------------------------------------------------

create or replace function public.opcoes_enquadramento_engenharia()
returns jsonb
language sql immutable set search_path = ''
as $$
  select '{
    "tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao", "troca_titularidade", "aumento_carga", "ligacao_nova", "cadastro_compensacao", "outro"],
    "tensao": ["baixa", "media", "verificar"],
    "zona": ["urbana", "rural", "verificar"],
    "categoria": ["micro", "mini", "indefinida"],
    "faixa_formulario": ["ate_10kw", "de_10_a_75kw", "mini"],
    "tipo_instalacao": ["telhado", "solo", "outra"],
    "modalidade_scee": ["local", "remoto", "multiplas_ucs", "compartilhada", "outra"],
    "titularidade": ["pf", "pj", "terceiro_procuracao"],
    "obra_rede": ["sim", "nao", "desconhecido"],
    "inversor_verificado": ["sim", "nao", "verificar"],
    "situacao_ambiental": ["nao_aplicavel", "dispensa", "licenca", "verificar"]
  }'::jsonb;
$$;

-- ---------------------------------------------------------------------------
-- Ficha: tensão e zona
-- ---------------------------------------------------------------------------

alter table public.obra_engenharia_enquadramento
  add column tensao text,
  add column zona text;

alter table public.obra_engenharia_enquadramento drop constraint obra_engenharia_enquadramento_respostas;
alter table public.obra_engenharia_enquadramento add constraint obra_engenharia_enquadramento_respostas check (
  public.resposta_enquadramento_valida('tipo_solicitacao', tipo_solicitacao) and
  public.resposta_enquadramento_valida('tensao', tensao) and
  public.resposta_enquadramento_valida('zona', zona) and
  public.resposta_enquadramento_valida('categoria', categoria) and
  public.resposta_enquadramento_valida('faixa_formulario', faixa_formulario) and
  public.resposta_enquadramento_valida('tipo_instalacao', tipo_instalacao) and
  public.resposta_enquadramento_valida('modalidade_scee', modalidade_scee) and
  public.resposta_enquadramento_valida('titularidade', titularidade) and
  public.resposta_enquadramento_valida('obra_rede', obra_rede) and
  public.resposta_enquadramento_valida('inversor_verificado', inversor_verificado) and
  public.resposta_enquadramento_valida('situacao_ambiental', situacao_ambiental)
);

-- Igual à de 20261101120000, com tensão e zona.
create or replace function public.enquadramento_obra_json(p_obra_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'tipo_solicitacao', e.tipo_solicitacao, 'tensao', e.tensao, 'zona', e.zona, 'categoria', e.categoria,
    'faixa_formulario', e.faixa_formulario, 'tipo_instalacao', e.tipo_instalacao, 'modalidade_scee', e.modalidade_scee,
    'titularidade', e.titularidade, 'obra_rede', e.obra_rede, 'inversor_verificado', e.inversor_verificado,
    'situacao_ambiental', e.situacao_ambiental
  )
  from public.obra_engenharia_enquadramento e where e.obra_id = p_obra_id;
$$;

-- Igual à de 20261101120000, gravando também tensão e zona.
create or replace function public.salvar_enquadramento_engenharia(p_obra_id uuid, p_respostas jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_opcoes jsonb := public.opcoes_enquadramento_engenharia();
  v_empresa uuid;
  v_chave text;
  v_valor jsonb;
  v_just text;
  v_mod numeric;
  v_inv numeric;
  v_antes jsonb;
  v_depois jsonb;
  v_campos text[];
begin
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'Respostas inválidas.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  for v_chave, v_valor in select * from jsonb_each(p_respostas) loop
    if v_opcoes ? v_chave then
      if v_valor <> 'null'::jsonb and (jsonb_typeof(v_valor) <> 'string' or not (v_opcoes -> v_chave) ? (v_valor #>> '{}')) then
        raise exception 'Resposta inválida em "%".', v_chave using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif v_chave in ('potencia_modulos_kwp', 'potencia_inversores_kw') then
      if v_valor <> 'null'::jsonb and (jsonb_typeof(v_valor) <> 'number' or (v_valor #>> '{}')::numeric <= 0 or (v_valor #>> '{}')::numeric >= 10000000) then
        raise exception 'Potência inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif v_chave <> 'justificativa_ambiental' then
      raise exception 'Pergunta desconhecida: %.', v_chave using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end loop;

  v_just := nullif(btrim(coalesce(p_respostas ->> 'justificativa_ambiental', '')), '');
  if p_respostas ->> 'situacao_ambiental' = 'nao_aplicavel' then
    if v_just is null or length(v_just) < 3 then
      raise exception 'Explique por que a questão ambiental não se aplica.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if length(v_just) > 500 then
      raise exception 'Justificativa muito longa (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  else
    v_just := null;
  end if;
  v_mod := (p_respostas ->> 'potencia_modulos_kwp')::numeric;
  v_inv := (p_respostas ->> 'potencia_inversores_kw')::numeric;

  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  select to_jsonb(e) - 'atualizado_por' - 'atualizado_em' - 'created_at' into v_antes
  from public.obra_engenharia_enquadramento e where e.obra_id = p_obra_id;

  insert into public.obra_engenharia_enquadramento as e (
    obra_id, empresa_id, tipo_solicitacao, tensao, zona, categoria, faixa_formulario, tipo_instalacao, modalidade_scee,
    titularidade, obra_rede, inversor_verificado, situacao_ambiental, justificativa_ambiental, potencia_modulos_kwp,
    potencia_inversores_kw, atualizado_por, atualizado_em
  ) values (
    p_obra_id, v_empresa, p_respostas ->> 'tipo_solicitacao', p_respostas ->> 'tensao', p_respostas ->> 'zona',
    p_respostas ->> 'categoria', p_respostas ->> 'faixa_formulario', p_respostas ->> 'tipo_instalacao',
    p_respostas ->> 'modalidade_scee', p_respostas ->> 'titularidade', p_respostas ->> 'obra_rede',
    p_respostas ->> 'inversor_verificado', p_respostas ->> 'situacao_ambiental', v_just, v_mod, v_inv,
    public.meu_membro_id(v_empresa), now()
  )
  on conflict (obra_id) do update set
    tipo_solicitacao = excluded.tipo_solicitacao, tensao = excluded.tensao, zona = excluded.zona,
    categoria = excluded.categoria, faixa_formulario = excluded.faixa_formulario,
    tipo_instalacao = excluded.tipo_instalacao, modalidade_scee = excluded.modalidade_scee, titularidade = excluded.titularidade,
    obra_rede = excluded.obra_rede, inversor_verificado = excluded.inversor_verificado, situacao_ambiental = excluded.situacao_ambiental,
    justificativa_ambiental = excluded.justificativa_ambiental, potencia_modulos_kwp = excluded.potencia_modulos_kwp,
    potencia_inversores_kw = excluded.potencia_inversores_kw, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em
  -- Nada mudou: não grava nem toca a data (a revisão do passo 2 não fica desatualizada à toa).
  where (e.tipo_solicitacao, e.tensao, e.zona, e.categoria, e.faixa_formulario, e.tipo_instalacao, e.modalidade_scee,
         e.titularidade, e.obra_rede, e.inversor_verificado, e.situacao_ambiental, e.justificativa_ambiental,
         e.potencia_modulos_kwp, e.potencia_inversores_kw)
    is distinct from
        (excluded.tipo_solicitacao, excluded.tensao, excluded.zona, excluded.categoria, excluded.faixa_formulario,
         excluded.tipo_instalacao, excluded.modalidade_scee, excluded.titularidade, excluded.obra_rede,
         excluded.inversor_verificado, excluded.situacao_ambiental, excluded.justificativa_ambiental,
         excluded.potencia_modulos_kwp, excluded.potencia_inversores_kw);
  if not found then
    return;
  end if;

  select to_jsonb(e) - 'atualizado_por' - 'atualizado_em' - 'created_at' into v_depois
  from public.obra_engenharia_enquadramento e where e.obra_id = p_obra_id;
  select coalesce(array_agg(d.key order by d.key), '{}') into v_campos
  from jsonb_each(v_depois) d
  where d.key not in ('obra_id', 'empresa_id') and d.value is distinct from coalesce(v_antes -> d.key, 'null'::jsonb);

  -- Sem a justificativa nem os valores: só quais perguntas mudaram.
  perform public.registrar_historico_obra(p_obra_id, 'enquadramento_engenharia_salvo', 'engenharia',
    jsonb_build_object('campos', to_jsonb(v_campos), 'autorizacao', v_aut));
  perform public.reconciliar_checklist_engenharia(p_obra_id, v_aut);
end;
$$;

-- ---------------------------------------------------------------------------
-- Checklist padrão novo
-- ---------------------------------------------------------------------------

-- Lista padrão da Copel (decisões de 04/11/2026). Também restaura um item da lista que já exista com o mesmo título
-- (grupo, ordem, obrigatoriedade, condição, descrição e ativo); só é chamada para empresa nova e, nesta migration,
-- para as empresas que nunca editaram o modelo.
create or replace function public.inserir_checklist_engenharia_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.engenharia_checklist_modelo (empresa_id, grupo, titulo, descricao, obrigatorio, ordem, condicoes)
  select p_empresa_id, i.grupo, i.titulo, i.descricao, i.obrigatorio, i.ordem, i.condicoes::jsonb
  from (values
    ('Cliente e titular', 'E-mail e celular do cliente', null, true, 10, '{}'),
    ('Cliente e titular', 'Documento com foto do titular, legível, com CPF', null, true, 20, '{}'),
    ('Cliente e titular', 'Fatura recente da unidade consumidora', null, true, 30, '{}'),
    ('Cliente e titular', 'Cartão CNPJ', null, true, 40, '{"titularidade": ["pj"]}'),
    ('Cliente e titular', 'QSA (quadro de sócios e administradores)', null, true, 50, '{"titularidade": ["pj"]}'),
    ('Cliente e titular', 'IPTU do imóvel', null, false, 60, '{"titularidade": ["pj"]}'),
    ('Cliente e titular', 'Procuração no modelo da Engenharia, com os documentos do cliente',
      'Poderes explícitos para representar o titular técnica e comercialmente perante a Copel, solicitar acesso, alterar carga e assinar contratos e documentos de micro ou minigeração. Identificar o endereço exato ou o número da UC. Sem assinatura gov.br ouro ou prata, reconhecer a firma em cartório.',
      true, 70, '{}'),
    ('Instalação e equipamentos', 'Localização da instalação', null, true, 80,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Instalação e equipamentos', 'Inversor: potência, modelo e marca', 'Na ampliação, os novos e os existentes.', true, 90,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Instalação e equipamentos', 'Painéis: potência, modelo e marca', 'Na ampliação, os novos e os existentes.', true, 100,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Projeto e Copel', 'ART (TRT) de projeto e execução', null, true, 110, '{}'),
    ('Projeto e Copel', 'DCA (declaração de carga)', null, true, 120, '{"tipo_solicitacao": ["aumento_carga", "ligacao_nova"]}'),
    ('Projeto e Copel', 'Diagrama unifilar', null, false, 130, '{}'),
    ('Projeto e Copel', 'Fatura ou faturas das unidades cadastradas', null, true, 140,
      '{"tipo_solicitacao": ["cadastro_compensacao"]}'),
    ('Produzido pela Engenharia', 'Formulário de solicitação de acesso (faixa de potência correta)', null, true, 150,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Memorial descritivo', null, true, 160,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Datasheet dos módulos', null, true, 170,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Datasheet e certificado do inversor', null, true, 180,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Licença ambiental ou justificativa de não aplicabilidade', null, false, 190,
      '{"situacao_ambiental": ["licenca", "dispensa"]}'),
    ('Produzido pela Engenharia', 'Formulário de beneficiárias (autoconsumo remoto ou geração compartilhada)', null, true, 200,
      '{"modalidade_scee": ["remoto", "multiplas_ucs", "compartilhada"]}')
  ) as i (grupo, titulo, descricao, obrigatorio, ordem, condicoes)
  on conflict (empresa_id, lower(btrim(titulo))) do update set
    grupo = excluded.grupo, descricao = excluded.descricao, obrigatorio = excluded.obrigatorio,
    ordem = excluded.ordem, condicoes = excluded.condicoes, ativo = true;
$$;
revoke all on function public.inserir_checklist_engenharia_padrao(uuid) from public, anon, authenticated, service_role;

-- Empresas que nunca editaram o modelo: ele é exatamente a lista de 20261030100000 (11 itens, ativos, sem descrição
-- nem condição, com o mesmo grupo, título, obrigatoriedade e ordem).
create temporary table modelo_inalterado on commit drop as
with antigo (grupo, titulo, obrigatorio, ordem) as (values
  ('Cliente e unidade consumidora', 'Fatura recente da unidade consumidora', true, 10),
  ('Cliente e unidade consumidora', 'Documento de identificação do titular (pessoa física ou jurídica)', true, 20),
  ('Cliente e unidade consumidora', 'Procuração e documento do procurador (quando houver representante)', false, 30),
  ('Projeto e responsabilidade técnica', 'Formulário de solicitação de acesso (faixa de potência correta)', true, 40),
  ('Projeto e responsabilidade técnica', 'ART de projeto e execução', true, 50),
  ('Projeto e responsabilidade técnica', 'Diagrama unifilar', true, 60),
  ('Projeto e responsabilidade técnica', 'Memorial descritivo', true, 70),
  ('Equipamentos', 'Datasheet dos módulos', true, 80),
  ('Equipamentos', 'Datasheet e certificado do inversor', true, 90),
  ('Condicionais', 'Licença ambiental ou justificativa de não aplicabilidade', false, 100),
  ('Condicionais', 'Formulário de beneficiárias (autoconsumo remoto ou geração compartilhada)', false, 110)
)
select m.empresa_id
from public.engenharia_checklist_modelo m
group by m.empresa_id
having count(*) = (select count(*) from antigo)
   and count(*) filter (where m.ativo and m.descricao is null and m.condicoes = '{}'::jsonb and exists (
     select 1 from antigo a where a.grupo = m.grupo and a.titulo = m.titulo and a.obrigatorio = m.obrigatorio and a.ordem = m.ordem
   )) = (select count(*) from antigo);

-- Saem da lista (desativados; obras já aplicadas mantêm a cópia).
update public.engenharia_checklist_modelo
set ativo = false
where empresa_id in (select empresa_id from modelo_inalterado)
  and titulo in (
    'Documento de identificação do titular (pessoa física ou jurídica)',
    'Procuração e documento do procurador (quando houver representante)',
    'ART de projeto e execução'
  );

select public.inserir_checklist_engenharia_padrao(empresa_id) from modelo_inalterado;

reset lock_timeout;
