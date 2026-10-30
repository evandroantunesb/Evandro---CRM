# Revisão de design: ficha do negócio e assistente "Adicionar negócio"

Sam (Design), Time Aurora. Data: 2026-10-21.

## Escopo e método

- Base: `origin/main` = `d960703a59afcfdb651882432b3d3721e9ebea03`, lida com `git show` (sem checkout, sem tocar os worktrees `R:/wt-layout` e `R:/wt-kit-auto`).
- **Revisão somente por código. Não vi nenhuma tela renderizada.** Tudo que depende de medida real (alturas, quebras de linha, rolagem, largura efetiva) é **inferência** e está marcado como tal. Aceite visual e funcional é do Evandro.
- Arquivos lidos: `src/app/(app)/negocios/[id]/{page,kit-personalizado,qualificacao,proposta,contrato,edicao,fechamento,marcos-venda,nova-nota,enviar-anexo,arquivamento,pagamento-solo}.tsx`, `src/app/(app)/negocios/novo/{page,formulario}.tsx`, `src/components/{ui,kit-componentes,lista-tarefas,nova-tarefa,concluir-tarefa,campo-arquivo,menu-suspenso}.tsx`, trechos de `src/app/globals.css` e `src/app/(app)/layout.tsx`.
- Não li: `pagamento.tsx`, `handoff-aceite.tsx`, `feedback-handoff.tsx`, `registrar-arquivo.tsx`, `mover-etapa.tsx` (inteiro) e o restante do layout/sidebar. Não verifiquei Next em `node_modules/next/dist/docs/` porque nada aqui depende de API específica do Next (só classes Tailwind 4 e HTML nativo).
- Padrões não documentados (não há documento de design system) foram inferidos do código e estão declarados como inferência.
- Contrastes calculados à mão (fórmula WCAG) com os tokens de `globals.css`: conferir com ferramenta antes de tratar como definitivo.

---

# [Diagnóstico]

## D1. Como a ficha se organiza hoje (visto no código)

`page.tsx:259` container `max-w-5xl` (1024 px). `page.tsx:356` grade `lg:grid-cols-[2fr_1fr]` com `lg:grid-rows-[auto_1fr]`: três filhos no DOM, nesta ordem:

1. Cartão de fechamento (`Fechamento`/`MarcosVenda`), coluna direita, linha 1.
2. Coluna esquerda (uma `div` que ocupa as 2 linhas), 9 a 10 cartões em sequência: Dados do negócio, Kit personalizado, Qualificação SDR, handoff (condicional), Proposta, Contrato, Pagamento (condicional), Tarefas, Notas e linha do tempo.
3. Coluna direita, linha 2: Contato, Etiquetas (condicional), Arquivos.

Antes da grade: link voltar, cabeçalho (nome, selos, etiquetas, Mover etapa), parágrafo de metadados, link da obra, banner de perda, `Arquivamento` (um botão "Arquivar negócio" sempre presente), avisos de criação e de conferência de arquivos.

**Consequência direta (visto no código, derivado da ordem do DOM):** no celular a pilha é Fechamento, Dados, Kit, Qualificação, handoff, Proposta, Contrato, Pagamento, Tarefas, Notas, **só então Contato** (com o botão WhatsApp), Etiquetas, Arquivos. O vendedor que abre a ficha no celular para ligar ou mandar WhatsApp precisa passar por cerca de 9 cartões. É o maior problema de hierarquia da tela.

## D2. Fontes de "comprimento" (visto no código, altura é inferência)

| Fonte | Evidência | Efeito |
|---|---|---|
| Qualificação SDR sempre aberta | `qualificacao.tsx:86-134`: 11 campos + textarea + Salvar + bloco "Enviar para vendas" | Cartão mais alto da página para quem já passou da fase SDR |
| Kit sem cálculo abre o editor completo | `kit-personalizado.tsx:93` (`editando = !calculo`) e `:281-415`: 4 blocos de tipo + 5 campos empilhados em coluna única + prévia + textarea | Um negócio sem kit tem um formulário de ~15 controles no meio da ficha |
| Kit com cálculo: resumo longo | `:207-279`: `dl` de 7 itens + lista de componentes + observações + aviso + botão | Resumo ocupa ~8 linhas antes de qualquer ação |
| Dados do negócio: 11 campos | `edicao.tsx:77-143` | Metade são dados técnicos secundários |
| Nova tarefa sempre aberta | `nova-tarefa.tsx:32-69`: título + 3 controles + botão | Formulário de 4 linhas dentro do cartão de tarefas, mesmo sem uso |
| Notas e linha do tempo sem limite | `page.tsx:604-624`: todas as notas e até 200 atividades | Cartão sem teto; na coluna direita seria uma torre |
| `Arquivamento` acima da grade | `arquivamento.tsx:92-100` e `page.tsx:313` | Botão secundário ocupa uma linha no topo de toda ficha; ao abrir vira formulário inline que empurra tudo |
| `Cartao` com `p-5` fixo | `ui.tsx:82` | 12 cartões x 20 px de padding por lado; em 360 px sobram ~296 px úteis (inferência) |

## D3. Repetição de informação (visto no código)

- Nome do cliente: `h1` (`page.tsx:264`), linha "Nome" do cartão Contato (`:631-636`) e `Selo`/parágrafo de título.
- Valor do negócio: parágrafo de metadados (`:295`), campo em Dados, e preço do kit; **o valor não aparece em destaque em lugar nenhum**: está no meio de uma linha de texto cinza com 6 itens separados por "·" (`:293-300`).
- Obra: link "Ver obra nº" no cabeçalho (`:301-305`) e de novo dentro de `MarcosVenda` (`marcos-venda.tsx:41-45`).
- Etiquetas: chips no cabeçalho (`:273-283`) e cartão "Etiquetas" com os mesmos nomes como alternadores (`:674-701`).
- Consumo médio e conta de energia: campos em Dados (`edicao.tsx:105-118`) e de novo no editor do kit (`kit-personalizado.tsx:328-352`). **Inferência:** pode ser o mesmo dado digitado duas vezes; é pergunta de produto (ver Dúvida 2).
- Wizard: "Documentos (opcional)" na etapa 1 (`formulario.tsx:674-693`) e "Documentos" de novo na etapa 3 (`:903-928`) com a lista dos mesmos arquivos.
- Wizard: potência do sistema aparece em "Resumo do sistema" e de novo em "Kit recomendado" (`:707-755`).

## D4. O que está bom (preservar)

