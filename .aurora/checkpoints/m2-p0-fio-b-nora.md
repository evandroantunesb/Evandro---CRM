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

## Validação final da versão integrada (Nora, 21/10, 22:52–23:10) — SEM commit/push/PR/merge
Versão: R:/wt-m2-p0-int = base 2780a53 + 38 arquivos locais (fora .aurora). Banco: descartável aurora-m2-q1 (573xx). Execuções pesadas uma por vez (script .aurora/tmp/validar-p0.sh; logs .aurora/logs/final-p0/). Nenhuma redução de paralelismo foi necessária; nenhum teste excluído; nenhum erro de Auth nesta validação.
- 01 typecheck: ok. 02 lint: ok.
- 03 puros afetados (12 arquivos): 549/551 no int; as 2 falhas = "regressões de tela" de tests/negocios-gravacao.test.ts.
- 04 suítes de banco isoladas: calculadora-persistencia-db, negocios-gravacao-db, calculo-vigencia-db, contrato-db, calculadora-db, negocios-acoes-db, proposta-db, travas-kit-sdr-db — todas exit=0.
- 05 suíte completa (config oficial via rodar-db.sh): 2032/2034, 94/95 arquivos; únicas falhas = as 2 acima.
- 06 build (env do banco descartável): ok.
- 07 e2e completo: 1ª tentativa exit=1 em 3 s (porta 3100 ocupada por servidor órfão de execução anterior, encerrado; linha "FIM 7-e2e-todos exit=1" no resumo é dessa execução anterior); 07b reexecução: 62/62 passaram (5,3 min). supabase/config.toml restaurado (git diff limpo).
- Cópia LF R:/wt-m2-p0-lf (autocrlf=false), sincronizada com a versão final: 38/38 arquivos idênticos ao int ignorando EOL; todos i/lf w/lf. tests/negocios-gravacao.test.ts: 31/31; 12 puros afetados: 551/551 (.aurora/logs/crlf/lf-*.log). Atenção: rodar com a config pura da PRÓPRIA cópia LF (a do int fixa root no int e lê os fontes CRLF — primeira tentativa inválida por isso, refeita).
- Conclusão: as 2 falhas no int são só de CRLF do working copy; suíte original preservada.

Caminhos de cálculo efetivamente usados (versão integrada):
- Prévia (cadastro novo/formulario.tsx:307 e ficha kit-personalizado.tsx:390): `calcular` (calculadora.ts:87) => sempre `incompleta`; mostra dimensionamento/geração/kit e pendências (vendedor e empresa); nada financeiro.
- Gravação (criarNegocio / salvarKitComCliente em negocios-gravacao.ts): `montarLinhaCalculo` (calculo-servidor.ts) -> `linhaDeCalculo` (calculo-reproduzivel.ts:124) -> `calcular` => incompleta => nenhuma linha em calculos_solares; kit, consumo e fatura gravados no negócio; mensagem persistente kit-salvo com pendências.
- Proposta nova (acoes/propostas.ts:30): `carregarVigencia` + `motivosDaAcao(…,"proposta")` => recusada (sem linha: estimativa incompleta; com linha: legado).
- Proposta emitida: página pública proposta/[token]/page.tsx:38 e PDF pdf/route.ts:37 => `situacaoDaEmissao` => sempre indisponível; PDF 409.
- Contrato (contratos-geracao.ts:58-68): linha legada usada só para potência/consumo/geração; guarda de vigência por kit/consumo/parâmetros; preço divergente ignorado quando legado (usa valor atual do negócio); sem linha: camposSemDado (comportamento anterior).
- Atualizar preço (negocios-gravacao.ts:509-518): recusa sempre (MENSAGEM_PRECO_CALCULO_LEGADO ou incompleta).
- `fecharEconomia` (arredondamento aprovado) e `calcularFioBHipotese` (fio-b-hipotese.ts): sem caminho de produção; só testes/ponto de extensão.

## Rodada de revisão (Nora, 22/10/2026) — SEM commit/push/PR/merge
Base igual (2780a53 + locais). Hipótese de Fio B segue isolada (nenhuma chamada no motor real).
1. Defeito hipótese: conta sem solar usava C (consumo da rede = total − autoconsumo). Corrigido: `max(consumo total, D) × T` (src/lib/fio-b-hipotese.ts; contrato m2-p0-conta-solar.md atualizado, incl. linha de arredondamento que estava desatualizada). tests/fio-b-hipotese.test.ts: 3 casos com autoconsumo corrigidos + 2 regressões; 82/82; com a fórmula antiga, 5 falham.
2. Defeito kit: salvar kit com kWh vazio gravava null em negocios.consumo_medio_kwh. Corrigido em salvarKitComCliente: kWh vazio usa o consumo gravado no negócio (estimativa, pendências e gravação); kWh informado substitui. Fatura vazia continua = null (não pedido; ver pendência). Teste db novo (com e sem tarifa + substituição); com o código antigo, falha.
3. Propostas: desenho em .aurora/contratos/m2-p0-propostas-emissao.md (emitidas: indisponível definitivo, sem reconstrução; futuras: propostas_emissoes imutável + proposta `simples` sem economia). Não implementado (exige migration).
Validação (banco descartável aurora-m2-q1 religado com `supabase start --workdir R:/raion-crm/descartavel/aurora-m2-db`; logs .aurora/logs/nora-22-10/): typecheck ok; lint 0 erros/3 warnings preexistentes; puros afetados 551/553 no int (2 = CRLF) e 553/553 na cópia LF; negocios-gravacao-db 25/25; travas-kit-sdr-db + calculo-vigencia-db + calculadora-persistencia-db 143/143; suíte completa 2035/2037 (mesmas 2 de CRLF); config.toml restaurado.
Build ok; e2e completo 62/62 (5,7 min). Stack aurora-m2-q1 deixado ligado.

