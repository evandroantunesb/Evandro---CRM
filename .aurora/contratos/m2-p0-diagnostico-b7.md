# Diagnóstico M2-B7 — motor real, propostas emitidas e vigência (Jay, somente leitura)

Estado: diagnóstico. Nenhum código editado, nada rodado (sem typecheck/lint/teste/banco/build). Base: worktree `R:/wt-m2-p0-int`, branch `aurora/m2-p0-integracao`, sem commit. Leitura do estado anterior às edições parciais de B6 em `R:/wt-m2-p0-lf`.

Resumo em 6 linhas:
1. O motor real é `calcular` (`calculadora.ts:42`) e ainda é a cobrança antiga: sem solar = C×T sem piso (l.55) e Fio B = kWh compensado × tarifa cheia × percentual (l.54, l.56). O arredondamento aprovado (l.57-62) está só na aritmética final.
2. Hoje NENHUM dado exigido pela estimativa nova existe no app: enquadramento, distribuidora estruturada, Fio B (R$/kWh) com origem e vigência, base tributária. Então `avaliarCompletude` (`estimativa-financeira.ts:83`) devolveria "incompleta" para 100% dos negócios. Isso é o comportamento honesto até o Evandro validar fórmula e dados.
3. `calculos_solares` tem 6 colunas financeiras NOT NULL (e consumo/tarifa/percentual NOT NULL). Estimativa incompleta NÃO pode ser gravada sem migration (nem com zeros: ausência nunca vira zero). Sem migration: incompleto = nenhuma linha gravada.
4. Proposta emitida não preserva nada do cálculo: `propostas` guarda só token, modo de preço, mensagem, modelo e blocos; página pública e PDF leem `calculos_solares`, `kit_componentes` e `contatos` ao vivo; nenhum PDF é armazenado. A data do cálculo não prova o que o cliente viu. Sem snapshot (migration), a única postura honesta é declarar indisponibilidade.
5. Vigência: potência, preço, produtividade/disponibilidade e consumo têm fonte atual. Tarifa e tipo de ligação NÃO têm: só existem dentro do próprio cálculo. Comparar o cálculo com ele mesmo não prova nada.
6. Das minhas edições parciais, vale manter o arredondamento, o esqueleto de `calculo-vigencia.ts` e as guardas; os chamadores ficaram na assinatura antiga (B5) e o contrato `arredondamento-economia.md` afirma mais do que a aprovação cobre.

---

## A) Mapa do motor real (arquivo:linha)

