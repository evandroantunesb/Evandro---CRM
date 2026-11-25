# Geração e consumo mês a mês (proposta completa, PR 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A empresa cadastra uma curva de geração de 12 meses, o vendedor pode informar o consumo dos 12 meses do cliente, e a proposta emitida (PDF e página on-line) mostra o gráfico "Geração e consumo mês a mês".

**Architecture:** Duas colunas novas (curva em `parametros_calculadora`, consumo em `negocios`), lidas na emissão e congeladas no esquema 8 da emissão simples (`mensal`). Uma função pura distribui a geração do ano pela curva. O cálculo do kit, a economia e o payback não mudam.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Zod 4, Supabase/Postgres (RLS), `@react-pdf/renderer`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-geracao-mensal-design.md`. Prévia aprovada em 25/11/2026: https://claude.ai/artifact/7ZdbwhJz1KAEVvbsciq5Vw

## Global Constraints

- Português em toda a interface, mensagens, nomes e commits; reutilizar `src/components/ui.tsx`.
- A curva só redistribui o ano: soma dos 12 meses de `geracaoKwh` = `Math.round(geracao.kwhMes × 12)`, exata.
- Curva: 12 valores > 0, ou nenhuma (nula). Consumo dos 12 meses: 12 valores ≥ 0, ou nenhum. "12 ou nenhum" vale nos dois.
- A curva não entra em vigência de cálculo, não apaga a confirmação da produtividade; o consumo mensal não muda `consumo_medio_kwh` nem a vigência.
- `mensal` só existe com `sistema.geracao != null` (produtividade confirmada) **e** curva cadastrada; faltar a curva não é pendência de emissão.
- Esquemas 4 a 7 continuam legíveis e renderizados como hoje; o novo é o 8, renderizador `simples-v8`.
- Cores do gráfico: dourado `#d4af37` (geração) e cinza `#6b7280` (consumo) no PDF; na página on-line, `bg-dourado` e `bg-offwhite/45` sobre `bg-carvao`.
- Nota do gráfico, texto exato: "No verão o sistema gera mais e no inverno, menos. O excedente vira crédito na distribuidora e compensa os meses de menor geração (validade de 60 meses)."
- Legenda do consumo: "Seu consumo" (`consumoOrigem = "informado"`) ou "Seu consumo médio (N kWh)" (`"media"`).
- Migration `supabase/migrations/20261222100000_geracao_mensal.sql`; atualizar junto `MIGRATIONS_AUTORIZADAS` em `.github/workflows/banco-producao.yml` e `AUTORIZADAS` em `tests/validar-conjunto-migrations.test.ts`.
- `src/lib/supabase/database.types.ts` só por `pnpm db:types`.
- Ambiente: rodar em `C:\dev\crm-proposta-p4` (já tem `.env.local`? copiar de `C:\dev\crm-sem-carbono\.env.local`, só valores locais). Suítes `*-db`, `db:reset` e `db:types` exigem o Docker Desktop ligado e a stack Supabase deste repositório (`pnpm exec supabase start`); sem Docker, parar e avisar o Evandro.

## Review Focus

- Curva com um mês zerado, negativo, vazio ou com 11 valores: a gravação recusa com mensagem clara, nunca grava curva parcial (teste na Task 3).
- Edição do negócio enviada sem nenhum campo `consumo_mes_*` (formulário antigo aberto, eletroposto, cartão "Oportunidade"): a coluna fica como está, nunca é apagada (teste na Task 4).
- Geração com curva muito desigual (um mês com quase tudo): a soma continua exata e nenhum mês fica negativo (teste na Task 1).
- Proposta emitida com curva e depois curva editada ou apagada: a proposta já emitida continua igual (teste na Task 5, lendo de novo os dados gravados).
- Escala do gráfico quando o consumo passa muito da geração (ex.: 2.000 kWh contra 400): as barras não estouram o quadro (teste de `escalaDoGrafico` na Task 1).

---

### Task 1: Funções puras da geração mensal

**Files:**
- Create: `src/lib/geracao-mensal.ts`
- Test: `tests/geracao-mensal.test.ts`

