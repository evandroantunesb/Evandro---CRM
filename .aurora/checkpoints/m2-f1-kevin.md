# Checkpoint M2-F1 — Kevin (Frontend)

- Objetivo: campos de percentual (Fio B e comissão) em Configurações → Calculadora sem resíduo de ponto flutuante (0,57 → "57").
- Worktree: R:/wt-m2-f1 · Branch: aurora/m2-f1-percentual-ui · SHA de base / commit pai: d960703a59afcfdb651882432b3d3721e9ebea03 (sem commit).
- Arquivos concluídos:
  - src/lib/percentual-exibicao.ts (novo): `percentualParaCampo(fracao: number): string` (arredonda `fracao*100` a 6 casas, pt-BR, sem milhar; não finito devolve "").
  - src/app/(app)/configuracoes/calculadora/formularios.tsx: `percentual_fio_b` e `comissao_percentual` usam o helper.
- Pendentes: testes tests/percentual-exibicao.test.ts (Kara).
- Decisões: precisão, validação do servidor e fórmulas inalteradas; só apresentação.
- Comandos e resultados:
  - Script descartável em .aurora/tmp (node --experimental-strip-types): 0,57→"57"; 0,575→"57,5"; 0,29→"29"; 0→"0"; 1→"100"; 0,0005→"0,05"; 0,1234→"12,34"; 0,000001→"0,0001"; 0,999999→"99,9999"; lerNumeroBr(texto)/100 === valor em todos.
  - `pnpm typecheck`: passou, sem erros.
  - `eslint` nos 2 arquivos alterados: sem avisos.
- Não rodou/inconcluso: vitest e build não rodados. `pnpm lint` completo: excedeu 400 s, depois concluiu em segundo plano com saída vazia (o exit 0 observado é o do `tail`, então não é prova forte; os 2 arquivos alterados passaram no eslint direto).
- Bloqueios: nenhum.
- Próximo passo: Kara escreve e roda tests/percentual-exibicao.test.ts; Nora integra. Commit/push só com autorização do Evandro.
- Estado: pronto para integração.

## Nota da rodada M2-F2 (Kevin) — interface: estimativa incompleta, cálculo desatualizado, Fio B recolhido
- Worktree R:/wt-m2-p0-int · branch aurora/m2-p0-integracao · sem commit.
- Arquivos: negocios/[id]/page.tsx, kit-personalizado.tsx, contrato.tsx, proposta.tsx (irmão, necessário); negocios/novo/formulario.tsx; proposta/[token]/page.tsx e pdf/route.ts.
- Feito: prévia só com consumo em kWh (conta em R$ não vira consumo); aviso "Estimativa incompleta" com o que falta; economia zero = "Sem economia estimada neste cenário" e payback "indisponível"; cálculo desatualizado rotulado, histórico recolhido, ações bloqueadas; "Detalhes técnicos" (Fio B da empresa, só leitura, fechado); proposta pública sem potência/geração/economia quando desatualizada.
- Pendente (fora da minha lista): renderers do PDF (src/lib/pdf-proposta.tsx, src/lib/propostas/pdf.tsx, pdf-tipos.ts) tolerarem null. Até lá o pdf/route.ts responde 409 quando desatualizado e a UI esconde "Baixar PDF".
- Não ligados: fio-b-hipotese.ts e estimativa-financeira.ts.
- Resultados: typecheck ok; lint 0 erros (3 avisos preexistentes); vitest puro: só as 2 falhas CRLF conhecidas. Sem build/banco/e2e.

## Nota M2-F3 (Kevin) - d3 e mensagem ao salvar kit
- proposta/[token]/page.tsx: com calculo desatualizado o campo "Kit" (kit_nome) nao e mais exibido; fica so o texto de revisao. Vigente inalterado.
- negocios/[id]/kit-personalizado.tsx: apos salvar com sucesso e cálculo desatualizado, a ficha mostra role="status": "Itens do kit salvos. Para atualizar a economia e o payback, informe o consumo em kWh e salve de novo." Some ao clicar em Editar kit / recalcular. Sem mudar src/lib.
- Resultados: pnpm typecheck ok; eslint nos 2 arquivos e em src/tests/e2e/scripts (--quiet) sem erros. e2e/banco/build nao rodados. Estado: pronto para integracao.

## Nota M2-F4 (Kevin) - telas dos novos estados do motor (sem commit)
- Worktree R:/wt-m2-p0-int, branch aurora/m2-p0-integracao.
- Arquivos: negocios/[id]/{kit-personalizado,page,proposta,contrato}.tsx, negocios/novo/formulario.tsx, proposta/[token]/{page.tsx,pdf/route.ts}, src/lib/pdf-proposta.tsx, src/lib/propostas/pdf.tsx (campos anulaveis: omite linha, cartao ou bloco).
- Previa: potencia e geracao sempre; quadro role=status data-testid=estimativa-incompleta separa o que o vendedor informa (consumo kWh, tarifa) do que e da empresa (enquadramento, Fio B, base tributaria, formula). Ficha: calculo legado em details data-testid=calculo-anterior; preco e proposta bloqueados com a mensagem do servidor; contrato so pelos motivos do contrato. Pos-salvar: role=status data-testid=kit-salvo, some na proxima edicao. Detalhes tecnicos fechado, sem percentual.
- Proposta publica e PDF: situacaoDaEmissao; indisponivel (hoje sempre): pagina com data-testid=proposta-indisponivel, PDF 409, sem Baixar PDF.
- Resultados: pnpm typecheck so com erros em tests/ (calculadora.test.ts 19, calculo-preco.test.ts 2); eslint src sem erros. Nao rodado: vitest, e2e, banco, build.
