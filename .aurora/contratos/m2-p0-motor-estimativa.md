# Contrato — motor da estimativa financeira (M2 P0, tarefa M2-B8)

Estado: implementado, NÃO validado funcionalmente. Escopo congelado: sem migration, sem snapshot, sem reconstrução histórica. Regra ou dado pendente = estimativa incompleta, sem recorrer ao cálculo financeiro antigo. Dimensionamento e montagem do kit preservados.

## Motor (`src/lib/calculadora.ts`)
`calcular(entrada: EntradaCalculo): ResultadoCalculo`, união discriminada:
- `{ estado: "incompleta", pendencias: Pendencia[], potenciaKwp, geracaoEstimadaKwhMes }`: ÚNICO estado produzido hoje, para qualquer entrada.
- `{ estado: "completa", geracaoEstimadaKwhMes, kwhFaturado, kwhCompensado, custoFioB, contaSemSolar, contaComSolar, economiaMensal, paybackMeses }`: só tipo / ponto de extensão. A fórmula entra aqui depois da validação do Evandro.

A cobrança antiga (sem piso; Fio B = kWh compensado × tarifa cheia × percentual) foi REMOVIDA. Nenhuma chamada de produção chega a ela. `percentualFioB` e `disponibilidadeKwh` da entrada são opcionais e sem efeito; o percentual de `parametros_calculadora` não é o percentual legal.

`fecharEconomia(contaSemSolar, contaComSolar, precoKit)`: a aritmética de arredondamento aprovada, pronta para o ramo `completa`; não é chamada em produção.

Geração = potência × produtividade (2 casas) continua disponível no estado incompleto. `dimensionarSistema` / `sugerirQuantidadeModulos` e o salvamento do kit: inalterados.

## Porta (`src/lib/estimativa-financeira.ts`)
- `avaliarCompletude` (inalterada): lista as pendências dos dados.
- `avaliarEstimativa(entrada + potenciaKwp + produtividade)`: devolve SEMPRE incompleta, com `avaliarCompletude` + a pendência `formula_nao_validada` (sempre presente: "A regra de cálculo da economia ainda não foi validada.").
- Auxiliares: `pendenciasSemDados()`, `listaDePendencias`, `mensagemPropostaIncompleta(pendencias, extra?)`, `hojeIso`, `ENQUADRAMENTO_NAO_INFORMADO`.

## Pendências (códigos)
`enquadramento_ausente`, `enquadramento_nao_suportado`, `percentual_legal_indisponivel`, `distribuidora_ausente`, `tarifa_base_ausente`, `consumo_ausente`, `consumo_estimado_pela_tarifa_base`, `fio_b_ausente`, `fio_b_origem_ausente`, `fio_b_manual_sem_justificativa`, `fio_b_vigencia_ausente`, `fio_b_vigencia_fora`, `base_tributaria_divergente`, `formula_nao_validada`. Hoje nenhum dado de enquadramento, distribuidora/Fio B (com origem e vigência) nem base tributária existe no app: sempre incompleta.

## Consumidores
| Consumidor | Comportamento |
| --- | --- |
| `linhaDeCalculo` / `montarLinhaCalculo` | `{ ok:false, incompleta:true, mensagem, pendencias, potenciaKwp, geracaoEstimadaKwhMes }`: nenhuma linha nova em `calculos_solares`. Entrada inválida segue como erro comum (`incompleta` ausente). |
| `criarNegocioComCliente` | incompleta é informação: negócio e kit salvos, sem aviso "calculo"; retorno ganha `estimativa?: { estado:"incompleta", mensagem, pendencias }`. Erro real de montagem continua `avisos: ["calculo"]`. |
| `salvarKitComCliente` | Salva o kit sempre (com ou sem tarifa); a recusa "Informe a tarifa para recalcular..." deixou de existir; linha legada fica intocada; grava `negocios.consumo_medio_kwh` e `valor_conta_energia` (vazio = null); retorno `{ ok:true, mensagem, pendencias }`. |
| `atualizarPrecoCalculoComCliente` | Recusa com linha legada (ver `m2-p0-calculo-vigencia.md`). |
| `gerarLinkProposta` | Bloqueia: ver abaixo. |
| `gerarContratoComCliente` | Só os motivos que afetam o contrato; ignora `legado`. |

## Mensagens exatas
- Kit salvo: `Itens do kit salvos. Estimativa financeira incompleta: <pendências separadas por "; ">.` e, com linha legada: ` O cálculo anterior foi mantido, mas foi feito pela fórmula antiga (não validada) e não vale como resultado atual.`
- Proposta bloqueada: `A estimativa financeira está incompleta: [o último cálculo foi feito pela fórmula antiga, que não foi validada; ]<pendências separadas por "; ">. A proposta fica disponível quando os dados forem validados.`
- Proposta emitida (página pública; PDF = 409 com o mesmo texto; helper `src/lib/propostas/emissao-preservada.ts`): `Proposta emitida em DD/MM/AAAA. Os valores de economia desta proposta não estão disponíveis nesta versão do sistema. Fale com o seu vendedor.` Hoje `situacaoDaEmissao(...)` devolve sempre `{ disponivel:false }`: não há dados da emissão preservados. Nunca dizer "conjunto emitido".
- Preço bloqueado com linha legada: `O cálculo salvo foi feito pela fórmula antiga, que não foi validada: o preço não pode ser atualizado nele. Aguarde a validação da estimativa financeira.`

## Proposta/PDF
`DadosSistemaProposta` tem potência, consumo, geração, contas, economia, payback e `kitPreco` anuláveis (nulo = sem dado; nunca zero). Os renderers (`pdf.tsx`, `pdf-proposta.tsx`) precisam omitir o que for nulo. Página pública e PDF: preço, sistema e economia são lidos ao vivo, então ficam indisponíveis enquanto não houver dados da emissão.

## Aprovado x pendente
- Aprovado: só o arredondamento (`fecharEconomia`; ver `m2-p0-arredondamento-economia.md`).
- NÃO aprovado/validado: fórmula com solar, art. 655-I e §2º, Fio B da distribuidora (Copel/REH 3.592), TUSD Fio B, tributos e base tributária, percentual legal (60%), enquadramento, cobrança antiga.
- `fio-b-hipotese.ts` segue isolado (oráculo de teste, não ligado a nada).

## Limitações
- Nenhuma linha nova em `calculos_solares` (colunas financeiras NOT NULL; gravar incompleto exige migration). Toda linha existente é legada (fórmula antiga).
- Obras copiam o cálculo na venda (`obra_snapshot_comercial`): valores antigos já copiados ficam como estão (fora da rodada).
- Sem snapshot, propostas já enviadas ficam sem números para sempre (indisponibilidade).
- Nova proposta fica bloqueada até haver estimativa completa e validada.
- Contrato sem linha de cálculo: comportamento atual (`camposSemDado`) mantido.