**Interfaces:**
- Produces:
  - `MESES_ABREV: readonly string[]` (`"Jan"`…`"Dez"`), `MESES_NOMES: readonly string[]` (`"Janeiro"`…`"Dezembro"`).
  - `distribuirGeracaoMensal(geracaoKwhMes: number, curva: readonly number[]): number[] | null` — 12 inteiros; `null` se a curva não tiver 12 valores finitos > 0 ou a geração não for > 0. Arredondamento pelo maior resto (empate: o mês de menor índice primeiro), soma = `Math.round(geracaoKwhMes * 12)`.
  - `lerDozeMeses(entrada: Record<string, unknown>, prefixo: string, minimo: "positivo" | "zero_ou_mais", rotulo: string): { ok: true; valores: number[] | null } | { ok: false; mensagem: string }` — lê `${prefixo}01`…`${prefixo}12` com `lerNumeroBr`; todos vazios → `valores: null`; alguns vazios → erro `"Faltam N meses de ${rotulo} (Out, Nov, Dez). Preencha os 12 ou deixe todos vazios."`; número inválido ou fora do mínimo → erro `"${rotulo}: valor inválido em ${Mês}."`. Campo ausente conta como vazio.
  - `algumMesPresente(entrada: Record<string, unknown>, prefixo: string): boolean` — se algum `${prefixo}NN` veio no formulário.
  - `mediaDosMeses(valores: readonly number[]): number` — média arredondada a inteiro.
  - `escalaDoGrafico(valores: readonly number[]): { maximo: number; marcas: number[] }` — `maximo` = menor múltiplo de 250 ≥ maior valor (mínimo 250); `marcas` = 5 valores de `maximo` a 0 igualmente espaçados.

- [ ] **Step 1: Write the failing tests** em `tests/geracao-mensal.test.ts`:
  - `distribuirGeracaoMensal(732, [5.9,5.7,5.3,4.6,3.8,3.4,3.6,4.5,4.7,5.4,6,6.1])`: soma 8784; dez = 908; jun = 506; todos inteiros.
  - curva desigual `[100,0.001,…]` (11 × 0.001): soma = 1200 para geração 100; nenhum < 0.
  - `null` para curva com 11 valores, com 0, com `NaN`, e para geração 0.
  - `lerDozeMeses({ c01: "720", …, c12: "700" }, "c", "zero_ou_mais", "consumo")` → 12 números; todos `""` → `null`; nenhum campo → `null`; `c10..c12` vazios → `ok: false` e a mensagem cita `Out, Nov, Dez`; `"-5"` → erro; `"0"` aceito em `zero_ou_mais` e recusado em `positivo`; `"5,9"` → 5.9.
  - `algumMesPresente({}, "c")` false; com `c03: ""` true.
  - `mediaDosMeses([720,700,680,630,600,600,610,620,630,650,680,700])` = 652.
  - `escalaDoGrafico([908, 720])` → `{ maximo: 1000, marcas: [1000,750,500,250,0] }`; `escalaDoGrafico([2000, 400])` → `maximo: 2000`; `escalaDoGrafico([0])` → `maximo: 250`.
- [ ] **Step 2:** `pnpm exec vitest run geracao-mensal.test` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar as funções acima em `src/lib/geracao-mensal.ts` (puras, sem I/O; `lerNumeroBr` de onde `negocios-gravacao.ts` já importa).
- [ ] **Step 4:** `pnpm exec vitest run geracao-mensal.test` → PASS.
- [ ] **Step 5:** `git commit -m "feat(calculadora): distribuição da geração por mês (proposta completa, PR 4)"`

### Task 2: Migration das duas colunas

**Files:**
- Create: `supabase/migrations/20261222100000_geracao_mensal.sql`
- Modify: `.github/workflows/banco-producao.yml` (lista `MIGRATIONS_AUTORIZADAS`, junto da linha de `20261221100000_calculo_projecao_v2.sql`), `tests/validar-conjunto-migrations.test.ts:12` (`AUTORIZADAS`), `src/lib/supabase/database.types.ts` (regenerado)
- Test: `tests/geracao-mensal-db.test.ts`

**Interfaces:**
- Produces: `parametros_calculadora.curva_geracao_mensal numeric(8,3)[]` nula ou 12 elementos, todos > 0, sem nulos; `negocios.consumo_mensal_kwh numeric(10,2)[]` nula ou 12 elementos, todos ≥ 0, sem nulos. Checks nomeados `parametros_calculadora_curva_geracao_mensal_ck` e `negocios_consumo_mensal_kwh_ck` (`cardinality(x) = 12 and array_ndims(x) = 1 and array_position(x, null) is null and 0 < all(x)` / `0 <= all(x)`). Sem política nova: valem as de cada tabela (curva: só admin edita).