- `MarcosVenda`: estado comunicado por texto (`marco.rotulo`) e não só por cor/ícone (`marcos-venda.tsx:56-71`, ícone `aria-hidden`). Boa prática.
- `Fechamento`: "Marcar como ganho" em dourado com carvão (contraste ~9:1) e perda com confirmação em duas etapas, com `perigo` só em perda. Alinhado à regra "vermelho só para perda e erro".
- Verde só no botão WhatsApp e em dinheiro/economia positiva: alinhado a CLAUDE.md.
- Padrão `<details>` já existe e tem precedente no projeto (`obras/[id]/gestao.tsx:41-48`, `pagamento-solo.tsx:102`, `negocios/page.tsx:288`).
- Wizard: validação por etapa com foco no campo (`formulario.tsx:429-434`), estado "Continuar sem kit" que deixa claro o que o botão faz (`:849`), `noValidate` com mensagem própria.
- Botões `type="button"` corretos no wizard; setas lucide consistentes.

---

# [Decisão de Design]

## DD1. Estrutura da ficha

Princípio: **a ficha deixa de ser "uma lista de cartões" e passa a ter dois eixos.** Coluna lateral = "o que faço agora com este cliente" (fechar, contatar, tarefas, histórico, arquivos). Coluna principal = "o que sei e o que vendo" (kit, dados, qualificação, proposta, contrato, pagamento).

1. **Cabeçalho mais informativo e menos "texto corrido":** nome, selos, Mover etapa; abaixo, o **valor em destaque** (Manrope, `text-xl font-semibold`) e os metadados como lista curta (Responsável, Origem, Criado em) em `text-sm text-zinc-600`. Remove a linha "·" de 6 itens.
2. **Ordem do DOM = ordem do celular = ordem de tabulação.** Nada de `order-*` ou `contents` reordenando o que o teclado e o leitor de tela percorrem (WCAG 1.3.2/2.4.3). Usa-se a técnica que a página já usa (grade com `grid-rows-[auto_1fr]`), apenas com **dois blocos laterais** em vez de um.
3. **Lateral A (antes do bloco principal no DOM):** Fechamento, Contato (com WhatsApp e etiquetas dentro), Tarefas. **Lateral B (depois do bloco principal):** Notas e linha do tempo, Arquivos. No celular isso dá: ações e contato primeiro, trabalho de venda no meio, histórico e arquivos no fim.
4. **Largura:** container sobe de `max-w-5xl` para `max-w-7xl`; duas colunas só a partir de `xl` (1280 px), lateral com ~20 rem. Motivo (cálculo, inferência): o menu lateral fixo ocupa 256 px de `md` em diante (`layout.tsx:129`) e `main` tem `md:p-10`; em 1024 px sobram ~688 px de conteúdo e a lateral levaria quase metade. Entre 768 e 1279 px a ficha fica em coluna única, na mesma ordem do celular.
5. **Dentro do bloco principal, responsividade por container, não por viewport.** Tailwind 4 tem `@container`/`@md:`/`@3xl:` nativos. O bloco principal vira `@container`; os `md:grid-cols-2` de formulários da ficha passam a ser `@lg:`; "Proposta e contrato" vira 2 colunas em `@3xl:` (>= 768 px do próprio bloco). Assim o layout se ajusta à largura real do bloco e não "espreme" quando a coluna é estreita.
6. **Recolher por padrão o que é de consulta ocasional; manter aberto o que é de ação frequente.** Recolhidos: Qualificação SDR, dados técnicos do cliente (dentro de Dados), itens do kit, formulário de Nova tarefa, tarefas concluídas, notas/atividades antigas, arquivos além dos 5 primeiros, Arquivar.
7. **Um único padrão de recolher:** `<details>` nativo (teclado e leitor de tela de graça), com cabeçalho `summary` em tamanho de toque confortável e indicador de chevron como em `gestao.tsx`. Para não repetir markup em 5+ lugares, a justificativa de **um componente novo e pequeno** está em D-C1 abaixo (`Cartao` ganha `recolhivel`).

## DD2. Pedidos aprovados: como executar bem

- **(a) Kit acima de "Valor do negócio" quando há kit.** O valor está dentro do cartão "Dados do negócio" (`edicao.tsx:97-104`). Logo: se existe cálculo ou itens salvos, o cartão Kit vem **antes** de Dados. Se não há kit, **não** mostrar o editor aberto: mostrar uma linha compacta "Nenhum kit montado" + botão "Montar kit", **depois** de Dados (o vendedor vê Valor primeiro, como hoje). O resumo do kit com cálculo passa a ter 3 números em destaque (Geração, Economia, Payback) e o resto em `<details>`. Detalhes na especificação.
- **(b) Qualificação recolhida por padrão com status e contagem visíveis.** `Selo` do status + "x de 3 critérios atendidos" ficam **no `summary`** (já existem em `qualificacao.tsx:80-83`). O formulário e "Enviar para vendas" ficam dentro. Depois de salvar, o painel **continua aberto** (para ver a mensagem de sucesso), e o `<details>` não deve ser controlado por estado do React: o navegador mantém `open` quando o servidor re-renderiza.
- **(c) Tarefas e Linha do tempo na coluna direita, abaixo do contato.** Sim, na lateral. Tarefas na Lateral A (logo após Contato); Notas e linha do tempo na Lateral B (fim, depois do bloco principal no celular). A linha do tempo é longa por natureza: **limitar a 8 itens visíveis** e o restante em `<details>` "Ver anteriores (n)". Composer de nota continua no topo do cartão.
- **(d) Proposta e Contrato no mesmo container, lado a lado em telas largas.** Um único `Cartao` "Proposta e contrato" com `@container`; dentro, duas `section` (cada uma com `h3`) lado a lado em `@3xl:` e empilhadas abaixo disso, separadas por `border-t` no empilhado e `border-l` no lado a lado. **Os `id` `#contrato` e `#pagamento` devem ser preservados** (são âncoras de `MarcosVenda`, `marcos-venda.tsx:66`). Pagamento continua sendo cartão separado imediatamente abaixo (só aparece com contrato).
- **(e) Indicador de etapas clicável.** `IndicadorEtapas` vira `<nav aria-label="Etapas do cadastro">` com `<ol>` de `<button type="button">` e `aria-current="step"` na etapa ativa. Voltar: sem validar. Avançar para N: valida as etapas da atual até N-1, na ordem; para na primeira que falha e a mostra (reaproveita `problemaDaEtapa` e `mostrarProblema`, `formulario.tsx:400-435`). Detalhes na especificação.
- **(f) Menos rolagem e ruído.** Resumido em DD1 e na lista de achados.

---

# [Especificação para o Kevin]

