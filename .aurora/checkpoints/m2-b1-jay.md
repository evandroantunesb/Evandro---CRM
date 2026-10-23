# Checkpoint M2-B1 — Jay (Backend)

Objetivo: o cálculo usa o mesmo consumo que será persistido (numeric(10,2), half away from zero, seguro para decimais), para que refazer o cálculo dos dados salvos reproduza o gravado. Escopo só consumo; fórmulas de `calcular` intactas.
Branch: aurora/m2-b1-reprodutibilidade — SHA de base/commit pai: d960703a59afcfdb651882432b3d3721e9ebea03 (sem commit; edições locais).
Estado: pronto para integração (vitest não rodou: ver "Não executado").

## Comparação com #209 e wip (somente leitura)
- #209 (origin/fix/novo-negocio-fluxo-calculo): cria `consumo-estimado.ts` (`estimarConsumoPelaConta` arredonda a 2 casas com Math.round(x*100)/100, `consumoParaCriacao`); `negocios-gravacao.ts` (criar) passa o consumo resolvido (informado ou fatura ÷ tarifa EFETIVA) a `montarLinhaCalculo` e nunca usa a tarifa base para estimar. NÃO toca `calculo-servidor.ts`. Não resolve o arredondamento do consumo informado nem a divergência: o consumo informado segue sem arredondar até o banco.
- wip (origin/wip/consumo-estimado-persistencia, não mesclável): `resolverConsumo`/`colunasDeConsumo`/`consumoSalvoDoNegocio`, colunas negocios.consumo_estimado_kwh/tarifa_efetiva_kwh (migration 20261021100000, já na main), salvarKit também. Altera `calculo-servidor.ts` (8 linhas): remove o ramo `fatura/tarifa` (exige `consumoMedioKwh != null`, mensagem nova "...(com a tarifa efetiva estimada)") e usa `const consumoMedioKwh = entrada.consumoMedioKwh`.
- Main ainda diverge: `montarLinhaCalculo` deriva consumo = fatura ÷ tarifa (base) sem arredondar; sem `consumo-estimado.ts`.
- Conflitos prováveis: `calculo-servidor.ts` conflita com a wip (mesmas linhas de validação e de `consumoMedioKwh`; aqui o corpo foi movido para `calculo-reproduzivel.ts`). Resolução ao integrar: manter `problemaDaEntrada` + `linhaDeCalculo`; levar para `problemaDaEntrada`/`linhaDeCalculo` a regra da wip (consumo obrigatório, sem fatura/tarifa) — decisão de Nora; a normalização `consumoComoPersistido` continua valendo (em `resolverConsumo` o arredondamento da estimativa já é de 2 casas, mas com Math.round: ver achado 5). `negocios-gravacao.ts` não é tocado aqui.

## Arquivos
- NOVO src/lib/calculo-reproduzivel.ts (puro, sem server-only)
- EDITADO src/lib/calculo-servidor.ts (assinatura pública de `montarLinhaCalculo` e tipo `LinhaCalculo` mantidos; re-exporta o tipo)
- NOVO .aurora/checkpoints/m2-b1-jay.md
- Local, não versionado: .aurora/tmp/{antes-depois.ts,hooks.mjs,registrar.mjs}

## Contrato FINAL (Kara testa; nomes conforme sugerido, mais um extra)
- `consumoComoPersistido(kwh: number): number` — 2 casas, half away from zero, sobre a representação decimal mais curta do double (o texto que vai ao banco). Idempotente. NaN/±Infinity devolvidos sem mascarar. Notação científica (<1e-6) arredonda para 0; valores >=1e21 devolvidos. Negativos simétricos (-1.005 -> -1.01); nunca devolve -0. Não valida o limite de 10 dígitos.
- `linhaDeCalculo(empresaId: string, entrada: EntradaLinhaCalculo, parametros: ParametrosCalculo | null): {ok:true, linha} | {ok:false, mensagem}`. `entrada` = {kitNome, potenciaKwp, precoKit, tipoLigacao, consumoMedioKwh|null, valorFaturaMedio|null, tarifaKwh}. `parametros` = {produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_mono_kwh, _bi_kwh, _tri_kwh}; `null` => "Parâmetros da calculadora não configurados.". Ordem e mensagens de erro iguais às de hoje: (1) "Informe o consumo médio ou o valor médio da fatura." (2) "Informe ao menos um módulo com potência para calcular." (3) parâmetros ausentes. Consumo = `consumoComoPersistido(consumoMedioKwh ?? valorFaturaMedio / tarifaKwh)`, usado em `calcular` e gravado em `consumo_medio_kwh`. Demais colunas inalteradas (valor_fatura_medio e tarifa_kwh gravados como vêm).
- EXTRA: `problemaDaEntrada(entrada): string | null` (validações 1 e 2; usada pelo wrapper para não consultar parâmetros em entrada inválida).
- `entradaDaLinha(linha): EntradaCalculo` — recebe os campos gravados (kit_potencia_kwp, kit_preco, tipo_ligacao, consumo_medio_kwh, tarifa_kwh, produtividade_kwh_kwp_mes, percentual_fio_b, disponibilidade_kwh) e devolve a entrada de `calcular`.
- Tipos exportados: `LinhaCalculo` (agora definido em calculo-reproduzivel; re-exportado por calculo-servidor), `EntradaLinhaCalculo`, `ParametrosCalculo`, `ResultadoLinha`, `LinhaParaEntrada`.

