# Contrato: conferir, editar e enviar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O vendedor confere o texto do contrato no cartão do negócio, edita o rascunho dentro do CRM (com rastro), envia pelo WhatsApp direto ao cliente; o modelo ganha formatação simples e três campos novos.

**Architecture:** A edição grava por uma RPC `security definer` que confere papel, responsável e rascunho; um gatilho em `contratos` mantém a marca "editado à mão" (liga na RPC, apaga em "Gerar novamente") e trava o texto fora do rascunho. Um único interpretador de formatação (`blocosDocumento`) alimenta a conferência, a página pública e o PDF.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres/RLS), `@react-pdf/renderer`, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-contrato-conferir-editar-design.md`. Prévia aprovada: canvas "Raion — Nova interface", linha "Contrato: conferir, editar e enviar" (`ContratoNegocio`, `ContratoEnderecoInstalacao`, `ContratoPdfFormatado`).

## Global Constraints

- Quem edita o texto: admin, gestor (que vê o negócio) e o responsável atual pelo negócio com papel `vendedor`. SDR nunca.
- Edição só com `contratos.status = 'rascunho'`; fora dele o texto não muda (trava no banco, não só na tela).
- Texto editado: não vazio, sem `{{` nem `}}`, até 60.000 caracteres.
- Cada edição registra atividade `contrato_texto_editado` no negócio. Nunca escrever em `eventos` nem `point_ledger`; valor, pontos e comissão continuam vindo do negócio.
- "Gerar novamente" com texto editado pede confirmação com a frase: "O texto volta ao modelo e você perde as edições feitas à mão. Gerar de novo?" e apaga a marca.
- Formatação aceita: linha `# ` ou `## ` (título), `**negrito**` em qualquer linha, linha `- ` (item de lista). Nada além. Texto sem esses símbolos sai igual a hoje.
- Campos novos: `{{negocio_valor_extenso}}` ("Valor do negócio por extenso"), `{{tipo_telhado}}` ("Tipo do telhado"), `{{endereco_instalacao}}` ("Endereço da instalação (ou do cliente)").
- Migration `supabase/migrations/20261213100000_contrato_texto_editado.sql`; tabela/coluna nova preserva RLS por `empresa_id`; `database.types.ts` só por `pnpm db:types`.
- Português em toda interface e mensagem; reutilizar `src/components/ui.tsx`; mobile primeiro.

## Review Focus

- Contrato antigo com linhas que começam com `- ` ou têm `**`: passa a sair formatado; não pode sumir texto (o interpretador nunca descarta caracteres que não sejam os marcadores). Teste em Task 2.
- `**` sem par (ex.: "5 ** 2"): sai literal, sem negrito pela metade. Teste em Task 2.
- Gestor de outra equipe ou vendedor que não é o responsável tentando editar: recusa e banco intacto. Teste em Task 4.
- Telefone do cliente vazio, curto ou com máscara: WhatsApp cai no link sem destinatário, nunca em `wa.me/55`. Teste em Task 6.
- Valor com centavos e valores redondos grandes (1.000.000, 2.000,01): extenso correto. Teste em Task 1.

---

### Task 1: Valor por extenso

**Files:**
- Create: `src/lib/extenso.ts`
- Test: `tests/extenso.test.ts`

**Interfaces:**
- Produces: `valorPorExtenso(valor: number): string` (reais e centavos, arredonda a 2 casas; valor < 0 ou não finito lança `RangeError`).

- [ ] **Step 1: Teste que falha** — `tests/extenso.test.ts`, `it.each`:

```ts
[
  [0, "zero real"], [1, "um real"], [0.01, "um centavo"], [0.5, "cinquenta centavos"],
  [2, "dois reais"], [100, "cem reais"], [101, "cento e um reais"], [1000, "mil reais"],
  [1001, "mil e um reais"], [1100, "mil e cem reais"], [1234, "mil, duzentos e trinta e quatro reais"],
  [42500, "quarenta e dois mil e quinhentos reais"], [2000.01, "dois mil reais e um centavo"],
  [1000000, "um milhão de reais"], [2500000, "dois milhões e quinhentos mil reais"],
  [1234567.89, "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos"],
]
```
e `expect(() => valorPorExtenso(-1)).toThrow(RangeError)`.

