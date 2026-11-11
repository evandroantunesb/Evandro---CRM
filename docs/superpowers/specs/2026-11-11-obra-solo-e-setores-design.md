# Obra do Solo e setores da obra (Onboarding, subprojeto 4)

Desenho aprovado pelo Evandro em 11/11/2026. Quadros no canvas "Raion — Nova interface": `SoloObras`, `SoloChecklist`,
`SoloClienteObra` (versão enxuta) e `OnboardingProTelas` (grupo "Setores da obra").

Duas entregas, nesta ordem, cada uma com PR, migration e autorização de produção próprias:

- **4a — Setores da obra:** a empresa PRO desliga Engenharia e/ou Administrativo; a obra nova nasce sem o setor.
- **4b — Obra do Solo:** checklist de 10 etapas, fotos, data prevista, anotação interna, link do cliente e página
  pública `/obra/[token]`.

A 4a vem antes porque a 4b depende de uma obra poder nascer sem fluxos de setor.

## Objetivo

"Acompanhamento da obra do início ao fim" é a promessa principal do produto. O Solo (uma pessoa) ganha uma obra
simples que o cliente acompanha pelo celular; o PRO ganha a escolha dos setores que a empresa realmente tem.

## Decisões do Evandro (11/11/2026)

1. Quadros do Solo aprovados na **versão enxuta**: ficam fora o contador de aberturas do link, a previsão de entrega
   "no ritmo das últimas obras", a edição das etapas e o número "Paradas".
2. Aviso ao cliente: a página do cliente atualiza na hora e há o botão **"Avisar no WhatsApp"** (abre a conversa com a
   mensagem pronta). Não há envio automático.
3. O cliente vê de cada etapa a **data e as fotos**. Anotação, NF, fornecedor e valores são internos.
4. As 8 etapas manuais podem ser marcadas **em qualquer ordem**; dá para desmarcar. Etapa atual = a primeira não feita.
5. **Data prevista** opcional por etapa ("agendada para 21/11").
6. Setor desligado no PRO: **a obra nova nasce sem o setor**; obras abertas ficam como estão; religar vale só para
   obras novas.
7. Setores desligáveis: **Engenharia e Administrativo**. Operacional (a instalação) é sempre ligado. **Compras fica fora
   das chaves**: continua a regra de 05/11 (sem equipe, outro setor atende — `compras_atendido_por`), porque a tabela
   de preços de Compras alimenta o kit e a proposta (P4b).
8. As chaves ficam **junto das telas** (passo Telas do assistente PRO e Configurações › Telas da empresa); o assistente
   PRO continua com 7 passos. A chave de Engenharia é uma só: desligar o setor desliga a tela Engenharia.

Acréscimos do Evandro em 11/11/2026 (segunda conversa, só para a 4b):

9. Etapa manual pode ser marcada **"não se aplica"**, com motivo obrigatório; conta como resolvida no andamento e o
   cliente vê "não se aplica" (sem o motivo).
10. As obras de empresas Solo que **já existem** quando a migration da 4b roda ganham o checklist (contrato e entrada
    feitas pelas datas reais, o resto pendente). Os fluxos de setor que essas obras já têm ficam como estão.
11. A página do cliente lê os dados por uma **função limitada liberada para `anon`**, não pela chave de serviço: o
    banco garante o que sai mesmo que o código da página erre. A chave de serviço fica só para assinar as fotos.

## 4a — Setores da obra

### Banco

- Tabela `empresa_setores_desligados (empresa_id, setor setor_obra, primary key (empresa_id, setor))` com
  `check (setor in ('engenharia', 'administrativo'))`. RLS: membros da empresa leem; o admin grava (insert/delete). Sem
  linha = ligado, então nada muda para as empresas de hoje.
- Função `setores_da_obra(p_empresa_id) returns setor_obra[]`: os setores operacionais que uma obra nova recebe nessa
  empresa. Solo → nenhum. PRO → compras, operacional e os de engenharia/administrativo que não estão desligados.
- `garantir_obra` cria os fluxos de `setores_da_obra()` lidos no momento em que a obra nasce. Os 2 marcos (NF do
  cliente e garantia) continuam sendo criados sempre.