Convenções: só tokens e classes que já existem (`bg-carvao`, `text-offwhite`, `dourado`, `zinc-*` e `amber-*` redefinidas em `globals.css`, `font-titulo`, `Botao`, `Campo`, `Selecao`, `Mensagem`, `Cartao`, `Selo`, `lucide-react`). Quem aplica é o Kevin, por tarefa que a Nora distribuir. **Cada bloco abaixo é independente**: a Nora pode fatiar em PRs menores.

## E1. Wireframe da ficha (desktop, >= 1280 px)

```
max-w-7xl, mx-auto
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ← Negócios                                                                      │
│ Maria Souza  [#482] [Proposta enviada] [Ganho?] [etiqueta][etiqueta]  [Mover ▾] │
│ R$ 38.500,00                                  (valor em destaque, font-titulo)  │
│ Responsável Ana · Origem Indicação · Criado 12/10/2026 · Fechado em ...         │
│ [Banner perdido]  [Banner arquivado]  [Oportunidade pendente de aceite]  [avisos]│
├───────────────────────────────────────────────────┬─────────────────────────────┤
│ BLOCO PRINCIPAL (1fr, é @container)               │ LATERAL (20rem)             │
│                                                   │ ┌ Lateral A ──────────────┐ │
│ ┌ Kit personalizado (se há kit) ───────────────┐  │ │ Fechamento / 3 marcos   │ │
│ │ Kit 5,5 kWp · 10 x 550 W + inversor          │  │ ├─────────────────────────┤ │
│ │ Geração  Economia  Payback                   │  │ │ Contato                 │ │
│ │ ▸ Ver itens e dados do kit   [Editar kit]    │  │ │ [WhatsApp]              │ │
│ └──────────────────────────────────────────────┘  │ │ tel · e-mail · cidade   │ │
│ ┌ Dados do negócio ────────────────────────────┐  │ │ Etiquetas (chips)       │ │
│ │ Nome | Origem | Responsável | Valor          │  │ ├─────────────────────────┤ │
│ │ ▸ Dados técnicos (consumo, conta, UC, ...)   │  │ │ Tarefas (3 abertas)     │ │
│ │ Descrição            [Salvar]                │  │ │  ☐ Ligar ... hoje       │ │
│ └──────────────────────────────────────────────┘  │ │  ▸ Concluídas (2)       │ │
│ (se NÃO há kit: linha "Nenhum kit  [Montar kit]") │ │  [+ Nova tarefa]        │ │
│ ┌ Qualificação SDR ▸ [Qualificado] 3 de 3 ────┐   │ └─────────────────────────┘ │
│ └──────────────────────────────────────────────┘  │ ┌ Lateral B ──────────────┐ │
│ [Handoff devolvido / feedback do lead] (se houver)│ │ Notas e linha do tempo  │ │
│ ┌ Proposta e contrato ─────────────────────────┐  │ │  [nota...] [Salvar]     │ │
│ │ Proposta            │ Contrato               │  │ │  8 itens recentes       │ │
│ │ link, Copiar, ...   │ link, status           │  │ │  ▸ Anteriores (n)       │ │
│ └──────────────────────────────────────────────┘  │ ├─────────────────────────┤ │
│ ┌ Pagamento (se há contrato) ──────────────────┐  │ │ Arquivos (n)            │ │
│ └──────────────────────────────────────────────┘  │ │  5 primeiros, 2 linhas  │ │
│                                                   │ │  ▸ Ver todos · [Anexar] │ │
│                                                   │ └─────────────────────────┘ │
├───────────────────────────────────────────────────┴─────────────────────────────┤
│ Arquivar negócio (botão discreto, rodapé; formulário abre aqui)                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## E2. Wireframe da ficha (celular e < 1280 px: coluna única, mesma ordem do DOM)

```
← Negócios
Maria Souza  [#482] [Etapa] [etiquetas]
[Mover etapa ▾]
R$ 38.500,00
Responsável · Origem · Criado em
[banners: oportunidade pendente, arquivado, perdido, avisos]
────────────────
Fechamento / 3 marcos          (Lateral A)
Contato  [WhatsApp]  tel  e-mail  cidade  etiquetas
Tarefas (3 abertas) · [+ Nova tarefa] · ▸ concluídas
────────────────
Kit personalizado              (se há kit)
Dados do negócio               (▸ dados técnicos recolhidos)
Nenhum kit montado [Montar kit](se não há kit)
Qualificação SDR ▸ [status] x de 3
Handoff (devolvido/feedback)
Proposta e contrato            (empilhados: Proposta, depois Contrato)
Pagamento
────────────────
Notas e linha do tempo         (Lateral B)
Arquivos
────────────────
Arquivar negócio
```

Estrutura de grade sugerida (extensão da já existente em `page.tsx:356`; a marcação é do Kevin):

```tsx
<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr]">
  <div className="flex flex-col gap-4 xl:col-start-2 xl:row-start-1">{/* Lateral A: Fechamento, Contato, Tarefas */}</div>
  <div className="@container flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">{/* Principal */}</div>
  <div className="flex flex-col gap-4 xl:col-start-2 xl:row-start-2">{/* Lateral B: Notas/timeline, Arquivos */}</div>
