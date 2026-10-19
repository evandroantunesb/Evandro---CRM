-- P1a-1 — Versões emitidas de proposta (2ª de 2 migrations em sequência)
-- Arquivo: supabase/migrations/20261019120000_proposta_versoes.sql (conteúdo SQL da proposta v7 do pacote P1-v10).
-- STATUS: ainda NÃO autorizada para produção e NÃO aplicada. Estar na `main` não a libera: a aplicação exige
-- PR própria da allowlist do workflow banco-producao.yml e autorização explícita do responsável.
-- EMISSÃO FECHADA: emitir_proposta_versao e reconstruir_proposta_legada ficam sem EXECUTE para todos os papéis da
-- aplicação até as etapas B + D serem liberadas; a estrutura, a leitura e o cancelamento existem, mas nenhuma versão nasce.
--
-- Pré-requisito: P1a-0 (arquivamento de negócio) aplicada E o fluxo de arquivamento em uso no app. A partir desta
-- migration, negócio, proposta e empresa com versão emitida não podem mais ser apagados; o caminho é arquivar.
-- A trava abaixo recusa aplicar esta migration sem a P1a-0.
--
-- O que faz:
--  * restrição única nova em `propostas (id, negocio_id, empresa_id)` para o vínculo composto da versão;
--  * tabela `proposta_versoes`: documento comercial congelado (lista explícita de campos), dados internos
--    de auditoria separados, texto canônico + SHA-256, autoria histórica sem FK, vínculos compostos;
--  * funções de emissão, cancelamento, reconstrução de legada (explícita e rotulada) e leitura pública por token.
-- O que NÃO faz: não altera, apaga nem recalcula nenhuma linha existente; propostas já emitidas continuam
-- como estão (caminho legado). Não cria bucket nem copia imagens (P1b). Não implementa eliminação de empresa.
-- Autorização: NENHUMA regra depende de pg_trigger_depth(). Exclusão é barrada por FK sem cascata + gatilho.
-- Depende de: P1a-0; #190/#191 (tem_acesso_financeiro, pode_ver_negocio, pode_ver_financeiro_negocio,
-- meu_membro_id, tem_papel e a restrição única negocios (id, empresa_id)).
-- Conteúdo: seções 2 a 5 da v4 (numeração dos comentários mantida para comparação), com o cabeçalho e a trava
-- de sequência da v5. Mudança da v6: enquanto os parâmetros econômicos não estiverem validados, o documento
-- público NÃO traz economia mensal, conta com solar nem payback (ficam nulos, com aviso ao cliente); os valores
-- calculados ficam só em `dados_internos` (auditoria). Mudança da v7: a conta sem solar também fica oculta, e os
-- valores internos são identificados como não validados (`situacao`).

set lock_timeout = '3s';

-- Trava de sequência: emitir e reconstruir conferem `negocios.arquivado_em`, e a exclusão bloqueada só é
-- aceitável com o arquivamento disponível.
do $$
begin
  if to_regprocedure('public.arquivar_negocio(uuid, text)') is null
     or to_regprocedure('public.desarquivar_negocio(uuid, text, uuid)') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'negocios' and column_name = 'arquivado_em') then
    raise exception 'Aplique antes a migration de arquivamento de negócio (P1a-0).';
  end if;
end;
$$;

-- ===========================================================================
-- 2. Tabela de versões
-- ===========================================================================

-- Alvo do vínculo composto versão → proposta (id já é PK; a restrição só permite a FK de 3 colunas).
alter table public.propostas add constraint propostas_id_negocio_empresa_key unique (id, negocio_id, empresa_id);

