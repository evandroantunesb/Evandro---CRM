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

## Integração local (Nora, 2026-10-21, desktop) — SEM commit/push
Worktree R:/wt-m2-p0-int, branch aurora/m2-p0-integracao = origin/aurora/m2-p0-jay (2780a53) + cherry-pick -n de 27b4ed3 (Kara) + 1 correção.
- typecheck e lint: passaram (node_modules por junção de R:/wt-m2-int).
- Testes puros (7 arquivos): 370 passaram, 5 falharam antes da correção; 1 falha restante.
- Correção (defeito no código do Jay, contra o próprio comentário): `percentualLegalFioB` só olhava gd e ano; agora exige classe, modalidade, gd e ano do RECORTE_P0 (B2, Branca, classe/modalidade nulas => null). Resolveu 4 falhas.
- FALHA RESTANTE (decisão de domínio, NÃO resolvida): tests/fio-b-hipotese.test.ts, varredura — com consumo C=0 (ou C<custo de disponibilidade) a economia sai negativa (-30 com T=1), porque `contaSemSolar = C*T` ignora o custo de disponibilidade e `contaComSolar` aplica o piso D*T. Decidir: a conta sem solar também tem piso max(C,D)*T? (Evandro/REN 1.000 art. 655-I) ou o teste deve aceitar economia < 0.
- NÃO rodado: suíte -db (calculadora-persistencia-db, exige Supabase local), suíte completa, build.

## Rodada M2-B3/Q3/Q4 (Nora, 21/10, desktop) — conta sem solar com piso — SEM commit/push/PR
Decisão do Evandro: sem solar = max(C,D)×T; com solar mantida max(D×T,(C−K)×T+K×N) (piso sobre o faturamento total, K×N dentro dele; sem Fio B por fora). Economia calculada sobre as contas arredondadas; contas iguais => economia 0 e `paybackDisponivel=false`. Contrato final: `.aurora/contratos/m2-p0-conta-solar.md`. Copel continua PENDENTE de validação oficial; testes usam valores fictícios.
Mudanças: Jay — `fio-b-hipotese.ts` (+ contrato); Nora — `percentualLegalFioB` exige o recorte inteiro e economia sobre contas arredondadas; Kara — `fio-b-hipotese.test.ts` (80 testes, mutação provou sensibilidade) e `negocios-gravacao-db.test.ts` (teste antigo agora informa 315,79 kWh; teste novo da estimativa incompleta com/sem cálculo prévio).
Validação (versão integrada, worktree R:/wt-m2-p0-int, base 2780a53 + locais, banco descartável aurora-m2-q1): typecheck ok; lint 0 erros/3 warnings preexistentes; puros 397/397; suíte completa 1896/1898 (2 falhas = baseline CRLF Windows de negocios-gravacao.test.ts, preexistente); build ok (node_modules real; uma junção causou falha de Turbopack, não do código).
NÃO rodado: e2e/visual. Kevin ainda não entrou. Aguarda: Evandro confirmar Copel "Tarifa de Aplicação" vs REH 3.592; autorização de commit/push.

## Incidente de Auth na suíte completa (21/10, 21:21) — falha TRANSITÓRIA, causa NÃO comprovada
Suíte completa (validação interrompida, versão = cópia LF R:/wt-m2-p0-lf): 4 arquivos falharam. 2 testes = baseline CRLF (passam em LF). 3 suítes de banco caíram no setup (blindagem-comercial-db, obras-escrita-db "Obras 3b-3", travas-kit-sdr-db; 97 testes pulados) com `AuthRetryableFetchError: Database error creating new user / querying schema`; log do container supabase_auth_aurora-m2-q1 no mesmo minuto: `couldn't start a new transaction: context canceled` (500, >1 s). Reexecução isolada das 3 na mesma versão: 97/97 passaram (.aurora/logs/crlf/3-suites-reexec-lf.log). Hipótese (não comprovada): saturação do banco descartável sob carga paralela. Na validação final: execuções pesadas sem concorrência; se necessário, suítes de banco com paralelismo reduzido (comando documentado), sem excluir testes.