## Rodada kWh/fatura do kit (Nora, 22/10/2026) — SEM commit/push/PR/merge
Contrato: .aurora/contratos/m2-p0-kit-consumo-fatura.md. Campo vazio no kit (kWh ou fatura) mantém o valor gravado em negocios; preenchido substitui; só "Dados do negócio" limpa.
Arquivos: src/lib/negocios-gravacao.ts (salvarKitComCliente; Jay + Nora), src/app/(app)/negocios/[id]/kit-personalizado.tsx (prévia, aviso `kit-consumo-salvo`/`kit-fatura-salva`; Kevin), tests/negocios-gravacao-db.test.ts e e2e/11-kit-consumo-fatura-salvos.spec.ts (Kara; Nora corrigiu 1 cenário: com tarifa e sem kWh/fatura o servidor já recusava o kit antes — teste agora cobre a recusa e o salvamento sem tarifa).
Validação (versão final, banco aurora-m2-q1; logs .aurora/logs/nora-22-10b/): typecheck ok; lint ok; puros afetados ok (2 falhas = CRLF; cópia LF 63/63); negocios-gravacao-db 28/28; build ok; suíte completa 2038/2040 (as 2 de CRLF); e2e completo 64/64. Mutação: sem a regra da fatura, 3 dos 4 testes novos falham. config.toml restaurado.
Custo: 3 subagentes ~179,9 mil tokens (Kevin 61,3k, Jay 45,9k, Kara 72,6k). Decisão do Evandro: correções pontuais na sessão principal, sem acionar os três por padrão.
Pendência menor: na tela, número malformado ("abc") não mostra o aviso de campo vazio (lerNumeroBr devolve NaN); o servidor recusa o envio.

## Encerramento da correção do kit (Nora, 22/10/2026)
Estado: VALIDADA TECNICAMENTE (aceite funcional é do Evandro). e2e 64/64; banco (negocios-gravacao-db) 28/28; suíte completa 2038/2040, com as 2 falhas de CRLF ("regressões de tela" de negocios-gravacao.test.ts) já reproduzidas como passando na cópia LF (63/63 nos afetados). Sem novas execuções nem novos agentes nesta etapa. Próximo: uma revisão única em Opus do diff integrado (só bloqueios de publicação).

## Revisão de bloqueios para publicação (Nora em Opus, 22/10/2026) — só leitura
1 BLOQUEIO: src/lib/kit-formulario.ts:33-34 — com linha legada em calculos_solares, o editor do kit abre kWh e fatura do CÁLCULO ANTIGO (não do negócio); salvar sem editar grava esses valores antigos em negocios (ex.: negócio 450 kWh, cálculo 700 → vira 700). Correção mínima: consumo/fatura = consumoMedioKwhPadrao/valorFaturaMedioPadrao (negócio), sem cair no cálculo; ajustar o teste M2-a de negocios-gravacao-db que passa padrão null. Não corrigido (aguarda autorização).
Sem bloqueio: cálculo antigo como atual (toda linha = legado; ramo sem rótulo inalcançável; contrato só potência/consumo/geração; Obras copia economia/payback na venda mas nenhuma tela exibe); propostas emitidas (página e PDF retornam antes de ler calculos_solares); proposta nova (única escrita é gerarLinkProposta, guardada).
Riscos para o desenho de propostas: definirExibicaoProposta altera modo_preco/mostrar_economia de proposta já emitida; cópia de economia/payback para Obras na venda.