| Função | Onde | O que usa de `calcular` |
| --- | --- | --- |
| `calcular` | `src/lib/calculadora.ts:42` | É o motor. Entrada `EntradaCalculo` (l.5), saída `ResultadoCalculo` (l.16). |
| `linhaDeCalculo` (monta a linha de `calculos_solares`) | `src/lib/calculo-reproduzivel.ts:79`; chama `calcular` em `:103` | Usa TODOS os campos do resultado (geração, kwhFaturado, kwhCompensado, custoFioB, contas, economia, payback) e grava em `:129-138`. Hoje já devolve `incompleta` só para conta em R$ sem kWh (`:95`). |
| `montarLinhaCalculo` | `src/lib/calculo-servidor.ts:14` (chama `linhaDeCalculo` em `:38`) | Lê `parametros_calculadora` e delega. Único ponto de servidor que monta a linha. |
| Prévia, criação de negócio | `src/app/(app)/negocios/novo/formulario.tsx:309` | Chama `calcular` direto no cliente (exige consumo kWh + tarifa + parâmetros). |
| Prévia, ficha | `src/app/(app)/negocios/[id]/kit-personalizado.tsx:224` | Idem. |
| Gravação, criação de negócio | `negocios-gravacao.ts:236` (`montarLinhaCalculo`), `:245-252` (insert) | `!montado.ok` (inclusive `incompleta`) vira aviso "calculo" (l.252): hoje um "incompleto" apareceria como falha. |
| Gravação, salvar kit | `negocios-gravacao.ts:397` (monta), `:406` (aceita `incompleta`), `:429-439` (upsert por `negocio_id`), `:466-472` (mensagem de incompleto), `:407-409` (sem tarifa e com cálculo salvo = recusa) | Mesmo caminho. |
| Atualizar preço | `negocios-gravacao.ts:486` | NÃO chama `calcular`: só `paybackComPreco` (`calculo-preco.ts:20`) sobre `economia_mensal` GRAVADA (l.507). Herda economia antiga. |
| Gerar proposta | `src/lib/acoes/propostas.ts:20`; vigência em `:28-31`; upsert em `:67-78` (`ignoreDuplicates: true`) | NÃO chama `calcular`; exige linha em `calculos_solares` (l.30). |
| Proposta pública | `src/app/proposta/[token]/page.tsx:31-37` (lê calc), `:115-144` (economia) | Lê `calculos_solares` ao vivo. |
| PDF | `src/app/proposta/[token]/pdf/route.ts:33-39` (lê calc), `:80` (`montarDadosSistemaProposta`), `:121-139` (PDF legado) | Ao vivo; renderers `src/lib/propostas/pdf.tsx` e `src/lib/pdf-proposta.tsx` esperam números não nulos (`pdf-tipos.ts:30-45`). |
| Dados do PDF | `src/lib/propostas/pdf-dados.ts:51` | Repassa colunas do cálculo. |
| Contrato | `src/lib/contratos-geracao.ts:25`; lê calc `:39-43` | Só usa kit, potência, ligação, consumo e GERAÇÃO (`contrato.ts:148-173`). NÃO usa economia/conta/payback. Preço: guarda `:56`; vigência `:61-65`. |
| Ficha | `src/app/(app)/negocios/[id]/page.tsx:99-104` (lê calc) e `:201-208` | Mostra economia/payback salvos. |
| Obras (SQL) | `obras_base.sql:251-262` (técnico) e `:277-301` (`obra_snapshot_comercial`: economia, payback, contas, tarifa, Fio B) | Copia a linha do cálculo para a obra na venda: valores antigos viram "snapshot" de obra. |
| `entradaDaLinha` | `calculo-reproduzivel.ts:157` | Só testes. |

Há ainda `apagarCalculo` (`acoes/calculadora.ts:44`), que apaga cálculo e kit, e `editarParametros` (l.112-143), que ainda deixa o admin editar `percentual_fio_b`.

## B) Caminho concreto de substituição

### B.1 O que entra já (aprovado) e o que fica bloqueado

| Item | Situação | Observação |
| --- | --- | --- |
| Geração = potência × produtividade; dimensionamento (`dimensionarSistema` `:156`, `sugerirQuantidadeModulos` `:184`) e montagem do kit | Mantém | Independem da fórmula financeira. Já funcionam sem tarifa. |
| Piso sem solar: `max(C, D) × T` no recorte B1 convencional | Aprovado | Hoje o código usa C×T (l.55). Só é aplicável com T (tarifa base) e D conhecidos E enquadramento B1 convencional declarado. |
| Arredondamento da economia (contas arredondadas, economia = diferença) | Aprovado | Já aplicado em l.57-62; vale só para quando houver economia calculada por regra validada. |
| Fórmula COM solar / art. 655-I e §2º | Bloqueado | Está só como hipótese em `fio-b-hipotese.ts`; sem validação. |
| N = TUSD Fio B × percentual legal (60% GD II 2026) | Bloqueado | O 60% está em `percentualLegalFioB` (`estimativa-financeira.ts:64`), mas TUSD Fio B depende de valor da distribuidora. |
| Valor da distribuidora (Copel, REH 3.592) | Bloqueado | NÃO validado. Não há tabela nem campo. |
| Tributos / base tributária de T e N | Bloqueado | `base_tributaria_divergente` já modelada, sem dado. |
| Enquadramento (classe, modalidade, GD, ano) | Bloqueado como dado | Não existe campo em lugar nenhum. A decisão P0 (`RECORTE_P0`) só diz qual é suportado. |
| `parametros_calculadora.percentual_fio_b` | Sai do cálculo novo | Não é o percentual legal nem o Fio B da distribuidora; manter só para linhas legadas. |