- [ ] **Step 2:** `pnpm vitest run tests/extenso.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar.** Grupos de milhar; entre grupos usa " e " quando o grupo seguinte é < 100 ou múltiplo de 100, senão ", "; "mil" sem "um"; "de reais" depois de milhão/bilhão exatos; centavos com " e ".
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(contrato): valor por extenso`.

### Task 2: Interpretador de formatação e componente

**Files:**
- Create: `src/lib/documento-formatado.ts`, `src/components/documento-formatado.tsx`
- Test: `tests/documento-formatado.test.ts`

**Interfaces:**
- Produces:
  - `type Trecho = { texto: string; negrito: boolean }`
  - `type Bloco = { tipo: "titulo"; nivel: 1 | 2; trechos: Trecho[] } | { tipo: "paragrafo"; trechos: Trecho[] } | { tipo: "item"; trechos: Trecho[] } | { tipo: "vazio" }`
  - `blocosDocumento(texto: string): Bloco[]` — uma linha do texto = um bloco (aceita `\r\n`).
  - `<DocumentoFormatado texto={string} className?={string} />` — `h2`/`h3` para título, `p`, `ul > li` agrupando itens consecutivos, `strong` para negrito, linha vazia como espaço.

- [ ] **Step 1: Testes que falham:**
  - `"# Título"` → `[{tipo:"titulo", nivel:1, trechos:[{texto:"Título", negrito:false}]}]`; `"## CLÁUSULA 1ª"` → nível 2.
  - `"**CONTRATANTE:** Fulano"` → parágrafo com `[{texto:"CONTRATANTE:",negrito:true},{texto:" Fulano",negrito:false}]`.
  - `"- Juros de 1%"` → `{tipo:"item", ...}`; `"-sem espaço"` → parágrafo literal.
  - `"5 ** 2"` → parágrafo com um trecho `"5 ** 2"` sem negrito.
  - `"a\n\nb"` → parágrafo, vazio, parágrafo.
  - Propriedade: para qualquer texto sem marcadores, `blocos.map(texto).join("\n") === texto` (teste com o MODELO de `tests/contrato-db.test.ts`).
- [ ] **Step 2:** `pnpm vitest run tests/documento-formatado.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `blocosDocumento` e o componente (componente sem lógica própria além do agrupamento de itens).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(documentos): formatação simples (título, negrito, lista)`.

### Task 3: PDF e página pública formatados

**Files:**
- Modify: `src/lib/pdf-contrato.tsx:46-51` (troca o `split` por `blocosDocumento`)
- Modify: `src/app/contrato/[token]/page.tsx:40-43` (troca o `article whitespace-pre-wrap` por `<DocumentoFormatado>` dentro do mesmo `article`, sem `whitespace-pre-wrap`)
- Test: `tests/contrato-pdf.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `blocosDocumento`, `DocumentoFormatado` (Task 2).

- [ ] **Step 1: Teste que falha** em `tests/contrato-pdf.test.ts`: gerar o PDF com `conteudo = "## CLÁUSULA 1ª\n**CONTRATANTE:** Fulano\n- item"` e conferir que o texto extraído contém "CLÁUSULA 1ª", "CONTRATANTE:" e "item" e **não** contém "##" nem "**" (seguir o jeito de extrair texto que o arquivo já usa).
- [ ] **Step 2:** `pnpm vitest run tests/contrato-pdf.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** No PDF: título nível 1 `fontSize 13` bold, nível 2 `fontSize 10.5` bold com `marginTop 10`; negrito com `Helvetica-Bold` em `<Text>` aninhado; item com "•" e recuo de 10; cada bloco continua um `<Text>` próprio (a quebra de página entre linhas continua). Procuração usa o mesmo `DocumentoPdf` e ganha a formatação junto.
- [ ] **Step 4:** → PASS; `pnpm vitest run tests/contrato.test.ts` continua PASS.
- [ ] **Step 5: Commit** `feat(contrato): PDF e link do cliente formatados`.

