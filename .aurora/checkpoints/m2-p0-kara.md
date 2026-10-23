# Checkpoint Kara (QA) - m2-p0

- Objetivo: testes puros (dados FICTICIOS) da estimativa financeira incompleta, da formula-hipotese do Fio B e ajuste das asserções afetadas pela mudança de requisito (conta em R$ sem kWh = incompleta).
- Worktree: R:/wt-p0b-kara · branch aurora/m2-p0-kara · base a81f4542302ff001d1fb5de77ed1994c9d4b1af1. Sem commit.
- Concluido: tests/estimativa-financeira.test.ts, tests/fio-b-hipotese.test.ts (escritos contra as assinaturas lidas em R:/wt-p0b-jay), edicoes em tests/calculo-reproduzivel.test.ts e tests/calculadora-persistencia-db.test.ts.
- NAO executado: nada (modulos do Jay nao existem neste worktree; sem Docker/Supabase). Nora roda na versao integrada: `pnpm exec vitest run tests/estimativa-financeira.test.ts tests/fio-b-hipotese.test.ts tests/calculo-reproduzivel.test.ts`. A suite `calculadora-persistencia-db` exige Supabase local (nao rodada).

## Asserções alteradas (mudança de requisito aprovada pelo Evandro; nenhuma outra afrouxada)
tests/calculo-reproduzivel.test.ts (import de MENSAGEM_ESTIMATIVA_INCOMPLETA adicionado):
1. "consumo estimado por fatura / tarifa: 1000 / 0,90 grava 1111,11" — antes: consumo_medio_kwh 1111,11 derivado. Depois: `linhaDeCalculo` devolve exatamente `{ok:false, incompleta:true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA}` e sem `linha`. Motivo: nao deriva consumo de fatura/tarifa base.
2. "fatura 1000 com tarifa 0,95231: consumo 1050,09 ..." — antes: consumo null, derivado 1050,09. Depois: consumo INFORMADO 1050,09; mantidas as asserções de tarifa 0,9523, fatura 1000, consumo 1050,09, oraculo e reproducao.
3. "fatura com casas excedentes..." (1000,005 / tarifa 0,5) — antes: consumo null, derivado 2000,02. Depois: consumo informado 1500; fatura gravada 1000,01 mantida; consumo 1500 (nao derivado).
4. "fatura 999,995 -> 1000..." (tarifa 0,7) — antes: derivado 1428,57. Depois: consumo informado 1300; fatura 1000 mantida; consumo 1300.
5. Novo it.each (fatura 1000/0,95231; 1000,005/0,5; 999,995/0,7 sem kWh) => incompleta (preserva os cenarios antigos como incompleta).
6. "fatura 0,004 com tarifa 1 ... devolve o erro de consumo" — antes: ERRO_CONSUMO. Depois: `{ok:false, incompleta:true, mensagem: MENSAGEM_ESTIMATIVA_INCOMPLETA}` e mensagem != ERRO_CONSUMO.
7. Novo: com consumo null + fatura, potencia/tarifa/preco invalidos ainda dao ERRO_POTENCIA/ERRO_TARIFA/ERRO_PRECO (incompleta so com entrada valida). Assume a ordem do codigo do Jay (checagem de incompleta apos preco).
Nao alterados: "sem consumo nem fatura" (ERRO_ENTRADA), erros de consumo informado 0/0,004, ordem dos erros, "consumo informado vence a fatura".

tests/calculadora-persistencia-db.test.ts (nao rodado; so os CASOS com consumo null):
- "tarifa 0,95 e fatura 1055,55 (consumo 1111,11)": consumo null -> 1111,11 informado; expectativas (consumoGravado 1111,11, contaSemSolarGravada 1055,55) iguais.
- "fatura 1000 e tarifa 0,90 (consumo 1111,11)": consumo null -> 1111,11; expectativas iguais.
- "fatura 1000 e tarifa 0,95231 (consumo 1050,09)": consumo null -> 1050,09; expectativas iguais.
- "potência 5,505, preço 20000,005 e fatura 1000,005 com tarifa 0,5": consumo null -> 2000,02; expectativas iguais.
Motivo: com consumo null o `linhaDeCalculo` agora devolve incompleta e o teste lancaria erro. Usar o mesmo consumo antes derivado preserva todos os valores esperados.
Pendente: outros trechos do db test que usem consumo null nao foram varridos alem do grep (Nora ve ao rodar com Docker).

