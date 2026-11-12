# Assistente de primeiro acesso — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** assistente em passos no primeiro acesso do admin de empresa nova, gravando nas configurações de sempre, mais a foto da faixa por empresa.

**Architecture:** tabela `empresa_onboarding` (criada pelo super-admin com a empresa); regra pura dos passos; rota `/primeiro-acesso` fora do grupo `(app)` com um componente por passo que reaproveita os de Configurações; o layout `(app)` leva o admin para lá enquanto pendente; faixa por empresa via variável CSS.

**Tech Stack:** Next.js 16, React 19, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-assistente-primeiro-acesso-design.md`

## Global Constraints

- Worktree `C:\dev\crm-p4`, branch `feat/assistente-primeiro-acesso`; Português.
- Migration `supabase/migrations/20261205100000_assistente_primeiro_acesso.sql`; tipos só por `pnpm db:types`.
- Visual dos quadros aprovados (coluna `#0F0F10` de 300 px, passos com bolinhas, trilha dourada, "Pular por agora", rodapé com "←" e "Continuar"); textos do quadro.
- Nada novo na proposta, no contrato ou na regra de pagamento; o passo grava pelas ações que já existem.
- e2e: a base fictícia cria empresas pelo `servico` (sem linha de onboarding): os testes atuais não podem ser levados ao assistente.

## Review Focus

- Empresa sem linha de onboarding (todas as de hoje e as da base de teste): nenhum redirecionamento — Task 3.
- Vendedor/gestor de empresa com onboarding pendente: não é levado ao assistente — Task 3 (e2e na Task 6).
- Falha ao ler o onboarding: o app segue normal — Task 3.
- Admin que fecha a aba no meio: volta ao passo onde parou — Task 2 (regra) e Task 3 (estado gravado a cada avanço).
- Super-admin, que não é membro: nunca é levado ao assistente — Task 3.

---

### Task 1: Banco

**Files:** Create `supabase/migrations/20261205100000_assistente_primeiro_acesso.sql`; Modify `src/lib/supabase/database.types.ts`; Test `tests/assistente-db.test.ts`

**Interfaces — Produces:** tabela `empresa_onboarding` (spec); colunas `empresa_tela_entrada.faixa_caminho`, `.faixa_usa_entrada`; `rpc("salvar_cnpj_empresa", { p_empresa_id, p_cnpj })`.

- [ ] **Step 1: Teste de banco** (padrão de `tests/telas-empresa-db.test.ts`; super-admin via `plataforma_admins` gravado pelo `servico`): super-admin insere a linha; admin lê e atualiza `passo_atual`/`pulados`/`concluido_em`; vendedor e admin de outra empresa não leem; atualizar `concluido_em` de preenchido para nulo é recusado; `salvar_cnpj_empresa` grava para o admin (`"12345678000190"`), recusa para o vendedor e recusa CNPJ com tamanho errado; `faixa_caminho` de outra empresa é recusado pelo check.
- [ ] **Step 2:** `npx vitest run tests/assistente-db.test.ts` → FAIL.
- [ ] **Step 3: Migration** — no padrão de `20261203100000_telas_empresa.sql` (trigger `tocar_updated_at`, `auditar()`, RLS, `revoke` de `anon`); trigger que recusa `concluido_em` voltar a nulo; check da faixa igual ao da imagem (`faixa_caminho like empresa_id::text || '/%'`).
- [ ] **Step 4:** `pnpm db:reset` (Kong caindo: `supabase stop`/`start`), `pnpm db:types`; teste → PASS.
- [ ] **Step 5: Commit** — `feat(assistente): banco do assistente e da faixa`.

### Task 2: Regra pura dos passos

**Files:** Create `src/lib/assistente.ts`; Test `tests/assistente.test.ts`