### Task 4: Banco — texto editado, trava e endereço da instalação

**Files:**
- Create: `supabase/migrations/20261213100000_contrato_texto_editado.sql`
- Modify: `src/lib/supabase/database.types.ts` (só `pnpm db:types`)
- Test: `tests/contrato-texto-editado-db.test.ts`

**Interfaces:**
- Produces:
  - `contratos.texto_editado_em timestamptz null`, `contratos.texto_editado_por uuid null references empresa_membros(id) on delete set null`.
  - `negocios.endereco_instalacao text null`, `check (char_length(endereco_instalacao) <= 300)`.
  - RPC `editar_texto_contrato(p_negocio_id uuid, p_conteudo text) returns void`, `security definer`, `search_path = ''`, `EXECUTE` só para `authenticated`.
  - Atividade `tipo = 'contrato_texto_editado'`, `ator_id = auth.uid()`, `dados = {contrato_id}`.

Regras (ler antes a skill `supabase-postgres-best-practices`):
- RPC: trava a linha de `contratos` do negócio (`for update`); recusa com `hint = 'mensagem_usuario'`: sem contrato ("Contrato não encontrado."); sem permissão ("Sem permissão para editar o texto deste contrato.") — permitido só se `pode_ver_financeiro_negocio(p_negocio_id)` e (`tem_papel(empresa,'{admin,gestor}')` ou (`negocios.responsavel_id = meu_membro_id(empresa)` e `tem_papel(empresa,'{vendedor}')`)); fora do rascunho ("O texto só muda com o contrato em rascunho."); vazio após `btrim` ("O texto do contrato não pode ficar vazio."); > 60.000 ("O texto do contrato passou do limite de 60.000 caracteres."); com `{{` ou `}}` ("Tire as chaves {{ ou }} do texto antes de salvar."). Texto igual ao atual = não faz nada (sem atividade). Liga `set_config('raion.contrato_edicao_manual','on', true)` só em volta do `update` (desliga logo depois), grava `conteudo` e `atualizado_por`, insere a atividade.
- Gatilho `before insert or update` em `contratos` (`contratos_texto_editado`): no insert, zera as duas colunas; no update com `conteudo` igual, copia as duas de `old` (ninguém muda a marca à mão); com `conteudo` diferente: se papel `authenticated` e `old.status <> 'rascunho'`, recusa ("O texto só muda com o contrato em rascunho."); se a configuração estiver `on`, marca `now()` e `meu_membro_id(new.empresa_id)`; senão (gerar novamente), zera as duas.

- [ ] **Step 1: Testes que falham** (`tests/contrato-texto-editado-db.test.ts`, mesmo preparo de `tests/contrato-db.test.ts`; usuários admin, gestor de outra equipe, vendedor responsável, outro vendedor, sdr):
  - responsável edita → `conteudo` novo, `texto_editado_por` = membro dele, `texto_editado_em` não nulo, 1 atividade `contrato_texto_editado`.
  - admin edita → ok; gestor de outra equipe, outro vendedor e sdr → erro e `conteudo` intacto.
  - contrato em `aguardando_assinatura` → erro pela RPC **e** `update` direto de `conteudo` pelo cliente autenticado → erro.
  - vazio, `"   "`, texto com `{{x}}` e 60.001 caracteres → erro com a mensagem acima.
  - texto igual → nenhuma atividade nova.
  - `gerarContratoComCliente` depois de editado → marca volta a nulo.
  - `update` direto de `texto_editado_em` pelo responsável → valor não muda.
  - `negocios.endereco_instalacao` com 301 caracteres → erro de `check`.