</div>
```

`minmax(0,1fr)` e `min-w-0` são obrigatórios para que nomes de arquivo longos e URLs não alarguem a coluna (hoje `2fr_1fr` sem `minmax` pode estourar com conteúdo sem quebra; inferência).

## E3. Componente base: `Cartao` recolhível (justificativa de componente novo)

Usos: Qualificação, Dados técnicos, itens do kit, Arquivos, Histórico. São 5 lugares com o mesmo padrão; o projeto já repete `<details>` em 3 telas com classes diferentes. Em `ui.tsx`:

- `Cartao` ganha props opcionais `recolhivel?: boolean`, `abertoPorPadrao?: boolean` e `resumo?: ReactNode` (selo e contagem mostrados ao lado do título quando fechado). Quando `recolhivel`, renderiza `<section><details open={abertoPorPadrao}><summary>…<h2>título</h2>{resumo}…</summary>…</details></section>`.
- `summary`: `flex min-h-11 cursor-pointer list-none items-center justify-between gap-2` + chevron lucide (`ChevronRight` com `group-open:rotate-90`, como `gestao.tsx:46`), `rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-700` (ver A1: o `ring-dourado/50` atual é fraco).
- Heading dentro de `summary` é permitido pelo HTML; manter `h2` para a hierarquia.
- Sem `aria-expanded` manual: `<details>` já expõe o estado.
- Padding: trocar `p-5` por `p-4 sm:p-5` em `Cartao` (mudança global pequena; Kevin confere as demais telas que usam `Cartao`).

## E4. Especificação por bloco da ficha

**Cabeçalho (`page.tsx:263-311`)**
- Remover o parágrafo único de metadados. Colocar o valor (`formatarMoeda`) em `font-titulo text-xl font-semibold text-carvao` abaixo do nome; "Sem valor" em `text-zinc-500` se nulo. Metadados em `flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600`.
- Remover o link "Ver obra" do cabeçalho (`:301-305`) e manter só o de `MarcosVenda`. Se a venda não tiver marcos (`cartao.tipo !== "marcos"`), manter o do cabeçalho: condicionar.
- Link "← Negócios": adicionar `inline-flex min-h-11 items-center` (alvo 44 px).
- `Arquivamento`: mover o render (`:313-327`) para depois da grade (rodapé). O **banner de negócio arquivado** (`arquivamento.tsx:39-90`) precisa continuar no topo: separar em dois componentes ou deixar `Arquivamento` receber `posicao="topo" | "rodape"`. Botão "Arquivar negócio" no rodapé como `variante="secundario"` com `w-fit`; o formulário de confirmação abre ali mesmo.
- `Oportunidade` pendente de aceite (`:465-472`, `ultimoHandoff.status === "pendente"` e `podeResponder`): mover para a zona de banners, **antes** da grade, porque é uma ação que pende de quem abre a ficha. Devolvido e feedback continuam no bloco principal.

**Kit personalizado (`kit-personalizado.tsx`)**
- Ordem na coluna principal: se `calculo || componentesSalvos.length > 0`, Kit **antes** de Dados; senão, linha compacta após Dados.
- Estado sem kit e sem edição: `editando` inicial deve ser `false` quando `!calculo && componentesSalvos.length === 0` (hoje `:93` abre sempre que não há cálculo). Mostrar `<p class="text-sm text-zinc-600">Nenhum kit montado.</p>` + `<Botao variante="secundario">Montar kit</Botao>`. O `Cancelar` da primeira montagem (`:409-411`) volta a este estado.
- Se há itens salvos mas sem cálculo (`:285-289`): manter o editor aberto, pois há pendência ("informe a tarifa").
- Estado com cálculo, fechado (`:207-279`): primeira linha com nome do kit (`font-medium`) + potência se disponível; bloco `grid grid-cols-3 gap-3` com Geração estimada, Economia estimada (verde positivo existente), Payback; o resto (Ligação, Consumo médio, Estrutura do telhado, lista de componentes, observações) em `<details>` "Ver itens e dados do kit". O aviso "Estimativa do modo comercial..." sai de `text-zinc-400` (ver A2) para `text-zinc-600 text-xs`. Avisos de preço desatualizado e "Favor adicionar o padrão do cliente" ficam **acima** do resumo (são pendências). "Editar kit / recalcular" continua `secundario`, `self-start`, alvo `min-h-11`.
- Estado de edição (`:281-415`): agrupar campos em grade por container: Tipo de ligação + Estrutura do telhado em `@lg:grid-cols-2`; Consumo médio + Valor da fatura + Tarifa em `@lg:grid-cols-3`. A frase "Sem o consumo em kWh? Preencha a fatura" (`:336`) vira texto de ajuda associado com `aria-describedby`.
- `EditorComponentesKit` (`kit-componentes.tsx:159`): trocar `md:grid-cols-[2fr_1fr_1fr_auto]` por `@xl:grid-cols-[2fr_1fr_1fr_auto]` (o editor precisa estar dentro de um `@container`); o botão "Remover" ganha `aria-label={`Remover ${rótulo do tipo} ${n}`}`.
- Preço sugerido (`:302-307`): sem mudança de conteúdo; contraste do texto (ver A2).

**Dados do negócio (`edicao.tsx`)**
- Grupo visível: Nome do negócio, Origem, Responsável (se houver), Valor, Descrição (2 linhas). Grupo recolhido `<details>` "Dados técnicos do cliente" com resumo `Consumo 780 kWh · Conta R$ 650 · Padrão trifásico` (só os preenchidos): Valor da conta, Consumo médio, Unidade consumidora, Padrão do cliente, Tipo do telhado, Fatura de energia.
- Os campos dentro do `<details>` continuam no mesmo `<form>` e são enviados mesmo fechados (comportamento nativo): não precisa mudar a ação.
- Responsividade: `md:grid-cols-2` → `@lg:grid-cols-2`.
- Estado de sucesso: o "Salvo." existe; garantir `role="status"` (já em `Mensagem`).

**Qualificação SDR (`qualificacao.tsx`)**
- `Cartao recolhivel` com `resumo={<><Selo tom={status.tom}>{status.rotulo}</Selo><span class="text-xs text-zinc-600">{status.atendidos} de {status.total}</span></>}`; `abertoPorPadrao={false}`.
- "Enviar para vendas" fica dentro do painel (ver Dúvida 1 sobre o SDR).
- `Selecao` do vendedor (`:31`) precisa de `aria-label="Vendedor que receberá o negócio"` (hoje não tem nome acessível).
- Grade interna `md:grid-cols-2` → `@lg:grid-cols-2`.
- Textarea (`:128-133`): usar o mesmo estilo dos demais campos (ver A5).

**Proposta e contrato (`page.tsx:503-537`, `proposta.tsx`, `contrato.tsx`)**
- Um `Cartao titulo="Proposta e contrato"`; `div` com `grid gap-6 @3xl:grid-cols-2 @3xl:divide-x @3xl:divide-zinc-200 [&>section+section]:border-t @3xl:[&>section+section]:border-t-0 [&>section+section]:pt-4 @3xl:[&>section+section]:pl-6`. Cada `section` com `h3 text-sm font-semibold text-zinc-900`. O `id="contrato"` e `scroll-mt-4` vão na section do contrato.
- Proposta (`proposta.tsx:78-104`): os 4 botões em `flex flex-wrap`; "Enviar no WhatsApp" é `<a><Botao/></a>` (botão dentro de link: HTML inválido e dois alvos de foco; trocar por `<a className=...>` com as classes do `Botao` ou um `BotaoLink`; mesmo para "Baixar PDF"). Em coluna estreita, o campo do link sobe para uma linha própria (`basis-full`) e os botões vão abaixo.
- Estado vazio da proposta (`proposta.tsx:41-43`, "Calcule o kit acima"): manter, mas tornar "kit" um link para o cartão do kit (`#kit`, com `id` no cartão).
- Estatística de aberturas (`:136`): `text-[11px] text-zinc-400` é ilegível (ver A2); usar `text-xs text-zinc-600`.
- Contrato (`contrato.tsx:114-127`): `FormularioStatus` usa `flex items-end gap-2` sem quebra; `flex-wrap`. A mensagem de resultado fica dentro do mesmo `flex`, espremendo o select; mover `Mensagem` para uma linha própria.
- `Pagamento` continua em cartão próprio, imediatamente abaixo, mantendo `id="pagamento"`.