- Engenharia: a chave da tela `engenharia` (`empresa_telas`) deixa de existir como chave separada; a área Engenharia
  fica ligada quando o setor não está desligado. A migration converte quem já desligou a tela Engenharia em setor
  Engenharia desligado (a tela continua desligada; obras novas passam a nascer sem o setor).
- Marco "NF do cliente" sem o Administrativo na obra: admin e gestor resolvem (já escrevem em todos os setores).
- Contas a pagar da obra continuam disponíveis para admin e gestor mesmo sem o fluxo do Administrativo.

### Regras do app

- **Conclusão da obra:** todos os setores **que a obra tem** no status final + os 2 marcos resolvidos (hoje exige os
  4 setores). Obra sem fluxo de um setor não espera por ele.
- **Cronograma e entrega contratada:** as etapas de um setor que a obra não tem saem do cronograma; a entrega
  contratada soma só as etapas que ficam. Qualquer regra "espera o setor X" (liberação do Operacional, cascata do
  previsto, semáforo) trata o setor ausente como cumprido.
- **Telas:** setor Engenharia desligado = `/engenharia` e `/configuracoes/engenharia` travados (`TelaDesligada`) e fora
  do menu. Administrativo desligado não tem tela própria a travar.
- **Pessoas:** o cadastro de pessoas não oferece setor desligado. Quem já tem o setor mantém o vínculo (sem efeito em
  obras sem o fluxo).
- O plano mapeia os pontos que hoje supõem os 4 setores (`SETORES_OBRA`, ~44 usos em `src/` e as funções do
  cronograma, prazos e semáforo no banco).

### Tela

`CartaoTelasOpcionais` (assistente PRO, passo Telas, e Configurações › Telas da empresa) — quadro `OnboardingProTelas`:

