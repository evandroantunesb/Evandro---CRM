# Procuração configurável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a empresa cadastra um modelo de procuração (texto com `{{campos}}`, como o contrato) e baixa a procuração preenchida em PDF pelo negócio (aba "Proposta e contrato") e pela obra (item do checklist da Copel na Engenharia); os PDFs de procuração e de contrato passam a sair com o logo da própria empresa, discreto.

**Architecture:** reaproveita o motor do contrato (`PLACEHOLDERS_CONTRATO`, `montarDadosContrato`, `camposSemDado`, `validarModeloContrato` em `src/lib/contrato.ts`) sem campo novo. Banco: tabela `modelos_procuracao` igual a `modelos_contrato`; marca `gera_procuracao` no modelo do checklist da Engenharia; RPC `dados_procuracao_obra` (security definer) entrega à Engenharia só os dados que a procuração usa, sem valor nem contatos. PDF: `ContratoPdfDocument` vira `DocumentoPdf` com rótulo e marca da empresa. A procuração não é gravada: é gerada a cada download (a assinatura fica para o item 2 do roadmap).

**Tech Stack:** Next.js 16 (route handlers), Supabase (Postgres, RLS, Storage `proposta-marca`), `@react-pdf/renderer`, Vitest.

**Spec:** prévia aprovada pelo Evandro em 17/11/2026 no canvas "Raion — Nova interface", linha "Documentos configuráveis: procuração" (`DocProcuracaoConfig`, `DocProcuracaoNegocio`, `DocProcuracaoPdf`, `DocProcuracaoEngenharia`, `DocContratoPdfCabecalho`); decisões na memória `projeto-documentos-procuracao` e no `docs/ROADMAP.md` (item 1).

## Global Constraints

- Migration: `supabase/migrations/20261212100000_procuracao.sql` (a mais recente da `main` é `20261211100000`; nenhuma PR aberta tem migration).
- Tela do modelo em **Configurações › Venda**, título "Modelo de procuração", descrição "Texto da procuração, com campos preenchidos sozinhos."; editam os papéis de `EDITAR_MODELO_CONTRATO` (`["admin"]`).
- Baixar pelo negócio: papéis de `PROPOSTA_E_CONTRATO` (`["admin","gestor","vendedor"]`), sob a RLS de hoje. Baixar pela obra: papéis de `ENGENHARIA` (`["admin","gestor","operacao"]`) **e** `autorizacao_setor_obra(obra, 'engenharia')` não nula (conferido no banco).
- A Engenharia nunca recebe `negocio_valor`, condição de pagamento, e-mail, telefones nem data de nascimento: no PDF da obra esses campos saem "—".
- Logo no PDF: `proposta_identidades.logo_url` (fundo claro), assinado com a chave de serviço; só PNG/JPEG (o react-pdf não lê WebP); sem logo utilizável, só o nome (`nome_exibicao`, senão `empresas.nome`). **Nunca** a marca Raion: sai o `public/marca/logo-escuro.png` do contrato. Tamanho máximo 72 × 16 pt, nome em 8 pt cinza `#6B7280` ao lado.
- Textos da interface exatamente como no canvas: "Procuração", "Representação na distribuidora", "Baixar procuração (PDF)", "A empresa ainda não tem modelo de procuração.", "Cadastrar o modelo em Configurações", "Peça ao admin para cadastrar o modelo", "Faltam dados que o modelo usa:", "Baixar procuração preenchida".
- Nome do arquivo: `procuracao-<titulo do negócio com não alfanuméricos trocados por ->.pdf`.

## Review Focus

1. Admin renomeou o item do checklist ou apagou a marca: o item fica sem botão (nada quebra); a marca é por coluna, não pelo título na hora de exibir. Teste no Task 1 (item renomeado continua marcado).
2. Logo WebP, logo apagado do Storage ou assinatura falhando: o PDF sai só com o nome, nunca dá erro 500. Teste no Task 2.
3. Operação de outro setor (Compras) ou de outra empresa chamando a rota da obra: recusa no banco (42501), não só na tela. Teste no Task 1.
4. Modelo vazio ou só com espaços: a rota responde 409 "A empresa ainda não tem modelo de procuração." e o cartão mostra o aviso. Testes nos Tasks 3 e 4.
5. Modelo com campo desconhecido (`{{cpf}}`): o salvar recusa, como no contrato (`validarModeloContrato`). Teste no Task 3.