**Fechamento (`page.tsx:358-360`, `marcos-venda.tsx`)**
- Sem mudança estrutural. Ao ficar no topo da Lateral A, é o primeiro cartão após os banners.
- `marcos-venda.tsx:62-70`: "Ver cartão" é um link por marco; em lateral estreita fica `text-sm underline`; ok. Alvo de toque: `inline-block py-1`.

**Contato (`page.tsx:628-673`)**
- Remover a linha "Nome" (o nome já está no `h1`); no lugar, no próprio cartão, um link "Ver contato" para `/contatos/{id}`.
- Primeiro elemento do cartão: botão WhatsApp (largura total, verde, ver A3); abaixo, `Telefone` como `<a href="tel:...">`, `E-mail` como `<a href="mailto:...">`, `Endereço` e `Cidade / UF` numa linha só ("Rua X, 12 · Campinas / SP").
- Etiquetas passam para dentro deste cartão (subtítulo "Etiquetas" `text-xs text-zinc-600`), eliminando o cartão separado (`:674-701`). Botões de etiqueta com `min-h-9 px-3 text-sm` (hoje `py-1 text-xs`, ~26 px de altura). Os chips do cabeçalho permanecem só como leitura.

**Tarefas (`page.tsx:579-601`, `lista-tarefas.tsx`, `nova-tarefa.tsx`)**
- Lista: abertas visíveis; concluídas em `<details>` "Concluídas (n)". `ListaTarefas` recebe a divisão (ou o `page.tsx` passa duas listas).
- "Nova tarefa": colapsada por padrão num `<details>` com `summary` "+ Nova tarefa"; abre e foca o título. O campo de título (`nova-tarefa.tsx:34-39`) precisa de `aria-label="Título da tarefa"`.
- Em lateral estreita, `Selecao` + datetime + responsável + botão em `flex flex-wrap` ficam em 2 a 3 linhas: usar `grid grid-cols-1 gap-2` e `Botao` com `w-full`.
- "Apagar" (`lista-tarefas.tsx:57-63`): ver A4.

**Notas e linha do tempo (`page.tsx:602-625`, `nova-nota.tsx`)**
- Mover para Lateral B. Mostrar 8 itens (`linha.slice(0, 8)`), o restante dentro de `<details>` "Ver anteriores (n)" (render no servidor, sem JS).
- `nova-nota.tsx:17-23`: `aria-label="Nova nota"` no textarea. Sucesso: hoje o formulário só reseta (`:10-12`) e não há confirmação; mostrar `Mensagem` com "Nota salva." por alguns segundos (ou deixar a própria nota aparecendo no topo como retorno, desde que a ação revalide a página; confirmar com Kara).
- Itens de nota (`amber-50`/`amber-200`) e de atividade (`border-l-2`): manter. `<time dateTime>` nas datas é desejável (baixa).

**Arquivos (`page.tsx:702-749`, `enviar-anexo.tsx`)**
- Cada linha em duas linhas: (1) nome do arquivo em `min-w-0 break-words` (permitir quebra em até 2 linhas com `line-clamp-2`) + `title={a.nome}`; (2) `Selo` de categoria + tamanho + "Apagar" alinhado à direita (`flex flex-wrap items-center gap-x-2`). Hoje o nome compete com `Selo`, tamanho e "Apagar" na mesma linha de ~300 px e é truncado (`:718`; inferência de largura).
- Mostrar os 5 mais recentes; o restante em `<details>` "Ver todos (n)". Cabeçalho do cartão mantém `Arquivos (n)`.
- Área de envio (`enviar-anexo.tsx:64-74`): ver A6 (input escondido não alcançável por teclado).
- Estado de envio: "Enviando..." está no texto do botão; adicionar `aria-live="polite"` na região para anunciar; erros em `role="alert"` (`:75`).

## E5. Especificação do assistente "Adicionar negócio"

**Indicador de etapas clicável (`formulario.tsx:67-95`)**
- Estrutura: `<nav aria-label="Etapas do cadastro"><ol class="flex items-center gap-2">` com `<li><button type="button" aria-current={n === atual ? "step" : undefined} onClick={() => irPara(n)}>`.
- Visual: manter as cores atuais (ativa `bg-carvao text-offwhite`, concluída `bg-dourado/15 text-carvao`, futura `bg-zinc-100 text-zinc-600`); acrescentar `min-h-11`, `outline-none focus-visible:ring-2 focus-visible:ring-amber-700`, `hover:bg-zinc-200` nas inativas, `cursor-pointer`. Etapa concluída mostra `Check` do lucide no lugar do número (redundância além da cor).
- Mobile (< 640 px): mostrar só o número e, ao lado, o título **apenas da etapa ativa** ("Etapa 2 de 3 · Sistema recomendado"); os outros itens ficam como círculos numerados. Hoje o `ol` não tem `flex-wrap` e três pílulas com título completo somam bem mais de 360 px (inferência: transborda ou força rolagem horizontal).
- Lógica `irPara(destino)`:

```ts
function irPara(destino: 1 | 2 | 3) {
  if (destino === etapaAtual) return;
  if (destino < etapaAtual) { setErroEtapa(null); return setEtapaAtual(destino); } // voltar: sem validar
  for (let e = etapaAtual; e < destino; e++) {            // avançar: valida a atual e as intermediárias
    const p = problemaDaEtapa(e as 1 | 2);
    if (p) return mostrarProblema(e as 1 | 2, p);          // leva à primeira etapa com problema
  }
  setErroEtapa(null);
  setEtapaAtual(destino);
}
```

  `avancar()` passa a ser `irPara(etapaAtual + 1)`. Voltar para trás não limpa nada digitado (o estado já vive no componente).
- Depois de trocar de etapa (botões, indicador ou erro): mover o foco para o `legend`/título da etapa (com `tabIndex={-1}`) e rolar até o topo do cartão (`scrollIntoView({block:"start"})`). Hoje o foco fica no botão "Avançar" que passou a `display:none` (foco perdido) e a página não volta ao topo (inferência: ao encolher o documento o navegador mantém a rolagem, o usuário cai no meio da etapa nova).
- Estados: indicador desabilitado enquanto `pendente` ou `enviandoArquivos`.