- [ ] **Step 1:** Ler a skill `supabase-postgres-best-practices` e a migration mais recente de cada tabela (`20261221100000_calculo_projecao_v2.sql`).
- [ ] **Step 2: Write the failing test** `tests/geracao-mensal-db.test.ts` (padrão de `tests/proposta-modelos-gestor-db.test.ts`, helpers de `./ajuda`):
  - admin grava curva de 12 valores > 0 → ok; 11 valores → erro de check; um 0 → erro; `{null,…}` → erro; `null` → ok.
  - vendedor da mesma empresa não altera `curva_geracao_mensal` (0 linhas afetadas, valor intacto).
  - responsável grava `consumo_mensal_kwh` com 12 valores (um 0) → ok; negativo → erro; 13 valores → erro.
  - gravar a curva não apaga `produtividade_confirmada_em`.
- [ ] **Step 3:** `pnpm exec vitest run geracao-mensal-db` → FAIL (colunas não existem).
- [ ] **Step 4:** Escrever a migration (só `alter table … add column … constraint … check (…)`, com comentário de cabeçalho no padrão das outras), atualizar as duas listas de migrations autorizadas, `pnpm db:reset`, `pnpm db:types`.
- [ ] **Step 5:** `pnpm exec vitest run geracao-mensal-db validar-conjunto-migrations` → PASS; `pnpm typecheck` → ok.
- [ ] **Step 6:** `git commit -m "feat(banco): curva de geração da empresa e consumo mês a mês do negócio"`

### Task 3: Curva em Configurações › Kits e calculadora

**Files:**
- Modify: `src/lib/acoes/calculadora.ts:113-163` (`editarParametros`), `src/app/(app)/configuracoes/calculadora/formularios.tsx` (`FormularioParametros`), `src/app/(app)/configuracoes/calculadora/page.tsx` (passa a curva)
- Test: `tests/geracao-mensal.test.ts` (leitura da curva) e o caso de banco da Task 2

**Interfaces:**
- Consumes: `lerDozeMeses`, `MESES_NOMES`, `MESES_ABREV` (Task 1); coluna `curva_geracao_mensal` (Task 2).
- Produces: campos `curva_mes_01`…`curva_mes_12` no formulário; `FormularioParametros` recebe `parametros.curvaGeracaoMensal: number[] | null`.

- [ ] **Step 1: Write the failing test:** extrair a leitura da curva para `lerCurvaDoFormulario(entrada: Record<string, unknown>) = lerDozeMeses(entrada, "curva_mes_", "positivo", "curva de geração")` em `src/lib/geracao-mensal.ts`, e testar em `tests/geracao-mensal.test.ts`: 12 válidos → valores; todos vazios → `null`; um `0` → erro `"curva de geração: valor inválido em Março."`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar `lerCurvaDoFormulario`; em `editarParametros`, depois do `safeParse`, ler a curva e devolver `{ ok: false, mensagem }` no erro; incluir `curva_geracao_mensal` no `update`.
- [ ] **Step 4:** UI conforme o quadro "Configurações › Kits e calculadora" da prévia: `fieldset` "Curva de geração por mês" com selos "Novo"/"opcional", o texto de ajuda da prévia, grade de 12 campos (4 colunas, 3 no celular, `inputMode="decimal"`, 16px, rótulos `MESES_NOMES`) e a barrinha com a parte de cada mês (`x / soma`, 1 casa) calculada no cliente a partir dos campos; logo abaixo da produtividade e da confirmação.
- [ ] **Step 5:** `pnpm exec vitest run geracao-mensal` → PASS; `pnpm lint` e `pnpm typecheck` → ok.
- [ ] **Step 6:** `git commit -m "feat(calculadora): curva de geração por mês em Configurações"`

### Task 4: Consumo dos 12 meses na edição do negócio

**Files:**
- Modify: `src/lib/negocios-gravacao.ts:423-470` (`editarNegocioComCliente`), `src/app/(app)/negocios/[id]/dados-ficha.ts:41` (select + `consumo_mensal_kwh`), `src/app/(app)/negocios/[id]/edicao-dados.tsx:26-30`, `src/app/(app)/negocios/[id]/edicao.tsx` (cartão "Conta de luz e local")
- Test: `tests/geracao-mensal.test.ts` (leitura) e `tests/geracao-mensal-db.test.ts` (gravação pela ação)

**Interfaces:**
- Consumes: `lerDozeMeses`, `algumMesPresente`, `mediaDosMeses`, `MESES_ABREV` (Task 1); coluna `consumo_mensal_kwh` (Task 2).
- Produces: campos `consumo_mes_01`…`consumo_mes_12`; `negocio.consumoMensalKwh: number[] | null` nas props da edição.

