# Emissão preservada da proposta simples — pacote para revisão e sequência de implantação (M2 P0, Nora, 22/10/2026, 5ª rodada)

Estado: **implementado, com três revisões Opus, e testado em banco local descartável. Ainda NÃO validado oficialmente. Sem commit, push, PR, merge nem produção.**
- As migrations foram aplicadas só no stack descartável `aurora-emissao` deste notebook (127.0.0.1), parado ao fim da rodada.
- Diff: `.aurora/revisao/m2-p0-emissao-preservada.patch`. Os arquivos e o SHA-256 estão no checkpoint (`.aurora/checkpoints/m2-p0-fio-b-nora.md`). A base é a árvore da integração (42 arquivos), `a217261c…` em `.aurora/revisao/.base-tree`.
- Material visual:
  - PDFs em `.aurora/revisao/pdfs/`.
  - Páginas em `.aurora/revisao/pdfs/imagens/`.
  - Referência IBS renderizada em `.aurora/revisao/referencia/`.
  - Comparações lado a lado em `.aurora/revisao/comparacao/`.
- Roteiro da validação oficial: `.aurora/revisao/VALIDACAO-OFICIAL.md`.

## 1. Decisões do Evandro e recomendações dele ainda sem aceite funcional
| # | Decisão | Como ficou |
| --- | --- | --- |
| 1 | Proposta simples provisória, até 3 páginas, sem economia nem payback | O modelo próprio é fixo em código. Ele não altera os modelos publicados e só lê do modelo padrão os blocos de conteúdo (incluso, exclusos, garantias, etapas e condições). |
| 2 | Migration aditiva, snapshot, PDF em bucket privado, link e arquivo por versão | `propostas_emissoes` imutável + bucket privado `propostas-emitidas`. |
| 3 | Rodapé ajustado, sem GD II nem Fio B no PDF | Texto aprovado, palavra por palavra, quando a proposta tem geração. Ver também a variante sem geração, abaixo. |
| 4 | Validade informada pelo vendedor; condições vindas do modelo, ajustáveis e congeladas | A validade é obrigatória e não tem padrão. As condições ficam congeladas nos `dados` da versão. |
| 5 | Propostas antigas | O sistema nunca gravou PDF antigo. O link antigo continua **indisponível** (página com aviso e "Solicitar uma nova proposta"; PDF responde 409) até terminar a consulta de anexos em produção, que é do Evandro. |
| 2ª | Sem texto padrão de "Incluso" e "Garantias" | Só entram itens que a empresa escreveu no modelo padrão publicado. Sem conteúdo, o bloco é omitido. O renderizador não tem texto padrão (há teste). |

**Recomendações do Evandro (4ª e 5ª rodadas), implementadas como proposta. Ele recomenda aceitar os quatro pontos abaixo, mas isso NÃO é o aceite funcional: ele ainda precisa dar o aceite explícito (item 8 da seção 7):**
1. Negócio com emissão só pode ser arquivado, não apagado (inalterado, FK `negocio_id` NO ACTION).
2. A geração só aparece com **valor, fonte e responsável pela validação** informados (seção 2).
3. Rodapé alternativo sem geração: "Esta proposta apresenta o sistema. Não inclui estimativa de geração, economia ou prazo de retorno." (redação minha; o Evandro só indicou o uso de um rodapé alternativo, então a redação precisa de aceite). O rodapé aprovado continua sendo usado quando a proposta tem geração. O formato dos dados exige que o rodapé acompanhe a geração; combinação trocada é recusada na leitura.
4. Manrope e Inter embutidas no PDF (seção 4).

**Exigências novas da 5ª rodada (todas com teste):**
- **Condição de pagamento obrigatória.** A proposta só é congelada com as condições de pagamento confirmadas: vazia, só espaços ou só marcadores recusam a emissão com orientação. O campo do formulário é obrigatório, uma opção por linha.
- **Logo configurado que não carrega recusa a emissão.** O logo é lido do bucket na hora de emitir. Arquivo ausente, vazio, erro de leitura ou formato que o PDF não entende (só PNG e JPEG, conferidos pelo conteúdo do arquivo) = nada é emitido. Sem logo configurado, a proposta usa o nome da empresa.
- **Foto da capa ausente ou que falha usa um fallback definido:** fundo sólido na cor da identidade da empresa, com a faixa lateral e a barra de destaque (caso B das páginas de revisão). O PDF segue com 3 páginas, testado.
- **Imagem só da própria empresa.** O caminho do arquivo precisa estar na pasta `<empresa_id>/` sem subir de diretório, e o download usa o acesso do usuário que emite. Um admin que apontasse o logo para o arquivo de outra empresa recusaria a emissão (o arquivo nem é lido).
- **Estado da geração conferido no clique.** O formulário envia o que o vendedor viu (com ou sem geração), e a emissão é recusada se a confirmação da produtividade mudou nesse intervalo.