create table public.proposta_versoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  proposta_id uuid not null,
  negocio_id uuid not null,
  numero integer not null check (numero >= 1),
  -- Um link permanente por versão: o link enviado mostra sempre o que foi enviado.
  token text not null unique default gen_random_uuid()::text,
  schema_versao smallint not null default 1 check (schema_versao = 1),
  tipo text not null check (tipo in ('preliminar', 'definitiva')),
  -- 'legado_reconstruida' só nasce de ação explícita e é sempre rotulada no próprio documento.
  origem text not null check (origem in ('emitida', 'legado_reconstruida')),
  situacao text not null default 'vigente' check (situacao in ('vigente', 'substituida', 'cancelada')),

  -- Documento comercial: SÓ o que o cliente pode ver (lista explícita de campos, montada no banco).
  documento jsonb not null check (jsonb_typeof(documento) = 'object'),
  -- Dados internos de auditoria (parâmetros do cálculo, valor do negócio, ids e caminhos originais).
  -- Nunca saem pela leitura pública.
  dados_internos jsonb not null check (jsonb_typeof(dados_internos) = 'object'),
  -- Representação canônica: texto EXATO resumido no hash = {"documento": ..., "interno": ...} na saída
  -- `jsonb::text` do PostgreSQL (chaves ordenadas, sem duplicatas). Guardado para que uma verificação externa
  -- futura recalcule o hash sobre os mesmos bytes.
  conteudo_canonico text not null,
  canonicalizacao text not null default 'pg-jsonb-text-v1' check (canonicalizacao = 'pg-jsonb-text-v1'),
  hash_algoritmo text not null default 'sha256' check (hash_algoritmo = 'sha256'),
  conteudo_hash text not null check (conteudo_hash ~ '^[0-9a-f]{64}$'),

  -- Imagens (P1b). 'pendente' = existe imagem usada pelo documento que não foi preservada.
  recursos_status text not null check (recursos_status in ('nenhum_necessario', 'congelados', 'pendente')),
  emissao_id uuid,

  -- Autoria histórica SEM FK: o desligamento (status) e até a exclusão do membro ou do usuário não são
  -- bloqueados e não apagam a autoria. A consistência (membro da MESMA empresa) é conferida na gravação.
  emitida_por_membro_id uuid not null,
  emitida_por_user_id uuid not null,
  emitida_por_nome text,
  emitida_em timestamptz not null default now(),
  situacao_alterada_em timestamptz,
  situacao_alterada_por_membro_id uuid,
  motivo_cancelamento text,

  unique (proposta_id, numero),
  -- Vínculos compostos, todos SEM cascata (NO ACTION): versão, proposta, negócio e empresa sempre coerentes,
  -- e apagar empresa, negócio ou proposta com versão é recusado.
  foreign key (empresa_id) references public.empresas (id),
  foreign key (negocio_id, empresa_id) references public.negocios (id, empresa_id),
  foreign key (proposta_id, negocio_id, empresa_id) references public.propostas (id, negocio_id, empresa_id),

  constraint proposta_versoes_canonico_confere check (
    conteudo_canonico::jsonb ->> 'documento' is not null
    and conteudo_canonico::jsonb -> 'documento' = documento
    and conteudo_canonico::jsonb -> 'interno' = dados_internos
    and (conteudo_canonico::jsonb - 'documento' - 'interno') = '{}'::jsonb),
  constraint proposta_versoes_hash_confere check (conteudo_hash = encode(extensions.digest(conteudo_canonico, 'sha256'), 'hex')),
  -- Só a emissão com todas as imagens preservadas pode ser definitiva.
  check (tipo <> 'definitiva' or recursos_status in ('nenhum_necessario', 'congelados')),
  check (origem <> 'legado_reconstruida' or tipo = 'preliminar'),
  check (situacao <> 'cancelada' or length(btrim(coalesce(motivo_cancelamento, ''))) > 0),
  check ((situacao = 'vigente') = (situacao_alterada_em is null))
);
create unique index proposta_versoes_uma_vigente on public.proposta_versoes (proposta_id) where situacao = 'vigente';
create unique index proposta_versoes_emissao_unica on public.proposta_versoes (emissao_id) where emissao_id is not null;
create index on public.proposta_versoes (empresa_id, negocio_id);
create index on public.proposta_versoes (negocio_id, empresa_id);

-- ---------------------------------------------------------------------------
-- Gravação: autoria coerente e estado inicial (vale para QUALQUER papel, inclusive o dono)
-- ---------------------------------------------------------------------------
create or replace function public.proposta_versoes_validar_insercao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.empresa_membros m
                 where m.id = new.emitida_por_membro_id and m.empresa_id = new.empresa_id and m.user_id = new.emitida_por_user_id) then
    raise exception 'Autor da versão não é membro desta empresa.' using errcode = 'check_violation';
  end if;
  if new.situacao <> 'vigente' or new.situacao_alterada_por_membro_id is not null or new.motivo_cancelamento is not null then
    raise exception 'Versão nasce vigente.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.proposta_versoes_validar_insercao() from public, anon, authenticated, service_role;
create trigger proposta_versoes_validar_insercao
  before insert on public.proposta_versoes
  for each row execute function public.proposta_versoes_validar_insercao();