- [ ] **Step 2:** `pnpm db:reset && pnpm vitest run tests/contrato-texto-editado-db.test.ts` → FAIL.
- [ ] **Step 3: Escrever a migration** com as regras acima; `pnpm db:reset && pnpm db:types`.
- [ ] **Step 4:** teste → PASS; `pnpm vitest run tests/contrato-db.test.ts tests/integridade-contratos-db.test.ts tests/dados-cliente-contrato-db.test.ts tests/blindagem-contratos-sdr-db.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(contrato): edição do texto no banco e endereço da instalação`.

### Task 5: Campos novos no contrato e endereço no negócio

**Files:**
- Modify: `src/lib/contrato.ts` (`PLACEHOLDERS_CONTRATO`, `FontesContrato`, `montarDadosContrato`)
- Modify: `src/lib/contratos-geracao.ts` (`lerFontesNegocio`: ler `tipo_telhado`, `endereco_instalacao`)
- Modify: `src/lib/negocios-gravacao.ts:128,292` (campo `endereco_instalacao`: `z.string().trim().max(300).optional()`, gravado como `|| null`, mesmo tratamento do `tipo_telhado`, inclusive no eletroposto)
- Modify: `src/app/(app)/negocios/[id]/edicao.tsx` (campo depois de "Tipo do telhado", ocupando as duas colunas), `edicao-dados.tsx`, `dados-ficha.ts:41` (ler a coluna)
- Modify: tela do modelo de contrato em `src/app/(app)/configuracoes/` (dica "Use ## para título, **negrito** e - para lista", acima do campo do modelo)
- Test: `tests/contrato.test.ts`, `tests/negocios-acoes-db.test.ts`

**Interfaces:**
- Consumes: `valorPorExtenso` (Task 1); colunas da Task 4.
- Produces: chaves `negocio_valor_extenso`, `tipo_telhado`, `endereco_instalacao` em `DadosContrato`.

- [ ] **Step 1: Testes que falham** em `tests/contrato.test.ts` (`montarDadosContrato`):
  - valor 42500 → `negocio_valor_extenso = "quarenta e dois mil e quinhentos reais"`; valor nulo → `""`.
  - `tipo_telhado: "metálico"` → `"metálico"`.
  - `endereco_instalacao` preenchido → ele mesmo; vazio → `"<cliente_endereco>, <cidade>/<uf>"`; sem endereço do cliente → `""`.
  - `validarModeloContrato("{{tipo_telhado}} {{endereco_instalacao}} {{negocio_valor_extenso}}").desconhecidos` → `[]`.
  - Em `tests/negocios-acoes-db.test.ts`, no teste que já grava `tipo_telhado: "metálico"`, gravar também `endereco_instalacao: "Sítio Boa Vista, Estrada X, km 3"` e conferir a leitura.
- [ ] **Step 2:** `pnpm vitest run tests/contrato.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Placeholder do endereço: o campo do formulário tem rótulo "Endereço da instalação" e `placeholder="Deixe vazio se for o endereço do cliente"`.
- [ ] **Step 4:** `pnpm vitest run tests/contrato.test.ts tests/negocios-acoes-db.test.ts tests/eletroposto-db.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(contrato): valor por extenso, telhado e endereço da instalação no modelo`.

### Task 6: Cartão do contrato — conferir, editar, enviar

**Files:**
- Modify: `src/lib/acoes/contratos.ts` (nova ação)
- Modify: `src/app/(app)/negocios/[id]/contrato.tsx`
- Modify: `src/app/(app)/negocios/[id]/dados-ficha.ts:163-167` (ler `conteudo, texto_editado_em, texto_editado_por`) e `aba-proposta.tsx:206-222` (passar os novos dados)
- Modify: `src/lib/linha-do-tempo.ts` (caso `contrato_texto_editado` → "Editou o texto do contrato")
- Modify: `src/lib/obras/checklist.ts` só se for preciso exportar algo; reutilizar `linkWhatsApp`
- Create: `src/lib/contrato-envio.ts`
- Test: `tests/contrato-envio.test.ts`, `tests/linha-do-tempo.test.ts` (se existir; senão no teste do módulo que já cobre `descreverAtividade`)

**Interfaces:**
- Consumes: RPC `editar_texto_contrato` (Task 4), `DocumentoFormatado` (Task 2), `linkWhatsApp(telefone, mensagem): string | null` de `src/lib/obras/checklist.ts`.
- Produces:
  - `editarTextoContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao>` — `negocioId` uuid, `conteudo` string até 60.000; SDR recusado como em `gerarContrato`; chama a RPC; `revalidatePath` do negócio; sucesso "Texto do contrato salvo.".
  - `linkWhatsAppContrato(cliente: { nome: string | null; telefone: string | null }, link: string): string` em `src/lib/contrato-envio.ts` — mensagem `"Olá, <primeiro nome>! Segue o seu contrato: <link>"` (sem nome: `"Olá! Segue o seu contrato: <link>"`); sem telefone válido devolve `https://wa.me/?text=<mensagem>`.
  - `ContratoSalvo` passa a ter `conteudo: string`, `editadoEm: string | null`, `editadoPorNome: string | null`; `Contrato` recebe `cliente: { nome: string | null; telefone: string | null }` e `podeEditar: boolean` (admin, gestor ou responsável com papel vendedor — a RPC é a barreira real).