## Diretriz de fechamento (Evandro, 21/10 noite) — escopo congelado
Motor real: regra ou dado pendente => estimativa incompleta, sem recorrer ao cálculo financeiro antigo; dimensionamento e kit preservados. Propostas: "conjunto emitido" só com dados preservados; sem snapshot/migration/reconstrução nesta rodada (desenho separado). Vigência: comparar entradas que determinam o resultado; sem fonte independente (tarifa, ligação) => registrar impossibilidade. Sem refatorações.

## Diagnóstico M2-B7 (Jay) e decisões de Nora para a implementação (21/10 noite) — dentro das diretrizes do Evandro
Diagnóstico completo: .aurora/contratos/m2-p0-diagnostico-b7.md. Motor real = `calcular` (calculadora.ts:42), cobrança antiga (sem piso; Fio B = compensado × tarifa cheia × percentual). Nenhum dado exigido pela estimativa nova existe no app (enquadramento, Fio B da distribuidora com origem/vigência, base tributária) => toda estimativa é incompleta hoje. calculos_solares tem colunas financeiras NOT NULL => incompleto não grava linha (sem migration). Propostas não preservam nada do cálculo; PDF gerado a cada acesso; só contrato fora de rascunho é preservado.
Decisões (aplicação direta das diretrizes; nenhuma decisão nova de produto):
1. Enquadramento: sem campo => pendência (não assumir premissa fixa).
2. Estado incompleto: nada financeiro (nem conta sem solar isolada); mostra geração/dimensionamento/kit e pendências.
3. Propostas já emitidas: dados da emissão não preservados => página pública informa indisponibilidade (sem números de sistema, economia ou preço lidos ao vivo); link válido; PDF 409 com a mesma mensagem.
4. Nova proposta: exige conjunto coerente e vigente => bloqueada enquanto a estimativa for incompleta ou o cálculo for legado (consequência, registrada como limitação).
5. Migrations (colunas anuláveis/estado/método; snapshot propostas_emissoes): só desenho, fora desta rodada.
6. Validação de dados/regra (Copel, TUSD Fio B, tributos, art. 655-I, 60%): Evandro; segue pendente.
7. Vigência sem fonte independente (tarifa, tipo de ligação, Fio B, enquadramento): `naoVerificavel` explícito, registrado; não comparar o cálculo consigo mesmo; não rotular como "atual".
8. Linhas legadas de calculos_solares: histórico "cálculo anterior (fórmula antiga, não validada)", nunca como resultado atual; sem reprocessar. Obras (cópia na venda): fora da rodada, registrado.
9. Contrato: inalterado no que não depende da fórmula (potência/consumo/geração); guarda de vigência só pelos motivos que afetam o contrato; sem linha de cálculo, comportamento atual (camposSemDado) mantido; limitação registrada.

## Ajuste de Nora após M2-F4 (21/10 noite)
Beco sem saída apontado pelo Kevin: com cálculo legado, "Atualizar preço" é recusado, mas o contrato exigia preço do cálculo = valor do negócio. Como o legado não aparece como atual e a proposta não mostra preço, a guarda de preço deixa de valer para cálculo legado: src/lib/contratos-geracao.ts (pula a guarda e o motivo "preco" quando legado; o contrato usa o valor atual do negócio) e src/app/(app)/negocios/[id]/page.tsx (precoDesatualizado só para cálculo não legado). typecheck fora de tests/: 0 erros; eslint ok.

## Ajuste de Nora após M2-Q6
Revertida a alteração da Kara em tests/negocios-gravacao.test.ts (normalizava CRLF na leitura do fonte): a diretriz é preservar a suíte original; as 2 falhas "regressões de tela" seguem atribuídas a CRLF do working copy e são reconfirmadas em cópia LF da versão final (kit-personalizado.tsx e novo/formulario.tsx mudaram nesta rodada).
