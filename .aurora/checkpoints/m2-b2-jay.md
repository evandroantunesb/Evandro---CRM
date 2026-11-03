# Checkpoint M2-B2 — Jay (Backend)

Objetivo: cálculo e dimensionamento usam o que será efetivamente persistido (escalas de calculos_solares), sem fórmula nova e sem tolerância.
Branch: aurora/m2-b2-persistido — SHA de base: 46d495f19b0a43583d97578a4a62ae425dab725e (sem commit; edições locais).
Estado: pronto para integração (testes de Kara a atualizar: 2 falhas esperadas por D1).

## Arquivos
- NOVO src/lib/consumo-persistido.ts (sem dependências)
- EDITADO src/lib/calculadora.ts (import + `dimensionarSistema` e seu comentário; fórmulas de `calcular` intactas)
- EDITADO src/lib/calculo-reproduzivel.ts
- NOVO .aurora/checkpoints/m2-b2-jay.md
- Local, não versionado: .aurora/tmp/{antes-depois.registro.ts, vitest.registro.config.mts}

## Contrato final
- `valorComoPersistido(valor, casas)`: half away from zero sobre o decimal mais curto do double; idempotente; NaN/±Infinity devolvidos; negativos simétricos; nunca -0; notação científica < 1e-6 vira 0; >= 1e21 devolvido. `casas` não inteiro ou < 0 lança RangeError (guarda nova, programador-erro).
- `consumoComoPersistido(kwh)` = `valorComoPersistido(kwh, 2)`. Ambos reexportados por calculo-reproduzivel.ts (contrato anterior válido).
- `dimensionarSistema(consumo, produtividade, moduloW)`: normaliza o consumo com `consumoComoPersistido` na entrada; assinatura e retorno iguais; null para entrada inválida, AGORA TAMBÉM quando o consumo normalizado vira 0 (ex.: 0,004 -> 0; antes dava 1 módulo). `sugerirQuantidadeModulos` herda.
- `linhaDeCalculo`: ordem de validação: (1) consumo/fatura ausentes, (2) potência bruta <= 0 [problemaDaEntrada], (3) potência normalizada (2 casas) <= 0 -> "Informe ao menos um módulo com potência para calcular.", (4) tarifa normalizada (4 casas) <= 0 -> "Informe uma tarifa maior que zero (o banco guarda 4 casas)." (mensagem nova, decisão de Nora), (5) parâmetros ausentes. Normaliza potência (6,2), tarifa (8,4), preço (12,2), fatura (12,2); usa e grava os normalizados. Consumo = `consumoComoPersistido(consumoInformado ?? faturaPersistida / tarifaPersistida)`. valorFaturaMedio nulo continua nulo. `payback_meses` decide por preço normalizado > 0.
- `problemaDaEntrada` inalterada (mesma mensagem, agora constante).

## Antes / depois (produtividade 120, módulo 620 W; kit 5,5 kWp, R$ 20.000, mono, fio B 0,6, disp. 30)
(a) módulos:
| consumo | antes | depois |
| 1190,396 | 16 | 16 |
| 1190,40 | 16 | 16 |
| 1190,404 | 17 | 16 |
| 1190,405 | 17 | 17 |
| 1190,41 | 17 | 17 |
(b) consumo 800 informado:
- tarifa 0,123456: ANTES usada 0,123456, gravada 0,1235, conta_sem 98,76 vs refeito 98,8, conta_com 66,17 vs 66,2, reproduz=false. DEPOIS usada=gravada 0,1235, 98,8/98,8, 66,2/66,2, reproduz=true.
- tarifa 0,95231: ANTES usada 0,95231, gravada 0,9523, sem 761,85 vs 761,84, com 510,44 vs 510,43, reproduz=false. DEPOIS usada=gravada 0,9523, 761,84/761,84, 510,43/510,43, reproduz=true.
(c) fatura 1000, tarifa 0,95231: ANTES consumo 1050,08 (1000/0,95231), tarifa gravada 0,95231 (banco 0,9523); DEPOIS consumo 1050,09 (1000/0,9523), tarifa 0,9523.
(Compara só conta_sem, conta_com e economia no script; a reprodução completa de todas as colunas fica para o teste de Kara.)