---

### Task 1: Banco — modelo, marca no checklist e dados para a Engenharia

**Files:**
- Create: `supabase/migrations/20261212100000_procuracao.sql`
- Modify (gerado): `src/lib/supabase/database.types.ts` via `pnpm db:types`
- Test: `tests/procuracao-db.test.ts`

**Interfaces:**
- Produces:
  - tabela `public.modelos_procuracao (empresa_id uuid pk → empresas, conteudo text not null default '', atualizado_por uuid → empresa_membros on delete set null, created_at, updated_at)`; trigger de `updated_at` como em `modelos_contrato`; RLS: select `tem_acesso_comercial(empresa_id)`, insert/update `tem_papel(empresa_id,'{admin}')`; sem delete.
  - coluna `engenharia_checklist_modelo.gera_procuracao boolean not null default false` + índice único parcial `(empresa_id) where gera_procuracao`; backfill e marcação de empresa nova pelo título `'procuração no modelo da engenharia, com os documentos do cliente'` (lower/btrim), redefinindo `marcar_documento_cliente_modelo()` (corpo de `20261127100000`) para marcar também esta coluna.
  - `public.tem_modelo_procuracao(p_empresa_id uuid) returns boolean` (security definer, stable; `membro_ativo(p_empresa_id)` e `length(btrim(conteudo)) > 0`); `execute` para `authenticated`.
  - `public.dados_procuracao_obra(p_obra_id uuid) returns jsonb` (security definer, stable): recusa com `42501` + `hint = 'mensagem_usuario'` se `autorizacao_setor_obra(p_obra_id,'engenharia') is null`; devolve `{"modelo": text, "empresa_id": uuid, "empresa": {"nome","cnpj"}, "negocio": {"titulo","numero","unidade_consumidora","qualif_distribuidora","consumo_medio_kwh"}, "contato": {"nome","documento","rg","endereco","cidade","uf","inscricao_estadual"}}`; `execute` só para `authenticated`.

- [ ] **Step 1: Escrever `tests/procuracao-db.test.ts`** (padrão de `tests/compras-substituto-candidatos-db.test.ts`: empresa A e B, admin, vendedor, engenheiro participante, comprador, obra por `confirmar_pagamento`). Casos:
  - `admin grava o modelo; vendedor lê; operação não lê a tabela; admin de B não lê o de A`;
  - `empresa nova nasce com o item da procuração marcado (gera_procuracao) e só ele`;
  - `item renomeado pelo admin continua marcado`;
  - `tem_modelo_procuracao: false sem modelo e com modelo só de espaços; true com texto`;
  - `engenheiro participante recebe os dados: chaves exatamente as da interface, sem valor, e-mail nem telefone` (`expect(Object.keys(d.contato).sort()).toEqual(["cidade","documento","endereco","inscricao_estadual","nome","rg","uf"])` e `expect(d.negocio).not.toHaveProperty("valor")`);
  - `comprador e admin de B recebem 42501`.
- [ ] **Step 2:** `pnpm exec vitest run tests/procuracao-db.test.ts` → FAIL (tabela/função inexistente).
- [ ] **Step 3:** escrever a migration (ler antes `supabase-postgres-best-practices`); `pnpm db:reset`; `pnpm db:types`.
- [ ] **Step 4:** rodar o teste → PASS; `pnpm typecheck`.
- [ ] **Step 5:** commit `feat(procuracao): modelo, marca no checklist e dados para a Engenharia`.

### Task 2: PDF com a marca da empresa (contrato e procuração)

**Files:**
- Modify: `src/lib/pdf-contrato.tsx`
- Create: `src/lib/marca-pdf.ts`
- Modify: `src/app/contrato/[token]/pdf/route.ts`
- Test: `tests/marca-pdf.test.ts`, `tests/contrato-pdf.test.ts`