- Engenharia sai da lista de telas opcionais.
- Grupo **"Setores da obra"**: chaves de Engenharia e Administrativo; Compras ("Sempre na obra. Sem equipe de
  Compras, escolha quem atende em Configurações › Compras.") e Operacional como "Sempre ligado".
- Nota: "Vale para obras novas. As obras em andamento continuam com os setores que já têm. Sem o Administrativo, o
  admin e o gestor pagam fornecedores e cuidam da NF."
- Um só "Salvar" grava telas e setores numa ação, com checagem de admin no servidor e na RLS.

## 4b — Obra do Solo

### Banco

- `obra_checklist (obra_id, empresa_id, etapa, feita_em date, nao_se_aplica_motivo text, prevista_para date,
  anotacao text, marcada_por, marcada_em, primary key (obra_id, etapa))`, com check: `feita_em` e
  `nao_se_aplica_motivo` nunca juntos; motivo não vazio. Etapa **resolvida** = feita ou "não se aplica". Etapas (enum, nesta ordem): `contrato`, `entrada`, `projeto_art`,
  `material_comprado`, `protocolo`, `material_entregue`, `instalacao`, `vistoria`, `conexao`, `entrega`.
  Rótulos: Contrato assinado, Entrada recebida, Projeto e ART, Material comprado, Protocolo na distribuidora,
  Material entregue, Instalação, Vistoria, Conexão e medidor, Entrega ao cliente.
- `garantir_obra`, quando a empresa é Solo, cria as 10 linhas; `contrato` feita na data da assinatura e `entrada` na
  data da confirmação do pagamento (datas de Brasília).
- Escrita só por funções `security definer` que checam o admin da empresa e gravam no histórico da obra:
  `marcar_etapa_obra(obra, etapa, feita boolean, data)`, `prever_etapa_obra(obra, etapa, data|null)`,
  `anotar_etapa_obra(obra, etapa, texto)` e `etapa_nao_se_aplica_obra(obra, etapa, motivo|null)` (nulo desfaz).
  `contrato` e `entrada` não podem ser desmarcadas. "Não se aplica" vale só para as etapas 3 a 9 (`projeto_art` a
  `conexao`): `entrega` sempre precisa ser feita. Data de "feita" no futuro é recusada.
- A migration cria o checklist das obras Solo existentes (decisão 10 acima: datas reais de assinatura e confirmação).
  Empresa que vira Solo depois (super-admin) não ganha checklist automático nas obras antigas: pendência registrada.
- `obra_checklist_fotos (id, obra_id, empresa_id, etapa, caminho, enviada_por, created_at)`; bucket privado
  `obra-fotos`, pasta `<empresa>/<obra>/`, só imagem, limite de tamanho; escrita e exclusão só do admin da empresa. Até
  10 fotos por etapa (checado no banco).
- `obras.link_cliente text unique` (token aleatório), criado na obra do Solo; `gerar_link_cliente_obra(obra)` troca o
  token (o antigo deixa de valer).
- Obra do Solo concluída = as 10 etapas resolvidas (a `entrega` sempre feita).

### Telas (mesmos endereços `/obras` e `/obras/[id]`; o servidor escolhe a versão pelo plano)

- Menu do Solo: Início, Tarefas, Negócios, Contatos, Propostas e contratos, **Obras**, Configurações. A trava de Obras
  libera o Solo para a versão checklist.
- **Lista** (quadro `SoloObras`): cartões com as 10 barrinhas, "X de 10 feitas", etapa atual com a data prevista;
  números Em andamento, Entregues no ano e Próxima data prevista; filtro Em andamento / Entregues.
- **Checklist** (quadro `SoloChecklist`): marcar/desmarcar (desmarcar pede confirmação), "Não se aplica" (pede o
  motivo; mostra "Não se aplica · <motivo>" e "Desfazer"), data prevista, foto, anotação
  ("Só você vê"); anel de andamento com a etapa atual; cartão do link com Copiar e "Gerar novo link" (confirma: "o link
  antigo para de funcionar"); dados da obra.
- **"Avisar no WhatsApp"** na faixa e logo depois de marcar uma etapa: `wa.me` com o telefone do cliente e a mensagem
  "Olá, <primeiro nome>! A etapa *<etapa>* da sua obra foi concluída. Acompanhe por aqui: <link>". Sem telefone, o
  botão fica desligado com a explicação.
- Fotos comprimidas no navegador e validadas como as imagens de hoje (`imagem-upload.ts`); apagar pede confirmação.

### Página do cliente `/obra/[token]` (quadro `SoloClienteObra`)

- Pública, em `ROTAS_PUBLICAS` (prefixo `/obra`; a regra compara `/obra` ou `/obra/…`, então `/obras` continua
  exigindo login). Os dados vêm de `acompanhamento_obra(p_token)`, `security definer`, liberada para `anon`, que
  devolve só os campos abaixo; o servidor assina as fotos (1 hora) com a chave de serviço. Página dinâmica, sem cache
  entre clientes.
- Devolve só: primeiro nome do cliente, nome, logo escura e cores da empresa, etapas com datas feitas e previstas,
  fotos por URL assinada de curta duração, WhatsApp da empresa e a hora da última alteração. Nunca anotação, valor,
  NF, fornecedor, telefone ou endereço do cliente.
- Token inexistente: "Link inválido ou trocado". Obra cancelada: "Esta obra foi encerrada. Fale com a empresa."
- Mobile primeiro; verde só no botão do WhatsApp; `noindex`.

## Fora do escopo

Contador de aberturas, previsão de entrega, edição das etapas, "Paradas", envio automático de WhatsApp, checklist e
link do cliente para o PRO, desligar Compras ou Operacional.

## Testes

- **Puros:** andamento e etapa atual; mensagem do WhatsApp; situação da obra pelos setores que ela tem; etapas que
  ficam no cronograma.
- **Banco:** `garantir_obra` no PRO com Engenharia/Administrativo desligados e no Solo (checklist com contrato e
  entrada feitas); obras antigas intactas; Operacional/Compras não desligam; só o admin grava chaves e marca etapas;
  contrato/entrada não desmarcam; "não se aplica" exige motivo e recusa `contrato`, `entrada` e `entrega`; data de
  "feita" futura recusada; checklist criado para as obras Solo existentes; limite de fotos; RLS entre empresas; token
  novo invalida o antigo; `acompanhamento_obra` como `anon` sem dado interno (nem anotação nem motivo) e vazia para
  token inválido ou obra cancelada.
- **e2e:** Solo marca uma etapa com foto e a página do cliente mostra etapa e foto, sem a anotação; PRO desliga
  Engenharia, a obra nova nasce sem o setor e `/engenharia` fica travado.