**Enter no meio do formulário (`formulario.tsx:327-336`)**
- Hoje o único `submit` está na etapa 3, mas o `<form onSubmit={enviar}>` envolve tudo: Enter num campo da etapa 1 dispara `enviar`, que valida todas as etapas e pode saltar para a etapa 2 ou 3 com erro (inferência do HTML: o botão de submit escondido continua sendo o padrão do formulário). Corrigir: no início de `enviar`, `if (etapaAtual !== 3) return avancar();`.

**Etapa 1 (`:480-701`): reduzir**
- Tirar "Documentos (opcional)" (`:674-693`) da etapa 1 e deixar só na etapa 3 (`:903-928`), com `CampoArquivo` para CNH e Conta de energia no mesmo padrão de Fotos e Outros. Elimina a duplicação e encurta a etapa inicial. (Se o Evandro quiser manter o anexo cedo, ver Dúvida de produto em P1.)
- Localização: manter visíveis CEP, Cidade e UF (obrigatórios); Rua, Número, Complemento, Bairro dentro de `<details>` "Endereço completo (opcional)", **aberto automaticamente** quando `buscarEnderecoPorCep` preencher algo (`:188-206`). O parágrafo "Cidade e estado identificam a distribuidora..." fica como `aria-describedby` de Cidade/UF, em `text-zinc-600`.
- "Novo cliente" / "Cliente existente" (`:509-519`): são alternadores; usar `role="radiogroup"` com dois `role="radio"` ou, no mínimo, `aria-pressed`. Hoje só a cor diferencia.
- Erro de e-mail (`:579`): `text-red-600` sobre branco ~4,8:1 (ok), mas falta ligar ao campo: `aria-invalid` + `aria-describedby`.
- Asteriscos no texto do rótulo ("WhatsApp*"): manter, mas os campos já têm `required`, o que expõe obrigatoriedade a leitor de tela. Acrescentar a legenda "* obrigatório" no topo da etapa.

**Etapa 2 (`:703-852`): enxugar e reordenar**
- Fundir "Resumo do sistema" e "Kit recomendado (estimativa)" num bloco só: Consumo, Produtividade, Potência recomendada, Módulos (ex.: "10 x 550 W"). Remover as células "Inversor: a definir (sem catálogo...)" e "Geração/economia/payback: a calcular" (ruído: dizem o que **não** existe). Manter a frase "Estimativa ilustrativa: não é salva no negócio" como nota única.
- Aviso de compatibilidade (`:758-764`): hoje aparece sempre, mesmo sem kit montado. Mostrar de forma compacta (uma linha, mesmo `AlertTriangle`) **junto do editor do kit** (quando `mostrarKit || componentes.length`). A redação é regra de produto e não deve ser alterada por design.
- Ordem: Resumo, aviso, **Kit** (botão "Montar kit manualmente" ou editor), **depois Valor do negócio**. Coerente com o pedido (a) da ficha (kit antes do valor) e com o fluxo real: o valor é sugerido a partir do kit (`:258-262`).
- `role="status"` no aviso é adequado (informativo).
- Botão "Remover" do editor com `aria-label` (idem ficha).

**Etapa 3 (`:854-941`)**
- Remover o campo desabilitado "Distribuidora - Preenchida automaticamente em breve" (`:859`): promete algo que não existe e ocupa uma linha com campo cinza inútil.
- Tarifa e Tipo de ligação desabilitados quando não há kit (`:865`, `:871`) + frase de explicação (`:880-885`): manter a regra (é de produto), mas trocar por `<p class="text-xs text-zinc-600">` e colocar o texto **antes** dos campos, não depois.
- Bloco "Documentos" (`:903-928`): unificar, ver etapa 1. Lista com Ver/Substituir/Remover: alvos `min-h-9`, e `aria-label` com o nome ("Substituir CNH").
- CTA final "Salvar negócio" (`:936`): ok. Durante o envio, `aria-busy` no formulário.

**Navegação inferior do wizard**
- Mobile: barra de ações fixa na base do cartão (`sticky bottom-0 -mx-5 border-t border-zinc-200 bg-offwhite/95 px-5 py-3 backdrop-blur`), com Voltar à esquerda e Avançar/Salvar à direita, alvo `min-h-11`. Para a etapa 1, que tem 20+ campos, o botão "Avançar" hoje só aparece no fim da rolagem (`:696-700`). Prioridade média, depende de ver o resultado renderizado.

**Erros e foco**
- `Mensagem` (`ui.tsx:58-68`) usa `role="status"` para sucesso **e** erro. Erros devem ser `role="alert"`. Mudança global em uma linha; afeta o wizard, a ficha e outras telas.
- Cada mensagem de etapa (`erroEtapa`) deve apontar para o campo com `aria-describedby` no campo que recebe o foco (hoje o foco vai ao campo, mas a mensagem fica solta).

---

# Achados priorizados

Formato: **ID. título** (tela/arquivo:linha). Evidência (visto/inferido). Impacto. Solução. Prioridade.

## Alta

**A1. Foco visível fraco em `Botao` e `Campo`/`Selecao`** (`ui.tsx:15`, `:29`, `:43`; global). *Visto:* `focus-visible:ring-dourado/50` e `focus:border-dourado focus:ring-dourado/20`, com `outline-none`. Dourado `#D4AF37` sobre branco tem ~2,1:1 (cálculo); a 50% e a 20% de opacidade é pior. *Impacto:* usuário de teclado quase não vê o foco; WCAG 2.4.7 e 1.4.11 (3:1). *Solução:* anel `ring-2 ring-amber-700` (`#8c701d`, ~4,7:1 sobre branco) com `ring-offset-1` nos botões; nos campos, `focus:border-amber-700 focus:ring-2 focus:ring-amber-700/30`. Usa tokens existentes; não altera a paleta. É mudança global: tratar em PR separada, avisando as demais telas.

**A2. Mobile coloca Contato, Tarefas e WhatsApp no fim** (`page.tsx:362-750`). *Visto:* ordem do DOM (D1). *Impacto:* ação mais comum no celular escondida atrás de ~9 cartões. *Solução:* Lateral A antes do bloco principal (E1/E2). Alta.

**A3. Entrada de arquivo inacessível por teclado** (`enviar-anexo.tsx:64-74`; `campo-arquivo.tsx:23-34`; `formulario.tsx:122-133`). *Visto:* `<input type="file" className="hidden">` (display:none) dentro/ligado a `<label>`, sem alternativa. *Impacto:* WCAG 2.1.1 (A): quem não usa mouse/toque não consegue anexar na ficha (`EnviarAnexo`) nem na fatura da edição; no wizard, só é possível na etapa 3 pelos botões "Anexar". *Solução:* `className="sr-only"` no input e, no label, `focus-within:ring-2 focus-within:ring-amber-700` (ou `peer` + `peer-focus-visible:`). Mesma troca nos três componentes.