## 2. Origem dos números e condição para mostrar a geração
- **Potência (kWp):** soma dos módulos do kit emitido (quantidade × potência_w ÷ 1000, 2 casas), pela mesma função do motor (`potenciaKitPersonalizadoKwp`). Os módulos listados no PDF são exatamente os que compõem o número.
- **Geração (kWh/mês):** potência × `parametros_calculadora.produtividade_kwh_kwp_mes` da empresa (2 casas). Só entra se o **admin da empresa confirmou o valor atual**. A confirmação é feita pela RPC `confirmar_produtividade_calculadora(empresa, valor, fonte, responsável)`, em Configurações › Calculadora:
  - **Valor:** tem que ser igual ao valor atual do parâmetro. Se ele mudou enquanto o admin preenchia, a confirmação é recusada.
  - **Fonte:** de 10 a 120 caracteres, de onde o valor vem (estudo de irradiação, relatório de geração real…).
  - **Responsável pela validação:** de 3 a 60 caracteres, quem calibrou o valor.
  - Vale enquanto `produtividade_confirmada_valor` for igual ao valor atual. Mudar a produtividade apaga a confirmação, por gatilho, e voltar ao valor antigo não a restaura.
  - Ninguém grava os campos de confirmação diretamente, nem a service role.
  - Toda empresa começa **sem** confirmação.
  - **Sem confirmação, a geração não é emitida:** `dados.sistema.geracao = null`, o PDF e a página mostram o consumo informado no lugar, e o rodapé é o alternativo.
  - Com confirmação, valor, fonte, responsável e data ficam congelados nos dados da versão, e a página 2 do PDF traz a premissa: "Geração estimada = potência do kit (X kWp, soma dos módulos listados) × produtividade média de Y kWh por kWp ao mês, valor confirmado pela empresa em DD/MM/AAAA (fonte: …; responsável pela validação: …). Estimativa comercial, sem simulação de engenharia…".
- **O padrão de 120 kWh/kWp/mês NÃO está aprovado para proposta real.** O sistema nunca o usa automaticamente: o valor só aparece se um admin o confirmar por escrito com fonte e responsável. Quem define se o valor serve para cliente real é o Evandro (dado técnico); a confirmação em si é uma **proposta minha para o aceite dele**.
- **Consumo e preço:** vêm do negócio. **Tipo de ligação:** omitido, por não ter fonte comprovável. `calculos_solares` (legado) não é lido.

## 3. Preço sem recálculo
O preço é `negocios.valor` no momento da emissão e fica congelado nos `dados`. Ele não passa por `calculos_solares`, pela vigência nem pela estimativa financeira. Não há impedimento restante.

## 4. Comparação visual com a referência IBS
O HTML recebido (`R:\modelo_proposta_ibs\proposta-solar-ibs.html`) tem SHA-256 `8019c9e1…2878596`, conferido e igual ao informado. Os três casos renderizados têm 3 páginas cada:
- **a-completa:** logo, cores e foto da empresa de exemplo configurados, conteúdo escrito pela empresa, geração confirmada e três opções de pagamento.
- **b-sem-conteúdo:** logo configurado, **foto de capa ausente (fallback)**, sem conteúdo da empresa, sem geração confirmada e com uma única condição de pagamento.
- **c-pior-caso:** todos os limites no máximo, inclusive fonte e responsável da confirmação.

**Logo e identidade:** o caso "a" usa o logo e a paleta (azul-petróleo e âmbar) configurados para uma empresa **fictícia** ("Solar Exemplo Energia"). O logo é um desenho de teste, e a foto da capa é um gradiente de amostra (não há foto real). No produto, logo, cores e foto vêm da identidade da empresa em Configurações › Propostas; com logo, o nome da empresa não é repetido ao lado dele.

