# Telas por empresa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o menu e as telas passam a depender da empresa (plano Solo/PRO e telas opcionais desligadas pelo admin), além do papel.

**Architecture:** tabela `empresa_telas` (lista de desligadas, só admin grava) e função `produto_da_empresa`; uma regra pura decide as telas da empresa; uma leitura em cache por requisição alimenta o menu, o índice de Configurações e um `layout.tsx` de trava em cada área.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres, RLS), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-telas-por-empresa-design.md`

## Global Constraints

- Worktree `C:\dev\crm-p4`, branch `feat/telas-por-empresa`; verificação em disco local (o `R:` é lento).
- Português em código novo, textos e commits; identidade visual de `src/app/globals.css`; reutilizar `src/components/ui.tsx`.
- Migration `supabase/migrations/20261203100000_telas_empresa.sql` (conferir o prefixo contra as PRs abertas antes de criar); `database.types.ts` só por `pnpm db:types`.
- Função nova em `public` sem `EXECUTE` para `anon`; toda tabela nova com `empresa_id` e RLS.
- A empresa só **tira** telas: nenhuma mudança dá acesso que `pode(papel, …)` não dá.
- Tela desligada não para nada no banco (pontos, rodízio, captura pública, obras) e não apaga dados.
- Chaves (valores aceitos no banco e no app): `painel, leads, forecast, obras, engenharia, gamificacao, eletroposto, captura`.

## Review Focus

- Empresa sem linha em `planos_empresa` e sem linha em `empresa_telas` (todas as empresas de hoje): tudo continua igual — testado na Task 1 (PRO sem plano) e na Task 2 (nada desligado).
- Falha ao ler as telas (erro de rede ou RLS): o app segue com tudo ligado e plano PRO, sem quebrar — testado na Task 3.
- Eletroposto desligado pelo admin com negócios de eletroposto existentes: a ficha continua abrindo, só a criação some — testado na Task 3 (criação recusada) e coberto pela trava não estar na ficha.
- Admin desliga a tela onde está: ao salvar, continua em Configurações (não é travada) e o menu já reflete — testado no e2e da Task 6.
- Solo com papel admin: Compras, Financeiro, Pedidos aos setores e Configurações de operação somem, mesmo o papel permitindo — testado na Task 2.

---

### Task 1: Banco — `empresa_telas` e `produto_da_empresa`

**Files:**
- Create: `supabase/migrations/20261203100000_telas_empresa.sql`
- Modify: `src/lib/supabase/database.types.ts` (gerado)
- Test: `tests/telas-empresa-db.test.ts`

**Interfaces:**
- Produces: tabela `public.empresa_telas (empresa_id uuid pk → empresas, desligadas text[] not null default '{}', atualizado_por uuid → empresa_membros, created_at, updated_at)`; `public.produto_da_empresa(p_empresa_id uuid) returns text` (`'solo' | 'pro' | null`).

- [ ] **Step 1: Escrever o teste de banco** (padrão de `tests/desconto-sugerido-db.test.ts`: `criarUsuario`, `servico`, `sufixo`; empresas A e B; A com admin, gestor e vendedor; B com admin). Casos:
  - `admin grava e lê`: admin de A faz `upsert` em `empresa_telas` com `desligadas: ["forecast","gamificacao"]` → sem erro; gestor e vendedor de A leem a mesma lista.
  - `só o admin grava`: gestor e vendedor de A tentam `upsert`/`update` → linha não muda (erro de RLS ou 0 linhas).
  - `valor inválido recusado`: admin de A grava `["financeiro"]` → erro de check.
  - `outra empresa`: admin de B não lê a linha de A (lista vazia) e não grava nela.
  - `produto_da_empresa`: sem linha em `planos_empresa` → `'pro'` para membro de A; com `planos_empresa.produto = 'solo'` (via `servico`) → `'solo'`; admin de B consultando A → `null`.
  - `auditoria`: após o upsert do admin, existe registro em `logs_auditoria` para a tabela `empresa_telas`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/telas-empresa-db.test.ts` → FAIL (tabela/função não existem).