## Correção do editor do kit (Nora, 22/10/2026) — SEM commit/push/PR/merge
Bloqueio da revisão corrigido: src/lib/kit-formulario.ts `estadoSalvoDoKit` abre kWh e fatura SEMPRE de negocios (consumoMedioKwhPadrao/valorFaturaMedioPadrao); nunca do cálculo (legado). Sem dado no negócio => campo vazio. Tarifa e tipo de ligação continuam vindo do cálculo (não pedidos; tarifa não existe em negocios).
Testes: tests/negocios-gravacao.test.ts (Cancelar com cálculo usa o negócio; caso sem dado abre vazio; teste de fonte agora confere as props do negócio), tests/numeros-br.test.ts (escala com valores do negócio), tests/negocios-gravacao-db.test.ts (M2-a com padrão do negócio; novos: negócio 450/300 + legado 700/900 => abrir 450/300, salvar sem editar mantém 450/300 e linha intocada; negócio sem dado + legado => campos vazios, servidor recusa (tarifa sem consumo/fatura), nada muda), e2e/06 (fixture legada com consumo no negócio; novo caso negócio 450 x legado 1200 => editor 450, salvar mantém 450).
Resultados (logs .aurora/logs/nora-22-10c/): tsc ok; eslint ok; puros 128/130 no int (2 = CRLF), 130/130 na cópia LF; negocios-gravacao-db 30/30; e2e 06+10+11: 06 tinha 1 falha esperada (fixava o defeito), corrigida → 06 4/4; 10 e 11 passaram. Mutação: com o preenchimento antigo, os 2 testes novos de banco falham. Suíte completa e e2e completo NÃO repetidos (instrução do Evandro).
Obras (mapeamento): snapshot comercial (economia, payback, contas, Fio B, kit_preco, tarifa do cálculo legado) é gravado em obra_dados_comerciais.snapshot na venda; único consumidor é marcar_venda_alterada_obra (só compara igualdade para o aviso "dados comerciais mudaram"); o app lê apenas valor_vendido; a RLS permite SELECT do snapshot a admin/vendedor/gestor via API, sem tela. Snapshot técnico: src/lib/obras/tecnico.ts:94-95 exibe na obra consumo do CÁLCULO (antes do negócio) e geração do cálculo legado — dado técnico legado visível na tela da obra (não financeiro).
Conclusões: (1) correção tecnicamente segura; (2) conjunto de 38 arquivos NÃO pronto para uso comercial (propostas novas bloqueadas; links antigos indisponíveis/409).