- [ ] **Step 1: Write the failing tests:** em `tests/geracao-mensal-db.test.ts`, chamar `editarNegocioComCliente` (como os testes de banco existentes de `negocios-gravacao` fazem) com o cartão técnico e: (a) 12 meses → grava; (b) todos vazios → grava `null`; (c) 3 vazios → `ok: false` com "Faltam 3 meses"; (d) **sem nenhum campo `consumo_mes_*`** (formulário do cartão "Oportunidade" e formulário técnico antigo) → `consumo_mensal_kwh` continua o que era; (e) negócio eletroposto → coluna intocada; (f) `consumo_medio_kwh` não muda por causa dos 12.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Em `editarNegocioComCliente`, só quando `temTecnico && !ehEletroposto && algumMesPresente(entrada, "consumo_mes_")`: `lerDozeMeses(entrada, "consumo_mes_", "zero_ou_mais", "consumo mês a mês")`; erro → retorno `{ ok: false, mensagem }`; sucesso → `consumo_mensal_kwh` em `camposSolares`.
- [ ] **Step 4:** UI conforme os quadros "Negócio › Conta de luz e local" e "Negócio no celular" da prévia: `fieldset` "Consumo mês a mês (kWh)" (selos "Novo"/"opcional", texto de ajuda da prévia), grade de 12 campos (4 colunas; 3 no celular), e a linha "Média dos 12 meses: N kWh · Consumo médio informado: M kWh" calculada no cliente com `mediaDosMeses` só quando os 12 estão preenchidos. Ocupa as duas colunas do formulário, entre "Autoconsumo" e "Unidade consumidora". Fora do cadastro do novo negócio.
- [ ] **Step 5:** `pnpm exec vitest run geracao-mensal` → PASS; lint e typecheck ok.
- [ ] **Step 6:** `git commit -m "feat(negocios): consumo dos 12 meses na conta de luz (opcional)"`

### Task 5: Esquema 8 da emissão com `mensal`

**Files:**
- Modify: `src/lib/propostas/proposta-simples.ts` (tipos, `esquemaV8`, união, `montarDadosEmissaoSimples`, `RENDERIZADOR_SIMPLES`, `economiaDaEmissao`), `src/lib/acoes/propostas-emissoes.ts:69-140` (lê curva e consumo), `tests/proposta-simples.test.ts:307`, `tests/economia-emissao.test.ts:192-193` (esquema 7 → 8)
- Test: `tests/proposta-simples.test.ts`, `tests/propostas-emissoes-db.test.ts`

**Interfaces:**
- Consumes: `distribuirGeracaoMensal` (Task 1); colunas da Task 2.
- Produces:
  - `type MensalEmitido = { geracaoKwh: number[]; consumoKwh: number[]; consumoOrigem: "informado" | "media" }` e `esquemaMensalEmitido` (Zod: 12 inteiros ≥ 0; 12 números ≥ 0; enum).
  - `EntradaEmissaoSimples` ganha `curvaGeracao: number[] | null` e `consumoMensalKwhNegocio: number[] | null`.
  - `esquemaV8 = esquemaV7.extend({ esquema: z.literal(8), mensal: esquemaMensalEmitido.nullable() })`, na união; refine extra: `mensal != null` exige `sistema.geracao != null` e `soma(mensal.geracaoKwh) === Math.round(sistema.geracao.kwhMes * 12)`.
  - `mensalDaEmissao(d): MensalEmitido | null` (só esquema 8); `economiaDaEmissao` aceita 7 e 8; `temConteudoV6(d): boolean` (`d.esquema >= 6`) para trocar os `esquema === 6 || esquema === 7` de `pdf-simples.tsx` e `emitida.tsx`.
  - `RENDERIZADOR_SIMPLES = "simples-v8"`.

- [ ] **Step 1: Write the failing tests** em `tests/proposta-simples.test.ts`:
  - com produtividade confirmada (732 kWh/mês), curva de exemplo e consumo de 12 meses → `esquema: 8`, `mensal.consumoOrigem: "informado"`, soma de `geracaoKwh` 8784.
  - sem consumo mensal → `consumoOrigem: "media"` e 12 × `consumoMedioKwhNegocio`.
  - sem curva → `mensal: null` e **sem** pendência nova; sem produtividade confirmada → `mensal: null`.
  - o esquema recusa dados com `mensal` e `sistema.geracao` nulo, e com soma diferente do ano.
  - dados gravados no esquema 7 (fixture existente) continuam passando por `esquemaDadosEmissaoSimples`.
  - atualizar as asserções `esquema: 7` existentes para 8.