**Interfaces — Produces:** `type ChavePasso = "empresa" | "marca" | "imagens" | "telas" | "pagamento" | "equipe" | "revisar"`; `PASSOS: Record<ChavePasso, { titulo: string; sobre: string }>` (títulos do quadro: "Sua empresa", "Marca e cores", "Tela de entrada e faixa", "Telas que a equipe usa", "Formas de pagamento", "Equipe", "Revisar e começar"); `passosDoPlano(solo: boolean): ChavePasso[]` (Solo: empresa, marca, imagens, pagamento, revisar; PRO: empresa, marca, imagens, telas, pagamento, equipe, revisar); `proximoPasso(passos, atual)`, `passoAnterior(passos, atual)` (nulo nas pontas); `estadoDoPasso({ passo_atual, pulados }, passos, chave): "feito" | "pulado" | "pendente"` (índice 1-based em `passo_atual`, `pulados` por índice).

- [ ] **Step 1: Teste** — os dois planos com 5 e 7 passos na ordem; próximo/anterior nas pontas; estado: passo antes do atual e não pulado = feito, pulado = pulado, o atual e os seguintes = pendente.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** — `feat(assistente): regra dos passos`.

### Task 3: Rota, navegação, redirecionamento e super-admin

**Files:** Create `src/app/primeiro-acesso/layout.tsx`, `src/app/primeiro-acesso/page.tsx`, `src/app/primeiro-acesso/moldura.tsx` (coluna e rodapé do quadro), `src/lib/assistente-servidor.ts`, `src/lib/acoes/assistente.ts`; Modify `src/app/(app)/layout.tsx`, `src/app/(app)/super-admin/actions.ts`, `src/app/(app)/configuracoes/page.tsx`; Test `tests/assistente-servidor.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `lerOnboarding(supabase, empresaId): Promise<{ passo_atual: number; pulados: number[]; concluido_em: string | null } | null>` (erro → nulo); `obterOnboarding = cache(...)`; `precisaDoAssistente(papel, onboarding): boolean` (admin e linha sem `concluido_em`); ações `avancarAssistente(chave, pular: boolean)`, `voltarAssistente(chave)`, `concluirAssistente()` (todas `exigirPapel("admin")`, gravam `passo_atual`/`pulados`/`concluido_em`).

- [ ] **Step 1: Teste** de `lerOnboarding` (cliente falso: linha, sem linha, erro) e de `precisaDoAssistente` (admin pendente = sim; admin concluído, vendedor pendente, sem linha = não).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementar** — layout `(app)`: `if (precisaDoAssistente(papel, await obterOnboarding())) redirect("/primeiro-acesso")`; rota com `exigirPapel("admin")`, passo pela query (`?passo=`) ou pelo `passo_atual`; `?rever=1` abre sem obrigar e o último passo volta a Configurações; moldura do quadro; por enquanto cada passo mostra só título e "Continuar"/"Pular" (os conteúdos vêm nas Tasks 4 e 5); `criarEmpresa` insere `empresa_onboarding` após o vínculo do admin; item "Abrir o assistente" (ícone `Sparkles`, "Rever a configuração inicial da empresa.") no grupo Empresa.
- [ ] **Step 4:** teste → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(assistente): rota, navegação e redirecionamento`.

### Task 4: Passos 1 a 3 e a faixa no app

**Files:** Create `src/app/primeiro-acesso/passos/{empresa,marca,imagens}.tsx`, `src/lib/acoes/dados-empresa.ts`; Modify `src/app/(app)/configuracoes/propostas/identidade/form-identidade.tsx` (exportar `CampoImagem`), `src/app/(app)/configuracoes/tela-entrada/{formulario.tsx,actions.ts,page.tsx}` (cartão "Faixa do topo"), `src/lib/tela-entrada.ts`, `src/components/cabecalho-pagina.tsx`, `src/app/(app)/layout.tsx`, `src/lib/marca-servidor.ts` (ou leitor próprio da faixa); Test `tests/tela-entrada.test.ts` (acréscimo) e `tests/dados-empresa.test.ts`