- [ ] **Step 3: Escrever a migration** no padrão de `20261118100000_tela_entrada.sql`: check `desligadas <@ array['painel','leads','forecast','obras','engenharia','gamificacao','eletroposto','captura']::text[]`; triggers `tocar_updated_at` e `auditar()`; trigger que grava `atualizado_por = meu_membro_id(new.empresa_id)`; RLS: select para membro da empresa, insert/update/delete só `tem_papel(empresa_id, '{admin}')`; `revoke` de `anon`. `produto_da_empresa`: `language sql stable security definer set search_path = ''`, devolve nulo se `meu_membro_id(p_empresa_id)` é nulo, senão `coalesce((select produto::text from planos_empresa where empresa_id = p_empresa_id), 'pro')`; `revoke all … from public, anon`; `grant execute … to authenticated`.
- [ ] **Step 4: Aplicar e gerar tipos** — `pnpm db:reset` (se o Kong cair depois do reset: `pnpm exec supabase stop` e `start`) e `pnpm db:types`; o diff de `database.types.ts` só acrescenta `empresa_telas` e `produto_da_empresa`.
- [ ] **Step 5: Rodar e ver passar** — `npx vitest run tests/telas-empresa-db.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(telas): empresa_telas e produto_da_empresa`.

### Task 2: Regra pura das telas

**Files:**
- Create: `src/lib/telas-empresa.ts`
- Test: `tests/telas-empresa.test.ts`

**Interfaces:**
- Produces:
  - `TELAS_OPCIONAIS: readonly TelaOpcional[]` (ordem do quadro: `painel, leads, forecast, obras, engenharia, gamificacao, eletroposto, captura`) e `INFO_TELA: Record<TelaOpcional, { rotulo: string; descricao: string }>` com os textos do quadro `OnboardingProTelas` (Painel — "Visão de gestão para admin e gestor"; Leads a distribuir — "Rodízio de leads entre vendedores e SDR"; Forecast — "Negócios com chance real de fechar"; Obras — "Acompanhamento das obras e semáforo"; Engenharia — "Projeto, protocolo e vistoria"; Gamificação — "Ranking, metas, loja e comissões"; Eletroposto — "Negócios e propostas de eletroposto"; Captura de leads — "Formulário público para o site").
  - `type Area = TelaOpcional | "pro"` — `"pro"` = áreas que só existem no PRO (operação, equipe).
  - `type TelasEmpresa = { solo: boolean; ligadas: ReadonlySet<TelaOpcional> }`.
  - `telasDaEmpresa({ produto, desligadas, eletropostoLiberado }: { produto: "solo" | "pro"; desligadas: readonly string[]; eletropostoLiberado: boolean }): TelasEmpresa`.
  - `areaLigada(t: TelasEmpresa, area: Area): boolean`.
  - `TELAS_PADRAO: TelasEmpresa` = PRO com todas ligadas exceto `eletroposto` (usado quando a leitura falha; o Eletroposto não liga sem liberação).