## Testes (Kara; não editei tests/)
Falham por D1, em tests/calculo-reproduzivel.test.ts (bloco "ACHADO A1"):
1. "1190,404 digitado pede 17 módulos, o gravado (1190,40) pede 16: DIVERGÊNCIA caracterizada" — espera modulos(1190,404)=17; agora 16 (dimensionamento normaliza).
2. "a divergência só ocorre em (limite, limite + 0,005)... varredura 1..40 módulos" — espera 40 divergências; agora 0 (não há mais divergência).
Todos os demais passam. Sugestão para Kara: inverter para "iguais" e cobrir 1190,405 -> 17, tarifa 0,123456 -> erro/normaliza, tarifa 0,00004 -> erro, potência 0,004 -> erro, fatura persistida, valorComoPersistido (casas 0/4/2, RangeError).

## Comandos e resultados reais
- vitest (config .aurora/tmp/vitest.registro.config.mts, antes e depois): saída acima.
- `pnpm typecheck`: OK.
- `pnpm lint`: 0 erros, 3 warnings preexistentes (seed-metas-vendedores.mjs, stack-supabase-local.test.ts).
- `pnpm exec vitest run --config .aurora/tmp/vitest.puro.config.mts tests/calculadora.test.ts tests/calculo-reproduzivel.test.ts tests/percentual-exibicao.test.ts tests/numeros-br.test.ts`: 4 arquivos, 127 testes: 125 passam, 2 falham (as de D1 acima).
- Um comando com pipe para grep foi barrado pelas permissões; reexecutei sem pipe.

## Não executado
Suítes de banco/rls, build, e2e (por instrução).

## Ajuste pós-revisão (Nora)
Só em calculo-reproduzivel.ts. Ordem final em `linhaDeCalculo`: (1) problemaDaEntrada; (2) potência persistida > 0; (3) tarifa persistida > 0; (4) preço persistido >= 0 (`!(preco >= 0)`, cobre NaN); (5) consumo persistido finito e > 0 (informado, ou fatura persistida ÷ tarifa persistida); (6) parâmetros nulos -> "Parâmetros da calculadora não configurados."; (7) cálculo. O consumo passou a ser calculado antes da checagem de parâmetros. Fórmulas inalteradas.
Mensagens novas:
- "Informe um preço do kit válido (maior ou igual a zero)."
- "Informe um consumo maior que zero (o banco guarda 2 casas)."
Isto resolve os itens "não tratados" de consumo derivado <= 0 e preço negativo abaixo.
Verificação do ajuste: ver relatório (typecheck, lint, vitest puro).

## Correções pós-Kara (2 achados)
1. consumo-persistido.ts: o atalho `fracao.length <= casas` agora devolve `valor === 0 ? 0 : valor` (nunca -0; casas 0 e 2 verificadas).
2. calculadora.ts (só a guarda de `dimensionarSistema`): acrescentado `Number.isFinite` para consumo normalizado, produtividade e potência do módulo; entrada não finita devolve null.
Verificação: typecheck OK; lint 0 erros (3 warnings preexistentes); vitest puro (calculadora + numeros-br) 66 passam; script descartável .aurora/tmp/verif-correcoes.test.ts passa (1190,404 -> 16 módulos; 1,005 -> 1,01).

## Observações / próximos passos
- Para depois (decisão de Nora): quando #209/wip forem unidas, `estimarConsumoPelaConta` e a gravação de `negocios.consumo_medio_kwh` devem usar `consumoComoPersistido`.
- Não tratado (fora do escopo): `linhaDeCalculo` não valida consumo derivado > 0 (o banco exige consumo_medio_kwh > 0; fatura muito pequena / tarifa grande pode dar 0 e o banco rejeitaria); preço negativo normalizado não é checado (banco exige >= 0); produtividade/fio B/disponibilidade já vêm do banco.
- Próximo: Kara atualiza os 2 testes e cobre os novos casos; Nora integra e roda banco/build.