-- ---------------------------------------------------------------------------
-- Proteção do histórico. Vale para authenticated, service_role e o DONO da tabela enquanto os gatilhos
-- estiverem ligados. NÃO protege contra o dono (postgres, que roda migrations) desligar o gatilho com
-- ALTER TABLE, nem contra o superusuário real (supabase_admin): isso exige uma âncora externa do hash
-- (etapa posterior, antes da liberação definitiva com garantias reforçadas).
-- ---------------------------------------------------------------------------
create or replace function public.proteger_proposta_versao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Nenhum caminho comum apaga versão: as FKs não têm cascata e não há exceção por profundidade de gatilho.
    raise exception 'Versão de proposta emitida não pode ser apagada.' using errcode = 'check_violation';
  end if;

  if (new.id, new.empresa_id, new.proposta_id, new.negocio_id, new.numero, new.token, new.schema_versao, new.tipo,
      new.origem, new.documento, new.dados_internos, new.conteudo_canonico, new.canonicalizacao, new.hash_algoritmo,
      new.conteudo_hash, new.recursos_status, new.emissao_id, new.emitida_por_membro_id, new.emitida_por_user_id,
      new.emitida_por_nome, new.emitida_em)
     is distinct from
     (old.id, old.empresa_id, old.proposta_id, old.negocio_id, old.numero, old.token, old.schema_versao, old.tipo,
      old.origem, old.documento, old.dados_internos, old.conteudo_canonico, old.canonicalizacao, old.hash_algoritmo,
      old.conteudo_hash, old.recursos_status, old.emissao_id, old.emitida_por_membro_id, old.emitida_por_user_id,
      old.emitida_por_nome, old.emitida_em) then
    raise exception 'Versão de proposta emitida é imutável: só a situação pode mudar.' using errcode = 'check_violation';
  end if;

  if new.situacao is distinct from old.situacao then
    if not ((old.situacao = 'vigente' and new.situacao in ('substituida', 'cancelada'))
            or (old.situacao = 'substituida' and new.situacao = 'cancelada')) then
      raise exception 'Transição de situação não permitida (% -> %).', old.situacao, new.situacao using errcode = 'check_violation';
    end if;
    new.situacao_alterada_em := now();
  elsif (new.motivo_cancelamento, new.situacao_alterada_em, new.situacao_alterada_por_membro_id)
        is distinct from (old.motivo_cancelamento, old.situacao_alterada_em, old.situacao_alterada_por_membro_id) then
    raise exception 'Motivo, data e autor só mudam junto com a situação.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_proposta_versao() from public, anon, authenticated, service_role;
create trigger proposta_versoes_imutavel
  before update or delete on public.proposta_versoes
  for each row execute function public.proteger_proposta_versao();

-- TRUNCATE não dispara gatilho de linha: sem este, o dono esvaziaria a tabela com um comando.
create or replace function public.proteger_proposta_versao_truncate()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Versões de proposta emitidas não podem ser apagadas em massa.' using errcode = 'check_violation';
end;
$$;
revoke all on function public.proteger_proposta_versao_truncate() from public, anon, authenticated, service_role;
create trigger proposta_versoes_sem_truncate
  before truncate on public.proposta_versoes
  for each statement execute function public.proteger_proposta_versao_truncate();

-- ---------------------------------------------------------------------------
-- Acesso direto à tabela
-- ---------------------------------------------------------------------------
-- O Supabase concede tudo a anon, authenticated e service_role por padrão na criação; aqui é retirado.
-- anon e service_role: nenhum acesso. authenticated: só leitura, sob RLS (admin, gestor, vendedor da empresa).
-- O link público lê por `obter_proposta_versao_publica(token)`.
alter table public.proposta_versoes enable row level security;
revoke all on public.proposta_versoes from public, anon, authenticated, service_role;
grant select on public.proposta_versoes to authenticated;

create policy "ver versões de proposta" on public.proposta_versoes for select to authenticated
  using (public.pode_ver_financeiro_negocio(negocio_id));

-- ===========================================================================
-- 3. Funções internas (negadas a anon, authenticated e service_role; só as funções de emissão as usam)
-- ===========================================================================