## ESTADO ATUAL (22/10/2026, fim do dia) — ler primeiro ao retomar
- Versão: base 2780a53 + 42 arquivos fora de .aurora (33 modificados, 9 novos). Conferência sem logs: .aurora/revisao/m2-p0-pacote.md + m2-p0-integracao.patch (sha256 34f7f3d3…f9d5bb) + m2-p0-manifesto-lf.sha256 (42/42 conferidos sobre git archive 2780a53). Usar `git diff HEAD` (4 arquivos têm parte no índice).
- Ajuste do editor do kit: ENCERRADO (puros afetados, negocios-gravacao-db 30/30, e2e 06/10/11 ok). Suíte completa (2038/2040) e e2e completo (64/64) são da versão anterior a esse ajuste; não repetidos por decisão do Evandro.
- Tecnicamente segura: sim. Pronta para uso comercial: NÃO (propostas novas bloqueadas; links antigos indisponíveis/409).
- Risco registrado: Obras mostra consumo e geração do cálculo legado (src/lib/obras/tecnico.ts:94-95 → obras/[id]/page.tsx:245-246). Menor correção e testes afetados no pacote, seção 5. Não implementado.
- PDFs antigos: nenhum PDF de proposta foi gravado pelo sistema em momento algum (código, migrations, histórico). Única fonte possível: anexos manuais; consulta SQL só leitura para o Evandro no contrato de propostas, seção 1.
- Proposta simples + emissão preservada (tabela imutável + PDF gravado no bucket): desenho para decisão em .aurora/contratos/m2-p0-propostas-emissao.md. Não implementado; vai em branch própria após o aceite.
- Próximo passo: decisões do Evandro (contrato de propostas, seção 5) e autorização de commit/push desta versão.
- Notebook (22/10/2026): manifesto dos 42 arquivos confere (42/42) e passou somente `tsc --noEmit`. Lint, testes, build, banco e e2e NÃO rodados aqui (sem pnpm/Docker, por decisão do Evandro); os resultados anteriores são do outro computador. Se uma falha exigir reprodução no notebook: primeiro preparar Node 22 e o pnpm previsto pelo projeto, depois rodar só a verificação necessária. Sem commit/push.
- Decisões do Evandro (22/10, contrato de propostas) aplicadas: proposta simples provisória (modelo próprio fixo), migration `20261022100000_propostas_emissoes.sql` + PDF em bucket privado preparados para REVISÃO (nada aplicado), rodapé ajustado e sem Fio B/GD II no PDF, validade obrigatória informada pelo vendedor, link antigo com aviso e "solicitar nova proposta". Pacote: `.aurora/contratos/m2-p0-emissao-preservada-implantacao.md`; diff só desta rodada: `.aurora/revisao/m2-p0-emissao-preservada.patch` (13 arquivos, base = árvore dos 42 arquivos, `.aurora/revisao/.base-tree`). Notebook: só tsc e eslint nos arquivos novos; testes novos NÃO rodados; `database.types.ts` NÃO regenerado. Próximo: revisão do Evandro; validação completa no outro computador; sem commit/push/PR/merge/produção.
- 2ª rodada da emissão preservada (22/10, notebook, Node 22 + pnpm 10.33 + stack descartável aurora-emissao): sem texto padrão de Incluso/Garantias (só conteúdo do modelo da empresa); potência = módulos do kit, geração = potência × produtividade da empresa, preço = valor do negócio (nada de calculos_solares); limites para caber em 3 páginas; migration revisada por Opus (3 defeitos corrigidos: inserção forjada pela API, empresa não conferida na política, negócio arquivado) e negócio com proposta emitida não é mais apagável. Validação: typecheck/lint/build ok; suíte completa 2101/2103 (2 = CRLF conhecidas), em sequência e com config temporária porque a trava do Docker recusa este notebook (portas em 0.0.0.0); e2e NÃO rodou; HTML IBS de referência ausente; produtividade padrão 120 aguarda decisão. Pacote: .aurora/contratos/m2-p0-emissao-preservada-implantacao.md; diff: .aurora/revisao/m2-p0-emissao-preservada.patch (18 arquivos); PDFs: .aurora/revisao/pdfs/. Sem commit/push/PR/merge/produção; supabase/config.toml restaurado.
- 3ª rodada da emissão preservada (22/10, notebook): HTML IBS recebido (SHA-256 8019c9e1…2878596, confere) e comparado com os 3 PDFs (`.aurora/revisao/comparacao/`). Geração só com produtividade CONFIRMADA pelo admin (migration `20261022110000_produtividade_confirmada.sql`; sem confirmação o PDF sai sem geração; padrão 120 NÃO aprovado; confirmação é proposta para aceite). 2ª revisão Opus curta (SQL + acessos públicos): 3 achados comprovados por teste que falha no SQL revisado e corrigidos (linha sem PDF via API; mensagem que vazava versão de negócio alheio antes da RLS; apagar membro que confirmou); 2 não comprovados registrados (remoção do PDF após falha de rede; cabeçalhos no-store/noindex). Validação NÃO oficial: 4 suítes focais 71/71, tipos idênticos, typecheck ok, lint 0 erros + 3 avisos preexistentes (aviso `L` removido). Suíte completa inválida (notebook sem memória, Docker caiu) — não repetir aqui. e2e 12 nunca executado. Stack aurora-emissao parado; vitest.descartavel.tmp.mts removido; supabase/config.toml restaurado (ff715f8f…a838). Diff: .aurora/revisao/m2-p0-emissao-preservada.patch (23 arquivos, sha256 5ee86298…2f66d1). Registros separados no contrato, seção 7 (arquivar sem apagar = decisão proposta; exclusão da empresa apaga em cascata; hash detecta mas não recupera PDF substituído; rodapé no caso sem geração). Próximo: decisões do Evandro + validação oficial no outro computador (.aurora/revisao/VALIDACAO-OFICIAL.md). Sem commit/push/PR/merge/produção.
- 4ª rodada da emissão preservada (22/10, notebook; recomendações do Evandro implementadas SEM aceite funcional): (1) confirmação da produtividade agora exige valor atual + fonte (10–120) + responsável (3–60), RPC `confirmar_produtividade_calculadora(empresa, valor, fonte, responsável)`, congelados nos dados; padrão 120 segue NÃO aprovado; (2) rodapé alternativo sem geração ("Esta proposta apresenta o sistema. Não inclui estimativa de geração, economia ou prazo de retorno.", redação minha, pendente de aceite); formato de dados v4 exige rodapé coerente com a geração; (3) Manrope (títulos) e Inter (textos) embutidas em `src/lib/propostas/fontes-pdf.ts` (WOFF/base64, OFL); (4) condições de pagamento: uma opção por linha vira lista na página 3; (5) amostra com logo e identidade configurados (empresa fictícia; foto = gradiente); (6) exclusão de empresa investigada: sem UI/ação/script, só RLS de super-admin via API, service role ou SQL; cascata apaga emissões e os PDFs ficam órfãos no bucket (provado por teste). Validação NÃO oficial: focais 73/73, typecheck ok, lint 0 erros + 3 avisos preexistentes, build exit 0. Suíte completa e e2e (inclusive 12-proposta-emitida) ficam para o outro computador (.aurora/revisao/VALIDACAO-OFICIAL.md). Falta revisão Opus curta da migration da confirmação v2 (não feita). Temporários removidos (vitest.descartavel.tmp.mts, teste de amostras); config.toml intacto (ff715f8f…a838); stack aurora-emissao parado. Patch: .aurora/revisao/m2-p0-emissao-preservada.patch (24 arquivos, sha256 1893f452…04453b). Sem commit/push/PR/merge/produção.
- 5ª rodada da emissão preservada (22/10, notebook): condição de pagamento OBRIGATÓRIA para congelar; logo configurado que falha recusa a emissão; foto ausente/falha usa fallback sólido definido (testado, 3 páginas); imagem só da pasta da própria empresa e baixada com o acesso do usuário; geração/rodapé conferidos no clique (geracaoEsperada); data da confirmação em São Paulo; RPC de confirmação trava a linha (for update). 3ª revisão Opus curta feita (1 média + 3 baixas, todas corrigidas; relatório no contrato, seção 6). Fluxo futuro de limpeza do bucket e bloqueio possível de exclusão de empresa registrados no contrato (seção 7, item 2), NÃO implementados. Validação NÃO oficial: focais 82/82, typecheck ok, lint 0 erros + 3 avisos preexistentes. BUILD: o último pnpm build estava rodando quando a sessão foi interrompida para a troca de PC (o anterior, antes das últimas mudanças, deu exit 0) — refazer no outro computador. Suíte completa e e2e (inclusive 12-proposta-emitida) pendentes no outro computador (.aurora/revisao/VALIDACAO-OFICIAL.md). Páginas A/B/C em .aurora/revisao/comparacao/ (inalteradas na 5ª rodada, o layout não mudou). Temporários removidos; config.toml intacto (ff715f8f…a838); stack aurora-emissao parado. Patch: .aurora/revisao/m2-p0-emissao-preservada.patch (26 arquivos, sha256 001e86d6…301120). Aguardam aceite do Evandro: rodapé sem geração, confirmação da produtividade (valor/fonte/responsável), Manrope+Inter, arquivar sem apagar. Sem commit/push/PR/merge/produção.
- Atualização: o pnpm build da 5ª rodada TERMINOU com exit 0 (depois das últimas alterações). Não é preciso tratá-lo como pendência; o build oficial segue valendo no outro computador.
- PASSAGEM DE PC (22/10): pacote em R:\troca_pc_22-10-1750\passagem-m2-p0 (LEIA-ME.txt, BASE.txt = 2780a53cf828caad5a41b5f5931ffa32a95c5695, rastreados.patch binário, novos/, aurora/, manifesto-estado-final.txt com sha256 bruto e LF, PACOTE.sha256, aplicar-passagem.sh, verificar-passagem.sh). Simulação do destino feita NO NOTEBOOK (worktree limpo na mesma base, patch + cópia dos novos + .aurora, verificação = COINCIDE, 103 arquivos). A conferência no OUTRO PC ainda NÃO foi feita: lá, conferir PACOTE.sha256, aplicar, rodar verificar-passagem.sh e só então declarar a retomada pronta; depois pnpm db:reset, db:types, lint, typecheck, pnpm test, pnpm build e e2e (VALIDACAO-OFICIAL.md). Sem commit/push/PR/merge/produção.
- PASSAGEM DE PC — LOCAL FINAL (por pedido do Evandro): o pacote está em R:\trocapc\passagem-m2-p0 (a pasta R:\troca_pc_22-10-1750 citada acima é uma cópia ANTERIOR e desatualizada: IGNORAR; o Evandro pode apagá-la). LEIA-ME.txt e .aurora/revisao/VALIDACAO-OFICIAL.md foram corrigidos: db:reset/db:types só numa stack Supabase DESCARTÁVEL criada e identificada no outro PC (project_id, portas, destino do .env.local e banco selecionado conferidos antes; nunca reiniciar o banco local existente com dados); ordem no destino: PACOTE.sha256 → ler os scripts → worktree na base 2780a53cf828caad5a41b5f5931ffa32a95c5695 → COINCIDE nos 103 arquivos → só então stack descartável, tipos, lint, typecheck, pnpm test, build e e2e; resultados na tabela do passo D e aceites de produto pendentes na seção E. Sem commit/push/PR/merge/produção.