- [ ] **Step 1: Escrever o teste** com os casos:
  - PRO sem desligadas e com eletroposto liberado → as 8 ligadas; `areaLigada(t, "pro") === true`.
  - PRO sem liberação → `eletroposto` desligado mesmo fora da lista.
  - PRO com `["forecast","gamificacao"]` → essas duas desligadas, as outras ligadas.
  - Valor desconhecido na lista (`"xyz"`) é ignorado.
  - Solo → `ligadas` vazio e `areaLigada(t, "pro") === false`, mesmo com eletroposto liberado e lista vazia.
  - `TELAS_PADRAO` → PRO, `eletroposto` desligado.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/telas-empresa.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `src/lib/telas-empresa.ts` (sem `server-only`: o cartão do cliente usa `INFO_TELA`).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(telas): regra das telas por empresa`.

### Task 3: Leitura no servidor, trava e Eletroposto

**Files:**
- Create: `src/lib/telas-empresa-servidor.ts`, `src/components/tela-desligada.tsx`
- Create (`layout.tsx`: `return (await telaPermitida(area)) ? children : <TelaDesligada souAdmin={…} />`): `src/app/(app)/painel/layout.tsx` (`painel`), `leads-a-distribuir/layout.tsx` (`leads`), `forecast/layout.tsx` (`forecast`), `obras/layout.tsx` (`obras`), `engenharia/layout.tsx` (`engenharia`), `gamificacao/layout.tsx` (`gamificacao`), `configuracoes/{metas,comissoes,resgates}/layout.tsx` (`gamificacao`), `configuracoes/captura/layout.tsx` (`captura`), `compras/layout.tsx`, `financeiro/layout.tsx`, `pagamentos/layout.tsx`, `tarefas/setores/layout.tsx`, `configuracoes/{equipes,tarefas-automaticas,compras,engenharia,prazos-obras,deducoes-obras,fixacoes}/layout.tsx` (todos `pro`). Se a pasta já tiver `layout.tsx`, a trava entra nele.
- Modify: `src/lib/eletroposto-servidor.ts` (`eletropostoDisponivel` passa a responder `areaLigada(await obterTelasEmpresa(), "eletroposto")`), `src/lib/negocios-gravacao.ts` (criação de negócio `eletroposto` recusa com "O Eletroposto está desligado na sua empresa." quando a área está desligada).
- Test: `tests/telas-empresa-servidor.test.ts`

**Interfaces:**
- Consumes: Task 1 (`empresa_telas`, `produto_da_empresa`), Task 2 (`telasDaEmpresa`, `areaLigada`, `TELAS_PADRAO`, `Area`).
- Produces:
  - `obterTelasEmpresa = cache(async (): Promise<TelasEmpresa> => …)` — lê, para `obterSessao().atual`, `empresa_telas.desligadas`, `rpc("produto_da_empresa")` e `empresas.eletroposto_ativo`; sem empresa ou com qualquer erro, devolve `TELAS_PADRAO` e registra o erro no log do servidor.
  - `lerTelasEmpresa(supabase, empresaId): Promise<TelasEmpresa>` — a parte testável, sem `cache` nem sessão.
  - `telaPermitida(area: Area): Promise<boolean>` — `areaLigada(await obterTelasEmpresa(), area)`; o `layout` renderiza `<TelaDesligada>` no lugar de `children` quando falso (não redireciona: o endereço continua o mesmo).
  - `<TelaDesligada souAdmin: boolean />` — título "Esta tela está desligada na sua empresa", link "Voltar ao Início" (`/inicio`) e, para admin, "Ligar em Configurações › Telas da empresa" (`/configuracoes/telas`); usa `CabecalhoPagina` e `Cartao`.

- [ ] **Step 1: Escrever o teste** de `lerTelasEmpresa` com um cliente falso (objeto com `from(...).select(...).eq(...).maybeSingle()` e `rpc`): (a) linha com `["obras"]`, produto `pro`, eletroposto `true` → `obras` desligada, `eletroposto` ligada; (b) `rpc` devolve `solo` → `solo: true`; (c) `from` devolve `error` → `TELAS_PADRAO`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/telas-empresa-servidor.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `telas-empresa-servidor.ts` (`import "server-only"`), `tela-desligada.tsx` e os `layout.tsx` da lista.
- [ ] **Step 4: Ajustar o Eletroposto** — `eletropostoDisponivel` e a recusa na criação; acrescentar em `tests/negocios-gravacao.test.ts` o caso "criar eletroposto com a tela desligada é recusado" no padrão dos casos de eletroposto que já existem.
- [ ] **Step 5: Rodar** — `npx vitest run tests/telas-empresa-servidor.test.ts tests/negocios-gravacao.test.ts` e `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** — `feat(telas): trava das telas desligadas`.

### Task 4: Menu, celular e índice de Configurações

**Files:**
- Modify: `src/app/(app)/layout.tsx` (itens do menu), `src/app/(app)/configuracoes/page.tsx` (`GRUPOS`)
- Create: `src/lib/menu-telas.ts`
- Test: `tests/menu-telas.test.ts`

**Interfaces:**
- Consumes: Task 2 (`TelasEmpresa`, `areaLigada`), Task 3 (`obterTelasEmpresa`).
- Produces: `AREA_DO_ENDERECO: Record<string, Area>` (prefixo do `href` → área: `/painel`→`painel`, `/leads-a-distribuir`→`leads`, `/forecast`→`forecast`, `/obras`→`obras`, `/engenharia`→`engenharia`, `/gamificacao`→`gamificacao`, `/configuracoes/{metas,comissoes,resgates}`→`gamificacao`, `/configuracoes/captura`→`captura`, `/compras`, `/financeiro`, `/pagamentos`, `/tarefas/setores` e `/configuracoes/{equipes,tarefas-automaticas,compras,engenharia,prazos-obras,deducoes-obras,fixacoes}`→`pro`) e `filtrarPorTelas<T extends { href: string }>(itens: T[], telas: TelasEmpresa): T[]` (mantém o item quando nenhum prefixo casa ou quando `areaLigada` é verdadeiro; o prefixo mais longo vence; `#…`/`?…` ignorados). Os mesmos prefixos alimentam a lista dos `layout.tsx` da Task 3.