**Página final e condições de pagamento:** o texto de condições do vendedor, que vem do modelo e pode ser ajustado antes de emitir, é escrito **uma opção por linha**, e cada linha vira um item de lista na página 3 (no caso "a": Pix ou transferência, financiamento bancário e cartão em até 12x). Texto de uma linha só vira parágrafo. As opções vêm só do que a empresa escreveu: o sistema não copia a mesa de financiamento fictícia do HTML IBS, não inventa parcelas e não tem texto padrão. A condição de pagamento é obrigatória (seção 1): sem ela a proposta não é emitida.

**Fontes:** Manrope (títulos) e Inter (textos), embutidas no PDF em formato WOFF/base64 (`src/lib/propostas/fontes-pdf.ts`; ambas sob a licença SIL OFL 1.1, distribuídas pelo pacote `@fontsource`). Nada é buscado na rede ao gerar. O arquivo tem cerca de 130 KB.

| Página | Igual à referência | Diferente (intencional) | Pendente |
| --- | --- | --- | --- |
| 1 Capa | Foto em tela cheia, faixa lateral, logo no canto, selo "Proposta comercial · Energia solar", cliente, endereço, 3 cards e caixa de número, emissão e validade | Cards de potência, geração e solução no lugar de economia e "tempo para se pagar" | Foto real da empresa (a amostra é gradiente) |
| 2 Sistema | Cabeçalho com selo, "Seu sistema solar em números simples" em 4 cards, lista de equipamentos com quantidade | Sem o card "Conta de energia: antes e depois". Consumo no lugar de "espaço no telhado" e "tipo de ligação". Premissa da geração com fonte e responsável. | Selo de garantia por equipamento (só existiria com dado confirmado) |
| 3 Oferta | Incluso e não incluso em duas colunas, garantias, investimento em destaque, condições de pagamento, 4 passos, CTA com WhatsApp e validade | Sem a mesa de financiamento nem parcelas. O rodapé fica nesta página. | — |
| Geral | Paleta escura derivada da identidade, cards com borda, Manrope nos títulos e Inter nos textos | — | — |

**Textos de inclusões, garantias e etapas:** nos PDFs de revisão, eles são **amostra da empresa fictícia**, escrita no modelo padrão de teste. Não vêm do renderizador nem do HTML IBS. Os textos reais da IBS (por exemplo "Engenharia própria e aprovação na Copel: Projeto, ART e troca do relógio") precisam ser cadastrados e publicados pela empresa no modelo padrão para entrar na proposta. Precisam de conferência do Evandro antes do primeiro uso real.

**Limites do layout:** o pior caso dentro dos limites cabe em 3 páginas, mas com folga pequena na página 3. A fonte nova é um pouco mais larga que a Helvetica, e por isso o espaçamento dos cartões foi reduzido. Aumentar algum limite de texto exige revisar o pior caso.

## 5. Validação desta rodada (notebook; NÃO é a validação oficial)
Ambiente: stack descartável `aurora-emissao` (127.0.0.1), Node 22.23.4 e pnpm 10.33.0. Rodou com um `vitest.descartavel.tmp.mts` temporário, porque a trava do repositório recusa o Docker deste notebook (portas em 0.0.0.0). A trava não foi afrouxada; a config temporária foi removida ao fim, e o `supabase/config.toml` do worktree não foi alterado nesta rodada.

| Etapa | Resultado |
| --- | --- |
| Migrations (87) em banco novo | aplicam sem erro |
| `database.types.ts` | regenerado do banco descartável |
| `pnpm typecheck` | ok |
| `pnpm lint` | 0 erros e 3 avisos preexistentes, em arquivos fora deste diff: `scripts/seed-metas-vendedores.mjs:115` (`_nome`) e `tests/stack-supabase-local.test.ts:195` (`_raiz`, `_opcoes`) |
| Suítes focais (5 arquivos, sequencial) | **82/82**: `proposta-simples`, `imagens-emissao`, `propostas-emissoes-db`, `propostas-emissoes-fluxo-db`, `produtividade-confirmada-db` |
| `pnpm build` | ok (exit 0, depois das últimas alterações da 5ª rodada) |
| Suíte completa | **não repetida no notebook** (ficou sem memória na rodada anterior). Fica para o outro computador. |
| e2e (`e2e/12-proposta-emitida.spec.ts`) | **nunca executado.** Fica para o outro computador. |

