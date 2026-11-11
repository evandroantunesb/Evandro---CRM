# Setores da obra (4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A empresa PRO desliga os setores Engenharia e/ou Administrativo; obras novas nascem sem o setor desligado, o
prazo e o cronograma contam só as etapas que ficam e a tela Engenharia passa a seguir a chave do setor.

**Architecture:** A escolha fica numa coluna nova de `empresa_telas` (mesma linha, RLS, auditoria e "Salvar" das
telas). `setores_da_obra(empresa)` diz quais fluxos uma obra nova recebe; `garantir_obra`, a entrega contratada e o
`cronograma_obra` passam a usá-la. No app, a obra mostra só os setores que tem e a conclusão espera só por eles.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres/RLS), Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-11-obra-solo-e-setores-design.md` (seção "4a — Setores da obra").

## Global Constraints

- Setores desligáveis: exatamente `engenharia` e `administrativo`. Compras e Operacional nunca desligam (o banco recusa).
- Vale só para **obras novas**: nenhuma obra existente ganha ou perde fluxo.
- Sem escolha gravada = tudo ligado (nada muda para as empresas de hoje).
- Só o admin grava; servidor (`exigirPapel("admin")`) e RLS conferem.
- Comparações de papel sempre positivas (`tests/permissoes.test.ts` proíbe `papel !== "..."`).
- Migration: `supabase/migrations/20261206100000_setores_da_obra.sql` (confira as PRs abertas antes; nenhuma usa esse
  prefixo em 11/11). Use a skill `supabase-postgres-best-practices`. Funções novas sem `EXECUTE` para `anon`.
- `database.types.ts` só por `pnpm db:types`.
- Lint: baseline de 50 avisos, 0 erros.
- Português em textos, nomes e commits. Textos da tela copiados do quadro `OnboardingProTelas` (abaixo, Tarefa 3).
- Rodar a verificação em `C:\dev\crm-p4` (não em `R:\`).

## Rulings deste plano (decididos ao escrever; o Evandro vê na entrega)

- **Coluna em vez de tabela:** a spec fala em `empresa_setores_desligados`; o plano usa `empresa_telas.setores_desligados
  text[]`, porque telas e setores são gravados juntos, pelo mesmo admin, com a mesma RLS e auditoria. Custo se errado:
  trocar o armazenamento numa migration futura.
- **Solo na 4a:** `setores_da_obra` trata o Solo como o PRO (recebe os setores de hoje). "Solo = nenhum setor" entra na
  4b, junto com o checklist, para não haver obra do Solo sem setor e sem checklist entre as duas entregas.
- **Entrega contratada:** hoje é um número configurado (`obra_prazos_etapas.entrega_contratada`, 51 dias úteis), não a
  soma das etapas. Sem um setor, ela passa a ser esse número **menos** os dias das etapas do setor que a obra não tem
  (mínimo 1). Padrão sem Engenharia: 51 − (7+15+7+5) = 17.
- **Contas a pagar e NF do cliente** já ficam fora dos cartões de setor (bloco financeiro da obra) e continuam para
  admin e gestor: não há mudança de tela para isso.

## Review Focus

1. Empresa que já tinha a **tela** Engenharia desligada antes da migration: depois dela tem o setor desligado, a tela
   continua desligada, `desligadas` não contém mais `engenharia` e `atualizado_por` não é apagado.
2. Obra antiga com Engenharia numa empresa que desligou o setor: o cartão de Engenharia continua na obra e o status
   ainda pode ser alterado por ali (só a tela `/engenharia` some).
3. Filtro da lista "Setor: Engenharia" + "Estado" não pode trazer obras que não têm Engenharia.
4. Obra sem nenhum fluxo (não deve nascer na 4a, mas a regra pura não pode dar "concluída" por vacuidade).
5. Tabela da lista no desktop: colunas fixas por setor não podem desalinhar quando a obra não tem um setor.

---

### Task 1: Banco — escolha dos setores, obra nova, prazo e cronograma

**Files:**
- Create: `supabase/migrations/20261206100000_setores_da_obra.sql`
- Create: `tests/setores-obra-db.test.ts`
- Modify (gerado): `src/lib/supabase/database.types.ts` via `pnpm db:types`

**Interfaces:**
- Produces: coluna `empresa_telas.setores_desligados text[] not null default '{}'`;
  `public.setores_da_obra(p_empresa_id uuid) returns public.setor_obra[]` (só uso interno: revogada de `public`,
  `anon`, `authenticated`, `service_role`).

- [ ] **Step 1: Write the failing tests** em `tests/setores-obra-db.test.ts`, criando empresa, membros e obra como
  `tests/obras-db.test.ts` (criarNegocio → ganhar → assinar → confirmar) e a conexão direta só por
  `tests/banco-local.ts` (`urlBancoLocal()`):
  - `sem escolha, a obra nova nasce com os 4 setores` → fluxos `['administrativo','compras','engenharia','operacional']` (ordenados).
  - `Engenharia e Administrativo desligados: a obra nova só tem Compras e Operacional` → fluxos `['compras','operacional']`; marcos `nf_cliente` e `garantia` existem.
  - `obra criada antes de desligar continua com os 4 fluxos`.
  - `entrega contratada desconta as etapas de Engenharia` → `obras.entrega_contratada` = `somar_dias_uteis(empresa, chegada, 17)` (calculado pela conexão direta).
  - `cronograma de obra sem Engenharia tem só compra, entrega do material e instalação` → `rpc("cronograma_obra")` como admin devolve `etapa` = `['compra','entrega_material','instalacao']`.
  - `alterar status de setor que a obra não tem falha` → `alterar_status_fluxo_obra(obra,'engenharia','projeto_em_elaboracao')` erra com `Fluxo do setor não encontrado.`
  - `só o admin grava os setores desligados` → gestor: upsert em `empresa_telas` recusado pela RLS; admin: aceito.
  - `Compras e Operacional não desligam` → upsert com `setores_desligados: ['compras']` e `['operacional']` recusado (check).
  - `obra sem Administrativo: o admin ainda lança conta a pagar` → a mesma RPC de criação usada em `tests/contas-pagar-obra-db.test.ts`, chamada pelo admin, funciona.

- [ ] **Step 2: Run** `pnpm exec vitest run tests/setores-obra-db.test.ts` — Expected: FAIL (coluna inexistente).

- [ ] **Step 3: Write the migration.** Cabeçalho com as decisões (spec + rulings acima). Conteúdo:
  1. `alter table public.empresa_telas add column setores_desligados text[] not null default '{}' check (setores_desligados <@ array['engenharia','administrativo']::text[]);`
  2. Mover a escolha antiga: com `empresa_telas_preparar` desabilitado só durante o `update` (para não zerar
     `atualizado_por`), `setores_desligados = array['engenharia']`, `desligadas = array_remove(desligadas,'engenharia')`
     onde `'engenharia' = any(desligadas)`.
  3. Trocar o check de `desligadas` (descubra o nome real com `\d public.empresa_telas`) pela lista sem `engenharia`.
  4. `setores_da_obra(p_empresa_id)` (`language sql stable security definer set search_path = ''`): na ordem
     compras, engenharia, operacional, administrativo, sem os que estão em `setores_desligados` da empresa.
  5. `garantir_obra`: copie o corpo de `20261119100100_setor_administrativo.sql` e troque só o `insert into
     public.obra_fluxos` dos 4 setores por um `insert ... select` sobre `unnest(public.setores_da_obra(empresa))` com o
     status inicial de cada setor (`a_comprar`, `a_iniciar`, `aguardando_liberacao`, `pagando_fornecedores`).
  6. `calcular_entrega_contratada(p_empresa_id, p_chegada)` (mesma assinatura; confirme com grep que o único chamador é
     `definir_entrega_contratada_obra`): dias = `entrega_contratada` − soma de `dias_uteis` das chaves cujo
     `setor_etapa_obra(chave)` não está em `setores_da_obra(p_empresa_id)`; `greatest(1, …)`.
  7. `cronograma_obra`: copie o corpo de `20261104100000_obras_cronograma.sql` e, no começo do laço, pule (`continue`) a
     etapa cuja `setor_etapa_obra(v_etapas[i])` não tem linha em `obra_fluxos` desta obra. `ordem` continua sendo o
     índice original. `prazos_obras` não muda (agrega o que vier).

- [ ] **Step 4: Run** `pnpm db:reset; pnpm db:types` e de novo `pnpm exec vitest run tests/setores-obra-db.test.ts tests/obras-db.test.ts tests/obras-cronograma-db.test.ts tests/obras-opr-db.test.ts tests/telas-empresa-db.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(obras): setores da obra no banco (Engenharia e Administrativo desligáveis)`.

### Task 2: Regra pura das telas, leitura no servidor e travas

**Files:**
- Modify: `src/lib/telas-empresa.ts`, `src/lib/telas-empresa-servidor.ts`, `src/lib/menu-telas.ts`,
  `src/app/(app)/configuracoes/engenharia/layout.tsx`, `src/components/telas-empresa.tsx` (só o mapa `ICONE`, que perde `engenharia`)
- Test: `tests/telas-empresa.test.ts`, `tests/menu-telas.test.ts`, `tests/telas-empresa-servidor.test.ts`

**Interfaces:**
- Consumes: coluna da Tarefa 1.
- Produces (em `src/lib/telas-empresa.ts`):
  - `SETORES_DESLIGAVEIS = ["engenharia", "administrativo"] as const`; `type SetorDesligavel`.
  - `INFO_SETOR: Record<SetorDesligavel, { rotulo: string; descricao: string }>` = Engenharia / "Projeto, ART,
    protocolo, vistoria e conexão"; Administrativo / "Paga fornecedores e cuida da NF do cliente".
  - `TELAS_OPCIONAIS` sem `"engenharia"` (e `INFO_TELA` idem).
  - `type Area = TelaOpcional | "pro" | "engenharia"`.
  - `TelasEmpresa = { solo: boolean; ligadas: ReadonlySet<TelaOpcional>; setoresDesligados: ReadonlySet<SetorDesligavel> }`.
  - `telasDaEmpresa({ produto, desligadas, setoresDesligados, eletropostoLiberado })` — Solo: `setoresDesligados` vazio.
  - `areaLigada(t, "engenharia")` = `!t.solo && !t.setoresDesligados.has("engenharia")`.
  - `lerSetoresDesligados(texto: string): SetorDesligavel[] | null` (JSON, como `lerDesligadas`).

- [ ] **Step 1: Write the failing tests:**
  - `telas-empresa.test.ts`: `Engenharia não é tela opcional`; `PRO com Engenharia desligada: área engenharia desligada, obras ligada`; `Solo: área engenharia desligada`; `lerSetoresDesligados aceita ["administrativo"] e recusa ["compras"] e texto inválido`; `lerDesligadas recusa "engenharia"`.
  - `menu-telas.test.ts`: `/configuracoes/engenharia` é da área `engenharia`; com Engenharia desligada, `/engenharia` e `/configuracoes/engenharia` saem do menu.
  - `telas-empresa-servidor.test.ts`: lê `setores_desligados` da linha de `empresa_telas`.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/telas-empresa.test.ts tests/menu-telas.test.ts tests/telas-empresa-servidor.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as interfaces acima; `lerTelasEmpresa` seleciona `desligadas, setores_desligados`;
  `AREA_DO_ENDERECO["/configuracoes/engenharia"] = "engenharia"`; o layout de `/configuracoes/engenharia` usa
  `telaPermitida("engenharia")`.
- [ ] **Step 4: Run** os testes do Step 2 e `pnpm typecheck` — Expected: PASS (o typecheck aponta os usos a ajustar na Tarefa 3; se aparecer algum fora dela, ajuste aqui).
- [ ] **Step 5: Commit** `feat(telas): Engenharia passa a seguir a chave do setor`.

### Task 3: Cartão "Setores da obra", gravação e resumo do assistente

**Files:**
- Modify: `src/components/telas-empresa.tsx`, `src/app/(app)/configuracoes/telas/formulario.tsx`,
  `src/app/(app)/configuracoes/telas/page.tsx`, `src/lib/acoes/telas-empresa.ts`,
  `src/app/primeiro-acesso/passos/index.tsx`, `src/lib/assistente.ts`
- Test: `tests/assistente.test.ts`

**Interfaces:**
- Consumes: `SETORES_DESLIGAVEIS`, `INFO_SETOR`, `lerSetoresDesligados` (Tarefa 2).
- Produces: `CartaoSetoresObra({ desligados, obrasLigada, onChange })` em `src/components/telas-empresa.tsx`;
  `FormularioTelas({ ligadasIniciais, setoresDesligadosIniciais, eletropostoLiberado })`;
  `DadosRevisao.telas` ganha `setoresDesligados: SetorDesligavel[]`.

- [ ] **Step 1: Write the failing test** em `tests/assistente.test.ts`: `resumo do passo telas cita o setor desligado` → com `setoresDesligados: ["engenharia"]` o texto contém `"sem Engenharia"`; sem setores desligados, o texto atual não muda.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/assistente.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `CartaoSetoresObra` (mesmo visual das chaves de `CartaoTelasOpcionais`), textos do quadro:
    título "Setores da obra"; descrição "Desligue o setor que a sua empresa não tem. A obra nasce sem ele, a tela dele
    some do menu e o prazo da obra conta só as etapas que ficam."; chaves Engenharia e Administrativo (`INFO_SETOR`);
    linhas fixas com selo "Sempre ligado": Compras ("Sempre na obra. Sem equipe de Compras, escolha quem atende em
    Configurações › Compras.") e Operacional ("A instalação: sempre na obra"); nota "Vale para obras novas. As obras em
    andamento continuam com os setores que já têm. Sem o Administrativo, o admin e o gestor pagam fornecedores e cuidam
    da NF."; com Obras desligada, aviso "As obras estão desligadas; os setores só valem quando Obras estiver ligada."
  - `FormularioTelas` guarda os dois estados, manda `setores_desligados` (JSON) num segundo campo escondido e mostra os
    dois cartões lado a lado (`lg:grid-cols-[1.3fr_1fr]`, empilhados no celular).
  - `salvarTelasEmpresa` valida os dois campos (`lerDesligadas`, `lerSetoresDesligados`) e grava os dois num só upsert.
  - Configurações › Telas e o passo Telas do assistente passam `setoresDesligadosIniciais` de `obterTelasEmpresa()`.
  - `resumoDoPasso("telas")` acrescenta `"sem Engenharia"` / `"sem Administrativo"`.
- [ ] **Step 4: Run** `pnpm exec vitest run tests/assistente.test.ts` e `pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(telas): chaves dos setores da obra junto das telas`.

### Task 4: Obra no app só com os setores que tem

**Files:**
- Modify: `src/lib/obras/derivados.ts`, `src/lib/obras/dados.ts`, `src/lib/obras/detalhe.ts`,
  `src/app/(app)/obras/page.tsx`, `src/app/(app)/obras/[id]/page.tsx`
- Test: o arquivo de `tests/` que já testa `situacaoObra` e `filtrarObras` (procure com grep) e `tests/obras-detalhe.test.ts`

**Interfaces:**
- Consumes: nada novo (o banco já cria só os fluxos da obra).
- Produces: `situacaoObra` com a mesma assinatura; `ObraListaVM.setores` e `ObraDetalheVM.setores` contêm só os setores
  com fluxo na obra (ordem de `SETORES_OBRA`).

- [ ] **Step 1: Write the failing tests:**
  - `obra sem Engenharia conclui com Compras, Operacional e Administrativo no fim e os 2 marcos resolvidos` → `"concluida"`.
  - `obra sem nenhum fluxo não fica concluída` → `"em_andamento"`.
  - `filtro Setor Engenharia + estado não traz obra sem Engenharia`.
  - `detalhe de obra sem Engenharia não tem o setor` (montagem do VM em `obras-detalhe.test.ts`, no estilo dos casos existentes).
- [ ] **Step 2: Run** esses arquivos com `pnpm exec vitest run <arquivos>` — Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `situacaoObra`: concluída se há ao menos um fluxo e todo fluxo recebido está no status final (mais os 2 marcos).
  - `dados.ts` e `detalhe.ts`: `SETORES_OBRA.filter(setor => fluxos têm o setor).map(...)`.
  - `obras/page.tsx` (`ListaObras`): o cabeçalho continua com `SETORES_OBRA`; as células percorrem `SETORES_OBRA` e,
    sem o setor na obra, mostram "—" com `aria-label="Sem este setor"`.
  - `obras/[id]/page.tsx`: o bloco `VistoriaEngenharia` do cartão Operacional só aparece se a obra tem Engenharia.
- [ ] **Step 4: Run** os testes do Step 2 e `pnpm exec vitest run tests/obras-interface.test.ts tests/obras-semaforo.test.ts tests/obras-apresentacao.test.ts tests/obras-gestao.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(obras): a obra mostra e conclui só com os setores que tem`.

### Task 5: Cadastro de pessoas sem setor desligado

**Files:**
- Modify: `src/lib/perfis-usuario.ts`, `src/app/(app)/configuracoes/usuarios/page.tsx`,
  `src/app/(app)/configuracoes/usuarios/formularios.tsx`
- Test: o teste existente de `perfis-usuario` em `tests/` (grep `perfis-usuario`; se não houver, crie `tests/perfis-usuario.test.ts`)

**Interfaces:**
- Produces: `setoresOferecidos(desligados: ReadonlySet<string>, atuais: readonly SetorObra[]): SetorObra[]` em
  `src/lib/perfis-usuario.ts` — `SETORES_OBRA` sem os desligados, mas mantendo os que a pessoa já tem.

- [ ] **Step 1: Write the failing test:** `setor desligado some das opções`; `setor desligado que a pessoa já tem continua`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** a função; a página lê `obterTelasEmpresa().setoresDesligados` e o formulário usa
  `setoresOferecidos` no perfil de setor e nos "outros setores". O servidor (`actions.ts`) não muda: o banco segue
  aceitando o setor (a pessoa só não é oferecida a ele).
- [ ] **Step 4: Run** o teste e `pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(usuarios): não oferece setor desligado`.

### Task 6: e2e, verificação completa e status

**Files:**
- Create: `e2e/36-setores-obra.spec.ts`
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: Write the e2e** no padrão de `e2e/33-telas-empresa.spec.ts` (empresa própria ou restauração ao fim, como
  ele faz): o admin abre Configurações › Telas, desliga Engenharia em "Setores da obra", salva; o menu não tem
  Engenharia; `/engenharia` e `/configuracoes/engenharia` mostram a tela desligada; religa e as duas voltam.
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/36-setores-obra.spec.ts e2e/33-telas-empresa.spec.ts e2e/35-assistente.spec.ts` — Expected: PASS.
- [ ] **Step 3: Run** `pnpm lint` (50 avisos, 0 erros), `pnpm typecheck`, `pnpm test`, `pnpm build` — Expected: tudo verde.
- [ ] **Step 4:** Registre a 4a em `docs/PROJECT_STATUS.md` (seção Onboarding, subprojeto 4) e faça o commit `docs(status): setores da obra (4a)`.