### B.2 Como `calcular` passa a responder

Proposta (em `calculadora.ts` + `estimativa-financeira.ts`):
- Substituir o retorno por união discriminada: `{ estado: "completa", ...campos atuais } | { estado: "incompleta", pendencias, geracaoEstimadaKwhMes, potenciaKwp }` (a união já existe em `EstimativaFinanceira`, `estimativa-financeira.ts:59-61`).
- A porta é `avaliarCompletude` (`:83`): ela já lista TODAS as pendências (enquadramento, distribuidora, tarifa base, consumo, consumo estimado só pela tarifa base, Fio B, origem, vigência, base tributária). Basta ampliar `EntradaEstimativa` com potência/produtividade para devolver a geração junto. Nada de fórmula nova.
- Ramo `completa`: fica vazio por enquanto (a fórmula só entra após aprovação). A cobrança antiga é REMOVIDA do caminho de produção (renomear para função só de teste, ou apagar depois que Kara migrar os testes). Nenhuma chamada de produção pode chegar nela.
- `contaSemSolar` com piso: só como campo opcional do estado incompleto (decisão 2 abaixo). Sozinha não permite economia nem payback.
- `fio-b-hipotese.ts` continua isolado: não importar em `calcular`. Serve de oráculo de teste da fórmula quando ela for validada.
- Efeito colateral: `ResultadoLinha` (`calculo-reproduzivel.ts:56`) passa a devolver `incompleta` em TODO caso até a fórmula entrar (hoje só no caso conta-em-R$); o tratamento no servidor já existe (`negocios-gravacao.ts:406`, `:466-472`).

### B.3 `calculos_solares`: exige cálculo completo?

Sim. NOT NULL em `consumo_medio_kwh`, `tarifa_kwh`, `produtividade...`, `percentual_fio_b`, `disponibilidade_kwh`, `geracao_estimada_kwh_mes`, `kwh_faturado`, `kwh_compensado`, `custo_fio_b`, `conta_sem_solar`, `conta_com_solar`, `economia_mensal` (`20260926000100_calculadora.sql:69-85`); só `payback_meses` e `valor_fatura_medio` são anuláveis.
- Sem migration: um cálculo incompleto não grava linha. Kit é salvo, aviso é devolvido (já é o fluxo de `salvarKitComCliente`). Quem já tem linha legada a mantém intocada (a mensagem já avisa).
- Com migration (desenho, NÃO criado): tornar anuláveis `kwh_faturado, kwh_compensado, custo_fio_b, conta_sem_solar, conta_com_solar, economia_mensal` (e, se for preciso gravar sem tarifa/consumo, também `tarifa_kwh`, `consumo_medio_kwh`, `percentual_fio_b`); novas colunas `estado_financeiro text not null default 'legado' check in ('legado','incompleto','completo')`, `metodo text`, `pendencias jsonb`; CHECK: `completo` exige todas as financeiras e `metodo`; `incompleto` exige financeiras nulas; backfill das linhas atuais = `legado`. Regenerar `database.types.ts` (`pnpm db:types`). Consumidores a revisar: `obra_snapshot_comercial` (nulos viram `null` no jsonb), `calculo-preco.ts`, `pdf-dados.ts`/`pdf-tipos.ts`, `kit-personalizado.tsx`.
- Vantagem da migration: grava a pendência, distingue legado de completo (hoje sem coluna de método NENHUMA linha distingue fórmula antiga de futura) e é pré-requisito do snapshot. Sem ela, enquanto a fórmula não estiver validada, todas as linhas existentes são legadas por definição; depois da validação, é obrigatória uma coluna `metodo`.

