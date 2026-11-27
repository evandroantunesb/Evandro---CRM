# Concessionárias, entrega 3: checklist, prazos e canais por concessionária — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada concessionária da empresa tem o próprio checklist de documentos, os próprios prazos da distribuidora e os próprios canais de entrada; o admin cria concessionárias (cópia da Copel ou vazia), e a obra usa os da sua concessionária.

**Architecture:** uma migration liga `engenharia_checklist_modelo` a uma concessionária, tira os prazos da distribuidora de `engenharia_prazos` para `concessionaria_prazos`, cria `concessionaria_canais` (com a regra do PEW da Copel como cadastro) e as RPCs de criar concessionária e de trocar a concessionária da obra com a regra 7. O servidor troca `canalCopel` por `canalSugerido(canais, respostas)`, e as telas seguem a prévia aprovada.

**Tech Stack:** Postgres/Supabase (migrations, RLS, plpgsql `security definer`), Next.js 16 App Router, React 19, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-concessionarias-design.md` (entrega 3 e "Decisões de 26/11/2026"). Prévia aprovada: https://claude.ai/artifact/BFk2a57EMctEpmB9FLbKwe

## Global Constraints

- Migration única: `supabase/migrations/20261224100000_concessionarias_configuracao.sql` (nenhuma branch ou PR usa prefixo igual ou maior). As Tasks 1 e 2 escrevem seções dela, nessa ordem.
- Para quem só atende a Copel nada muda: mesmos itens aplicados às obras, mesmos prazos e vencimentos, mesmo canal sugerido.
- Checklist já aplicado a uma obra só muda pela regra 7 (troca de concessionária sem nada enviado).
- Toda tabela nova: `empresa_id` + FK composta `(empresa_id, concessionaria_id) → concessionarias (empresa_id, id)` + RLS; sem `delete` nem `truncate` para `anon`/`authenticated`; `security definer` sempre com `set search_path = ''`; função nova sem `EXECUTE` para `anon`.
- Ao recriar uma função, partir da última definição dela nas migrations (achar com um script que percorre `supabase/migrations/*.sql` em ordem e guarda a última `create ... function public.<nome>`), mudando só o que a tarefa diz.
- Mensagens ao usuário em português com `hint = 'mensagem_usuario'`.
- Atualizar juntos `MIGRATIONS_AUTORIZADAS` (`.github/workflows/banco-producao.yml`) e `AUTORIZADAS` (`tests/validar-conjunto-migrations.test.ts`) para só `20261224100000_concessionarias_configuracao.sql` (a `20261223100000` já está em produção).
- `database.types.ts` só por `pnpm db:types`. Telas reutilizam `src/components/ui.tsx`; mobile primeiro.
- Prazos da distribuidora por concessionária: `distribuidora_analise`, `distribuidora_analise_rural`, `distribuidora_vistoria`, `distribuidora_conexao` (`CHAVES_PRAZO_DISTRIBUIDORA`). `distribuidora_obra_rede` continua vindo da obra.

## Review Focus

- Empresa criada depois da migration: precisa ter a Copel com checklist, prazos e canais (os gatilhos de `empresas` rodam em ordem alfabética: `empresas_checklist_engenharia` vem antes de `empresas_concessionaria_copel`). Teste na Task 1.
- Prazos de uma Copel que a empresa já tinha editado (ex.: análise 20 corridos) são copiados como estão, não pelos valores padrão. Teste na Task 1.
- Papel `operacao` (coordenador da Engenharia) não lê `obras`: `prazos_engenharia` roda como quem chama e precisa achar a concessionária da obra sem ler a tabela. Teste na Task 1 chamando a função como o coordenador.
- Item dispensado pelo próprio enquadramento ("Fora do enquadramento") não conta como envio; um "não se aplica" marcado à mão conta. Teste na Task 2.
- Protocolo registrado com `p_canal: "pew"` (testes antigos e `e2e/base-ficticia.ts`) continua funcionando: o nome do canal casa sem diferenciar maiúsculas. Teste na Task 2.

---

### Task 1: Banco — checklist e prazos da distribuidora por concessionária

**Files:**
- Create: `supabase/migrations/20261224100000_concessionarias_configuracao.sql`
- Test: `tests/concessionarias-config-db.test.ts` (cenário próprio, sufixo, padrão de `tests/concessionarias-db.test.ts`)
- Modify: `.github/workflows/banco-producao.yml`, `tests/validar-conjunto-migrations.test.ts`; regenerate `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces (SQL):
  - `engenharia_checklist_modelo.concessionaria_id uuid not null` (carga: a Copel da empresa), FK composta; os índices únicos `engenharia_checklist_modelo_titulo_unico`, `_documento_cliente` e `_gera_procuracao` passam de `empresa_id` para `concessionaria_id` (mesmas expressões e filtros de hoje); `proteger_engenharia_checklist_modelo` também recusa trocar `concessionaria_id`; `marcar_documento_cliente_modelo` procura o "já existe" na mesma concessionária.
  - `inserir_checklist_engenharia_padrao(p_empresa_id uuid)`: chama `inserir_concessionaria_copel(p_empresa_id)` antes, grava na Copel, `on conflict` pelo índice novo.
  - `aplicar_checklist_engenharia` e `reconciliar_checklist_engenharia`: só itens com `m.concessionaria_id = obra.concessionaria_id` (obra sem concessionária: reconciliar não traz nada).
  - Tabela `concessionaria_prazos (empresa_id, concessionaria_id, chave text check (chave in os 4 da distribuidora), dias_uteis integer null check (1..365), contagem text not null default 'uteis' check (in ('uteis','corridos')), updated_at, primary key (concessionaria_id, chave))`; `tocar_updated_at`; `auditar`. RLS: select `membro_ativo(empresa_id)`; update com a mesma expressão da policy "quem coordena a engenharia edita os prazos" de `engenharia_prazos` (20261124100000); `grant update (dias_uteis, contagem)` a `authenticated`; sem insert pela API.
  - Carga: para cada empresa, as 4 chaves de `engenharia_prazos` vão para a Copel dela com os valores atuais; depois são apagadas de `engenharia_prazos`, cujo `check` de `chave` passa a aceitar só as internas (`art`, `a_iniciar`, `projeto_em_elaboracao`, `exigencia`, `correcao_campo`); `inserir_prazos_engenharia_padrao` deixa de inserir as da distribuidora.
  - `inserir_concessionaria_copel(p_empresa_id)` passa a inserir também os prazos padrão da Copel (`distribuidora_analise` 15 corridos, `_rural` 30 corridos, `_vistoria` 7 úteis, `_conexao` nulo úteis), `on conflict do nothing`.
  - `concessionaria_da_obra(p_obra_id uuid) returns uuid` (`stable security definer`): a concessionária da obra se quem chama é membro ativo da empresa dela; senão nulo. Execute para `authenticated`.
  - `prazos_engenharia(p_empresa_id)`: mesma saída; prazos internos por `engenharia_prazos` como hoje; os da distribuidora pela linha de `concessionaria_prazos` da `concessionaria_da_obra(obra_id)` (obra sem concessionária: sem prazo da distribuidora).
- Produces (TS): `ConfigPrazo` continua; `carregarConfigPrazos(supabase, empresaId)` passa a devolver só as internas; nova `carregarPrazosConcessionaria(supabase, { empresaId, concessionariaId }): Promise<ConfigPrazo[]>` em `src/lib/engenharia-prazos.ts`.

- [ ] **Step 1: Testes que falham**, cada um num `it`: (a) obra de empresa só com a Copel recebe exatamente os títulos ativos do modelo da Copel que valem no enquadramento (comparar com o modelo, sem número fixo); (b) item do modelo da Cemig não entra em obra da Copel e entra em obra da Cemig (Cemig criada por `insert` direto com o serviço, com um item no modelo dela); (c) empresa criada depois tem a Copel com os itens de `inserir_checklist_engenharia_padrao` no modelo (ex.: "Memorial descritivo"), os 4 prazos padrão e nenhuma chave da distribuidora em `engenharia_prazos`; (d) `prazos_engenharia` dá, para uma obra protocolada na Copel, `limite = protocolado_em + 15 dias corridos` e, chamado pelo coordenador (papel `operacao`), o mesmo resultado; com a Copel editada para 20 corridos, o limite muda; obra sem concessionária não tem `distribuidora_analise`; (e) coordenador edita `concessionaria_prazos` da própria empresa; vendedor e admin de outra empresa não; (f) o modelo não troca de concessionária (`update` recusado).
- [ ] **Step 2:** `pnpm vitest run tests/concessionarias-config-db.test.ts` → falha.
- [ ] **Step 3:** Escrever a seção 1 da migration; `pnpm db:reset`.
- [ ] **Step 4:** `pnpm vitest run tests/concessionarias-config-db.test.ts tests/concessionarias-db.test.ts tests/engenharia-checklist-db.test.ts tests/engenharia-enquadramento-db.test.ts tests/engenharia-prazos-db.test.ts tests/procuracao*-db.test.ts tests/documentos-cliente*-db.test.ts` → passa (ajustar só testes que leem prazos da distribuidora em `engenharia_prazos`).
- [ ] **Step 5:** `carregarConfigPrazos` só internas e `carregarPrazosConcessionaria`; `pnpm db:types`; listas autorizadas; `pnpm typecheck`; `pnpm vitest run tests/validar-conjunto-migrations.test.ts`.
- [ ] **Step 6:** Commit `feat(banco): checklist e prazos da distribuidora por concessionária`.

### Task 2: Banco — canais, nova concessionária, protocolo e troca com a regra 7

**Files:**
- Modify: `supabase/migrations/20261224100000_concessionarias_configuracao.sql` (seção 2)
- Test: `tests/concessionarias-config-db.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces (SQL):
  - Tabela `concessionaria_canais (id uuid pk, empresa_id, concessionaria_id, nome text 1..60 após btrim, ordem integer not null default 0, ativo boolean not null default true, tipos text[] not null default '{}' (cada um em `TIPOS_SOLICITACAO` menos `outro`), tensoes text[] not null default '{}' (cada um em `baixa`, `media`), created_at, updated_at)`, `unique (concessionaria_id, lower(btrim(nome)))`; RLS select `membro_ativo`; insert e update `tem_papel(empresa_id, '{admin}')`; proteger troca de empresa e de concessionária; `auditar`. `tensoes` vale só para `ligacao_nova` e `aumento_carga`.
  - Carga da Copel (empresas atuais e, por `inserir_concessionaria_copel`, as novas): `PEW` (10; tipos `nova_conexao, ampliacao, regularizacao, ligacao_nova, aumento_carga`; tensões `baixa`), `Site da Copel` (20; `troca_titularidade, cadastro_compensacao, ligacao_nova, aumento_carga`; `media`), `CAW` (30; vazio), `Atendimento comercial` (40; vazio).
  - `proteger_concessionaria` também recusa trocar `distribuidora`.
  - `criar_concessionaria(p_empresa_id uuid, p_nome text, p_distribuidora text, p_copiar_de uuid default null) returns uuid`: só `tem_papel(p_empresa_id, '{admin}')` (senão "Só o admin cria concessionária."). Recusa sigla que não existe em `tarifas_gd_aneel` ("Distribuidora não encontrada.") e sigla ou nome já cadastrados na empresa ("Esta distribuidora já tem concessionária na empresa." / "Já existe uma concessionária com esse nome."). Com `p_copiar_de` (mesma empresa; senão "Concessionária não encontrada."): copia os itens ativos do modelo (grupo, título, descrição, obrigatório, ordem, condições, `documento_cliente`, `gera_procuracao`), os 4 prazos e os canais. Sem: os 4 prazos com `dias_uteis` nulo e nada mais.
  - `checklist_engenharia_enviado(p_obra_id uuid) returns boolean` (`stable security definer`, execute para `authenticated`, nulo para quem não é membro): existe protocolo na obra, ou item com status diferente de `pendente` que não seja `dispensado` com `pelo_enquadramento` e `motivo = 'Fora do enquadramento'`, ou item com documento em `obra_engenharia_documentos`.
  - `definir_concessionaria_obra` (versão de 20261223100000): quando a obra tem itens e `not checklist_engenharia_enviado`, apaga os itens e aplica o modelo da nova concessionária (mesma consulta de `aplicar_checklist_engenharia`, sem o histórico próprio); `dados` do histórico ganha `checklist_trocado boolean`.
  - `registrar_protocolo_engenharia` (última versão): a coluna `canal` perde o `check` dos 4 códigos e ganha `check (length(btrim(canal)) between 1 and 60)`; `p_canal` vale `outro` (qualquer caixa → grava `outro`) ou o nome de um canal ativo da concessionária da obra, sem diferenciar maiúsculas (grava o nome cadastrado); senão "Escolha um canal da concessionária da obra.".
  - `obras_sem_concessionaria_por_distribuidora(p_empresa_id uuid) returns table (distribuidora text, obras integer)`: só admin da empresa; obras com `concessionaria_id` nulo, não canceladas, agrupadas pela sigla ANEEL cujo `nomes_aceitos` contém `normalizar_nome_distribuidora(negocios.qualif_distribuidora)` (o negócio da obra).

- [ ] **Step 1: Testes que falham:** (a) canais da Copel com os 4 nomes, ordens, tipos e tensões acima; (b) `criar_concessionaria` cópia da Copel: mesmos títulos do modelo, mesmos prazos (inclusive um editado), mesmos canais; vazia: 0 itens, 0 canais, 4 prazos nulos; vendedor e admin de outra empresa recusados; sigla inexistente e repetida recusadas; (c) regra 7: obra da Copel com checklist só pendente troca para a Cemig e passa a ter os itens da Cemig, histórico com `checklist_trocado: true`; obra com um item marcado `dispensado` à mão mantém os itens (`false`); obra com item dispensado pelo enquadramento ainda troca; (d) protocolo com `p_canal: "pew"` grava `PEW`; com `"Outro"` grava `outro`; com `"Fax"` recusa; (e) `obras_sem_concessionaria_por_distribuidora` conta uma obra de negócio "Cemig" sem concessionária como `CEMIG-D: 1`.
- [ ] **Step 2:** rodar → falha. **Step 3:** seção 2 da migration; `pnpm db:reset`.
- [ ] **Step 4:** `pnpm vitest run tests/concessionarias-config-db.test.ts tests/concessionarias-db.test.ts tests/engenharia-protocolos-db.test.ts tests/engenharia-obra-rede-db.test.ts tests/engenharia-passos-db.test.ts tests/engenharia-vistoria-db.test.ts tests/engenharia-prazos-db.test.ts` → passa; `pnpm db:types`; `pnpm typecheck`.
- [ ] **Step 5:** Commit `feat(banco): canais, nova concessionária e troca do checklist por concessionária`.

### Task 3: Servidor — canal sugerido, leituras e ações

**Files:**
- Modify: `src/lib/engenharia-enquadramento-regras.ts` (troca `canalCopel` por `canalSugerido`), `src/lib/engenharia-protocolos-regras.ts`, `src/lib/obras/historico.ts`, `src/lib/engenharia-concessionaria.ts`, `src/lib/acoes/engenharia.ts`, `src/app/(app)/configuracoes/engenharia/actions.ts`
- Test: `tests/engenharia-enquadramento-regras.test.ts`, `tests/concessionarias-config-db.test.ts` (ações), `tests/concessionaria-historico.test.ts`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces:
  - `type CanalConcessionaria = { id: string; nome: string; ordem: number; ativo: boolean; tipos: string[]; tensoes: string[] }`.
  - `canalSugerido(canais: readonly CanalConcessionaria[], respostas: RespostasEnquadramento | null): CanalConcessionaria | null` (puro): ativos, por `ordem`; ignora os de `tipos` vazio; vale se o tipo respondido está em `tipos` e, quando o tipo é `ligacao_nova` ou `aumento_carga` e `tensoes` não é vazio, a tensão respondida está em `tensoes`; sem tipo ou `outro`: nulo.
  - `rotuloCanal(canal: string): string`: `ROTULO_CANAL` para os códigos antigos (`pew`, `caw`, `atendimento`, `outro`), senão o próprio nome. `CANAIS_PROTOCOLO` sai; a ação do protocolo valida `canal` como texto 1..60.
  - `carregarCanais(supabase, { empresaId, concessionariaId }): Promise<CanalConcessionaria[]>` e `carregarConcessionarias` passa a devolver também `distribuidora` (sigla) em `src/lib/engenharia-concessionaria.ts`; `checklistEnviado(supabase, obraId): Promise<boolean>` (RPC).
  - Ações (todas `ResultadoAcao`): `criarConcessionaria` (admin; `nome`, `distribuidora`, `base: "copel" | "vazia"`), `renomearConcessionaria` (admin; `id`, `nome`), `salvarCanal` (admin; `id?`, `concessionariaId`, `nome`, `ordem`, `ativo`, `tipos[]`, `tensoes[]`), `salvarPrazosConcessionaria` (`PRAZOS_OBRA`; mesma validação de `salvarPrazos`, mais `concessionariaId`); `criarItemModelo` recebe `concessionariaId`.
- [ ] **Step 1: Testes que falham:** `canalSugerido` com os canais da Copel dá exatamente os resultados que os testes atuais de `canalCopel` esperam (mesmos casos, `"pew"`→`PEW`, `"site"`→`Site da Copel`, nulos iguais); `rotuloCanal("pew")` = "PEW (portal da Copel)", `rotuloCanal("Site da Copel")` = "Site da Copel"; histórico com `checklist_trocado: true` mostra "Copel → Cemig, checklist trocado"; ação `criarConcessionaria` cria a Cemig como cópia; `salvarCanal` recusa tipo fora da lista.
- [ ] **Step 2:** rodar → falha. **Step 3:** implementar. **Step 4:** rodar → passa; `pnpm typecheck`; `pnpm lint`.
- [ ] **Step 5:** Commit `feat(engenharia): canais e configuração por concessionária no servidor`.

### Task 4: Telas — Configurações › Engenharia e obra (conforme a prévia)

**Files:**
- Create: `src/app/(app)/configuracoes/engenharia/concessionarias.tsx` (faixa, nova concessionária, renomear), `src/app/(app)/configuracoes/engenharia/canais.tsx`
- Modify: `src/app/(app)/configuracoes/engenharia/page.tsx` (`searchParams.c` = concessionária escolhida, padrão a Copel ou a primeira por nome; checklist, prazos da distribuidora e canais dela; "Para a empresa toda" com prazos internos, feriados e marcos; gestor e coordenador veem a faixa e os prazos), `prazos.tsx`, `formularios.tsx`; `src/components/engenharia/concessionaria.tsx` (aviso da regra 7 no seletor, por `checklistEnviado`), `checklist.tsx` (aviso "Checklist da concessionária anterior (Copel)." quando os itens vêm de outra concessionária), `enquadramento.tsx` (canal sugerido pela concessionária; some sem sugestão), `protocolos.tsx` (select com os canais ativos da concessionária, o sugerido primeiro, mais "Outro"; `rotuloCanal` na exibição); `src/app/(app)/engenharia/[id]/page.tsx`
- Test: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

**Interfaces:**
- Consumes: Task 3.
- [ ] **Step 1:** Implementar conforme a prévia aprovada; textos da prévia; "Nova concessionária" mostra "N obras sem concessionária citam esta distribuidora" quando houver.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → passa.
- [ ] **Step 3:** Commit `feat(engenharia): configuração por concessionária e canais na tela`; atualizar `docs/PROJECT_STATUS.md`; push e PR (sem merge; a migration vai para produção antes do merge, com autorização do Evandro).