- [ ] **Step 1: Escrever o teste** de `filtrarPorTelas`: Solo tira `/forecast`, `/compras`, `/financeiro`, `/tarefas/setores`, `/configuracoes/equipes`, `/gamificacao/loja`, `/gamificacao/administracao/regras` e mantém `/inicio`, `/negocios`, `/contatos`, `/configuracoes/tela-entrada`, `/configuracoes/usuarios`; PRO com `gamificacao` desligada tira `/configuracoes/metas`, `/gamificacao` e `/configuracoes/usuarios#perfil-gamificacao` (mapeado explicitamente para `gamificacao`, antes de ignorar o `#`) e mantém `/configuracoes/usuarios`; PRO sem nada desligado mantém tudo.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** `menu-telas.ts`; no `layout.tsx` do app, `const itens = filtrarPorTelas([...], await obterTelasEmpresa())` (o mesmo array alimenta `MenuLateral` e `NavegacaoCelular`); em `configuracoes/page.tsx`, filtrar `itens` de cada grupo e esconder o grupo que ficar vazio.
- [ ] **Step 4: Rodar** — `npx vitest run tests/menu-telas.test.ts` e `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(telas): menu e Configurações pelas telas da empresa`.

### Task 5: Configurações › Telas da empresa

**Files:**
- Create: `src/app/(app)/configuracoes/telas/page.tsx`, `src/components/telas-empresa.tsx`, `src/lib/acoes/telas-empresa.ts`
- Modify: `src/app/(app)/configuracoes/page.tsx` (item "Telas da empresa", grupo "Empresa", ícone `LayoutGrid`, descrição "Telas que aparecem para a equipe.")
- Test: `tests/acoes-telas-empresa.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 (`TELAS_OPCIONAIS`, `INFO_TELA`), Task 3 (`obterTelasEmpresa`).
- Produces:
  - `salvarTelasEmpresa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao>` — `exigirPapel("admin")`; lê o campo `desligadas` com `lerDesligadas` (nulo → "Dados inválidos."); `upsert` em `empresa_telas`; `revalidatePath("/", "layout")`; mensagens "Telas salvas." / erro do banco por `mensagemErro`.
  - `<CartaoTelasOpcionais ligadas: TelaOpcional[]; eletropostoLiberado: boolean; onChange?(ligadas: TelaOpcional[]): void />` — lista com ícone, `INFO_TELA` e `role="switch"`; sem a linha do Eletroposto se não liberado. O assistente (subprojeto 3) reutiliza.
  - Página: PRO → texto do quadro ("Início, Tarefas, Negócios, Contatos e Propostas e contratos ficam sempre ligados. Uma tela desligada some do menu de todo mundo, e os dados dela continuam guardados."), o cartão e "Salvar"; Solo → a lista das telas do plano e "Cresceu e contratou alguém? Passe para o PRO e libere equipe, setores, gestão e Gamificação." sem chaves. Só admin (`exigirPapel("admin")`).

- [ ] **Step 1: Escrever o teste** de `lerDesligadas(texto: string): TelaOpcional[] | null` (em `src/lib/telas-empresa.ts`, porque um arquivo `"use server"` só exporta funções assíncronas): JSON válido → lista; `["financeiro"]` → `null`; texto que não é JSON → `null`; duplicados removidos.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** `lerDesligadas`, a ação, o cartão e a página.
- [ ] **Step 4: Rodar** — `npx vitest run tests/acoes-telas-empresa.test.ts`, `pnpm typecheck`, `pnpm lint` → PASS, 0 erros.
- [ ] **Step 5: Commit** — `feat(telas): Configurações › Telas da empresa`.

### Task 6: Navegador, verificação completa e status

**Files:**
- Create: `e2e/telas-empresa.spec.ts`
- Modify: `docs/PROJECT_STATUS.md` (seção nova "Onboarding — subprojeto 1: telas por empresa")

- [ ] **Step 1: Escrever o e2e** (padrão de `e2e/02-navegacao.spec.ts`, `entrarComo(usuarios.admin)`): em `/configuracoes/telas`, desligar "Forecast" e salvar → "Telas salvas." e a página continua; o menu lateral não tem "Forecast"; `page.goto("/forecast")` mostra "Esta tela está desligada na sua empresa"; religar e salvar no fim (o teste deixa a base como encontrou, também em `afterEach`).
- [ ] **Step 2: Verificação completa** — `pnpm typecheck`, `pnpm lint` (0 erros, avisos iguais aos da `main`), `pnpm test`, `pnpm build` → tudo ok.
- [ ] **Step 3: Atualizar `docs/PROJECT_STATUS.md`** com o que entrou, a migration e o que falta (subprojetos 2 a 4).
- [ ] **Step 4: Commit** — `test(telas): navegador e status`.
- [ ] **Step 5: PR** para a `main` e pedido de autorização ao Evandro para o fluxo da migration (`banco-producao.yml`: tag, conferir, aplicar) antes do merge — o preview usa o banco de produção.