### B.4 Cada consumidor

| Consumidor | Hoje | Mudança mínima |
| --- | --- | --- |
| Prévia (novo negócio e ficha) | `calcular` direto, exige consumo + tarifa | Tratar a união: mostrar geração e as pendências em linguagem simples; nenhuma economia/payback. Kevin. |
| Ficha | Mostra economia/payback salvos | Linha sem método validado = rótulo "cálculo anterior (fórmula antiga, não validada)", recolhido como o "desatualizado" da B5 (o caminho de UI já existe: `kit-personalizado.tsx:257,284`). Kevin, mais motivo novo na vigência (Jay). |
| Criar negócio | `montado.ok === false` vira aviso "calculo" (`negocios-gravacao.ts:245-252`) | Diferenciar `incompleta` (informativo, sem falha) de erro real. Jay. |
| Salvar kit | Recusa se há linha e não vem tarifa (`:407-409`) | Com motor sem fórmula essa recusa não faz mais sentido: salvar o kit, manter a linha legada e marcá-la. Jay. |
| Proposta (`gerarLinkProposta`) | Exige linha de cálculo | Continua bloqueada para linha legada ("cálculo anterior não validado"). Sem linha: "Calcule o kit antes" passa a ser "estimativa financeira incompleta". Jay. |
| PDF/página pública | Lê linha | Ver C. |
| Contrato | Usa potência, consumo e geração | NÃO deve ser bloqueado pelo motivo "fórmula antiga": nenhum campo do contrato depende da fórmula financeira. Guarda por ação: contrato ignora `legado`. Sem linha de cálculo, potência e geração podem vir de `kit_componentes` + produtividade (hoje `camposSemDado` recusa se o modelo usa esses campos). Decisão de Nora/Evandro. |
| Atualizar preço | Reaproveita economia gravada | Recusar com linha legada (payback novo sobre economia não validada). Jay. |
| Obras | Copiam o cálculo na venda | Fora desta rodada; só registrar que os valores copiados são da fórmula antiga. |

### B.5 Preservar dimensionamento e kit

`dimensionarSistema` / `sugerirQuantidadeModulos` e o salvamento do kit não dependem de `calcular` nem de `calculos_solares`. Mudança: nenhuma. Cuidado único: `salvarKitComCliente` segue gravando itens antes de qualquer cálculo (`:411-427`).

## C) Propostas emitidas

### C.1 O que é persistido hoje na emissão

- `propostas` (`20260926030000_proposta.sql:9-23`): id, `empresa_id`, `negocio_id` (único), `token`, `modo_preco`, `mensagem`, autores, `created_at`, `updated_at`; + `mostrar_sistema`/`mostrar_economia` (`proposta_secoes.sql`) + `modelo_id`, `capa_variante`, `blocos_emitidos` (`propostas_modelo_emitido.sql:8-11`).
- `blocos_emitidos` é snapshot só do LAYOUT do modelo (tipo, ordem, quebra, config). NENHUM número de cálculo, nenhum preço, nenhum nome de componente.
- `propostas_aberturas`: registro de acessos.
- Storage: o único bucket de proposta é `proposta-marca` (logo/foto da identidade; `proposta_modelos.sql:136-169`). Nenhum PDF é armazenado: `renderToBuffer` roda a cada GET (`pdf/route.ts:95`, `:121`). Resultado: não há documento "já gerado" para preservar além do que está no banco.
- `ignoreDuplicates: true` (`propostas.ts:77`): reemitir não altera a linha, mas isso não congela o cálculo.
- Contrato é diferente: `contratos.conteudo` guarda o texto preenchido; fora de `rascunho` ele não muda mais (`contratos-geracao.ts:52-54`). Esse é o único documento comercial realmente preservado (contém potência, consumo e geração, não economia).

### C.2 O que a página pública e o PDF leem ao vivo

