# Checkpoint de integração — M2 P0 (estimativa incompleta + hipótese Fio B), Nora, 2026-10-21

Estado: **em andamento.** Branches de Jay e Kara enviadas ao remoto em 21/10 com autorização do Evandro; sem PR, sem merge, sem migration aplicada.

## Autorização do Evandro (21/10)
Autorizado: trabalho local de Jay e Kara; Kevin só depois do contrato estável. NÃO autorizado: aplicar migration, mexer em produção, merge, fixar a fórmula no motor, liberar economia/payback não validados. Sem commit/push/PR até nova aprovação.

## Base
`origin/aurora/m2-integracao` (#213) = a81f4542302ff001d1fb5de77ed1994c9d4b1af1, sobre main d960703.

## Branches/worktrees ativos (sem push)
- `aurora/m2-p0-jay` · R:/wt-p0b-jay · Jay — pronto para integração, NÃO validado (sem node_modules).
  Arquivos: novos `src/lib/estimativa-financeira.ts`, `src/lib/fio-b-hipotese.ts` (hipótese isolada, ninguém a importa), `.aurora/propostas-sql/m2-p0-fio-b.sql` (rascunho, não aplicado), `.aurora/checkpoints/m2-p0-jay.md`; alterados `src/lib/calculo-reproduzivel.ts`, `calculo-servidor.ts`, `negocios-gravacao.ts` (só `salvarKitComCliente`).
- `aurora/m2-p0-kara` · R:/wt-p0b-kara · Kara — testes escritos, NÃO executados: `tests/estimativa-financeira.test.ts`, `tests/fio-b-hipotese.test.ts`, ajustes em `tests/calculo-reproduzivel.test.ts` e `tests/calculadora-persistencia-db.test.ts`, checkpoint `m2-p0-kara.md`. Ela foi retomada para alinhar os testes às assinaturas reais do Jay; conferir se terminou.
- Ordem de integração prevista: Jay → Kara, por patch, num worktree de integração; rodar typecheck/lint/testes puros numa cópia limpa.

## Investigação da Copel (item 4 do Evandro) — CONCLUÍDA em 21/10/2026
**Correção:** a conclusão anterior "Copel ausente do dataset 2026" estava ERRADA (CSV truncado de 11,9 MB + CNPJ da holding 76535764000143). O levantamento anterior do Raion procede.

Evidência reproduzível:
- Fonte: dados abertos ANEEL, "Componentes Tarifárias" 2026, recurso `componentes-tarifarias-2026.csv` (https://dadosabertos.aneel.gov.br/dataset/613e6b74-1a4b-4c48-a231-096815e96bd5/resource/e8717aa8-2521-453f-bf16-fbb9a16eea39/download/componentes-tarifarias-2026.csv), Last-Modified 20/10/2026.
- Integridade: 697.528.904 bytes (= Content-Length do servidor; download completo), SHA-256 `16fcbba40c72572cb5b737cc2055f50c12f1b33324ceb38e986c1e0a033a1681`, 2.506.618 linhas, 84 agentes distintos.
- Identificação: `COPEL-DIS`, CNPJ `04368898000106` (59.040 linhas). REH 3.592, de 23/06/2026; vigência 2026-06-24 a 2027-06-23.
- Linha-alvo: Subgrupo B1, modalidade Convencional, classe Residencial, subclasse "Residencial", detalhe "Não se aplica", unidade R$/MWh, base "Tarifa de Aplicação": TE 310,85; TUSD 457,17; **TUSD_FioB 214,53560037400001 (= R$ 0,2145/kWh)**. TE+TUSD = 768,02 R$/MWh. Outras bases no mesmo arquivo: "Base Econômica" (TUSD_FioB 215,340116784) e "CVA" (TUSD_FioB 0); a de aplicação é a da tarifa vigente — Evandro deve confirmar.
- Reprodução: filtrar `grep '04368898000106'` + `"B1"` + `"Convencional"` + `"Residencial";"Não se aplica"` + componente `TUSD_FioB|TE|TUSD`. Cada linha aparece 2x no CSV (causa não investigada; um importador deve deduplicar).
- Tratamento tributário: valores da ANEEL são SEM tributos. Tributos sobre a energia compensada/Fio B seguem pendência legal.
- **Status: NÃO marcado como oficialmente validado** até o Evandro conferir a base "Tarifa de Aplicação" contra o anexo da REH 3.592. Nenhum valor foi inserido no sistema nem no banco.
- Colunas do CSV: DscResolucaoHomologatoria; SigNomeAgente; NumCPFCNPJ; DatInicioVigencia; DatFimVigencia; DscBaseTarifaria; DscSubGrupoTarifario; DscModalidadeTarifaria; DscClasseConsumidor; DscSubClasseConsumidor; DscDetalheConsumidor; DscPostoTarifario; DscUnidade; DscComponenteTarifario; VlrComponenteTarifario (decimal com vírgula).

## Regra do piso (REN 1.000, art. 655-I, texto consolidado lido)
Parcela de consumo = maior entre custo de disponibilidade e faturamento (energia não compensada a tarifa cheia + energia compensada valorada pelas tarifas TUSD/TE aplicáveis ao SCEE conforme GD I/II/III); energia compensada limitada de modo que esse faturamento seja >= custo de disponibilidade e ao consumo (§2º). Fórmula-hipótese aprovada só para testes isolados.

## Pendências legais/tributárias (não resolvidas)
Tratamento tributário (ICMS/PIS/COFINS) sobre a energia compensada/Fio B; outras componentes GD II; leitura do art. 27 da Lei 14.300 no texto oficial; autoconsumo instantâneo (premissa zero_conservador).

## Próximo passo exato
1. Na outra máquina: `git fetch origin`; crie worktrees a partir de `origin/aurora/m2-p0-jay` e `origin/aurora/m2-p0-kara` (ambas enviadas em 21/10, base a81f454); leia os checkpoints dos agentes.
2. Evandro confirma a base "Tarifa de Aplicação" da Copel contra o anexo da REH 3.592 (evidência acima); só então o valor pode ser tratado como validado.
3. Integrar Jay+Kara, rodar typecheck/lint/vitest puros em cópia limpa.
4. Só depois, Kevin: fluxo recolhido e mensagem "Economia pendente de configuração da tarifa" (ficha, proposta, PDF, Obras — Obras ainda não foi inspecionada).
5. Relatório final ao Evandro (itens 1–6 do pedido dele).
