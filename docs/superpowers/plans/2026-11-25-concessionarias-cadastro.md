# Concessionárias, entrega 2: cadastro, Copel migrada e obra com concessionária — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada empresa passa a ter concessionárias cadastradas (a Copel pronta para todas), e cada obra guarda a sua concessionária, herdada do negócio, com aviso e correção pela Engenharia.

**Architecture:** uma migration cria `concessionarias` (por empresa, com RLS), dá a Copel a toda empresa atual e nova, liga `obras.concessionaria_id` (todas as obras atuais apontam para a Copel), escolhe a concessionária em `garantir_obra` pelo texto da distribuidora do negócio (mesma comparação da calculadora, via `tarifas_gd_aneel.nomes_aceitos`) e cria a RPC de correção. O checklist só é aplicado com concessionária definida. A tela da Engenharia mostra o aviso e o seletor; o protocolo sugere o nome da concessionária.

**Tech Stack:** Postgres/Supabase (migrations, RLS, plpgsql `security definer`), Next.js 16 App Router, React 19, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-concessionarias-design.md` (entrega 2; regras 4, 5, 6, 6a, 7 e 10).

## Global Constraints

- Migration única: `supabase/migrations/20261223100000_concessionarias.sql` (nenhuma PR aberta usa prefixo igual ou maior).
- Toda tabela nova com `empresa_id` + RLS; função nova em `public` sem `EXECUTE` para `anon`; `security definer` sempre com `set search_path = ''`.
- Nada muda para quem só atende a Copel: obras atuais e novas de empresas só com a Copel continuam aplicando o mesmo checklist.
- Checklist já aplicado a uma obra nunca muda por causa do cadastro (regra 7 com troca de checklist fica para a entrega 3, quando o modelo passa a ser por concessionária).
- Mensagens ao usuário em português, com `hint = 'mensagem_usuario'`.
- Atualizar juntos `MIGRATIONS_AUTORIZADAS` (`.github/workflows/banco-producao.yml`) e `AUTORIZADAS` (`tests/validar-conjunto-migrations.test.ts`) para só `20261223100000_concessionarias.sql`.
- `database.types.ts` só por `pnpm db:types`.
- Tela só depois da prévia aprovada pelo Evandro (Task 3 começa com a prévia).

## Review Focus

- Distribuidora com acento, maiúsculas ou espaços extras ("COPEL  Distribuição") casa igual à calculadora: a normalização SQL dá o mesmo resultado que `normalizarNome` do TS.
- Empresa com distribuidora vazia e duas concessionárias: obra nasce sem concessionária (não escolhe uma ao acaso).
- RPC de correção com concessionária de outra empresa: recusada com a mesma mensagem de "não existe" (não revela dados de outras empresas).
- Obra cancelada: correção recusada (mesma regra de `preparar_escrita_obra`).
- Empresa criada depois da migration recebe a Copel (gatilho), e a concessionária não pode trocar de empresa.

---

### Task 1: Banco — concessionárias, Copel, obra com concessionária

**Files:**
- Create: `supabase/migrations/20261223100000_concessionarias.sql`
- Create: `tests/concessionarias-db.test.ts` (padrão de `tests/engenharia-checklist-db.test.ts`, conexão só por `tests/banco-local.ts`)
- Modify: `.github/workflows/banco-producao.yml`, `tests/validar-conjunto-migrations.test.ts`
- Regenerate: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces (SQL):
  - tabela `public.concessionarias (id uuid pk, empresa_id uuid not null → empresas on delete cascade, nome text 2..60 após btrim, distribuidora text not null — sigla ANEEL como em `tarifas_gd_aneel.distribuidora`, created_at, updated_at, unique (empresa_id, id), unique (empresa_id, distribuidora), unique index (empresa_id, lower(btrim(nome))))`; gatilho que recusa trocar `empresa_id`; `tocar_updated_at`; `auditar`. RLS: select `membro_ativo(empresa_id)`; insert/update `tem_papel(empresa_id, '{admin}')`; sem delete nem truncate; nada para `anon`.
  - `inserir_concessionaria_copel(p_empresa_id uuid) returns void` (nome `Copel`, distribuidora `COPEL-DIS`, `on conflict do nothing`), sem execute para ninguém; gatilho `after insert on empresas`; carga para todas as empresas atuais.
  - `obras.concessionaria_id uuid null`, FK composta `(empresa_id, concessionaria_id) references concessionarias (empresa_id, id)`; carga: toda obra existente → a Copel da sua empresa.
  - `normalizar_nome_distribuidora(p text) returns text` (immutable): minúsculas, sem acento (translate com o mapa de acentos do português), espaços colapsados, trim — igual a `normalizarNome` de `src/lib/tarifa-gd.ts`.
  - `concessionaria_do_negocio(p_empresa_id uuid, p_distribuidora text) returns uuid` (interna, sem execute para `authenticated`): vazia → a única concessionária da empresa, ou nulo se houver 0 ou 2+; preenchida → a concessionária da empresa cuja `distribuidora` é a sigla de alguma linha de `tarifas_gd_aneel` com o nome normalizado em `nomes_aceitos`, ou cujo `nome` normalizado é igual; senão nulo.
  - `garantir_obra` (cópia da versão de `20261207100000_obra_solo.sql`) passa a gravar `concessionaria_id = concessionaria_do_negocio(empresa, negocio.qualif_distribuidora)`.
  - `definir_concessionaria_obra(p_obra_id uuid, p_concessionaria_id uuid) returns void`: `preparar_escrita_obra(p_obra_id, 'engenharia', false)`; concessionária de outra empresa ou inexistente → "Concessionária não encontrada."; igual à atual → nada; senão grava e registra histórico `concessionaria_obra_alterada` (`de`, `para`, `autorizacao`). Execute para `authenticated`. Novo tipo incluído em `obra_historico_tipo_check` (lista completa da versão de `20261217100000_agenda_operacional.sql` + o novo).
  - `aplicar_checklist_engenharia` (cópia da versão de `20261112100000_engenharia_nao_se_aplica.sql`) recusa obra sem concessionária: "Escolha a concessionária da obra antes de aplicar o checklist." (`check_violation`, `mensagem_usuario`). Mesmos grants.

- [ ] **Step 1: Testes que falham** em `tests/concessionarias-db.test.ts`:
  - `toda empresa tem a Copel e empresa nova também recebe` (conta 1 linha `COPEL-DIS` por empresa, inclusive uma criada no teste).
  - `normaliza como a calculadora` (para `["COPEL", " Copel  Distribuição ", "copel-dis", "Copel Distribuição S.A."]`, `select normalizar_nome_distribuidora($1)` === `normalizarNome(x)`).
  - `obra herda a concessionária pela distribuidora` (`qualif_distribuidora = 'Copel Distribuição'` → Copel).
  - `distribuidora vazia com uma concessionária usa ela` e `vazia com duas fica sem` (insere uma segunda concessionária como admin).
  - `distribuidora sem cadastro fica sem concessionária` (`'Cemig'` → nulo).
  - `aplicar checklist sem concessionária é recusado` com a mensagem exata, e com concessionária aplica como antes.
  - `correção pela Engenharia grava e registra histórico`; `concessionária de outra empresa é recusada`; `vendedor sem setor não corrige`; `obra cancelada não corrige`.
  - `RLS: membro de outra empresa não vê concessionárias`; `vendedor não cria concessionária`.
- [ ] **Step 2:** `pnpm vitest run tests/concessionarias-db.test.ts` → falha (tabela inexistente).
- [ ] **Step 3:** Escrever a migration conforme as Interfaces; `pnpm db:reset`.
- [ ] **Step 4:** `pnpm vitest run tests/concessionarias-db.test.ts tests/engenharia-checklist-db.test.ts tests/engenharia-enquadramento-db.test.ts` → passa (os testes antigos criam obras de negócios sem distribuidora em empresa só com a Copel, então continuam aplicando o checklist).
- [ ] **Step 5:** `pnpm db:types`; atualizar as duas listas de migrations autorizadas; `pnpm vitest run tests/validar-conjunto-migrations.test.ts` → passa.
- [ ] **Step 6:** Commit `feat(banco): concessionárias por empresa e obra com concessionária`.

### Task 2: Servidor — leitura e ação de correção

**Files:**
- Create: `src/lib/engenharia-concessionaria.ts`
- Modify: `src/lib/acoes/engenharia.ts`
- Test: `tests/concessionarias-db.test.ts` (ação pelo cliente autenticado)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `carregarConcessionariaObra(supabase, { empresaId: string; obraId: string }): Promise<{ atual: { id: string; nome: string } | null; opcoes: { id: string; nome: string }[] }>` (opções ordenadas por nome).
  - `definirConcessionariaObra(_: unknown, formData: FormData): Promise<{ ok: true } | { ok: false; mensagem: string }>` (`"use server"`; campos `obraId`, `concessionariaId` uuid por Zod; chama a RPC; `revalidatePath("/engenharia/" + obraId)`; erro com `mensagem_usuario` vira a mensagem, outro vira "Não foi possível salvar a concessionária.").
- [ ] **Step 1:** Teste que falha: `ação devolve a mensagem da RPC para concessionária de outra empresa` e `ação grava`.
- [ ] **Step 2:** Rodar → falha. **Step 3:** Implementar. **Step 4:** Rodar → passa; `pnpm typecheck`.
- [ ] **Step 5:** Commit `feat(engenharia): ler e corrigir a concessionária da obra`.

### Task 3: Tela — aviso, seletor e protocolo (depois da prévia aprovada)

**Files:**
- Create: `src/components/engenharia/concessionaria.tsx`
- Modify: `src/app/(app)/engenharia/[id]/page.tsx`, `src/components/engenharia/protocolos.tsx`, `src/components/engenharia/checklist.tsx`

**Interfaces:**
- Consumes: Task 2.
- Produces: `ConcessionariaDaObra({ obraId, atual, opcoes, podeEditar })`: com concessionária, mostra o nome e "Trocar" (seletor + salvar); sem, aviso "Concessionária sem cadastro: escolha a concessionária da obra para aplicar o checklist." com o seletor. `ProtocolosEngenharia`/`NovoProtocolo` recebem `distribuidoraSugerida: string` (nome da concessionária ou vazio) no lugar do fixo "Copel". O botão de aplicar o checklist fica desabilitado sem concessionária, com o mesmo texto do aviso.
- [ ] **Step 0:** Prévia em canvas (antes × depois) e aprovação do Evandro.
- [ ] **Step 1:** Implementar conforme a prévia, reutilizando `src/components/ui.tsx`; mobile primeiro.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → passa.
- [ ] **Step 3:** Commit `feat(engenharia): concessionária da obra na tela`; atualizar `docs/PROJECT_STATUS.md`; abrir PR.