- [ ] **Step 2:** Rodar `pnpm exec vitest run proposta-simples economia-emissao` → FAIL.
- [ ] **Step 3:** Implementar; em `propostas-emissoes.ts`, acrescentar `curva_geracao_mensal` ao select de `parametros_calculadora` e `consumo_mensal_kwh` ao de `negocios`, e passar `curvaGeracao` / `consumoMensalKwhNegocio` (convertidos com `Number`) a `montarDadosEmissaoSimples`.
- [ ] **Step 4:** Em `tests/propostas-emissoes-db.test.ts`, um caso: emite com curva, depois altera a curva e o consumo mensal; os dados lidos da emissão gravada continuam com o `mensal` original.
- [ ] **Step 5:** `pnpm exec vitest run proposta-simples economia-emissao propostas-emissoes emissao-preservada` → PASS.
- [ ] **Step 6:** `git commit -m "feat(propostas): esquema 8 com a geração e o consumo mês a mês"`

### Task 6: Gráfico no PDF e na página on-line

**Files:**
- Create: `src/lib/propostas/pdf-geracao-mensal.tsx`, `src/app/proposta/[token]/geracao-mensal.tsx`
- Modify: `src/lib/propostas/pdf-simples.tsx` (`SecoesSistema`, linha ~231; trocas por `temConteudoV6`), `src/app/proposta/[token]/emitida.tsx` (cartão "O sistema", linha ~57; trocas por `temConteudoV6`)
- Test: `tests/propostas-pdf.test.ts`

**Interfaces:**
- Consumes: `mensalDaEmissao`, `MensalEmitido`, `temConteudoV6` (Task 5); `escalaDoGrafico`, `MESES_ABREV` (Task 1).
- Produces: `SecaoGeracaoMensal({ mensal, p }: { mensal: MensalEmitido; p: Paleta })` (PDF) e `GeracaoMensalDaProposta({ mensal }: { mensal: MensalEmitido })` (on-line). Exportar de `geracao-mensal.ts` o texto `NOTA_GERACAO_MENSAL` e `legendaConsumo(mensal): string`.

- [ ] **Step 1: Write the failing test** em `tests/propostas-pdf.test.ts`: renderizar o PDF de uma emissão esquema 8 com `mensal` e conferir que o texto extraído contém "Geração e consumo mês a mês", `NOTA_GERACAO_MENSAL` e "Seu consumo"; com `mensal: null`, nenhum dos dois. `legendaConsumo` em `tests/geracao-mensal.test.ts`: `"Seu consumo"` / `"Seu consumo médio (650 kWh)"`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** PDF conforme o quadro "PDF · página Seu sistema" da prévia: cartão com título, legenda, eixo de `escalaDoGrafico` (5 marcas), 12 pares de barras (`Svg`/`Rect` como em `pdf-economia.tsx`), rótulos `MESES_ABREV`, a linha "kWh por mês · Maior geração: Mês N kWh · Menor: Mês N kWh · Ano: N kWh" e a nota; `wrap={false}`; entra logo depois de "Seu sistema solar em números simples".
- [ ] **Step 4:** On-line conforme o quadro "Página on-line": caixa `bg-carvao` dentro do cartão "O sistema", barras em grid de 12 colunas (como `economia.tsx`), `role="img"` com `aria-label` citando o menor e o maior mês de geração e o intervalo do consumo, rótulos de uma letra no celular, nota abaixo.
- [ ] **Step 5:** `pnpm exec vitest run propostas-pdf geracao-mensal` → PASS; `pnpm lint`, `pnpm typecheck`, `pnpm build` → ok.
- [ ] **Step 6:** `git commit -m "feat(propostas): gráfico de geração e consumo mês a mês no PDF e na página"`

### Task 7: Verificação final e status

**Files:**
- Modify: `docs/PROJECT_STATUS.md` (seção "Proposta comercial completa": PR 4 com branch, migration, decisões e a prévia)

- [ ] **Step 1:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` → tudo verde (relatar a saída real; falha não se contorna).
- [ ] **Step 2:** Conferir à mão com `pnpm dev`: salvar curva e consumo, emitir uma proposta, abrir o PDF e a página on-line no celular (390 px).
- [ ] **Step 3:** Atualizar `docs/PROJECT_STATUS.md` e `git commit -m "docs(status): proposta completa, PR 4"`.
- [ ] **Step 4:** Push e PR para o Evandro revisar (sem merge). A migration vai a produção só pelo `banco-producao.yml`, com autorização e aprovação do Evandro; como o preview usa o banco de produção e o código lê as colunas novas, ela precisa estar aplicada antes do merge, o que também depende de autorização explícita dele.
