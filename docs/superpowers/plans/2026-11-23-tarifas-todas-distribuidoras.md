# Tarifas ANEEL de todas as distribuidoras — plano (entrega 1 do item 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a calculadora passa a ter a tarifa oficial (TE, TUSD e TUSD Fio B, B1 residencial convencional, sem tributos) de todas as distribuidoras da ANEEL, não só da Copel.

**Architecture:** um script Node reproduzível consulta o conjunto "Componentes Tarifárias 2026" da ANEEL, aplica a **mesma regra de extração aceita para a Copel** (contrato `.aurora/contratos/m2-p0-decisao-fio-b-copel.md`), recusa toda distribuidora/vigência em que a regra não dá exatamente um valor por componente e gera (1) o arquivo de fonte em `.aurora/fontes/` e (2) o corpo da migration de carga em `tarifas_gd_aneel`. Nada muda no cálculo: `resolverTarifa` já casa a distribuidora por `nomes_aceitos` e vigência.

**Tech Stack:** Node 22 (`fetch`, sem dependência nova), Postgres/Supabase migration, Vitest, React (só o rótulo do seletor).

**Spec:** `docs/superpowers/specs/2026-11-23-concessionarias-design.md` (decisão 3 e entrega 1).

## Global Constraints

- Tabela global, só leitura pelo app, carga só por migration (`tarifas_gd_aneel` não muda de estrutura nem de políticas).
- Mesma rastreabilidade da Copel por linha: `fonte_recurso_id`, `fonte_linhas` (`_id` por componente), `fonte_extraida_em`, `fonte_resposta_sha256`.
- Regra de extração = a da Copel: base "Tarifa de Aplicação", subgrupo B1, modalidade Convencional, classe e subclasse Residencial, posto "Não se aplica", unidade R$/MWh, acessante "Não se aplica"; TE e TUSD do detalhe "Não se aplica"; TUSD_FioB do detalhe "SCEE" (igual ao "Não se aplica" quando os dois existem). Valores como `numeric(18,9)`, sem o ruído de ponto flutuante do texto da ANEEL.
- `pendencias_fonte = {tabela4_nao_conferida}` em toda linha nova (a Tabela 4 de nenhuma REH foi lida).
- **Dado técnico da calculadora: o Evandro confere a lista gerada (carregadas e recusadas) antes do commit da migration.** O Claude não decide sozinho incluir uma distribuidora que a regra recusou.
- A linha da Copel existente não é tocada (o script a pula; a `unique (distribuidora, subgrupo, subclasse, modalidade, vigencia_inicio)` garante).
- Migration: `supabase/migrations/20261219100000_tarifas_gd_todas_distribuidoras.sql` (sem conflito: as PRs abertas #389, #398 e #399 não têm migration; conferir de novo antes do commit).

## Review Focus

1. **Rótulos repetidos no seletor:** hoje `rotuloDistribuidora` corta no primeiro hífen/espaço, então "ENEL CE", "ENEL RJ" e "ENEL SP" virariam três "Enel". Esperado: rótulos distintos. Teste na Task 3.
2. **Nome aceito em duas distribuidoras:** um apelido (ex.: "enel", "equatorial", "energisa") casando com mais de uma distribuidora daria tarifa errada sem aviso. Esperado: o gerador só cria apelidos únicos e a migration nunca deixa um nome em duas distribuidoras. Testes nas Tasks 1 e 2.
3. **Distribuidora com regra incompleta** (sem linha SCEE, valores divergentes, unidade diferente): esperado ficar fora, listada como recusada com o motivo, nunca carregada com valor "parecido". Teste na Task 1.
4. **Mais de uma vigência no ano** para a mesma distribuidora: esperado carregar cada vigência e `resolverTarifa` escolher pela data. Teste na Task 1 (as duas saem) e já coberto em `resolverTarifa`.
5. **Negócios antigos com texto livre** em `qualif_distribuidora` (ex.: "Cemig"): passam a casar com a tarifa oficial no próximo cálculo; cálculos já gravados não mudam (retrato imutável). Teste de banco na Task 2.

---

### Task 1: gerador da carga ANEEL (regra pura + script)

**Files:**
- Create: `scripts/aneel/tarifas-regra.mjs` (puro: linhas brutas → tarifas e recusadas)
- Create: `scripts/aneel/gerar-tarifas.mjs` (I/O: consulta a API, grava a fonte e o SQL)
- Test: `tests/aneel-tarifas-regra.test.ts` (fixture com linhas brutas reduzidas, incluindo as 12 da Copel de `.aurora/fontes/aneel-componentes-2026-copel-reh3592-b1.json`)

**Interfaces:**
- Produces:
  - `extrairTarifas(linhas: LinhaAneel[]): { tarifas: TarifaExtraida[]; recusadas: { distribuidora: string; vigenciaInicio: string; motivo: string }[] }`
  - `TarifaExtraida = { distribuidora, cnpj, ato, vigenciaInicio, vigenciaFim, teRsMwh: string, tusdRsMwh: string, fioBRsMwh: string, fonteLinhas: { TE: number[]; TUSD: number[]; TUSD_FioB_SCEE: number[] } }` (valores como texto decimal com até 9 casas, para o SQL)
  - `nomesAceitos(distribuidoras: string[]): Map<string, string[]>` — formas normalizadas por `normalizarNome` (mesma função de `src/lib/tarifa-gd.ts`, replicada no `.mjs` com teste de equivalência): a sigla inteira, com hífen e com espaço; apelido curto (antes do primeiro hífen/espaço) **só se único** entre todas.
  - `sqlCarga(tarifas: TarifaExtraida[], fonte: { recursoId: string; extraidaEm: string; sha256: string }): string`
  - CLI: `node scripts/aneel/gerar-tarifas.mjs` → grava `.aurora/fontes/aneel-componentes-2026-b1-todas.json` (linhas usadas verbatim, consulta reproduzível, hash da resposta completa) e imprime o SQL e a lista de recusadas.

- [ ] **Step 1: testes da regra** — `extrairTarifas` com a fixture: Copel sai com TE `310.85`, TUSD `457.17`, Fio B `214.535600374` e `fonteLinhas` iguais às da migration `20261023210000`; linhas duplicadas (mesmo conteúdo, `_id` diferente) contam uma vez e guardam os dois `_id`; distribuidora sem linha SCEE de TUSD_FioB → recusada com motivo `sem_fio_b_scee`; TE com dois valores diferentes na mesma vigência → `valores_divergentes`; duas vigências da mesma distribuidora → duas tarifas. `nomesAceitos(["ENEL CE","ENEL RJ","CEMIG-D"])` não contém `"enel"` e contém `"cemig"`. Nenhum nome aparece em duas distribuidoras.
- [ ] **Step 2:** `pnpm vitest run tests/aneel-tarifas-regra.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** implementar `tarifas-regra.mjs`. Agrupar por (`SigNomeAgente`, `DatInicioVigencia`); filtrar pelos campos da regra nas Global Constraints; converter `"310,85000000000002"` arredondando para 9 casas sem passar por `Number` em texto final (usar arredondamento decimal em string).
- [ ] **Step 4:** teste passa.
- [ ] **Step 5:** implementar `gerar-tarifas.mjs`: `datastore_search` paginado (`limit=10000`, `offset`) no recurso `e8717aa8-2521-453f-bf16-fbb9a16eea39` com `filters={"DscSubGrupoTarifario":"B1","DscModalidadeTarifaria":"Convencional","DscSubClasseConsumidor":"Residencial"}`; sha256 da resposta concatenada; pula `COPEL-DIS`. Rodar e conferir: Copel recalculada bate com a migration existente (o script falha se não bater).
- [ ] **Step 6: commit** `feat(calculadora): gerador da carga de tarifas ANEEL de todas as distribuidoras`.

### Task 2: migration de carga + teste de banco

**Files:**
- Create: `supabase/migrations/20261219100000_tarifas_gd_todas_distribuidoras.sql` (cabeçalho explicando fonte, regra e recusadas; corpo gerado pela Task 1)
- Create: `.aurora/fontes/aneel-componentes-2026-b1-todas.json` (gerado pela Task 1)
- Test: `tests/tarifas-gd-todas-db.test.ts`

**Interfaces:**
- Consumes: saída do CLI da Task 1.

- [ ] **Step 0: parada para o Evandro.** Mostrar a lista (quantas distribuidoras carregadas, quantas recusadas e por quê). Só seguir com o OK dele.
- [ ] **Step 1: teste de banco** — depois de `pnpm db:reset`: mais de uma distribuidora em `tarifas_gd_aneel`; a linha da Copel idêntica à de antes (id e valores); `select n, count(distinct distribuidora) from tarifas_gd_aneel, unnest(nomes_aceitos) n group by n having count(distinct distribuidora) > 1` vazio; toda linha nova com `pendencias_fonte = {tabela4_nao_conferida}` e `base_tributaria = 'sem_tributos'`; `authenticated` continua sem insert/update/delete; um negócio residencial com `qualif_distribuidora = 'Cemig'` (ou outra carregada) resolve tarifa `ok` pela `resolverTarifa` com as linhas lidas do banco.
- [ ] **Step 2:** rodar → FAIL (só a Copel).
- [ ] **Step 3:** colar o SQL gerado na migration; `pnpm db:reset`.
- [ ] **Step 4:** `pnpm vitest run tests/tarifas-gd-todas-db.test.ts` → PASS; `pnpm db:types` sem diferença (a migration não muda estrutura).
- [ ] **Step 5: commit** `feat(calculadora): tarifas ANEEL B1 de todas as distribuidoras`.

### Task 3: rótulo do seletor de distribuidora

**Files:**
- Modify: `src/app/(app)/negocios/novo/formulario.tsx:93-97` (mover `rotuloDistribuidora` para `src/lib/tarifa-gd.ts`, exportada)
- Test: `tests/estimativa-financeira.test.ts` (ou novo `tests/tarifa-gd-rotulo.test.ts`)

**Interfaces:**
- Produces: `rotulosDistribuidoras(siglas: string[]): Map<string, string>` em `src/lib/tarifa-gd.ts` — rótulo curto capitalizado ("COPEL-DIS" → "Copel") quando único na lista; quando o curto colide, a sigla inteira capitalizada por palavra ("ENEL CE" → "Enel CE"). Usado pelo seletor e pelo resumo do cálculo (linha 406).

- [ ] **Step 1: teste** — `rotulosDistribuidoras(["COPEL-DIS","ENEL CE","ENEL RJ"])` → `Copel`, `Enel CE`, `Enel RJ`; rótulos todos distintos para a lista real (fixture com as siglas carregadas na Task 2).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar e usar no seletor (opções ordenadas pelo rótulo) e no resumo.
- [ ] **Step 4:** teste passa; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` verdes.
- [ ] **Step 5: commit** `feat(calculadora): rótulos distintos no seletor de distribuidora`.

### Fechamento

- [ ] Abrir a calculadora no navegador local e escolher duas distribuidoras novas; conferir a tarifa e o resumo.
- [ ] Atualizar `docs/PROJECT_STATUS.md` (entrega 1 do item 6), abrir a PR. Aplicação em produção só pelo `banco-producao.yml` com o OK do Evandro para cada disparo.
