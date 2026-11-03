# Economia: arredondamento das contas (regra B) — APROVADO pelo Evandro em 21/10/2026

Estado: **a aprovação cobre SOMENTE o arredondamento.** A fórmula da economia (conta com solar, Fio B, art. 655-I), os dados da distribuidora (Copel) e a cobrança antiga NÃO estão aprovados nem validados. Hoje o motor não produz números financeiros (estimativa sempre incompleta): ver `m2-p0-motor-estimativa.md`.

## Regra aprovada
`economiaMensal = arred2(arred2(contaSemSolar) − arred2(contaComSolar))`; `economiaMensal <= 0` => payback indisponível (`null`); com economia > 0, `paybackMeses = arred1(preço ÷ economiaMensal arredondada)`. `arred2` = 2 casas, meio para longe de zero (escala do banco). Os números exibidos sempre fecham: conta hoje − conta com sistema = economia.

## Onde está
| Onde | Arquivo | Situação |
| --- | --- | --- |
| Aritmética aprovada | `fecharEconomia` em `src/lib/calculadora.ts` | Pronta para o ramo `completa` do motor; NENHUM caminho de produção a chama hoje. |
| Motor `calcular` | `src/lib/calculadora.ts` | Sem fórmula: devolve estimativa incompleta. A cobrança antiga foi removida; o arredondamento não é "aplicado" a nenhum número em produção. |
| Módulo-hipótese do Fio B | `src/lib/fio-b-hipotese.ts` | Hipótese em teste, isolada (não ligada a tela, ação, proposta ou PDF); usa o mesmo arredondamento; `paybackDisponivel = economiaMensal > 0`. |
| Payback com preço novo | `paybackComPreco` (`src/lib/calculo-preco.ts`) | Sem mudança. Só roda sobre linha com economia gravada; com linha legada a ação de atualizar preço é recusada. |

Nota técnica: `arredondar` de `calculadora.ts` é `Math.round(x*10^n)/10^n` (meia-acima, com ruído binário em empates como 1,005); o módulo-hipótese usa arredondamento fiel ao decimal (`toPrecision(15)`). Em empate exato de centavo os dois podem diferir 0,01. Valores aqui nunca são negativos (com solar <= sem solar), então meia-acima = meio para longe de zero. Ao ligar o ramo `completa`, decidir qual das duas implementações fica.

## Efeito medido anteriormente (432 combinações, só da regra de arredondamento sobre a cobrança antiga)
Economia diferente da regra A em 5,6% dos casos (máx. R$ 0,01/mês); payback diferente em 4 casos (máx. 0,1 mês); caso-limite (contas exibidas iguais) dá economia 0 e payback indisponível em vez de economia 0,01 e payback absurdo. Medição histórica; não valida nenhum número de produção.

## Linhas já gravadas
Toda linha de `calculos_solares` existente foi gerada pela fórmula antiga (não validada) e é tratada como legada (ver `m2-p0-calculo-vigencia.md`). Não há migration nem reprocessamento.

## Testes (Kara edita; Jay não editou)
Os testes que fixavam economia/payback de `calcular` deixam de valer (o motor é incompleto); a aritmética aprovada é testável por `fecharEconomia`. Falhas reais: ver relatório da tarefa M2-B8.