-- Parâmetros econômicos (tarifa, Fio B e enquadramento) validados? Hoje sempre FALSO: não há validação real.
-- M2/M3 substituem esta função quando houver. Fonte única para as pendências e para o documento público.
create or replace function public.proposta_parametros_economicos_validados(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select false;
$$;
revoke all on function public.proposta_parametros_economicos_validados(uuid) from public, anon, authenticated, service_role;

-- Pendências para uma emissão DEFINITIVA. Hoje a lista nunca fica vazia (validações econômica e de
-- compatibilidade ainda não existem): M2/M3 removem cada item só quando houver validação real.
create or replace function public.proposta_pendencias_definitiva(p_negocio_id uuid)
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pendencias text[] := '{}';
begin
  if not exists (select 1 from public.calculos_solares where negocio_id = p_negocio_id) then
    v_pendencias := array_append(v_pendencias, 'cálculo da proposta ausente');
  end if;
  if not public.proposta_parametros_economicos_validados(p_negocio_id) then
    v_pendencias := array_append(v_pendencias, 'parâmetros econômicos (tarifa, Fio B e enquadramento) não validados');
  end if;
  v_pendencias := array_append(v_pendencias, 'compatibilidade técnica do kit não verificada');
  return v_pendencias;
end;
$$;
revoke all on function public.proposta_pendencias_definitiva(uuid) from public, anon, authenticated, service_role;

-- Monta {documento, interno} lendo as tabelas NO BANCO (o cliente nunca envia o conteúdo).
-- `documento` usa LISTA EXPLÍCITA de campos; colunas novas do cálculo NÃO entram sozinhas.
create or replace function public.proposta_montar_conteudo(
  p_negocio_id uuid, p_tipo text, p_numero integer, p_rotulo text
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_contato public.contatos;
  v_calculo public.calculos_solares;
  v_proposta public.propostas;
  v_identidade public.proposta_identidades;
  v_modelo_id uuid;
  v_capa public.proposta_modelo_capa;
  v_blocos jsonb;
  v_vendedor text;
  v_modo_preco text;
  v_tem_modelo boolean := false;
  -- Sem parâmetros econômicos validados, os resultados econômicos não saem no documento público.
  v_economia_validada boolean := public.proposta_parametros_economicos_validados(p_negocio_id);
begin
  select * into v_negocio from public.negocios where id = p_negocio_id;
  select * into v_contato from public.contatos where id = v_negocio.contato_id;
  select * into v_calculo from public.calculos_solares where negocio_id = p_negocio_id;
  select * into v_proposta from public.propostas where negocio_id = p_negocio_id;
  select * into v_identidade from public.proposta_identidades where empresa_id = v_negocio.empresa_id;
  select pf.nome into v_vendedor
    from public.empresa_membros m join public.perfis pf on pf.id = m.user_id
    where m.id = v_negocio.responsavel_id;
  v_modo_preco := coalesce(v_proposta.modo_preco::text, 'completo');

  -- Modelo: o escolhido na proposta ou o padrão publicado; sem modelo publicado, os blocos que a proposta
  -- já tinha congelado; sem nada disso, renderização simples. ESTA é a única fonte dos blocos do documento
  -- (as imagens exigidas são lidas do próprio documento, então não há como divergir).
  v_modelo_id := coalesce(v_proposta.modelo_id,
    (select id from public.proposta_modelos where empresa_id = v_negocio.empresa_id and status = 'publicado' and padrao limit 1));
  select m.capa_variante into v_capa
    from public.proposta_modelos m where m.id = v_modelo_id and m.empresa_id = v_negocio.empresa_id and m.status = 'publicado';
  if found then
    v_tem_modelo := true;
    select coalesce(jsonb_agg(jsonb_build_object('tipo', b.tipo, 'ordem', b.ordem, 'ativo', b.ativo,
                                                 'quebra_pagina', b.quebra_pagina, 'config', b.config) order by b.ordem), '[]'::jsonb)
      into v_blocos from public.proposta_modelo_blocos b where b.modelo_id = v_modelo_id;
  elsif v_proposta.blocos_emitidos is not null and v_proposta.capa_variante is not null then
    -- Blocos já congelados na proposta (modelo despublicado ou empresa sem modelo). Na v3 este ramo deixava
    -- `modelo` nulo no documento e as imagens desses blocos não eram exigidas (provado em teste).
    v_tem_modelo := true;
    v_modelo_id := null;
    v_capa := v_proposta.capa_variante;
    v_blocos := v_proposta.blocos_emitidos;
  else
    v_modelo_id := null;
  end if;

  return jsonb_build_object(
    'documento', jsonb_build_object(
      'cliente', jsonb_build_object('nome', v_contato.nome, 'endereco', v_contato.endereco,
                                    'cidade', v_contato.cidade, 'uf', v_contato.uf),
      'negocio', jsonb_build_object('titulo', v_negocio.titulo, 'numero', v_negocio.numero),
      -- Exatamente os campos que a página e o PDF usam hoje. Preço some do documento quando a exibição é "sem preço";
      -- conta sem solar, conta com solar, economia e payback somem enquanto os parâmetros econômicos não estiverem validados.
      'calculo', jsonb_build_object(
        'kit_nome', v_calculo.kit_nome,
        'kit_potencia_kwp', v_calculo.kit_potencia_kwp,
        'kit_preco', case when v_modo_preco = 'sem_preco' then null else v_calculo.kit_preco end,
        'tipo_ligacao', v_calculo.tipo_ligacao,
        'consumo_medio_kwh', v_calculo.consumo_medio_kwh,
        'geracao_estimada_kwh_mes', v_calculo.geracao_estimada_kwh_mes,
        'conta_sem_solar', case when v_economia_validada then v_calculo.conta_sem_solar end,
        'conta_com_solar', case when v_economia_validada then v_calculo.conta_com_solar end,
        'economia_mensal', case when v_economia_validada then v_calculo.economia_mensal end,
        'payback_meses', case when v_economia_validada then v_calculo.payback_meses end),
      'kit', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', k.tipo, 'descricao', k.descricao, 'potencia_w', k.potencia_w,
                                            'quantidade', k.quantidade) order by k.ordem, k.tipo, k.descricao)
        from public.kit_componentes k where k.negocio_id = p_negocio_id), '[]'::jsonb),
      'exibicao', jsonb_build_object('modo_preco', v_modo_preco,
                                     'mostrar_sistema', coalesce(v_proposta.mostrar_sistema, true),
                                     'mostrar_economia', coalesce(v_proposta.mostrar_economia, true)),
      'mensagem', v_proposta.mensagem,
      'modelo', case when v_tem_modelo then jsonb_build_object('capa_variante', v_capa, 'blocos', v_blocos) end,
      'identidade', jsonb_build_object(
        'nome_exibicao', v_identidade.nome_exibicao, 'cor_primaria', v_identidade.cor_primaria,
        'cor_destaque', v_identidade.cor_destaque, 'whatsapp', v_identidade.whatsapp, 'rodape_texto', v_identidade.rodape_texto),
      'vendedor', jsonb_build_object('nome', v_vendedor),
      'emissao', jsonb_build_object(
        'numero', p_numero, 'tipo', p_tipo, 'em', now(),
        'situacao_economica', case when p_tipo = 'definitiva' then 'definitiva' else 'preliminar' end,
        'pendencias', to_jsonb(public.proposta_pendencias_definitiva(p_negocio_id)),
        'resultados_economicos', case when v_economia_validada then 'validados' else 'pendentes' end,
        'aviso_economico', case when not v_economia_validada then
          'Estimativa preliminar: a conta de energia sem e com solar, a economia mensal e o retorno do investimento (payback) '
          || 'serão informados depois da validação dos parâmetros econômicos (tarifa, Fio B e enquadramento).' end,
        'rotulo', p_rotulo),
      'recursos', '[]'::jsonb),
    'interno', jsonb_build_object(
      'calculo_parametros', jsonb_build_object(
        'kit_preco', v_calculo.kit_preco, 'valor_fatura_medio', v_calculo.valor_fatura_medio,
        'tarifa_kwh', v_calculo.tarifa_kwh, 'produtividade_kwh_kwp_mes', v_calculo.produtividade_kwh_kwp_mes,
        'percentual_fio_b', v_calculo.percentual_fio_b, 'disponibilidade_kwh', v_calculo.disponibilidade_kwh,
        'kwh_faturado', v_calculo.kwh_faturado, 'kwh_compensado', v_calculo.kwh_compensado,
        'custo_fio_b', v_calculo.custo_fio_b),
      -- Resultados calculados, sempre guardados para auditoria (no documento só quando validados).
      'resultados_economicos', jsonb_build_object(
        'situacao', case when v_economia_validada then 'validados' else 'nao_validados' end,
        'conta_sem_solar', v_calculo.conta_sem_solar, 'conta_com_solar', v_calculo.conta_com_solar,
        'economia_mensal', v_calculo.economia_mensal, 'payback_meses', v_calculo.payback_meses),
      'calculo_atualizado_em', v_calculo.updated_at,
      'negocio_valor', v_negocio.valor,
      'modelo_id', v_modelo_id,
      'identidade_caminhos', jsonb_build_object('logo', v_identidade.logo_url, 'logo_escuro', v_identidade.logo_escuro_url,
                                                'foto_capa', v_identidade.foto_capa_url))
  );