**Interfaces — Produces:** `salvarDadosEmpresa(_: ResultadoAcao, fd)` (nome de exibição e WhatsApp na identidade; CNPJ por `salvar_cnpj_empresa`); `urlFaixa(linha, publica): string | null` em `src/lib/tela-entrada.ts` (`faixa_usa_entrada` → imagem da entrada; senão `faixa_caminho`; nada → nulo).

- [ ] **Step 1: Testes** — `urlFaixa`: usa a entrada quando marcado; usa a própria quando desmarcado; nulo sem imagens; validação de `salvarDadosEmpresa` extraída para função pura (`lerDadosEmpresa`): CNPJ com máscara vira 14 dígitos, vazio vira nulo, tamanho errado recusa; WhatsApp só dígitos (10 a 13).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementar** — passos 1–3 no visual dos quadros (`OnboardingEmpresa`, `OnboardingProMarca` com `CampoImagem` + `CamposMarcaCores`, `OnboardingProImagens` com o formulário da tela de entrada + cartão da faixa); `CabecalhoPagina` usa `bg-[image:var(--faixa-imagem,url(/marca/paisagem.jpg))]`; o layout `(app)` põe `--faixa-imagem: url(...)` no `style` do invólucro quando `urlFaixa` existe.
- [ ] **Step 4:** testes → PASS; `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** — `feat(assistente): passos da empresa, da marca e das imagens; faixa por empresa`.

### Task 5: Passos de telas, pagamento, equipe e revisão

**Files:** Create `src/app/primeiro-acesso/passos/{telas,pagamento,equipe,revisar}.tsx`; Modify `src/app/(app)/configuracoes/usuarios/formularios.tsx` (se precisar exportar o cadastro); Test `tests/assistente.test.ts` (acréscimo: `resumoDoPasso`)

**Interfaces — Produces:** `resumoDoPasso(chave, dados): string` (linhas do quadro `OnboardingRevisar`: "Solar Campinas · CNPJ · WhatsApp", "Logo enviada · barra · destaque", "Pulado: fica a paisagem do Raion.", "N ligadas · Eletroposto desligado", "À vista … · cartão até Nx", "N pessoas cadastradas").

- [ ] **Step 1: Teste** de `resumoDoPasso` para cada chave, com e sem dados.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementar** — telas: `CartaoTelasOpcionais` + `salvarTelasEmpresa`; pagamento: `FormularioPreferencias` e `FormularioTaxas` de Configurações no visual do quadro; equipe: o cadastro de Usuários (`convidarMembro`), mostrando "Pessoa cadastrada" e a senha temporária devolvida; revisar: resumo, "Editar"/"Fazer agora" (`?passo=`), "Começar a usar o Raion" → `concluirAssistente` → `/inicio`.
- [ ] **Step 4:** teste → PASS; `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** — `feat(assistente): telas, pagamento, equipe e revisão`.

### Task 6: Navegador, verificação, quadro e status

**Files:** Create `e2e/35-assistente.spec.ts`; Modify `docs/PROJECT_STATUS.md`; canvas: texto do quadro `OnboardingEquipe` ("Pessoa cadastrada" e senha temporária)

- [ ] **Step 1: e2e** — o teste cria (pelo `servico`, como a base) uma empresa nova com admin e vendedor e a linha de onboarding; admin entra → `/primeiro-acesso` passo 1; preenche o nome e continua; pula os demais; conclui → Início; entrar de novo não leva ao assistente; o vendedor da empresa nunca é levado; a faixa: com `faixa_caminho` de uma imagem pública, o cabeçalho do Início usa essa imagem.
- [ ] **Step 2:** `pnpm exec playwright test e2e/35-assistente.spec.ts` → PASS.
- [ ] **Step 3:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` → ok.
- [ ] **Step 4:** quadro `OnboardingEquipe` ajustado; `docs/PROJECT_STATUS.md` (subprojeto 3).
- [ ] **Step 5: Commit** — `test(assistente): navegador e status`; PR e pedido de autorização do fluxo da migration.