`calculos_solares` (kit, potência, preço, ligação, consumo, geração, contas, economia, payback), `kit_componentes` (lista e potência), `negocios`/`contatos` (nome, endereço), `proposta_identidades` (marca) e as colunas editáveis da própria `propostas` (`modo_preco`, `mensagem`, `mostrar_*`). Qualquer edição posterior do cálculo, do kit, do contato, do preço (`atualizarPrecoCalculo`) ou da exibição muda a proposta já enviada.

### C.3 Por que a data do cálculo não comprova

`propostas.created_at` vs `calculos_solares.updated_at` só cobre uma das ~8 fontes ao vivo acima (não cobre componentes, contato, modo de preço, mensagem, identidade), não registra qual fórmula gerou os números e depende de regravação via `upsert` não ter ocorrido. Não usar como prova (alinhado à diretriz).

### C.4 Comportamento mínimo honesto, SEM migration

- Nunca dizer "conjunto emitido" para proposta: não há conjunto preservado.
- Página pública e PDF, para qualquer proposta: não mostrar geração/conta/economia/payback de uma linha que não seja comprovadamente completa e validada (hoje: toda linha). Exibir: "Proposta emitida em <created_at>. Os valores de economia desta proposta não estão disponíveis nesta versão do sistema. Fale com o seu vendedor." Manter cliente e mensagem. Preço (`kit_preco`) também é ao vivo (muda por `atualizarPrecoCalculo`): decisão do Evandro (decisão 3).
- PDF: responder 409 (já é o padrão da B5, `pdf/route.ts:57-61`) com a mesma mensagem, em vez de gerar PDF com economia antiga.
- Gerar nova proposta: bloqueado enquanto o cálculo for legado ou incompleto (consequência de B.4). Propostas já emitidas continuam acessíveis pelo link, sem números.
- Contratos já fora de rascunho: preservados, sem mudança.

### C.5 Desenho do snapshot (futuro, separado, migration)

1. Tabela `propostas_emissoes(id, proposta_id → propostas, empresa_id, emitida_em, emitida_por, metodo, entrada jsonb, resultado jsonb, componentes jsonb, cliente jsonb, preco jsonb, modo_preco, mensagem, modelo jsonb)`; imutável (igual `eventos`: sem update/delete, RLS por `empresa_id`).
2. `entrada` = tudo que alimentou o cálculo (potência, consumo, tarifa, tipo ligação, enquadramento, Fio B com origem e vigência, parâmetros); `resultado` = o que o cliente viu; `metodo` identifica a fórmula validada.
3. `gerarLinkProposta` grava a emissão na mesma operação (RPC `security definer` ou duas instruções com checagem) e a página/PDF leem SÓ o snapshot da emissão vigente; reemitir = nova linha (nova versão), a anterior continua legível.
4. Backfill: nenhum. Propostas anteriores ao snapshot ficam "sem dados da emissão" para sempre (indisponibilidade).
5. Pré-requisito: método/estado do cálculo (B.3) e fórmula validada.

## D) Vigência: entradas que determinam cada resultado

| Resultado | Entradas que o determinam |
| --- | --- |
| Geração | potência do kit, produtividade da empresa |
| Conta sem solar | consumo kWh, tarifa T, custo de disponibilidade D (função do tipo de ligação), enquadramento |
| Conta com solar / economia | tudo acima + geração + N (Fio B da distribuidora × percentual legal) + base tributária + vigência do Fio B + regra do art. 655-I |
| Payback | economia + `kit_preco` |
| Contrato | kit (nome/itens), potência, consumo, geração, preço (valor do negócio) |