## M2-Q3 (conta sem solar com piso; worktree R:/wt-m2-p0-int, sem commit)
Arquivo: tests/fio-b-hipotese.test.ts. Regra: sem solar = max(C,D)*T; economia = arred2(arred2(sem) - arred2(com)); paybackDisponivel = economia > 0 (HIPOTESE B1, valores ficticios).
Ajustes de asserção (unico caso com C < D): "consumo < custo de disponibilidade" — contaSemSolar 20 -> 30 (D*T); acrescentei economia 0 e paybackDisponivel false. Comentario de cabecalho atualizado. Varredura (economia >= 0, conta com solar >= piso) NAO mudou e passa.
Acrescentados (derivados a mao em comentario): C<D / C=D com E=0 e E=100; C>D com E=0 e E=50; C<=D com qualquer geracao (grade); limites de K (0 se C<=D; K=E; K=C; limitado pelo piso; ponto exato K=(C-D)T/(T-N) com T=1, N=0,5, D=20, C=30: E=19/20/21; C=D*T/N); autoconsumo deslocando C e E (2 casos); arredondamento (reais diferem 0,004 mas ambas 20,00; reais diferem 0,008 mas exibidos 1,00/1,00 => economia 0; exibidos 1,01/1,00 => 0,01 e payback true); varredura sem>=com, sem>=piso, economia = sem-com exibidos, payback <=> economia>0; determinismo.
Resultados: fio-b-hipotese 80/80 passou; estimativa-financeira + calculo-reproduzivel 153/153 passou (config .aurora/tmp/vitest.puro.config.mts). Mutacao (copia em .aurora/tmp/mut, config vitest.mutante.config.mts, sem solar = C*T): 7 testes falharam (incluindo a varredura antiga), 73 passaram.
Nao rodado: typecheck, lint, banco, build, suites *-db. Dados ficticios; nada validado oficialmente (pendente de aprovacao do Evandro).

## M2-Q5 (vigencia do calculo; worktree R:/wt-m2-p0-int, branch aurora/m2-p0-integracao, sem commit)
Arquivos: tests/calculo-vigencia.test.ts (novo, puro), tests/propostas-pdf-dados.test.ts (so acrescentado), tests/calculo-vigencia-db.test.ts (novo), tests/contrato-db.test.ts (conserto de fixture), e2e/10-calculo-estados.spec.ts (novo).
- Esperados derivados a mao em comentario nos arquivos (10 x 550 W = 5,5 kWp; 11 x 550 = 6,05; escala 2 casas: 5,504 e 5,495 -> 5,5; 5,505 -> 5,51; 5,494 -> 5,49). Economia zero (e2e c): consumo 30 kWh, tarifa 1, kit 5,5 kWp => faturado 30, compensado 0, sem=com=30, economia 0, payback null (motor real, sem fixture).
- contrato-db.test.ts: o helper negocio() criava modulo sem potencia_w e o calculo fictício tinha 5 kWp; com a nova regra o contrato recusava ("Em dia: gera" falhava). Fixture coerente: potencia_w 550 (10 x 550 = 5,5 kWp) e kit_potencia_kwp 5,5 (kit_nome "Kit 5,5 kWp"). Nenhuma assertion alterada.
- Resultados: vitest puro (calculo-vigencia + propostas-pdf-dados) 24/24; rodar-db.sh calculo-vigencia-db 15/15; contrato-db + calculo-vigencia-db 26/26; travas-kit-sdr-db passou (contrato-db antes do conserto: 1 falha pela fixture). e2e 10-calculo-estados: 5 passaram, 1 falhou de proposito (d3, defeito abaixo).
- Mutacao (copia em .aurora/tmp/mut, config vitest.mutante.config.mts, calculoDesatualizado sempre false): 5 de 18 testes de calculo-vigencia falharam. Mutacao nas suites -db: script preparado (rodar-db-mut.sh) mas a execucao exigiu aprovacao e NAO rodou. Sem mutacao no e2e e no pdf-dados.
- Defeito (d3): pagina publica /proposta/[token] de cálculo desatualizado esconde "Potência", mas o campo "Kit" mostra kit_nome antigo ("Kit personalizado · 5,5 kWp (...)": nomeKitPersonalizado grava a potencia no nome) com o kit ja em 6,05 kWp. Reproducao: e2e (d3). Origem: src/app/proposta/[token]/page.tsx (kit_nome sempre exibido).
- Observacao: ao salvar sem consumo com cálculo existente, o formulario fecha e a mensagem "O cálculo anterior foi mantido..." nao fica visivel (o Mensagem fica no formulario desmontado); o aviso efetivo e o alerta "Último cálculo — desatualizado". Nao testado como mensagem na tela. Salvar sem consumo E sem fatura recusa ("Informe o consumo médio ou o valor médio da fatura. Nada foi alterado.") — a fixture (d) mantem fatura R$ 450.
- Nao rodado: typecheck, lint, build, suite completa.
- Proximo passo: Nora decide o defeito d3 (Kevin) e roda a validacao integrada.