- [ ] **Step 1: Testes que falham:** `tests/contrato-envio.test.ts`: `("Marcos Pereira", "(45) 99999-0000")` → `https://wa.me/5545999990000?text=` + mensagem codificada; telefone `""`, `null` e `"1234"` → `https://wa.me/?text=...`; nome nulo → "Olá! Segue...". Linha do tempo: `descreverAtividade("contrato_texto_editado", {contrato_id:"x"}, nomes)` → `"Editou o texto do contrato"`.
- [ ] **Step 2:** `pnpm vitest run tests/contrato-envio.test.ts` → FAIL.
- [ ] **Step 3: Implementar a ação, o helper e o cartão** como no quadro `ContratoNegocio` do canvas: rascunho mostra o texto em `DocumentoFormatado` numa área com rolagem (`max-h-80 overflow-y-auto`, `tabIndex={0}`, `aria-label="Texto do contrato"`); botões "Editar texto" (se `podeEditar`) e "Gerar novamente"; separador; "Enviar no WhatsApp" (ouro) com a linha "Abre a conversa com <nome> · <telefone>" quando houver telefone válido, "Baixar PDF", "Copiar link". Editando: `textarea` com o texto, dica de formatação, "Salvar texto"/"Cancelar", aviso "Valor, pontos e comissão continuam vindo do negócio, não do texto. A edição fica no histórico com seu nome." Com marca: selo "Texto editado à mão · <nome>, <data/hora>" e confirmação antes de gerar (frase das Global Constraints; botões "Gerar e perder edições" e "Manter"). Fora do rascunho: como hoje (link, botões, status), sem editar nem gerar. O status continua no fim do cartão.
- [ ] **Step 4:** testes → PASS; `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(contrato): conferir, editar e enviar no cartão do negócio`.

### Task 7: Verificação final e documentação

**Files:**
- Modify: `docs/PROJECT_STATUS.md` (seção nova + "Ponto de retomada"), `docs/ROADMAP.md` (item 2: assinatura eletrônica fora; entra "conferir, editar e enviar o contrato")

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (no worktree `C:\dev\crm-contrato-editar`, com a stack Supabase deste checkout) → tudo verde; anotar contagem de testes.
- [ ] **Step 2:** Conferir no navegador (`pnpm dev`) um negócio com o modelo de `C:\dev\modelos\contrato-modelo.md` colado: gerar, conferir, editar, gerar de novo com confirmação, PDF formatado, link público formatado, WhatsApp com número.
- [ ] **Step 3:** Atualizar os dois documentos; commit `docs(status): contrato conferir, editar e enviar`.
- [ ] **Step 4:** Push e PR com etiqueta `navegador` (mexe em `supabase/**`). Migration aplicada em produção só pelo `banco-producao.yml`, com aprovação do Evandro, antes do merge.