## 6. Revisões Opus
### 1ª revisão (SQL, RLS e fluxo público)
Todos os achados foram corrigidos e cobertos por teste: token, versão e datas escolhidos pela API; política de INSERT com `empresa_id` sem qualificar; falta da trava de negócio arquivado; imutabilidade contornável pela cascata do negócio; pior caso de tamanho do conteúdo.

### 2ª revisão (curta, só SQL e acessos públicos corrigidos)
Não encontrou vazamento entre empresas, escalada de privilégio, bypass de imutabilidade nem risco de `search_path`. Cada correção abaixo foi provada por teste que **falha no SQL revisado** e passa com a correção:
1. **Corrigido:** a linha só nasce se o PDF já estiver guardado no bucket com o mesmo tamanho (antes, um POST direto na API criava uma emissão imutável sem PDF).
2. **Corrigido:** quem não enxerga o negócio é recusado antes de qualquer outra checagem, com mensagem genérica (antes, a mensagem revelava a próxima versão do negócio alheio).
3. **Corrigido:** apagar o membro que confirmou a produtividade deixou de ser recusado com mensagem enganosa; a confirmação continua, sem autor.
4. **Não aplicado, por falta de prova:** a remoção do PDF depois de uma falha de rede posterior à gravação.
5. **Não aplicado, é endurecimento:** cabeçalhos `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` e `Referrer-Policy: no-referrer` na página e no PDF públicos.

### 3ª revisão (curta, Opus; só o que mudou desde a anterior)
Escopo: a migration da confirmação da produtividade (valor, fonte e responsável), o formato de dados v4 e o acesso às imagens. Nada de vazamento entre empresas na migration; a guarda do gatilho, o RPC e os grants conferem. Achados e o que foi feito:
1. **Média, corrigido:** o logo ou a foto de outra empresa podia vazar para o PDF, porque o download usava a service role com um caminho que o admin escreve na identidade. Agora o caminho tem de estar na pasta da própria empresa, e o download usa o acesso do usuário que emite. Há teste. A rota pública antiga `/proposta/[token]/pdf` (links antigos, que seguem indisponíveis) tem o mesmo padrão e não foi alterada. Um CHECK em `proposta_identidades` ficou como endurecimento opcional.
2. **Baixa, corrigido:** corrida entre confirmar e mudar a produtividade. O RPC agora trava a linha (`for update`) antes de comparar. A corrida não tem teste automático.
3. **Baixa, corrigido:** a data da confirmação saía em UTC no texto congelado (21h30 em Brasília virava o dia seguinte). Agora é formatada em São Paulo. Há teste.
4. **Baixa, corrigido:** o vendedor podia ver um estado da geração e a proposta sair em outro. A emissão agora recusa se a confirmação mudou entre a tela e o clique. Não há teste automático, porque é ação de servidor; o e2e do vendedor cobre o caminho feliz.