## M2-Q6 (motor novo e versao integrada; worktree R:/wt-m2-p0-int, sem commit) - RETOMADA
Estado: puros, suites -db e e2e FEITOS. e2e: 06 (3), 07 (2), 08-kit-quantidades (3), 09 (1), 10 (6) = 15/15; e2e completo 62/62. eslint tests e2e sem erros; typecheck ok. Proximo passo: Nora integra/valida; nenhum commit.
e2e trocas: 06 (consumo/economia da linha -> consumo no negocio, sem linha; ida e volta com fixture legada), 09 ("atualizar leva preco" -> sem aviso/sem botao de atualizar, contrato liberado, proposta bloqueada), 10 reescrito (a,b,c,c2,d,d2). Achado: ver relatorio (Atualizar preco nunca aparece para legado: bloqueioPreco/preco-bloqueado sao codigo morto; CRLF no worktree).
Resultados reais ate aqui (banco descartavel aurora-m2-q1): typecheck ok; vitest puro dos 8 arquivos (calculadora, calculo-preco, calculo-reproduzivel, calculo-vigencia, estimativa-financeira, propostas-pdf-dados, emissao-preservada, fio-b-hipotese) 375/375; calculadora-persistencia-db 96/96; negocios-gravacao-db 24/24; calculo-vigencia-db 19/19; contrato-db 11/11; calculadora-db 6/6; negocios-acoes-db 11/11; proposta-db 6/6; travas-kit-sdr-db 28/28; vitest completo (config oficial, rodar-db.sh sem args) 94/95 arquivos, 2032/2034 antes do ajuste de CRLF; negocios-gravacao.test.ts depois do ajuste 31/31.
Trocas de teste (antes / depois / motivo):
- negocios-gravacao-db: "Kit e cálculo salvos." + linha criada -> "Itens do kit salvos. <pendencias>" + nenhuma linha + consumo/fatura no negocio; "sem tarifa com cálculo recusa" -> sem tarifa salva (nao recusa mais); "cálculo recusado pelo banco restaura o kit" -> tarifa 100000 nao recusa, linha legada intocada (caminho de upsert nao ocorre mais; restauracao por falha ao apagar segue coberta); "atualizar leva preço e payback" -> recusa MENSAGEM_PRECO_CALCULO_LEGADO, linha intocada; linhas de calculo, onde necessarias, inseridas como fixture legada (o banco exige o kit antes). Novo: criar com incompleta sem aviso de falha.
- calculo-vigencia-db: proposta "gera com kit vigente" -> recusa (legado) mesmo com kit vigente/restaurado; "sem cálculo" -> mensagem de estimativa incompleta; "limitação conhecida" -> recusa igual; contrato continua gerando com legado, preço divergente nao bloqueia, kit/consumo/produtividade bloqueiam, Fio B ignorado; preço: sempre MENSAGEM_PRECO_CALCULO_LEGADO. Fixture coerente (nome do kit, consumo 500 no negocio, parametros reais 120/0,6/50).
- contrato-db: "preço diferente bloqueia até atualizar" -> preço divergente com legado gera (valor atual do negocio no contrato); kit alterado bloqueia.
- negocios-acoes-db: "Kit e cálculo salvos." -> incompleta; linha de calculo inexistente (maybeSingle null).
- travas-kit-sdr-db: helper negocioComCalculo insere linha legada (com criado_por) porque criar nao gera linha; "restauração após falha no cálculo" -> tarifa fora do limite nao recusa; "recálculo pelo app" -> app nao recalcula (tarifa fica 0,95).
- calculadora-persistencia-db: escala das colunas conferida com linha legada inserida; "reproduz pelo motor" -> motor devolve incompleta e nao altera a linha; tipo Caso.consumo number (typecheck).
- negocios-gravacao.test.ts (pure, fora da lista): leitura de fonte normaliza CRLF (worktree Windows tem src com CRLF; 2 testes de recorte falhavam por isso, nao pela mudanca).

## Duvidas / premissas
fio-b-hipotese (assinatura lida do codigo do Jay): N entra pronto (`custoEnergiaCompensadaRsKwh`); T=0 e erro; energias arredondadas a 2 casas (K=85,37, nao-compensada 9,63 assertados exatos); N==T com C<=D e erro (validacao T>N precede a formula).
estimativa-financeira:
1. Ordem estavel: assumi a ordem da lista do contrato; confere com o codigo lido.
2. Pendencias isoladas assertam lista EXATA.
3. `enquadramento_ausente` nao vem com `percentual_legal_indisponivel` no codigo do Jay; nao assertado.
4. Strings so com espacos tratadas como vazias.
5. `parametrosFioB: null` assertado so contendo `fio_b_ausente` (o codigo tambem emite distribuidora_ausente e base_tributaria_divergente).
- Proximo passo: Nora executa na versao integrada e devolve falhas.

## M2-Q4 (tests/negocios-gravacao-db.test.ts)
- Teste "itens sem tarifa..." passou a informar consumoMedioKwh "315,79" (300/0,95 = 315,789 -> 315,79); expectativas inalteradas (tarifa 0.95, fatura 300, kWp 5.5).
- Novo teste: conta em R$ sem kWh. Sem calculo previo: ok, mensagem "Itens do kit salvos. <MENSAGEM_ESTIMATIVA_INCOMPLETA>", 2 itens, calculo null. Com calculo previo: kit trocado por outro, mensagem + "O cálculo anterior foi mantido e pode estar desatualizado.", linha de calculos_solares igual campo a campo.
- Resultados (rodar-db.sh, banco descartavel): negocios-gravacao-db 23/23; negocios-acoes-db 11/11. Grep em *-db: nenhum outro uso de consumo vazio + fatura.
- Nao rodado: typecheck, lint, build, suite completa, mutacao.