**Interfaces:**
- Produces:
  - `type MarcaPdf = { logoUrl: string | null; nome: string | null }`
  - `lerMarcaPdf(admin: ReturnType<typeof criarClienteAdmin>, empresaId: string): Promise<MarcaPdf>` em `src/lib/marca-pdf.ts`: lê `proposta_identidades(logo_url, nome_exibicao)` e `empresas(nome)`; assina `logo_url` no bucket `proposta-marca` por 3600 s só se o caminho termina em `.png`, `.jpg` ou `.jpeg`; qualquer falha → `logoUrl: null` com `registrarErro`.
  - `DocumentoPdf({ rotulo, titulo, conteudo, marca }: { rotulo: string; titulo: string | null; conteudo: string; marca: MarcaPdf })` em `src/lib/pdf-contrato.tsx`; `ContratoPdfDocument` passa a ser `DocumentoPdf` com `rotulo: "Contrato"` e recebe `marca`. Cabeçalho: logo (máx. 72 × 16 pt, `objectFit: "contain"`) + nome 8 pt `#6B7280`; sem logo, só o nome; sem os dois, só o filete.
- [ ] **Step 1:** testes: `tests/marca-pdf.test.ts` — `logo .webp: só o nome`, `logo .png: URL assinada`, `sem identidade: nome da empresa`, `assinatura com erro: logoUrl nulo`; `tests/contrato-pdf.test.ts` — o mock do admin passa a responder também `proposta_identidades`/`empresas`, e o caso "contrato pronto" continua 200.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar; a rota do contrato seleciona também `empresa_id` e passa `await lerMarcaPdf(admin, empresa_id)`.
- [ ] **Step 4:** rodar os dois → PASS.
- [ ] **Step 5:** commit `feat(pdf): logo da empresa no PDF do contrato`.

### Task 3: Configurações › Modelo de procuração

**Files:**
- Create: `src/app/(app)/configuracoes/procuracao/page.tsx`
- Modify: `src/app/(app)/configuracoes/contrato/formularios.tsx` (o formulário recebe a ação por prop), `src/app/(app)/configuracoes/page.tsx` (item em "Venda", depois de "Modelo de contrato"), `src/lib/acoes/contratos.ts` ou novo `src/lib/acoes/procuracao.ts`
- Test: `tests/procuracao-acoes.test.ts`

**Interfaces:**
- Produces: `salvarModeloProcuracao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao>` em `src/lib/acoes/procuracao.ts` — mesmo corpo de `salvarModeloContrato` (exige `EDITAR_MODELO_CONTRATO`, valida com `validarModeloContrato`, upsert em `modelos_procuracao`, `revalidatePath("/configuracoes/procuracao")`).
- [ ] **Step 1:** testes (mock do Supabase, como os testes de ações existentes): `campo desconhecido {{cpf}}: recusa com a mensagem do contrato`, `texto válido: upsert em modelos_procuracao`, `vendedor: recusado por exigirPapel`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar a ação, a página (cópia da do contrato com os textos do canvas e os campos em destaque: `cliente_nome, cliente_documento, cliente_rg, cliente_endereco, cliente_cidade, cliente_uf, negocio_uc, distribuidora, empresa_nome, empresa_cnpj, data_hoje`) e o item no índice.
- [ ] **Step 4:** rodar → PASS; `pnpm lint`.
- [ ] **Step 5:** commit `feat(procuracao): tela do modelo em Configurações`.

### Task 4: Procuração no negócio (cartão e PDF)

**Files:**
- Modify: `src/lib/contratos-geracao.ts` (extrair a leitura)
- Create: `src/app/(app)/negocios/[id]/procuracao/route.ts`, `src/app/(app)/negocios/[id]/procuracao.tsx`
- Modify: `src/app/(app)/negocios/[id]/dados-ficha.ts`, `src/app/(app)/negocios/[id]/aba-proposta.tsx` (cartão logo abaixo do "Contrato", fora do eletroposto)
- Test: `tests/procuracao-negocio.test.ts`

