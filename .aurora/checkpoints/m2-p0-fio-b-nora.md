# Checkpoint de integração — M2 P0 (estimativa incompleta + hipótese Fio B), Nora, 2026-10-21

Estado: **em andamento. Nada commitado, nada enviado ao remoto.** Tudo existe só no notebook (R:).

## Autorização do Evandro (21/10)
Autorizado: trabalho local de Jay e Kara; Kevin só depois do contrato estável. NÃO autorizado: aplicar migration, mexer em produção, merge, fixar a fórmula no motor, liberar economia/payback não validados. Sem commit/push/PR até nova aprovação.

## Base
`origin/aurora/m2-integracao` (#213) = a81f4542302ff001d1fb5de77ed1994c9d4b1af1, sobre main d960703.

## Branches/worktrees ativos (sem push)
- `aurora/m2-p0-jay` · R:/wt-p0b-jay · Jay — pronto para integração, NÃO validado (sem node_modules).
  Arquivos: novos `src/lib/estimativa-financeira.ts`, `src/lib/fio-b-hipotese.ts` (hipótese isolada, ninguém a importa), `.aurora/propostas-sql/m2-p0-fio-b.sql` (rascunho, não aplicado), `.aurora/checkpoints/m2-p0-jay.md`; alterados `src/lib/calculo-reproduzivel.ts`, `calculo-servidor.ts`, `negocios-gravacao.ts` (só `salvarKitComCliente`).
- `aurora/m2-p0-kara` · R:/wt-p0b-kara · Kara — testes escritos, NÃO executados: `tests/estimativa-financeira.test.ts`, `tests/fio-b-hipotese.test.ts`, ajustes em `tests/calculo-reproduzivel.test.ts` e `tests/calculadora-persistencia-db.test.ts`, checkpoint `m2-p0-kara.md`. Ela foi retomada para alinhar os testes às assinaturas reais do Jay; conferir se terminou.
- Ordem de integração prevista: Jay → Kara, por patch, num worktree de integração; rodar typecheck/lint/testes puros numa cópia limpa.

## Investigação da Copel (item 4 do Evandro)
- Conclusão anterior "Copel ausente do dataset 2026" **foi INVÁLIDA**: o CSV baixado tinha 11,9 MB; o arquivo completo tem 697.528.904 bytes (665 MiB), `Last-Modified` 20/10/2026.
- Download completo reiniciado em `…/scratchpad/aneel/c2026.csv` com `curl -C -`; estava em ~233 MB. Pode ter sido interrompido ao fechar a sessão: refazer com retomada (`curl -C -`), conferir tamanho = 697528904, contar linhas e distribuidoras, procurar Copel por CNPJ 76535764000143 (campo NumCPFCNPJ), REH 3.592/2026, B1, Convencional, componente `TUSD_FioB`, unidade R$/MWh. Registrar sha256. Valor anterior citado pelo Evandro (~R$ 0,2145/kWh) NÃO está validado por mim.
- Colunas do CSV: DscResolucaoHomologatoria; SigNomeAgente; NumCPFCNPJ; DatInicioVigencia; DatFimVigencia; DscBaseTarifaria; DscSubGrupoTarifario; DscModalidadeTarifaria; DscClasseConsumidor; DscSubClasseConsumidor; DscDetalheConsumidor; DscPostoTarifario; DscUnidade; DscComponenteTarifario; VlrComponenteTarifario (decimal com vírgula).

## Regra do piso (REN 1.000, art. 655-I, texto consolidado lido)
Parcela de consumo = maior entre custo de disponibilidade e faturamento (energia não compensada a tarifa cheia + energia compensada valorada pelas tarifas TUSD/TE aplicáveis ao SCEE conforme GD I/II/III); energia compensada limitada de modo que esse faturamento seja >= custo de disponibilidade e ao consumo (§2º). Fórmula-hipótese aprovada só para testes isolados.

## Pendências legais/tributárias (não resolvidas)
Tratamento tributário (ICMS/PIS/COFINS) sobre a energia compensada/Fio B; outras componentes GD II; leitura do art. 27 da Lei 14.300 no texto oficial; confirmação do valor Copel; autoconsumo instantâneo (premissa zero_conservador).

## Próximo passo exato
1. Na outra máquina: `git fetch`; os worktrees acima NÃO existem lá — só existirão se Evandro autorizar commit+push das duas branches e deste checkpoint.
2. Concluir/validar o download da ANEEL e registrar evidência da Copel.
3. Integrar Jay+Kara, rodar typecheck/lint/vitest puros em cópia limpa.
4. Só depois, Kevin: fluxo recolhido e mensagem "Economia pendente de configuração da tarifa" (ficha, proposta, PDF, Obras — Obras ainda não foi inspecionada).
5. Relatório final ao Evandro (itens 1–6 do pedido dele).