**A4. Enter no wizard salta de etapa ou tenta salvar** (`formulario.tsx:327-336`, `:460`). *Inferido do HTML* (submit padrão do formulário). *Impacto:* vendedor digita o nome do cliente, aperta Enter e é jogado na etapa 2 com erro de "Valor". *Solução:* `if (etapaAtual !== 3) return avancar();` no início de `enviar`. Alta (fluxo principal).

**A5. Indicador de etapas não clicável, sem semântica e provavelmente largo demais no celular** (`formulario.tsx:67-95`). Pedido (e). Solução em E5. Alta.

**A6. Valor do negócio sem destaque e linha de metadados ilegível** (`page.tsx:293-300`). *Visto.* *Impacto:* o dado mais consultado fica numa frase cinza de 6 itens. *Solução:* E4 (cabeçalho). Alta.

## Média

**M1. Texto de apoio com contraste insuficiente (`text-zinc-400`)** (`kit-personalizado.tsx:271`, `:303`, `:336`; `kit-componentes.tsx:153-157`; `formulario.tsx:670`, `:786`, `:880`; `proposta.tsx:136` com 11 px; `lista-tarefas.tsx:60`; botões "Apagar"). *Visto:* `#9ca0a8` sobre branco ~2,6:1 (cálculo); WCAG 1.4.3 pede 4,5:1. *Solução:* `text-zinc-600` (`#555a64`, ~6,2:1) para texto de apoio e `text-zinc-500` (~4,8:1 em branco; ~4,3:1 sobre `zinc-100`, então evitar sobre fundo `zinc-100`) no mínimo. Mínimo de `text-xs` (12 px); eliminar `text-[11px]` (`proposta.tsx:136`).

**M2. Botão WhatsApp com contraste baixo** (`page.tsx:668`). *Visto:* `bg-green-600 text-white`; ~3,3:1 (cálculo). *Solução:* `bg-green-700 hover:bg-green-800`, ~5,0:1. Verde segue exclusivo do WhatsApp (identidade preservada). Também: ícone do WhatsApp (lucide não tem marca; usar `MessageCircle`) é opcional.

**M3. "Apagar" sem confirmação e com alvo minúsculo** (`lista-tarefas.tsx:57-63`, `page.tsx:725-730`). *Visto:* `<button className="text-xs text-zinc-400 ...">` num `form action` direto; sem confirmação visível no código. *Inferido:* a ação apaga ao primeiro toque. *Impacto:* apagar tarefa ou anexo por engano no celular. *Solução:* alvo `min-h-9 px-2`, cor `text-zinc-600 hover:text-red-700`, `aria-label="Apagar tarefa {título}"` / `"Apagar arquivo {nome}"` (hoje todos "Apagar tarefa" iguais e o anexo sem nome), e confirmação (padrão de duas etapas como em `Fechamento`, ou `<details>` com "Confirmar"). Depende de a regra aceitar desfazer; é só UI.

**M4. Rótulos faltando em campos soltos** (`nova-nota.tsx:17-23`, `nova-tarefa.tsx:34-39`, `qualificacao.tsx:31`, `fechamento.tsx:75-80`, `page.tsx` etiquetas). *Visto:* só `placeholder` ou nenhum nome. WCAG 3.3.2/4.1.2. *Solução:* `aria-label` (E4). Placeholder some ao digitar.

**M5. Textareas e inputs crus com estilo diferente dos campos do sistema** (`nova-nota.tsx:22`, `nova-tarefa.tsx:38`, `fechamento.tsx:79`, `qualificacao.tsx:132`, `edicao.tsx:134`, `kit-personalizado.tsx:382`, `formulario.tsx:899`). *Visto:* `rounded-md border border-zinc-300` sem foco de marca, enquanto `Campo`/`Selecao` usam `rounded-lg border-zinc-200 focus:border-dourado...`. *Impacto:* inconsistência visual e de foco. *Solução:* exportar `Area` (textarea) em `ui.tsx` com as classes de `Campo` (6+ usos justificam o componente) e usar `Campo` para os `input` crus.

**M6. Mensagens de erro como `role="status"`** (`ui.tsx:61-63`). Erros devem ser `role="alert"` (anúncio imediato). Global, uma linha.

**M7. Foco perdido e rolagem não reiniciada ao trocar de etapa** (`formulario.tsx:436-441`, `:454-457`). Ver E5. *Impacto:* WCAG 2.4.3 e usabilidade no celular.

**M8. Boxe de handoff pendente enterrado** (`page.tsx:465-472`). Ver E4.

**M9. Busca de catálogo no editor do kit sem semântica de combobox** (`kit-componentes.tsx:56-92`). *Visto:* `ul` absoluto com botões; sem `role="combobox"`, `aria-expanded`, `aria-controls`, setas, `Esc`; a lista só fecha ao escolher. *Impacto:* WCAG 2.1.1/4.1.2 para quem usa teclado; resultados ficam sobre os campos seguintes ao sair do campo. *Solução:* fechar no `blur`/`Esc`; `role="listbox"`/`option` com navegação por setas, ou padrão `datalist`. Esforço maior: pode ficar para a PR do kit.

**M10. Etapa 1 do wizard muito longa** (`formulario.tsx:480-701`): ~20 controles + documentos. Solução E5 (documentos para etapa 3; endereço detalhado recolhido).

**M11. `Cartao` com padding fixo `p-5` e títulos `text-base`** (`ui.tsx:82`). *Inferido:* peso excessivo no celular. `p-4 sm:p-5` (E3).

**M12. Kit sem cálculo abre editor completo** (`kit-personalizado.tsx:93`). Solução em E4. Reduz cerca de 15 controles da ficha de todo negócio novo sem kit (inferência de quantidade, o código mostra os 4 tipos + 5 campos).

**M13. `Botao` dentro de `<a>`** (`proposta.tsx:96-103`). *Visto:* HTML inválido (elemento interativo dentro de interativo); foco duplo no teclado. *Solução:* `<a className="...classes do Botao...">` ou `BotaoLink` em `ui.tsx`.

**M14. Cartão Etiquetas e chips do cabeçalho repetidos** (`page.tsx:273-283` e `:674-701`). Fundir no Contato (E4). Alvos dos botões de etiqueta com ~26 px de altura (`py-1 text-xs`).