## 7. Registros separados (riscos aceitos ou a decidir)
1. **Decisão proposta, aguarda aceite do Evandro:** negócio com proposta emitida **só pode ser arquivado, não apagado**.
2. **Exclusão de empresa (investigada nesta rodada):**
   - **Acessível?** Não há exclusão de empresa na interface, nas ações do servidor, nos scripts nem nos workflows. Hoje só é possível por:
     - a política de RLS `super-admin apaga empresas` (`fundacao.sql`), que permite a um super-admin autenticado chamar o DELETE direto na API;
     - a service role;
     - SQL direto.
   - A tela de super-admin só altera a situação (`ativa`, `suspensa`, `cancelada`).
   - **Efeito da cascata:** todas as tabelas com `empresa_id ON DELETE CASCADE` são apagadas, e isso inclui `propostas_emissoes`. A imutabilidade abre exceção só para esse caso (profundidade de gatilho maior que 1 e empresa já inexistente).
   - **PDFs órfãos:** os objetos do bucket `propostas-emitidas` **não** são apagados junto, porque `storage.objects` não tem vínculo com `empresas`. O PDF fica no bucket, sem linha, sem link e sem dono. Isso é provado por teste, e o mesmo vale para `proposta-marca`, `anexos` e demais buckets (padrão preexistente).
   - **Opções, se o Evandro quiser tratar:** (a) não permitir DELETE de empresa e usar só `cancelada`; (b) rotina de limpeza do bucket por empresa; (c) manter como está.
   - **Bloqueio possível (não implementado, depende do aceite):** um gatilho `BEFORE DELETE` em `empresas` que recuse a exclusão enquanto houver emissão. Nesse caso a exceção de cascata do gatilho de imutabilidade deixaria de ser usada, e a empresa só sairia de cena como `cancelada`. A exclusão real passaria a exigir um fluxo próprio (abaixo).
   - **Fluxo futuro de limpeza do bucket (proposta, nada implementado):**
     1. A empresa fica `cancelada` e passa pelo prazo de guarda que o Evandro definir.
     2. Exporta-se, antes de apagar, a lista de emissões da empresa (versão, link, hash) e, se o Evandro quiser, uma cópia dos PDFs.
     3. Um script único, executado só com autorização específica do Evandro para aquela execução (regra do `CLAUDE.md` para operação destrutiva em produção), primeiro em modo de listagem sem apagar: lista os objetos de `propostas-emitidas/<empresa_id>/` e confere a contagem contra as emissões exportadas.
     4. Só então apaga os objetos e, em seguida, a empresa. Cada execução é registrada com data, contagem e responsável.
     5. Outros buckets com pasta por empresa (`proposta-marca`, `anexos` e demais) entram no mesmo fluxo. Eles já deixam objetos órfãos hoje, e isso é anterior a esta entrega.
3. **O hash detecta, mas não recupera, um PDF substituído.** A service role pode sobrescrever o objeto no bucket. A leitura pública confere tamanho e SHA-256 e recusa (409 / "indisponível"), mas o arquivo original se perde. Endurecimento opcional: gatilho em `storage.objects` ou cópia de segurança.
4. **Imagens do PDF (resolvido nesta rodada):** logo configurado que falha recusa a emissão e a foto usa o fallback definido. O que continua: se a foto configurada falhar, a proposta sai com o fallback, sem aviso ao vendedor, e fica assim (a emissão é imutável).
5. **Auditoria:** a emissão não registra atividade na linha do tempo nem conta aberturas do link.
6. **UX:** o card "Proposta" antigo continua visível sob o card "Proposta simples" (escondê-lo exige ajustar os e2e 09 e 10).
7. **Pendências 4 e 5 da 2ª revisão** (seção 6).
8. **Aceites pendentes:** redação do rodapé sem geração, confirmação da produtividade com valor, fonte e responsável (inclusive qual valor vale por empresa), e o uso real de Manrope e Inter em propostas de clientes.

## 8. Sequência de implantação (cada passo depende de autorização do Evandro)
1. Revisar o diff, os PDFs, as comparações e os registros acima, e dar os aceites listados no item 8 da seção 7.
2. A 3ª revisão Opus curta já foi feita (seção 6). Se houver mudança nova na migration ou nos acessos, nova revisão curta só do que mudou.
3. **Validação oficial no outro computador**, conforme `.aurora/revisao/VALIDACAO-OFICIAL.md`: `pnpm db:reset`, `pnpm db:types` idêntico, lint, typecheck, `pnpm test` com a trava, build, e2e completo com o `12-proposta-emitida`, e emitir, baixar e reabrir o PDF à mão.
4. Git, só após autorização. Primeiro a integração M2 P0 (42 arquivos). Depois a emissão, em branch e PR próprias a partir dela. Os prefixos `20261022100000` e `20261022110000` precisam ser reconferidos contra as PRs abertas.
5. CI verde. Merge só com autorização específica.
6. Produção só por `banco-producao.yml`, nesta ordem:
   1. `conferir` (dry-run).
   2. Aprovação do Evandro em `producao-banco`.
   3. Conferir a lista, porque `--include-all` aplica todas as pendentes.
   4. `aplicar` com `aplicar-<sha7>` e nova aprovação.

   A trava do workflow hoje autoriza só o conjunto Solo (`b13d465`) e precisa incluir este conjunto, com autorização.
7. Deploy do código só depois da migration (o preview da Vercel usa o banco de produção).
8. Nenhuma emissão de teste em produção sem autorização específica. Links antigos continuam indisponíveis até terminar a consulta de anexos.