end;
$$;
revoke all on function public.proposta_montar_conteudo(uuid, text, integer, text) from public, anon, authenticated, service_role;

-- Imagens que o documento USA, lidas do próprio par {documento, interno} (fonte única).
-- Identidade: logo, logo escuro e foto de capa cadastrados (conservador: congela todos os cadastrados).
-- Blocos: cada bloco ATIVO com imagem, identificado pela posição no documento ('bloco.<n>.imagem').
create or replace function public.proposta_recursos_do_conteudo(p_conteudo jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('origem', origem, 'caminho_original', caminho) order by origem), '[]'::jsonb)
  from (
    select 'identidade.' || c.chave as origem, c.valor as caminho
      from jsonb_each_text(coalesce(p_conteudo -> 'interno' -> 'identidade_caminhos', '{}'::jsonb)) c(chave, valor)
      where coalesce(c.valor, '') <> ''
    union all
    select 'bloco.' || b.posicao || '.imagem', b.bloco -> 'config' ->> 'imagemUrl'
      from jsonb_array_elements(coalesce(p_conteudo -> 'documento' -> 'modelo' -> 'blocos', '[]'::jsonb)) with ordinality b(bloco, posicao)
      where coalesce((b.bloco ->> 'ativo')::boolean, true) and coalesce(b.bloco -> 'config' ->> 'imagemUrl', '') <> ''
  ) x;
$$;
revoke all on function public.proposta_recursos_do_conteudo(jsonb) from public, anon, authenticated, service_role;