**M15. Campos de etiqueta com cor arbitrária e texto branco** (`page.tsx:276-279`, `:686-691`). *Inferido:* a cor vem do banco (`e.cor`); contraste do texto branco não é garantido para qualquer cor escolhida. *Solução:* calcular cor do texto (carvão ou branco) pela luminância, ou limitar a paleta de etiquetas na configuração. Pode ser PR separada.

## Baixa

**B1. Aviso de compatibilidade sempre visível na etapa 2** (`formulario.tsx:758-764`): compactar junto do kit (E5).

**B2. Cartões sem nome de região** (`ui.tsx:82`): `aria-labelledby` com `useId` para o `h2` em `Cartao`. Navegação por landmarks.

**B3. Alertas amarelos sem ícone** (`page.tsx:330`, `:343`, `:349`): `bg-amber-50 text-amber-900` tem contraste bom (~9:1), mas a informação "atenção" só é dada por cor + texto; adicionar `AlertTriangle` do lucide, como o wizard já faz.

**B4. Ficha sem `loading.tsx`** (verificado: não há `loading.tsx`/`error.tsx` em `negocios/`; `git ls-tree`). A ficha faz várias consultas em sequência (`page.tsx:~60-196`, `await` em cadeia); sem esqueleto, a navegação parece travada. Propor `loading.tsx` com 3 cartões `animate-pulse bg-zinc-100` (usa tokens existentes). Confirmar o tempo real com Kara.

**B5. Emojis nos títulos de CardDocumento** (`formulario.tsx:677`, `:686`: "📄", "⚡"): inconsistente com o resto, que usa lucide. Usar `FileText` e `Zap`/`Paperclip` do lucide, `aria-hidden`. Some se o card sair da etapa 1 (E5).

**B6. Cores de borda de campos** (`border-zinc-200` sobre branco ~1,2:1): por 1.4.11 o limite do componente deveria ter 3:1; é decisão visual global (Evandro). Alternativa conservadora: manter e garantir rótulo visível sempre (já há). **Registrado, não recomendo mexer nesta entrega.**

**B7. Pílulas do wizard**: o número da etapa futura é `bg-zinc-300 text-white` (~1,5:1) e o texto `text-zinc-500` sobre `bg-zinc-100` (~4,3:1) (`formulario.tsx:75-85`). Já coberto na refação do indicador: `bg-zinc-200 text-zinc-700` no número e `text-zinc-600` no texto.

**B8. Sem rascunho do wizard** (`formulario.tsx`): atualizar a página perde tudo. Inferência (nenhum armazenamento local no código). Produto; só registro.

**B9. "Marcar como perdido" ao lado de "Marcar como ganho"** (`fechamento.tsx:96-107`): a confirmação de duas etapas mitiga; manter. Em lateral estreita os dois botões quebram em duas linhas; ok.

---

# Estados (resumo)

| Estado | Ficha | Wizard |
|---|---|---|
| Carregamento | Sem `loading.tsx` (B4); botões mostram "Salvando.../Gerando..." (ok) | "Salvando..."/"Enviando arquivos..." no botão final (ok); `aria-busy` ausente |
| Vazio | Tarefas: mensagem boa (`page.tsx:582`); Notas: sem estado vazio (lista vazia fica em branco, baixa); Arquivos: lista vazia sem texto (baixa) | Busca de contato: "Nenhum contato encontrado" (ok) |
| Erro | `Mensagem` com `role="status"` (M6); erro de envio de arquivo em `div` sem `role` (`enviar-anexo.tsx:75`; usar `role="alert"`) | Erro por etapa com foco no campo (bom); falta `aria-describedby` |
| Sucesso | "Salvo." em Dados e Kit; Nota salva sem retorno visível (M4) | Navega para a ficha com `?avisos=` (ok) |
| Arquivado/somente leitura | Ações de escrita escondidas (bom); com recolhíveis, garantir que o resumo continue legível | — |

---

# Perguntas para a Nora (2)

**Dúvida 1**
- Tarefa: Redistribuição da ficha do negócio (Qualificação SDR recolhida).
- Destinatário: Nora (para o Evandro decidir).
- Informação ou dúvida: Para o papel `sdr`, cuja tarefa principal é preencher a qualificação e usar "Enviar para vendas", a Qualificação também deve vir recolhida? Proposta de design: recolhida para todos, mas com o `Selo` de status e um botão "Enviar para vendas" visível no resumo quando estiver "Qualificado".
- Impacto: Se recolhida para SDR, ele ganha um toque a mais em todo atendimento; se aberta para SDR, o cartão volta a ser o mais alto da ficha dele.
- Ação necessária: Evandro escolher entre "recolhida para todos" e "aberta para `sdr`, recolhida para os demais".

**Dúvida 2**
- Tarefa: Dados do negócio e Kit personalizado (duplicidade de campos).
- Destinatário: Nora (para o Evandro decidir).
- Informação ou dúvida: "Valor da conta de energia" e "Consumo médio" existem em Dados do negócio (`edicao.tsx:105-118`) e voltam a ser digitados no editor do kit (`kit-personalizado.tsx:328-352`). São o mesmo dado (o kit usa os de Dados como padrão) ou são valores distintos (kit = base do cálculo; Dados = informação do cliente)?
- Impacto: Se for o mesmo dado, dá para remover dois campos do editor do kit e reduzir a edição; se forem distintos, o rótulo precisa diferenciar ("Consumo usado no cálculo").
- Ação necessária: Evandro confirmar a regra; design não decide fórmula nem fonte do dado.

---

# O que não pude verificar

- Qualquer medida real (alturas, quebras, overflow do indicador de etapas, largura efetiva da lateral): nada foi renderizado.
- Contrastes e alvos de toque calculados à mão, não medidos no navegador.
- Comportamento de `<details>` com `useActionState` após revalidação (esperado: mantém `open`); validar com Kara.
- Telas e componentes não lidos: `pagamento.tsx`, `handoff-aceite.tsx`, `feedback-handoff.tsx`, `registrar-arquivo.tsx`, `mover-etapa.tsx` (por inteiro), sidebar mobile.
- Depende do Evandro: dúvidas 1 e 2, e B6 (bordas de campo, decisão visual global).

# Nota operacional

Por engano, durante a leitura, um comando de redirecionamento criou o arquivo temporário `R:/tmp1.txt` (cópia de leitura de quatro componentes, sem dados sensíveis, fora do repositório). A tentativa de removê-lo foi bloqueada pela verificação de segurança; fica a cargo de quem puder apagá-lo. Nenhum arquivo do repositório foi alterado além deste relatório.

Estado: **revisão entregue**. O aceite funcional e visual é do Evandro.