## Validação oficial no desktop (Nora, 22/10/2026, DESKTOP-MMIUIS0) — SEM commit/push/PR/merge
Pacote: R:\trocapc\passagem-m2-p0\ (a pasta antiga R:\troca_pc_22-10-1750 não foi usada nem apagada). Worktree novo: R:/wt-m2-p0-retomada (detached em 2780a53). Logs locais: .aurora/logs/validacao-oficial/.

| Etapa | Resultado |
| --- | --- |
| `PACOTE.sha256` na cópia | 70/70 OK |
| `verificar-passagem.sh` (103 arquivos) | COINCIDE (antes de qualquer banco) |
| Stack descartável; B1 | `aurora-validacao-m2p0`, portas 58320–58329 só em 127.0.0.1; project_id, portas, destino do .env.local (58321/58322) e banco `postgres|0`: as 4 ok. Stacks existentes (evandro---crm, aurora-m2-q1, restore-*) intocadas |
| `pnpm db:reset` | ok, 87 migrations |
| `pnpm db:types` | idêntico ao pacote (SHA LF = manifesto) |
| lint / typecheck | 0 erros (3 avisos conhecidos) / ok |
| `pnpm test` oficial (trava ligada) | 2123/2125, 99/100 arquivos; só as 2 de CRLF de tests/negocios-gravacao.test.ts (erro mostra `\r\n` no fonte). Suítes da emissão (proposta-simples, propostas-emissoes-db, propostas-emissoes-fluxo-db, imagens-emissao, produtividade-confirmada-db) passaram |
| `pnpm build` | ok |
| e2e completo | 68/69. Falha: e2e/12 "emitir… mesmo PDF", linha 95 espera "620 kWh/mês" ou "619,85 kWh/mês"; a página mostra 660 kWh/mês = 5,5 kWp × 120 (produtividade confirmada pela própria fixture; todas as outras fixtures usam 120 → 660). Defeito da EXPECTATIVA do teste, não do produto. Cópia temporária do spec só com essa linha trocada para "660 kWh/mês" (apagada depois): cenário inteiro passou (emitir, link sem login, PDF, mudar negócio e kit → mesmo PDF, v2). Arquivo do pacote NÃO alterado |
| Conferência manual (C.7) | PENDENTE (precisa do Evandro no navegador) |
| Stack descartável parada e `config.toml` restaurado | PENDENTE (stack mantida para a conferência manual) |