| Entrada | Fonte atual independente | Situação |
| --- | --- | --- |
| Potência / composição do kit | `kit_componentes` (kit personalizado) ou `kits_solares` (kit_id) | Tem fonte (B5/B6 já compara) |
| Preço do kit | `negocios.valor` | Tem fonte (`precoDoCalculoDesatualizado`) |
| Produtividade | `parametros_calculadora` | Tem fonte |
| Disponibilidade D | `parametros_calculadora` (pela ligação) | Tem fonte, mas depende do TIPO DE LIGAÇÃO, que não tem |
| Consumo kWh | `negocios.consumo_medio_kwh` | Tem fonte SE `salvarKitComCliente` gravar o consumo no negócio (hoje só grava `estrutura_telhado`, l.452-456: o formulário do kit grava no cálculo e o negócio fica velho, falso positivo conhecido da B5). Conta em R$: `negocios.valor_conta_energia`. `consumo_estimado_kwh`/`tarifa_efetiva_kwh` existem no schema e no types mas NENHUM código lê ou grava. |
| Tarifa T | NENHUMA. Existe só em `calculos_solares.tarifa_kwh`. `negocios.tarifa_efetiva_kwh` é outra coisa (estimar consumo) e também não é gravada. | SEM FONTE |
| Tipo de ligação | NENHUMA. `negocios.padrao_cliente` é texto livre (60 caracteres). `obras.tipo_ligacao` nasce do próprio cálculo | SEM FONTE |
| Fio B / distribuidora / vigência | NENHUMA (sem tabela; `qualif_distribuidora` é texto livre) | SEM FONTE |
| Enquadramento | NENHUMA | SEM FONTE |
| Percentual do Fio B legal | Constante em código (60%, GD II 2026) | Sem fonte externa; depende de confirmação |

Consequência prática se "sem fonte" virar "não comprovado": tarifa e ligação são entradas do vendedor sem espelho, logo TODO cálculo ficaria `nao_comprovado` para sempre e bloquearia proposta com economia, atualizar preço e contrato. Só destrava com fonte nova (campos no negócio ou tabela de tarifas por distribuidora com vigência: migration). Sugestão: retornar na vigência uma lista `naoVerificavel: ["tarifa", "tipo_ligacao", ...]` separada de `vigente`; a UI diz "conferido: kit, preço, consumo, parâmetros; não conferido: tarifa e ligação (informadas pelo vendedor em DD/MM)"; nunca o rótulo "atualizado" sem ressalva. Bloquear ou não é decisão do Evandro (decisão 7). Comparar `calculos_solares.tipo_ligacao` com `calculos_solares.tipo_ligacao` (ou D com D do mesmo cálculo) não vale como comprovação.

## E) Avaliação das minhas edições parciais (B6)

| Arquivo | Veredicto |
| --- | --- |
| `calculadora.ts` (arredondamento nas contas arredondadas, l.57-72) | Manter a aritmética aprovada; ela será reaproveitada no ramo completo. Refazer o resto: retorno em união + remover a cobrança antiga (B.2). |
| `calculo-vigencia.ts` (B6, estado amplo) | Manter esqueleto (`avaliarVigencia`, `carregarVigencia`, motivos, kit/catálogo, preço, parâmetros). Refazer: (a) todos os chamadores ficaram na assinatura B5 (`calculoDesatualizado(calculo, {componentes})` em `page.tsx:206`, `proposta/[token]/page.tsx:52`, `pdf/route.ts:52`) e não compilam com o tipo novo; (b) retornar `naoVerificavel` explícito (D); (c) novo motivo `formula_antiga`/legado enquanto não houver método; (d) guarda por ação (contrato ignora `legado`); (e) consumo só compara se o salvamento do kit gravar no negócio. Descartar: o cabeçalho que sugere "todos os dados comparados". |
| `acoes/propostas.ts` (`carregarVigencia` + guarda) | Manter a estrutura (uma leitura, falha = não vigente). Ajustar o motivo (legado/incompleto) e o texto. |
| `contratos-geracao.ts` (guarda de vigência) | Manter; restringir aos motivos que afetam o contrato (kit, preço, produtividade, consumo), sem `legado`. |
| `negocios-gravacao.ts` (`atualizarPrecoCalculoComCliente` com vigência; `incompleta` no kit) | Manter; ajustar `criarNegocio` (aviso) e a recusa de l.407-409; gravar consumo/fatura no negócio se a comparação for mantida. |
| `fio-b-hipotese.ts` | Manter como está, isolado. Não ligar a nada. |
| `.aurora/contratos/m2-p0-arredondamento-economia.md` | Corrigir: a tabela diz que o motor real "aplicado" e que prévia/gravação/proposta "herdam"; isso soa como validação. Reescrever: a aprovação cobre só arredondamento; a fórmula e a cobrança antiga NÃO estão aprovadas. |

