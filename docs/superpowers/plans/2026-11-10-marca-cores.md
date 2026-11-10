# Marca e cores da empresa no app — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o app usa a logo e as cores da identidade da proposta (barra/faixa e destaque), com contraste garantido.

**Architecture:** função `marca_da_empresa` para qualquer membro; regra pura de cores (contraste, texto sobre o destaque, tons derivados, variáveis CSS); o invólucro `tema-app` recebe as variáveis; CSS limita a cor da barra à barra lateral e à faixa; a Gamificação volta ao dourado; a tela de identidade valida e mostra a prévia.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 (variáveis `--color-*`), Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-marca-cores-design.md`

## Global Constraints

- Worktree `C:\dev\crm-p4`, branch `feat/marca-cores`; Português em código, textos e commits.
- Migration `supabase/migrations/20261204100000_marca_da_empresa.sql`; `database.types.ts` só por `pnpm db:types`.
- Função nova sem `EXECUTE` para `public`/`anon`; nenhuma política existente alterada.
- Padrão Raion: barra `#0F0F10`, destaque `#D4AF37`, texto claro do menu `#FAF8F3`. Contraste mínimo 4,5.
- Não mudam: verde, vermelho, escala âmbar, Gamificação (conteúdo), login, páginas do cliente.

## Review Focus

- Empresa sem identidade ou sem cores (todas as de hoje, em sua maioria): nada muda — Task 1 (`marcaDoApp` nula) e Task 3 (sem `style` nem `data-marca`).
- Combinação antiga ilegível já salva: o app cai no padrão Raion — Task 1.
- Papel `operacao` (sem acesso comercial) vê as cores e a logo — Task 2 (banco) e Task 3 (URL assinada pela sessão).
- Gamificação continua dourada por dentro com a empresa de outra cor — Task 3 (CSS) e Task 5 (e2e abre `/gamificacao`).
- Botão de destaque com cor escura recebe texto branco — Task 1 (`textoSobre`) e Task 5 (e2e confere a cor do texto).

---

### Task 1: Regra pura das cores

**Files:** Create `src/lib/marca-cores.ts`; Test `tests/marca-cores.test.ts`

**Interfaces — Produces:**
- `MARCA_PADRAO = { barra: "#0F0F10", destaque: "#D4AF37" } as const`
- `contraste(a: string, b: string): number`
- `textoSobre(cor: string): "#0F0F10" | "#FFFFFF"`
- `type Marca = { barra: string; destaque: string }`
- `validarMarca(m: Marca): string[]` (mensagens da spec)
- `variaveisMarca(m: Marca): Record<string, string>` (chaves da spec)
- `marcaDoApp(linha: { cor_primaria: string | null; cor_destaque: string | null } | null): Marca | null`

- [ ] **Step 1: Teste** — `contraste("#000000","#FFFFFF")` = 21 (2 casas); `contraste("#D4AF37","#0F0F10") >= 9`; `textoSobre("#D4AF37")` = `#0F0F10`, `textoSobre("#123C45")` = `#FFFFFF`; `validarMarca(MARCA_PADRAO)` = `[]`; `validarMarca({ barra: "#EDDB9F", destaque: "#D4AF37" })` tem 1 problema com "clara demais"; `validarMarca({ barra: "#0F0F10", destaque: "#7A7A7A" })` tem 1 problema com "botões" (≈4,3 com branco e ≈4,4 com `#0F0F10`); `variaveisMarca({ barra: "#123C45", destaque: "#0E9F8A" })` tem as seis chaves, `--color-sobre-acao` com `textoSobre`, e o tom claro de `--color-dourado-texto` com contraste ≥ 4,5 sobre `#FAF8F3`; `marcaDoApp(null)` e `marcaDoApp({ cor_primaria: null, cor_destaque: null })` = `null`; `marcaDoApp({ cor_primaria: "#EDDB9F", cor_destaque: "#D4AF37" })` = `null`; só uma das cores preenchida usa o padrão na outra.
- [ ] **Step 2:** `npx vitest run tests/marca-cores.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** — luminância WCAG (canal ≤ 0,03928 → /12,92; senão ((c+0,055)/1,055)^2,4); escurecer/clarear misturando com preto/branco em passos de 5% até atingir 4,5 (máx. 20 passos); `--color-acao-forte` = mistura de 13% com preto.
- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5: Commit** — `feat(marca): regra das cores da empresa`.

### Task 2: Banco — `marca_da_empresa`

**Files:** Create `supabase/migrations/20261204100000_marca_da_empresa.sql`; Modify `src/lib/supabase/database.types.ts` (gerado); Test `tests/marca-da-empresa-db.test.ts`

**Interfaces — Produces:** `rpc("marca_da_empresa", { p_empresa_id })` → `{ cor_primaria, cor_destaque, logo_url, logo_escuro_url }[]` (0 ou 1 linha).

- [ ] **Step 1: Teste** (padrão de `tests/telas-empresa-db.test.ts`): empresas A e B; em A, admin, vendedor e um membro `operacao`; em B, admin. `servico` grava `proposta_identidades` de A com `#123C45`/`#0E9F8A` e `logo_url` `"<empresaA>/logo.png"`. Admin, vendedor e `operacao` de A recebem 1 linha com essas cores e a logo; admin de B consultando A recebe 0 linhas; o `operacao` de A NÃO lê `proposta_identidades` direto (0 linhas pela RLS de hoje).
- [ ] **Step 2:** `npx vitest run tests/marca-da-empresa-db.test.ts` → FAIL.
- [ ] **Step 3: Migration** — `language sql stable security definer set search_path = ''`; `where pi.empresa_id = p_empresa_id and public.meu_membro_id(p_empresa_id) is not null`; `revoke all … from public, anon`; `grant execute … to authenticated`.
- [ ] **Step 4:** `pnpm db:reset` (Kong caindo: `supabase stop`/`start`), `pnpm db:types`; teste → PASS.
- [ ] **Step 5: Commit** — `feat(marca): marca_da_empresa`.