## Antes / depois (script .aurora/tmp/antes-depois.ts; params: produtividade 120, fio B 0,6, disponibilidade mono 30; kit 5,5 kWp, R$ 20.000, mono, tarifa 0,90)
- Consumo informado 1200,555: ANTES calcular usava 1200.555; banco grava 1200.56. DEPOIS linha.consumo_medio_kwh = 1200.56 e é o usado. Resultados (conta_sem_solar 1080.5; conta_com 842.9; economia 237.6; payback 84.2) coincidiram nos dois lados neste caso (sem divergência visível nas saídas, mas o consumo gravado era diferente do usado).
- Fatura 1000 / 0,90: ANTES usava 1111.111111111111; banco grava 1111.11. DEPOIS usa e grava 1111.11; saídas iguais.
- Casos com divergência visível nas saídas (ANTES = gravado na linha; refeito = calcular com o consumo gravado):
  - tarifa 0,90, consumo 1500.005 (grava 1500.01): conta_sem_solar 1350 vs 1350.01; conta_com_solar 1112.4 vs 1112.41.
  - tarifa 0,90, consumo 800.125 (grava 800.13): conta_sem_solar 720.11 vs 720.12; conta_com 482.51 vs 482.52.
  - tarifa 0,95, fatura-derivada 1111.111111111111 (grava 1111.11): conta_sem_solar 1055.56 vs 1055.55; conta_com 804.76 vs 804.75.
  - DEPOIS: nos três, linha = refeito dos salvos (o script confirma igualdade para os dois casos principais via `entradaDaLinha`).
- Arredondamento: 1.005->1.01, 1.015->1.02, 2.675->2.68, 0.005->0.01, 123.456->123.46, -1.005->-1.01, 1e-7->0, idempotente, NaN/Infinity devolvidos.

## Achados fora do escopo (NÃO corrigidos)
1. tarifa_kwh numeric(8,4): `calcular` usa a tarifa com mais de 4 casas, o banco grava 4; refazer dos salvos diverge (ex.: 0,123456 -> 0,1235). Também afeta a conversão fatura ÷ tarifa (usa a tarifa não arredondada).
2. kit_preco numeric(12,2) e kit_potencia_kwp numeric(6,2): precoKit/potência com mais casas são arredondados ao gravar (potência já vem com 2 casas de `potenciaKitPersonalizadoKwp`; preço `d.valor` não é arredondado antes).
3. valor_fatura_medio numeric(12,2): gravado arredondado, mas o consumo é derivado do valor bruto; refazer da fatura salva (não do consumo salvo) pode divergir.
4. produtividade (6,2), percentual_fio_b (4,3), disponibilidade (6,2): vêm do próprio banco (já na escala); sem divergência.
5. `estimarConsumoPelaConta` (#209/wip) usa Math.round(x*100)/100 — pode errar em casos como 1.005 (artefato de ponto flutuante); candidato a usar `consumoComoPersistido`, a decidir pela Nora.
6. Colunas de saída (geracao, kwh_*, custo_fio_b, conta_*, economia, payback (6,1)): `calcular` arredonda com Math.round(x*fator)/fator, mesmo risco de artefato, e payback usa economia não arredondada. Não alterado.
7. negocios.consumo_medio_kwh também é numeric(10,2) (mesma escala, mesma regra); `negocios-gravacao.ts` grava o consumo informado bruto lá. Não alterado.

## Comandos e resultados reais
- `pnpm lint`: 0 erros, 3 warnings preexistentes (scripts/seed-metas-vendedores.mjs, tests/stack-supabase-local.test.ts).
- `pnpm exec eslint src/lib/calculo-reproduzivel.ts src/lib/calculo-servidor.ts`: limpo.
- `pnpm typecheck`: OK (na 1ª tentativa falhou por BigInt literal com target < ES2020; corrigido).
- `node --no-warnings --import ./.aurora/tmp/registrar.mjs .aurora/tmp/antes-depois.ts`: saída acima. (`pnpm exec tsx` não existe no projeto; usei node 22 com type-stripping e um hook de resolução local.)
- `pnpm exec vitest run tests/calculadora.test.ts`: NÃO executou os testes. Abortou no globalSetup: "NEXT_PUBLIC_SUPABASE_URL ausente" (trava fail-closed; sem .env.local/Supabase local neste worktree). Falha de ambiente, não do código. Não contornei a trava.

## Não executado
- vitest (todas as suítes, por falta de Supabase local); suítes *-db/rls; build; e2e.

## Bloqueios / próximo passo
- Sem bloqueio de código. Próximo: Nora repassa o contrato a Kara (tests/calculo-reproduzivel.test.ts) e decide a integração com a wip (conflito em calculo-servidor.ts) e os achados 1–7.
