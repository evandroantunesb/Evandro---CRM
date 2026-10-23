# Contrato final — conta sem solar x com solar (M2 P0, tarefa M2-B3)

Estado: **HIPÓTESE, NÃO validada oficialmente.** Escopo: B1 convencional, GD II, 2026, sem banco de créditos. Módulo isolado `src/lib/fio-b-hipotese.ts` (`calcularFioBHipotese`, `METODO_FIO_B_HIPOTESE = "fio_b_hipotese_gd2_2026_v0"`); nenhuma tela, ação, proposta ou PDF o chama. Resultado é **estimativa, não a fatura**.

## Entradas (kWh/mês; R$/kWh)
| Campo | Símbolo | Regra |
| --- | --- | --- |
| consumoTotalKwh | | finito, >= 0 |
| geracaoTotalKwh | | finito, >= 0 |
| autoconsumoInstantaneoKwh | | opcional (padrão 0, premissa conservadora); >= 0, <= consumo e <= geração |
| tarifaCheiaRsKwh | T | R$/kWh, T > N |
| custoDisponibilidadeKwh | D | kWh (piso equivalente), >= 0 |
| custoEnergiaCompensadaRsKwh | N | R$/kWh = TUSD Fio B × 0,60, **já resolvido pelo chamador**, na MESMA base tributária de T; >= 0 |

Derivados: C = consumo total − autoconsumo (consumo da rede, kWh); E = geração − autoconsumo (energia disponível para compensação, kWh).

## As duas expressões
| Lado | Expressão |
| --- | --- |
| SEM solar | `max(consumo total, D) × T` |
| COM solar | `max(D × T, (C − K) × T + K × N)` |

Regra de K (energia compensada): `K = min(E, C, max(0, ((C − D) × T) / (T − N)))`.

Correção 22/10 (revisão): sem solar não existe autoconsumo instantâneo — ele só aparece depois da instalação — então a conta sem solar usa o consumo TOTAL, não C; não depende de autoconsumo nem de geração. A versão anterior (`max(C, D) × T`) subestimava a conta sem solar e a economia sempre que havia autoconsumo informado.

Por que diferem: sem solar não há energia compensada; o faturamento é consumo total × T e o piso (D × T) é comparado a ele, o que equivale a `max(consumo total, D) × T`. Com solar, o faturamento comparado ao piso já inclui a parcela da energia compensada (`K × N`); o piso incide sobre o faturamento TOTAL e o Fio B nunca é somado por fora de uma parcela já elevada ao piso. K é limitado a E, a C e ao valor que mantém o faturamento >= D × T (REN 1.000/2021, art. 655-I e §2º, conforme registrado no checkpoint de Nora). Reaplicar a expressão sem solar ao lado com solar seria incorreto (duplicaria o piso).

Parcelas da fatura representadas: apenas **energia (TE + TUSD)** ao piso/tarifa cheia T. **Fora**: iluminação pública, bandeiras tarifárias, multas/juros, e tributos (ICMS/PIS/COFINS) que T não inclua.

## Saída (ok)
`metodo`, `premissas {autoconsumoInstantaneo: "zero_conservador"|"informado", bancoDeCreditos: false}`, `geracaoTotalKwh`, `autoconsumoInstantaneoKwh`, `energiaInjetadaKwh`, `energiaDisponivelCompensacaoKwh` (E), `energiaCompensadaKwh` (K), `energiaDisponivelNaoCompensadaKwh` (E − K; não é compensada nem descartada, sem banco), `consumoDaRedeKwh` (C), `contaSemSolar`, `contaComSolar`, `economiaMensal`, **`paybackDisponivel`** (novo: true somente se `economiaMensal > 0`).
Erro: `{ok:false, motivo}` para entrada não finita, negativa, T <= N, autoconsumo > consumo ou > geração, ou resultado não finito.

Payback: **nenhuma fórmula de payback existe aqui.** `paybackDisponivel = false` significa "payback indisponível" (ex.: consumo total <= D, contas iguais, economia 0). Nunca exibir payback inventado.

## Arredondamento
Só no resultado final; 2 casas, meio para longe de zero (como o numeric do Postgres; `toPrecision(15)` remove ruído binário). Intermediários sem arredondar. `economiaMensal` = sem arredondado − com arredondado (os números exibidos fecham), conforme `.aurora/contratos/m2-p0-arredondamento-economia.md`.

## Casos de borda
| Caso | Sem solar | K | Com solar | Economia |
| --- | --- | --- | --- | --- |
| C < D | max(consumo total, D) × T | 0 (max(0, negativo)) | D × T | 0 sem autoconsumo -> indisponível; com autoconsumo e consumo total > D, positiva |
| C = D | max(consumo total, D) × T | 0 | D × T | idem |
| C > D | consumo total × T | min(E, C, (C−D)T/(T−N)) | >= D × T | >= 0; > 0 se K > 0 e N < T |
| geração 0 (E = 0; autoconsumo 0) | max(C,D) × T | 0 | max(D × T, C × T) = max(C,D) × T | 0 -> indisponível |
| E < K-limite (geração baixa) | | K = E (toda a energia disponível compensada) | piso só aparece se C − E ainda < D | positiva |
| E >= K-limite | | K = limite (faturamento = D × T) ou C | = D × T quando limitado pelo piso | positiva |
Com solar nunca fica abaixo de D × T nem acima de max(C, D) × T; sem solar = max(consumo total, D) × T >= max(C, D) × T; logo com solar <= sem solar sempre (N < T) e economia nunca é negativa.

## Premissas
Autoconsumo instantâneo 0 se não informado (conservador); sem banco de créditos (E − K não é transportada); GD II; Fio B percentual legal e N resolvidos fora (`percentualLegalFioB` não é chamado aqui).

## NÃO validado
- Valores da Copel (REH 3.592) e a base "Tarifa de Aplicação" (Evandro confere contra o anexo).
- Tratamento tributário (ICMS/PIS/COFINS) sobre Fio B/energia compensada; aqui N e T devem vir na mesma base, sem fator tributário no módulo.
- Leitura do art. 655-I/§2º no texto oficial por Jay: baseada na regra registrada no checkpoint de Nora, sem nova consulta ao texto (sem acesso à fonte nesta sessão).
- N resolvido pelo chamador (este módulo não o calcula nem valida contra a tarifa).

## O que o Kevin pode consumir
Nada deste módulo ainda: segue isolado e não validado. Quando o fluxo de estimativa for ligado, a UI deve tratar `incompleta` (ver `src/lib/estimativa-financeira.ts`) com a mensagem de pendência, **sem inventar economia nem payback**; se um dia consumir este resultado, exibir economia/payback somente quando `paybackDisponivel` for true e com o rótulo de estimativa não validada.