Correção proposta (aguarda autorização, muda 1 arquivo do pacote): e2e/12-proposta-emitida.spec.ts:95 → `await expect(pagina.getByText("660 kWh/mês", { exact: true })).toBeVisible();` (ou derivar de `p.produtividade_kwh_kwp_mes × 5,5`).

### C.7 — conferência manual (em andamento, 22/10/2026)
- e2e/12 corrigido (autorizado pelo Evandro): linha 95 espera "660 kWh/mês" = 5,5 kWp × 120 confirmada NA FIXTURE. Isso não aprova 120 como parâmetro de proposta real. e2e completo depois da correção: 69/69.
- App: http://localhost:3100 (next start em 127.0.0.1, trava ok), só na stack aurora-validacao-m2p0.
- APROVADO pelo Evandro: só o VISUAL da proposta exibida (emissão manual v1, empresa "Solar Fictícia A (E2E mvk3swk573w)", 22:39 UTC, admin). Observação dele: faltam dados ainda não cadastrados (pagamento, cartão, financiamento e outros); é conteúdo a cadastrar, não defeito.
- Cenários funcionais NÃO conferidos manualmente (pendentes): (a) emitir com condições de pagamento vazias = recusa; (b) várias linhas de pagamento = um item por linha na página 3; (c) confirmação da produtividade em Configurações › Calculadora; (d) logo e cores da empresa no PDF com identidade configurada; (e) logo inválido = emissão recusada; (f) capa sem foto = fundo sólido.
- Cenário (e) preparado SÓ no banco descartável: inserida proposta_identidades da empresa A com logo_url apontando para arquivo inexistente (sem objeto no bucket proposta-marca). Antes não havia linha de identidade para essa empresa.
- (e) Logo inválido: CONFERIDO pelo Evandro. Mensagem: "Não foi possível carregar o logo da empresa (confira o arquivo em Configurações › Propostas › Identidade; use PNG ou JPEG). Nada foi emitido." Banco: nenhuma versão nova (continua só a v1 manual).
- Cenário (f) preparado só no banco descartável: identidade da empresa A com logo_url e foto_capa_url nulos.
- (f) Capa sem foto: Evandro confirmou "emitiu corretamente a nova versão". Banco: v2 às 22:46 UTC, token e pdf_sha256 diferentes da v1.
- Pendentes de conferência manual (não testados à mão; cobertos só por testes automáticos): (a) pagamento vazio recusado, (b) várias linhas de pagamento na página 3, (c) confirmação da produtividade pela tela, (d) logo e cores no PDF com identidade configurada.

### Encerramento (22/10/2026)
- App parado (o processo do next start ficou órfão na 3100 e foi encerrado após confirmar que era deste worktree).
- `supabase stop --no-backup` SÓ em aurora-validacao-m2p0 (project_id reconferido); evandro---crm, aurora-m2-q1 e restore-* intocadas e no ar.
- supabase/config.toml restaurado: SHA-256 ff715f8f…a838, `git diff` sem diferença. .env.local removido (criado nesta rodada; não existia antes).
- Backup R:/config.toml.original NÃO removido (a verificação de segurança barrou o rm na raiz do drive); idêntico ao config restaurado; o Evandro pode apagar.
- verificar-passagem.sh: NÃO COINCIDE com exatamente 2 diferenças esperadas: e2e/12-proposta-emitida.spec.ts (correção autorizada da linha 95) e este checkpoint (resultados). git status sem nada fora do manifesto; nenhum arquivo proibido.

## VALIDAÇÃO TÉCNICA OFICIAL: CONCLUÍDA (Evandro, 22/10/2026)
- Concluída no desktop sobre o pacote de 103 arquivos + a correção autorizada do e2e/12. pnpm test oficial 2123/2125: as 2 falhas são de CRLF do working copy em tests/negocios-gravacao.test.ts ("regressões de tela"; o erro mostra `\r\n` no fonte; passam em LF). e2e completo 69/69 após a correção. db:reset (87 migrations), db:types idêntico, lint, typecheck e build ok.