### Task 3: Marca aplicada no app

**Files:** Create `src/lib/marca-servidor.ts`; Modify `src/app/(app)/layout.tsx`, `src/app/globals.css`, `src/components/cabecalho-pagina.tsx`; Test `tests/marca-servidor.test.ts`

**Interfaces:**
- Consumes: Task 1 (`marcaDoApp`, `variaveisMarca`), Task 2 (`marca_da_empresa`).
- Produces: `lerMarcaEmpresa(supabase, empresaId): Promise<{ marca: Marca | null; logoUrl: string | null }>`; `obterMarcaEmpresa = cache(...)` (empresa da sessão; sem empresa ou erro → `{ marca: null, logoUrl: null }`).

- [ ] **Step 1: Teste** de `lerMarcaEmpresa` com cliente falso (mesmo estilo de `tests/telas-empresa-servidor.test.ts`): cores válidas → `marca` preenchida; logo escura presente → URL assinada dela (o falso de `storage.from().createSignedUrl` devolve `{ data: { signedUrl: "u:"+caminho } }`); sem linha → `{ marca: null, logoUrl: null }`; `rpc` com erro → mesmo resultado, sem lançar.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementar** `marca-servidor.ts` (bucket `proposta-marca`, expiração 3600 s); no `layout.tsx`, `const { marca, logoUrl } = await obterMarcaEmpresa()`, `style={marca ? variaveisMarca(marca) : undefined}` e `data-marca={marca ? "" : undefined}` no `div.tema-app`; nos dois lugares do `LogoRaion tom="claro"`, `logoUrl ? <img src={logoUrl} alt={empresaNome} style={{ height: <mesma altura> }} className="w-auto max-w-[180px] object-contain" /> : <LogoRaion …/>`; regras de CSS da spec em `globals.css` (perto de `.tema-app .barra-lateral`); classe `faixa-marca` na `<section>` do `CabecalhoPagina`.
- [ ] **Step 4:** teste → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(marca): cores e logo da empresa no app`.

### Task 4: Identidade da proposta com prévia e contraste

**Files:** Create `src/components/marca-cores.tsx`; Modify `src/app/(app)/configuracoes/propostas/identidade/form-identidade.tsx`, `src/lib/acoes/proposta-identidade.ts`, `src/app/(app)/configuracoes/page.tsx`; Test `tests/marca-cores.test.ts` (acréscimo)

**Interfaces:**
- Consumes: Task 1.
- Produces: `<CamposMarcaCores barra destaque logoUrl nomeEmpresa onChange(m: Marca) />` — os dois campos (seletor + `#RRGGBB`, nomes `cor_primaria` e `cor_destaque`), a prévia do quadro, "✓ Contraste bom" ou os problemas, e "Voltar ao padrão Raion" (`onChange(MARCA_PADRAO)`); `problemaCoresIdentidade(corPrimaria: string, corDestaque: string): string | null` em `marca-cores.ts` (campos vazios = padrão; devolve a primeira mensagem de `validarMarca` ou nulo).

- [ ] **Step 1: Teste** de `problemaCoresIdentidade`: `("", "")` → nulo; `("#EDDB9F", "")` → "clara demais"; `("#123C45", "#0E9F8A")` → nulo.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementar** — o formulário troca os dois campos de cor por `CamposMarcaCores` (rótulos da spec); a ação recusa com `problemaCoresIdentidade` antes de gravar; item "Marca e cores" (ícone `Palette`, descrição "Logo e cores do app e das propostas.") no grupo "Empresa" do índice, apontando para `/configuracoes/propostas/identidade`.
- [ ] **Step 4:** teste → PASS; `pnpm typecheck`, `pnpm lint` (0 erros).
- [ ] **Step 5: Commit** — `feat(marca): prévia e contraste na identidade`.

### Task 5: Navegador, verificação e status

**Files:** Create `e2e/34-marca-cores.spec.ts`; Modify `docs/PROJECT_STATUS.md`

- [ ] **Step 1: e2e** (`entrarComo(usuarios.admin)`, 1440×900): em `/configuracoes/propostas/identidade`, preencher `#123C45` e `#0E9F8A`, salvar → mensagem de sucesso; o `aside.barra-lateral` tem `background-color` `rgb(18, 60, 69)`; o link "Novo negócio" do Início (botão de destaque) tem fundo `rgb(14, 159, 138)`; `/gamificacao` mantém algum elemento de destaque dourado (`rgb(212, 175, 55)`) ou, se não houver elemento estável, só que a barra segue `rgb(18, 60, 69)`; preencher `#EDDB9F` na barra → aviso "clara demais" e salvar não muda nada; `afterEach` volta ao padrão (campos vazios ou "Voltar ao padrão Raion" + salvar).
- [ ] **Step 2:** `pnpm exec playwright test e2e/34-marca-cores.spec.ts` → PASS.
- [ ] **Step 3:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` → ok.
- [ ] **Step 4:** `docs/PROJECT_STATUS.md`: seção do subprojeto 2.
- [ ] **Step 5: Commit** — `test(marca): navegador e status`; PR e pedido de autorização do fluxo da migration ao Evandro.
