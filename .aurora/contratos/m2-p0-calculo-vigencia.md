# Contrato — vigência do cálculo solar salvo (M2 P0, tarefas M2-B4 a M2-B8)

Estado: implementado (M2-B8), sem migration. Compara SOMENTE entradas com fonte independente. O que não tem fonte fica registrado em `naoVerificavel`, nunca vira "atual", e o cálculo nunca é comparado consigo mesmo.

## API (`src/lib/calculo-vigencia.ts`, puro exceto `carregarVigencia`)
`avaliarVigencia(calculo, atual): { vigente, motivos, naoVerificavel }`; `vigente` = lista de motivos vazia (só reflete o verificável).

Motivos (ordem de relevância):
| Motivo | Quando |
| --- | --- |
| `legado` | Linha gerada pela fórmula antiga (não validada). Sem coluna de método, TODA linha existente: `calculoEhLegado` devolve `true`. Logo hoje `vigente` é sempre `false`. Some quando a fórmula validada existir e a linha tiver método. |
| `kit` | Potência (2 casas) ou composição/nome do kit diferente (kit personalizado: itens atuais; catálogo: `kits_solares`). |
| `consumo` | `consumo_medio_kwh` ou `valor_fatura_medio` diferente de `negocios.consumo_medio_kwh` / `valor_conta_energia`. |
| `parametros` | Produtividade da empresa diferente (afeta a geração, logo o contrato). |
| `parametros_financeiros` | Percentual do Fio B ou disponibilidade (pela ligação) diferentes (só afetam a parte financeira). |
| `preco` | `kit_preco` diferente de `negocios.valor`. |
| `nao_comprovado` | Dado necessário ausente (parâmetros inexistentes, kit de catálogo não lido, negócio sem consumo etc.). |

`naoVerificavel` (sempre): `["tarifa", "tipo_ligacao", "fio_b", "enquadramento"]`. Sem fonte atual independente (tarifa e ligação só existem dentro do cálculo; não há tabela de Fio B nem campo de enquadramento). A UI deve dizer "conferido: kit, preço, consumo, parâmetros; não conferido: tarifa, ligação, Fio B e enquadramento", nunca o rótulo "atualizado" sem ressalva.

## Guardas por ação (`motivosDaAcao(motivos, acao)`)
| Ação | Motivos que bloqueiam |
| --- | --- |
| `proposta` | todos (inclui `legado`); sem linha: estimativa incompleta. Mensagem: ver `m2-p0-motor-estimativa.md`. |
| `preco` | todos exceto `preco`. Com `legado`: `MENSAGEM_PRECO_CALCULO_LEGADO`. |
| `contrato` | só o que afeta o contrato: `kit`, `consumo`, `parametros` (produtividade), `preco` (guarda própria de preço), `nao_comprovado`. Ignora `legado` e `parametros_financeiros`. Nenhum campo do contrato depende da fórmula financeira. |

`mensagemDeRecusa(motivos, acao)`: principal = primeiro da ordem acima. `kit` devolve a constante `MENSAGEM_*_CALCULO_DESATUALIZADO` da ação; `legado` devolve a mensagem de proposta/preço/contrato descrita acima.

## Compatibilidade (chamadores de `src/app`)
`calculoDesatualizado(calculo, { componentes, ... })` mantém a assinatura leniente (recorte de colunas e só `componentes`): para linha legada devolve `true` sem comparar; dado faltante nunca vale como vigente. Chamadores atuais (ficha `page.tsx`, `proposta/[token]/page.tsx`, `pdf/route.ts`) compilam sem troca, mas passam a ver SEMPRE `true` (cálculo "desatualizado/legado"). Para rótulo mais preciso, o Kevin pode usar `carregarVigencia`/`avaliarVigencia` e ler `motivos` e `naoVerificavel`.

## Constantes de texto
`MENSAGEM_CALCULO_DESATUALIZADO`, `MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO`, `MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO`, `MENSAGEM_PRECO_CALCULO_DESATUALIZADO` (motivo `kit`, inalteradas) e a nova `MENSAGEM_PRECO_CALCULO_LEGADO`.

## Gravação
`salvarKitComCliente` grava `negocios.consumo_medio_kwh` e `valor_conta_energia` com os valores enviados (vazio = null): é a fonte atual da comparação de consumo. Negócios antigos com esses campos nulos aparecem como `nao_comprovado` (e bloqueiam o contrato) até o kit ser salvo de novo.

## Limitações
- Troca de módulos que mantém a mesma potência E o mesmo nome do kit não é detectada por potência; o nome do kit personalizado inclui a descrição do primeiro módulo.
- Obras (`obra_snapshot_comercial`) não passam por esta vigência.
- Leitura com falha nunca vale como vigente.