### Limite do aceite manual (registro separado)
- O Evandro aprovou o VISUAL da v1 emitida manualmente na stack descartável: SEM logo (a empresa não tinha identidade) e SEM condições comerciais reais (texto de teste). Esse aceite NÃO cobre logo, cores, foto de capa nem condições de pagamento reais.
- Funcionais conferidos à mão: logo inválido = recusa; capa sem foto = v2 emitida. Não conferidos à mão (só automáticos): pagamento vazio recusado; várias linhas de pagamento na página 3; confirmação da produtividade pela tela; logo e cores no PDF.
- Para o aceite visual final de logo, cores e pagamento existem só os PDFs de revisão do notebook (.aurora/revisao/pdfs/a|b|c, gerados às 17:17 na 4ª rodada, empresa fictícia "Solar Exemplo", produtividade fictícia 112,7 → 620 kWh/mês). Arquivos de dados e validação mudaram às 17:26 (5ª rodada); o registro dela diz que o layout não mudou. Esses PDFs não foram regerados na versão final.

### Pacote atualizado
- R:\trocapc\passagem-m2-p0: novos/e2e/12-proposta-emitida.spec.ts e aurora/.aurora/checkpoints/m2-p0-fio-b-nora.md substituídos pelos da versão validada; manifesto-estado-final.txt e PACOTE.sha256 recalculados. Cópia de segurança do pacote anterior: R:\trocapc\passagem-m2-p0-antes-validacao. Nada na raiz de R: foi apagado.

### Decisões de produto pendentes (Evandro) antes de propor publicação
1. Aceite visual final com logo, cores e pagamento (PDF "a" do notebook ou nova emissão com a identidade real).
2. Rodapé sem geração: "Esta proposta apresenta o sistema. Não inclui estimativa de geração, economia ou prazo de retorno."
3. Produtividade: confirmação pelo admin (valor, fonte, responsável) como condição para mostrar geração; o valor real da empresa (120 não aprovado; 112,7 é fictício).
4. Fontes Manrope (títulos) e Inter (textos) embutidas no PDF.
5. Negócio com proposta emitida: só arquivar, nunca apagar.
6. Conteúdo real: logo, foto de capa, inclusões, garantias, etapas e condições de pagamento (à vista, cartão, financiamento etc.).
7. Exclusão de empresa: bloqueio e limpeza do bucket (hoje a cascata deixa PDFs órfãos).
8. Obras exibe consumo e geração do cálculo legado (tecnico.ts:94-95): corrigir ou rotular antes de publicar.
9. Fio B/Copel e economia: continuam fora (estimativa financeira incompleta).
10. Autorização de commit em branch própria, PR, CI e migration em produção só pelo fluxo banco-producao.yml.

## Decisões novas do Evandro (22/10/2026) — SÓ mapeadas; versão validada NÃO alterada
D1. Validade da proposta: 7, 15 ou 30 dias, configurada pelo gestor e calculada na emissão.
D2. Condições de pagamento: exibir à vista, cartão e financiamento; o vendedor NÃO escolhe modalidade.
Regra comum: versões já emitidas ficam como estão (PDF gravado e `dados` v4 intocados).

Impacto mapeado (código atual):
- Hoje a validade é digitada pelo vendedor (`emitir-proposta.tsx:49`, campo date `validadeAte`; `acoes/propostas-emissoes.ts:18,39,97`; regras em `proposta-simples.ts:156,348-350`). O trigger da migration `20261022100000_propostas_emissoes.sql:86-120` exige `validade_ate` = `dados.comercial.validadeAte` e não anterior a hoje. Isso continua valendo.
- Hoje o pagamento é texto livre do vendedor, uma opção por linha, pré-preenchido pelo modelo (`emitir-proposta.tsx:51-62`; obrigatório e com no máximo 240 caracteres em `proposta-simples.ts:158,329-330`; `opcoesDePagamento` em `:274`; página 3 em `pdf-simples.tsx`).
- D1 exige: (a) configuração por empresa do prazo ∈ {7,15,30}, editável só por gestor/admin (migration nova, com check); (b) a emissão calcula validadeAte = hoje em São Paulo + N, e a tela troca o campo de data por um texto "válida até dd/mm (N dias)"; (c) gravar o prazo em `dados` muda o formato.
- D2 exige: (a) três textos por empresa (à vista, cartão, financiamento), configurados pelo gestor/admin (migration ou config do modelo); (b) a emissão congela os três em `dados.comercial` de forma estruturada; (c) o renderizador da página 3 e a página pública mostram os três com rótulos; (d) a tela de emissão tira o campo de texto livre (vira prévia só de leitura).
- PRESERVAÇÃO: o leitor aceita só `esquema: z.literal(4)` (`proposta-simples.ts:120`). Um formato novo (v5) precisa de leitor que aceite 4 E 5, com os dois caminhos de exibição, senão as emissões v4 viram "indisponível". `RENDERIZADOR_SIMPLES` passa de "simples-v4" para "simples-v5"; os PDFs já gravados continuam servidos byte a byte.
- Testes afetados: tests/proposta-simples.test.ts (validade, condições, limites, formato), propostas-emissoes-db, propostas-emissoes-fluxo-db, e2e/12 (preenche validade e condições), mais testes novos de RLS/permissão da configuração e de leitura v4 após a v5.
- Decisões que faltam para implementar D1/D2: quem é "gestor" para essa configuração (gestor e admin? só admin?); prazo padrão quando não configurado (bloquear emissão ou 15?); textos reais da IBS para as três modalidades; se uma modalidade não configurada some ou bloqueia a emissão.