-- Confere os recursos informados pelo servidor (P1b) contra o que o documento usa e contra o Storage.
-- Regras: cada item corresponde a UMA imagem exigida (mesma origem E mesmo caminho original); sem
-- duplicatas; nada além do exigido; arquivo existe no bucket `proposta-emitidas` na pasta
-- <empresa>/<emissao>/; tipo png/jpeg/webp (SVG proibido); 1 byte a 10 MB. Tamanho, tipo e eTag vêm do Storage.
create or replace function public.proposta_validar_recursos(p_empresa_id uuid, p_emissao_id uuid, p_recursos jsonb, p_exigidos jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_objeto record;
  v_saida jsonb := '[]'::jsonb;
  v_prefixo text;
begin
  if p_recursos is null or jsonb_typeof(p_recursos) <> 'array' then
    raise exception 'Recursos da proposta inválidos.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_recursos) = 0 then
    return v_saida;
  end if;
  if p_emissao_id is null then
    raise exception 'Informe o identificador da emissão para preservar os recursos.' using errcode = 'check_violation';
  end if;
  if (select count(*) from jsonb_array_elements(p_recursos)) <> (select count(distinct r ->> 'origem') from jsonb_array_elements(p_recursos) r) then
    raise exception 'Recurso informado em duplicidade.' using errcode = 'check_violation';
  end if;
  v_prefixo := p_empresa_id::text || '/' || p_emissao_id::text || '/';

  for v_item in select * from jsonb_array_elements(p_recursos) loop
    if not exists (select 1 from jsonb_array_elements(p_exigidos) e
                   where e ->> 'origem' = v_item ->> 'origem' and e ->> 'caminho_original' = v_item ->> 'caminho_original') then
      raise exception 'Recurso não corresponde a nenhuma imagem usada pela proposta: %.', v_item ->> 'origem' using errcode = 'check_violation';
    end if;
    select o.name, (o.metadata ->> 'size')::bigint as bytes, lower(o.metadata ->> 'mimetype') as tipo_mime, o.metadata ->> 'eTag' as etag
      into v_objeto
      from storage.objects o
      where o.bucket_id = 'proposta-emitidas' and o.name = v_item ->> 'caminho_congelado'
        and left(o.name, length(v_prefixo)) = v_prefixo;
    if not found then
      raise exception 'Recurso não encontrado na pasta desta emissão: %.', v_item ->> 'origem' using errcode = 'check_violation';
    end if;
    if v_objeto.tipo_mime is null or v_objeto.tipo_mime not in ('image/png', 'image/jpeg', 'image/webp') then
      raise exception 'Tipo de arquivo não permitido para %: %.', v_item ->> 'origem', coalesce(v_objeto.tipo_mime, 'desconhecido') using errcode = 'check_violation';
    end if;
    if v_objeto.bytes is null or v_objeto.bytes < 1 or v_objeto.bytes > 10485760 then
      raise exception 'Tamanho de arquivo inválido para %.', v_item ->> 'origem' using errcode = 'check_violation';
    end if;
    v_saida := v_saida || jsonb_build_object(
      'origem', v_item ->> 'origem', 'caminho_congelado', v_objeto.name,
      'bytes', v_objeto.bytes, 'tipo_mime', v_objeto.tipo_mime, 'etag', v_objeto.etag);
  end loop;
  return v_saida;
end;
$$;
revoke all on function public.proposta_validar_recursos(uuid, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

-- Grava a versão (interna). Calcula texto canônico e hash sobre o par final {documento, interno}.
create or replace function public.proposta_gravar_versao(
  p_negocio public.negocios, p_proposta_id uuid, p_numero integer, p_tipo text, p_origem text,
  p_conteudo jsonb, p_recursos_status text, p_emissao_id uuid, p_membro_id uuid
)
returns public.proposta_versoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_canonico text := jsonb_build_object('documento', p_conteudo -> 'documento', 'interno', p_conteudo -> 'interno')::text;
  v_user uuid;
  v_nome text;
  v_versao public.proposta_versoes;
begin
  select m.user_id, pf.nome into v_user, v_nome
    from public.empresa_membros m left join public.perfis pf on pf.id = m.user_id
    where m.id = p_membro_id and m.empresa_id = p_negocio.empresa_id;
  insert into public.proposta_versoes
    (empresa_id, proposta_id, negocio_id, numero, tipo, origem, documento, dados_internos, conteudo_canonico, conteudo_hash,
     recursos_status, emissao_id, emitida_por_membro_id, emitida_por_user_id, emitida_por_nome)
  values
    (p_negocio.empresa_id, p_proposta_id, p_negocio.id, p_numero, p_tipo, p_origem, p_conteudo -> 'documento', p_conteudo -> 'interno',
     v_canonico, encode(extensions.digest(v_canonico, 'sha256'), 'hex'),
     p_recursos_status, p_emissao_id, p_membro_id, v_user, v_nome)
  returning * into v_versao;
  return v_versao;
end;
$$;
revoke all on function public.proposta_gravar_versao(public.negocios, uuid, integer, text, text, jsonb, text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 4. Funções expostas a usuários (cada uma confere papel E empresa do negócio)
-- ===========================================================================

create or replace function public.emitir_proposta_versao(
  p_negocio_id uuid, p_tipo text, p_emissao_id uuid default null, p_recursos jsonb default '[]'::jsonb
)
returns public.proposta_versoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_proposta public.propostas;
  v_membro uuid;
  v_numero integer;
  v_conteudo jsonb;
  v_exigidos jsonb;
  v_recursos jsonb;
  v_status text;
  v_pendencias text[];
begin
  if p_tipo not in ('preliminar', 'definitiva') then
    raise exception 'Tipo de emissão inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found or not public.tem_acesso_financeiro(v_negocio.empresa_id) or not public.pode_ver_negocio(v_negocio.id) then
    raise exception 'Você não pode emitir proposta deste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_negocio.arquivado_em is not null then
    raise exception 'Negócio arquivado: desarquive antes de emitir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (select 1 from public.calculos_solares where negocio_id = p_negocio_id) then
    raise exception 'Calcule o kit antes de emitir a proposta.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_membro := public.meu_membro_id(v_negocio.empresa_id);

  select * into v_proposta from public.propostas where negocio_id = p_negocio_id for update;
  if not found then
    insert into public.propostas (empresa_id, negocio_id, criado_por, atualizado_por)
      values (v_negocio.empresa_id, p_negocio_id, v_membro, v_membro)
      returning * into v_proposta;
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.proposta_versoes where proposta_id = v_proposta.id;

  -- Documento primeiro; as imagens exigidas saem DELE (mesma fonte), depois os recursos são conferidos.
  v_conteudo := public.proposta_montar_conteudo(p_negocio_id, p_tipo, v_numero, null);
  v_exigidos := public.proposta_recursos_do_conteudo(v_conteudo);
  v_recursos := public.proposta_validar_recursos(v_negocio.empresa_id, p_emissao_id, p_recursos, v_exigidos);
  v_status := case
    when jsonb_array_length(v_exigidos) = 0 then 'nenhum_necessario'
    when jsonb_array_length(v_recursos) = jsonb_array_length(v_exigidos) then 'congelados'
    else 'pendente' end;
  v_conteudo := jsonb_set(v_conteudo, '{documento,recursos}', v_recursos);

  if p_tipo = 'definitiva' then
    v_pendencias := public.proposta_pendencias_definitiva(p_negocio_id);
    if coalesce(array_length(v_pendencias, 1), 0) > 0 then
      raise exception 'Emissão definitiva indisponível: %.', array_to_string(v_pendencias, '; ')
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_status = 'pendente' then
      raise exception 'Emissão definitiva exige as imagens da proposta preservadas.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  -- A anterior deixa de ser a vigente na MESMA transação (índice parcial garante uma só vigente).
  update public.proposta_versoes set situacao = 'substituida', situacao_alterada_por_membro_id = v_membro
    where proposta_id = v_proposta.id and situacao = 'vigente';

  return public.proposta_gravar_versao(v_negocio, v_proposta.id, v_numero, p_tipo, 'emitida', v_conteudo, v_status, p_emissao_id, v_membro);
end;
$$;
-- EMISSÃO FECHADA: nenhum papel da aplicação executa (nem PUBLIC, anon, authenticated ou service_role) até as etapas
-- B + D (anonimização controlada e encerramento de tenant) serem implementadas e liberadas. Só o dono (postgres) executa.
-- O GRANT a authenticated volta na migration que liberar a emissão (ver docs/ADR-P1A-RETENCAO-E-ENCERRAMENTO-2026-10-19.md).
revoke all on function public.emitir_proposta_versao(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- Reconstrução de proposta legada: ação explícita, nunca automática. Usa os dados DE AGORA, sempre preliminar,
-- rotulada no documento. NÃO é cópia fiel do documento enviado originalmente.
create or replace function public.reconstruir_proposta_legada(p_negocio_id uuid)
returns public.proposta_versoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_proposta public.propostas;
  v_conteudo jsonb;
  v_rotulo text := 'Reconstruída em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    || ' com os dados disponíveis neste momento. Não é cópia fiel do documento enviado originalmente; os valores podem diferir do que o cliente viu.';
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found or not public.tem_acesso_financeiro(v_negocio.empresa_id) or not public.pode_ver_negocio(v_negocio.id) then
    raise exception 'Você não pode reconstruir a proposta deste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_negocio.arquivado_em is not null then
    raise exception 'Negócio arquivado: desarquive antes de reconstruir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_proposta from public.propostas where negocio_id = p_negocio_id for update;
  if not found then
    raise exception 'Este negócio não tem proposta legada para reconstruir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.proposta_versoes where proposta_id = v_proposta.id) then
    raise exception 'Esta proposta já tem versões emitidas.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (select 1 from public.calculos_solares where negocio_id = p_negocio_id) then
    raise exception 'Calcule o kit antes de reconstruir a proposta.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_conteudo := public.proposta_montar_conteudo(p_negocio_id, 'preliminar', 1, v_rotulo);
  return public.proposta_gravar_versao(v_negocio, v_proposta.id, 1, 'preliminar', 'legado_reconstruida', v_conteudo,
    case when jsonb_array_length(public.proposta_recursos_do_conteudo(v_conteudo)) = 0 then 'nenhum_necessario' else 'pendente' end,
    null, public.meu_membro_id(v_negocio.empresa_id));
end;
$$;
-- Fechada pelo mesmo motivo da emissão: reconstruir também cria versão imutável.
revoke all on function public.reconstruir_proposta_legada(uuid) from public, anon, authenticated, service_role;

-- Cancelamento: revoga o link sem tocar no documento; registra quem e por quê.
create or replace function public.cancelar_proposta_versao(p_versao_id uuid, p_motivo text)
returns public.proposta_versoes
language plpgsql security definer set search_path = ''
as $$
declare
  v_versao public.proposta_versoes;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_motivo is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_versao from public.proposta_versoes where id = p_versao_id for update;
  if not found or not public.tem_acesso_financeiro(v_versao.empresa_id) or not public.pode_ver_negocio(v_versao.negocio_id) then
    raise exception 'Versão não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_versao.situacao = 'cancelada' then
    raise exception 'Esta versão já está cancelada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.proposta_versoes
     set situacao = 'cancelada', motivo_cancelamento = v_motivo,
         situacao_alterada_por_membro_id = public.meu_membro_id(v_versao.empresa_id)
   where id = p_versao_id returning * into v_versao;
  return v_versao;
end;
$$;
revoke all on function public.cancelar_proposta_versao(uuid, text) from public, anon, service_role;
grant execute on function public.cancelar_proposta_versao(uuid, text) to authenticated;

-- Auditoria interna: recalcula o hash sobre o texto canônico guardado. Detecta corrupção e alteração parcial;
-- NÃO detecta quem reescreve documento, texto e hash juntos (ver documento técnico, seção 7).
create or replace function public.proposta_versao_hash_confere(p_versao_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select v.conteudo_hash = encode(extensions.digest(v.conteudo_canonico, 'sha256'), 'hex')
         and v.conteudo_canonico::jsonb = jsonb_build_object('documento', v.documento, 'interno', v.dados_internos)
  from public.proposta_versoes v
  where v.id = p_versao_id and public.pode_ver_financeiro_negocio(v.negocio_id);
$$;
revoke all on function public.proposta_versao_hash_confere(uuid) from public, anon, service_role;
grant execute on function public.proposta_versao_hash_confere(uuid) to authenticated;

-- ===========================================================================
-- 5. Leitura pública por token (página e PDF da versão; chamada só pelo servidor)
-- ===========================================================================
-- Devolve UMA versão, a do token; não lista nem lê sem o token. Nunca devolve `dados_internos`.
-- Versão cancelada: só a situação, sem documento. `existe_mais_recente` avisa sem revelar o link novo.
create or replace function public.obter_proposta_versao_publica(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'numero', v.numero, 'tipo', v.tipo, 'origem', v.origem, 'situacao', v.situacao, 'emitida_em', v.emitida_em,
    'recursos_status', v.recursos_status, 'conteudo_hash', v.conteudo_hash, 'empresa_id', v.empresa_id,
    'documento', case when v.situacao = 'cancelada' then null else v.documento end,
    'existe_mais_recente', exists (select 1 from public.proposta_versoes o
                                   where o.proposta_id = v.proposta_id and o.numero > v.numero and o.situacao <> 'cancelada'))
  from public.proposta_versoes v
  where v.token = p_token;
$$;
revoke all on function public.obter_proposta_versao_publica(text) from public, anon, authenticated;
grant execute on function public.obter_proposta_versao_publica(text) to service_role;

reset lock_timeout;

-- ---------------------------------------------------------------------------
-- FORA desta migration:
--  * P1b: bucket privado `proposta-emitidas` (allowed_mime_types png/jpeg/webp, limite 10 MB, sem policy
--    para authenticated/anon: só o servidor grava; ninguém apaga pela API); cópia das imagens no momento da
--    emissão; troca da URL externa do "layout da instalação" por upload privado; limitar tipos do bucket
--    `proposta-marca` (hoje aceita qualquer tipo).
--  * Âncora externa do hash; procedimento administrativo de eliminação de empresa.
-- ---------------------------------------------------------------------------