## F) Solução mínima proposta e bloqueios reais

Arquivos por agente (sem migration):
- Jay: `src/lib/calculadora.ts`, `src/lib/estimativa-financeira.ts`, `src/lib/calculo-reproduzivel.ts`, `src/lib/calculo-servidor.ts`, `src/lib/negocios-gravacao.ts`, `src/lib/calculo-vigencia.ts`, `src/lib/acoes/propostas.ts`, `src/lib/contratos-geracao.ts`, `src/lib/propostas/pdf-dados.ts`, `src/lib/propostas/pdf-tipos.ts` (campos anuláveis), `.aurora/contratos/m2-p0-arredondamento-economia.md`, `.aurora/contratos/m2-p0-calculo-vigencia.md` e um contrato novo do motor.
- Kevin: `negocios/novo/formulario.tsx`, `negocios/[id]/kit-personalizado.tsx`, `negocios/[id]/page.tsx`, `proposta.tsx`, `contrato.tsx`, `proposta/[token]/page.tsx`, `proposta/[token]/pdf/route.ts`, `src/lib/propostas/pdf.tsx`, `src/lib/pdf-proposta.tsx` (tolerar nulos / mensagem de indisponibilidade).
- Kara: `tests/calculadora.test.ts`, `tests/calculo-reproduzivel.test.ts`, `tests/calculadora-persistencia-db.test.ts`, `tests/calculo-vigencia*.test.ts`, `tests/propostas-pdf-dados.test.ts`, `tests/negocios-gravacao-db.test.ts`, `tests/contrato-db.test.ts`, `tests/estimativa-financeira.test.ts`, `e2e/10-calculo-estados.spec.ts`. A cobrança antiga some dos testes; entra "sempre incompleta com estes dados".

Ordem: (1) Jay contrato do motor + `calcular`/`avaliarCompletude` (união); (2) Jay vigência com `naoVerificavel` + motivo legado; (3) Kevin telas e página/PDF públicos; (4) Kara testes.

Bloqueios reais (só o Evandro, ou só migration):
1. Enquadramento: assumir B1 convencional GD II 2026 como premissa fixa e rotulada, ou campo informado por negócio (campo = migration)?
2. Exibir `contaSemSolar` com piso (aprovada) sozinha no estado incompleto, ou nada financeiro até a fórmula completa?
3. Propostas já enviadas: ocultar números (recomendado, sem snapshot nada prova o que o cliente viu) e decidir se o preço continua visível; confirmar que o link continua válido sem números.
4. Permitir emitir proposta sem estimativa financeira (kit + preço), ou bloquear emissão até haver cálculo completo?
5. Aprovar migration: colunas anuláveis + `estado_financeiro`/`metodo`/`pendencias` e, depois, `propostas_emissoes` (snapshot). Sem isso: incompleto não grava linha e nada distingue legado de completo.
6. Dados e validação: valor da distribuidora (Copel NÃO validada), TUSD Fio B, base tributária (tributos), texto oficial do art. 655-I/§2º, confirmação do 60% legal, fonte de tarifa e de tipo de ligação.
7. Vigência com "sem fonte": rotular sem bloquear (recomendado) ou bloquear tudo até existir fonte.
8. Linhas legadas em `calculos_solares` e cópias em obras: rotular como "fórmula antiga, não validada" (sem reprocessar), ou outra política.
9. Contrato sem linha de cálculo: ler potência e geração de `kit_componentes` + produtividade, ou continuar exigindo a linha.