Renderizador x PDF "a": NÃO comprovável por diff (não existe cópia do código das 17:17; o script que gerou as amostras não está no pacote). `pdf-simples.tsx` foi modificado às 17:12 (antes do PDF, 17:17), mas importa `dataBr`, `opcoesDePagamento` e `textoPremissaGeracao` de `proposta-simples.ts`, alterado às 17:26. Pela regra do Evandro, o PDF "a" NÃO serve como amostra da versão final; vale só como referência de layout fictícia.

Separação dos aceites: (1) aceite visual — só a v1 sem logo e sem pagamento real; layout com logo e cores pendente; (2) textos e dados reais da IBS — pendentes; (3) decisões de produto — lista acima + D1/D2; (4) autorização de publicação — não dada.

## Calculadora — fonte do Fio B, regra e estimativa incompleta persistida (Nora, 22/10/2026, noite)
Pedido do Evandro: congelar D1/D2 e o visual; concluir a calculadora sem ligar a hipótese ao motor com valor presumido. Worktree NOVO `R:/wt-m2-p0-calc` (git worktree detached em 2780a53 + os 103 arquivos da versão validada `R:/wt-m2-p0-retomada`, conferidos byte a byte; SEM D1/D2). Pacote `R:\trocapc\passagem-m2-p0` NÃO atualizado.
- Fonte (item 1): ANEEL Componentes Tarifárias 2026 (API datastore), COPEL-DIS, REH 3.592/2026, vigência 2026-06-24 a 2027-06-23, B1 Convencional Residencial, Tarifa de Aplicação: `TUSD_FioB` 214,535600374 R$/MWh; TE 310,85; TUSD 457,17; SCEE TE 30,20. Conferido com o conjunto "Tarifas de aplicação". PDF da REH (anexos) bloqueado por Cloudflare para acesso automatizado; DOU só tem o extrato.
- Regra (item 2): Lei 14.300 art. 27 (60% 2026, 75% 2027) lida no Planalto; REN 1.000 arts. 291, 655-I (red. REN 1.098/2024) e 655-Q lidos na cópia compilada da Cemig (ago/2025). Desconto GD II da Tabela 4 = 1 − p × FioB / TUSD_SCEE, comprovado em duas REHs legíveis (Equatorial GO 3.544; Enel CE 3.445). N Copel = 0,1287214 R$/kWh (2026), 0,1609017 (2027).
- Decisão única para o Evandro: `.aurora/contratos/m2-p0-decisao-fio-b-copel.md` (valores, fontes, fórmula, 4 casos + 4b). Mapa de ligação: `.aurora/contratos/m2-p0-ligacao-motor.md`.
- Trabalho independente (item 3), banco descartável `aurora-calc` (portas 585xx): migration `20261023200000_calculos_estimativa_incompleta.sql` (estado_financeiro legado/incompleto/completo, pendências, método; financeiros anuláveis; CHECK de coerência). Salvar kit/criar negócio grava o resultado técnico `incompleto` (sem economia/payback); linha `legado` nunca é substituída por resultado incompleto (decisão pendente do Evandro). Vigência: motivo `incompleta`. Ficha: "Resultado técnico salvo (sem economia)".
- Validação: typecheck ok; lint 0 erros (3 avisos conhecidos); testes afetados 636/638 (as 2 falhas são a linha de base CRLF de `negocios-gravacao.test.ts`) + teste novo de banco 4/4 (15 recusas com 23514) + 4 casos 5/5; e2e 06/09/10/11 13/13 e e2e 12 4/4. Suíte completa e e2e completo NÃO rodados. Diff: `.aurora/revisao/calc/calculadora-estimativa-incompleta.patch` (20 arquivos, +834/−157).
- Próximo: aceite do Evandro na decisão → cadastrar a linha da Copel (parametros_fio_b), ligar `calcular` conforme o mapa e testar prévia → salvar → reabrir → proposta. Sem commit/push/PR/merge/produção.
- Revisão 2 do contrato (pedido do Evandro, 6 pontos): piso pelo art. 655-I com a interpretação oficial (voto REN 1.059, itens 204-210, parecer PFANEEL); Lei 14.300 sem alteração nos arts. 16/27; REN 1.148/2026 e 1.162/2026 não tocam 291/655-I/655-Q; PDL 59/2023 parado desde 31/10/2023. Caso 5 (C=100, E=100, D=50) = 38,40. Linha bruta da ANEEL em .aurora/fontes/. Definições C/E/K com A=0 declarado; percentual por ano x componente por vigência; payback indisponível no P0; tarifa personalizável mantida com base declarada; R6.1-R6.4 (R6.2/R6.3 não implementados). Oráculo 6/6. Aguarda aceite.