**Interfaces:**
- Produces:
  - `lerFontesContrato(supabase: SupabaseServidor, empresaId: string, negocioId: string, agora?: Date): Promise<FontesContrato | null>` exportada de `contratos-geracao.ts`, usada por `gerarContratoComCliente` (sem mudar o comportamento dele).
  - rota `GET /negocios/[id]/procuracao`: `exigirPapel(...PROPOSTA_E_CONTRATO)`; modelo vazio → 409 com "A empresa ainda não tem modelo de procuração."; negócio não visível → 404; senão `DocumentoPdf({ rotulo: "Procuração", titulo: contato.nome ?? negocio.titulo, conteudo: preencherModeloContrato(modelo, montarDadosContrato(fontes)), marca })`, `Content-Disposition: inline; filename="procuracao-<titulo>.pdf"`.
  - na ficha: `procuracao: { temModelo: boolean; faltando: string[] }` (rótulos de `camposSemDado` para os campos que o modelo usa).
- [ ] **Step 1:** testes da rota (mocks como `tests/contrato-pdf.test.ts`): `sem modelo: 409 com a mensagem`, `modelo com {{negocio_uc}} sem UC: 200 e "—" no texto`, `pronto: application/pdf e nome procuracao-…`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar a extração, a rota e o cartão com os três estados do quadro `DocProcuracaoNegocio` (o link "Cadastrar o modelo em Configurações" só para `EDITAR_MODELO_CONTRATO`; o botão é um `<a href>` para a rota, `target="_blank"`).
- [ ] **Step 4:** rodar → PASS; `pnpm vitest run tests/contrato*.test.ts` continua verde.
- [ ] **Step 5:** commit `feat(procuracao): cartão e PDF no negócio`.

### Task 5: Procuração no checklist da obra (Engenharia)

**Files:**
- Create: `src/app/(app)/engenharia/[id]/procuracao/route.ts`
- Modify: `src/lib/engenharia-checklist.ts` (select `engenharia_checklist_modelo(documento_cliente, gera_procuracao)`; item ganha `geraProcuracao: boolean`; retorno ganha `temModeloProcuracao` por `tem_modelo_procuracao`), `src/components/engenharia/checklist.tsx`
- Test: `tests/procuracao-obra.test.ts`

**Interfaces:**
- Consumes: `dados_procuracao_obra` e `tem_modelo_procuracao` (Task 1), `DocumentoPdf` e `lerMarcaPdf` (Task 2).
- Produces: rota `GET /engenharia/[id]/procuracao` (`id` = obra): `exigirPapel(...ENGENHARIA)`; erro `42501` do RPC → 403; modelo vazio → 409 com a mesma mensagem; senão monta `FontesContrato` a partir do JSON (campos ausentes `null`, `calculo: null`, `itensKit: []`, `vendedorNome: null`, `negocio.valor: null`) e devolve o PDF com `lerMarcaPdf(criarClienteAdmin(), empresa_id)`.
- [ ] **Step 1:** testes da rota: `42501 do banco: 403`, `sem modelo: 409`, `valor e telefone no modelo saem "—"`, `pronto: application/pdf`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar a rota e, no item com `geraProcuracao`, o botão "Baixar procuração preenchida" (link para a rota) antes de "Anexar"; sem modelo, no lugar do botão: "A empresa ainda não tem modelo de procuração." (quadro `DocProcuracaoEngenharia`).
- [ ] **Step 4:** rodar → PASS; `pnpm vitest run tests/engenharia*.test.ts` verde.
- [ ] **Step 5:** commit `feat(procuracao): botão no checklist da Engenharia`.

### Task 6: Verificação e entrega

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` (com Supabase local) e `pnpm build` verdes.
- [ ] Atualizar `docs/PROJECT_STATUS.md` (seção da procuração; pendências) e `docs/ROADMAP.md` (Documentos configuráveis).
- [ ] PR com a etiqueta `navegador` (mexe em Engenharia e `supabase/**`); migration em produção só pelo `banco-producao.yml`, com autorização e aprovação do Evandro.
