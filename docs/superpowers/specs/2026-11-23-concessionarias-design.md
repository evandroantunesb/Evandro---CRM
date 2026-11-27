# Concessionárias além da Copel — desenho (item 6 do roadmap)

Data: 23/11/2026. Decisões do Evandro nesta data; o que é escolha do Claude está marcado como **(proposta do Claude, aceita)**.

## Por quê

Preparar o Raion para revenda fora do Paraná. Hoje o sistema só conhece a Copel: a calculadora só tem a tarifa ANEEL da `COPEL-DIS`, e a Engenharia tem um único checklist, um único conjunto de prazos e a regra de canal "PEW ou site" escrita no código, todos montados com os valores do engenheiro para a Copel. A obra nem guarda qual é a concessionária (o protocolo tem só um texto, com "Copel" pré-preenchido).

## Objetivo

Cada empresa cadastra as próprias concessionárias, e cada uma tem o próprio checklist de documentos, os próprios prazos e os próprios canais de entrada. A obra herda a concessionária do negócio. A calculadora funciona em qualquer distribuidora do Brasil.

## Fora do escopo

- Regras técnicas de qualquer concessionária além da Copel: quem preenche é o responsável técnico de cada empresa. O Raion não decide dado técnico de concessionária.
- Tipos de pedido, tensão (baixa/média), zona rural, os oito passos da Engenharia e o fluxo da obra de rede: continuam iguais para todas (regra da ANEEL ou do nosso processo).
- Integração com portal de distribuidora.

## Anti-objetivos (falha mesmo funcionando)

- Qualquer mudança perceptível para quem só atende a Copel: checklists, prazos, sinais e indicadores das obras atuais ficam idênticos.
- Perder isolamento por empresa ou as validações que o banco garante hoje (condições do checklist, faixa dos prazos, escrita só por RPC onde já é assim).
- Reinterpretar obras antigas: checklist já aplicado a uma obra nunca muda por causa do cadastro.

## Abordagens consideradas

- **A) Cadastro de concessionárias por empresa (escolhida).** Tabela de concessionárias da empresa, cada uma ligada a uma distribuidora ANEEL; modelo do checklist, prazos e canais passam a pertencer a uma concessionária; a obra guarda a dela. Clara com várias concessionárias; custo: as funções da Engenharia que leem checklist e prazos mudam, migration cuidadosa.
- B) Configuração atual como padrão + exceções por concessionária. Migration menor, mas fica difícil saber de onde vem cada item e editar o padrão muda concessionárias sem exceção sem querer.
- C) Configuração inteira em JSON por concessionária. Rápido, mas perde as validações e condições do banco. Descartada.

## O que foi decidido

1. **Cada empresa cadastra as próprias concessionárias** (revenda). Por concessionária: checklist de documentos (com as condições de hoje: tipo de pedido, tensão, zona rural), prazos (cada um em dias úteis ou corridos) e canais de entrada (lista livre, ex.: "PEW", "site"; a regra fixa `canalCopel` vira cadastro).
2. **A Copel vira modelo pronto** com os dados do engenheiro. Uma concessionária nova começa de uma cópia da Copel ou vazia, e o técnico da empresa ajusta. **(proposta do Claude, aceita)**
3. **Tarifas ANEEL de todas as distribuidoras** carregadas na tabela global `tarifas_gd_aneel` (dado público, igual para todos, carga por migration como hoje). Fora do cadastro da empresa. **(proposta do Claude, aceita)**
4. **Empresas e obras atuais:** toda empresa ganha a concessionária "Copel" com o checklist, prazos e canais que tem hoje, e toda obra existente aponta para ela. **(proposta do Claude, aceita)**
5. **A obra herda a concessionária do negócio** (`negocios.qualif_distribuidora`, já escolhida na calculadora/cadastro), casando com a distribuidora ANEEL da concessionária cadastrada. A Engenharia pode corrigir.
6. **Negócio com distribuidora que a empresa não cadastrou** (ou vazia, ou texto livre "outra"): a obra nasce com aviso "concessionária sem cadastro" e checklist vazio, até alguém cadastrar ou escolher a concessionária. **(proposta do Claude, aceita)**
6a. **Distribuidora vazia no negócio (decisão do Evandro em 25/11/2026):** se a empresa tem uma única concessionária cadastrada, a obra usa essa (hoje, a Copel), para nada mudar a quem só atende a Copel. Distribuidora preenchida que não bate com nenhuma concessionária continua na regra 6 (aviso e sem checklist).
7. **Concessionária corrigida pela Engenharia:** se nenhum documento do checklist foi enviado ainda, o checklist é trocado pelo da nova concessionária; se já houve envio, o checklist fica e a tela avisa que ele é da concessionária anterior. **(proposta do Claude, aceita)**
8. **Só os prazos da distribuidora variam por concessionária** (análise do protocolo, aprovação, vistoria, conexão, obra de rede). Os prazos internos da equipe (a iniciar, projeto em elaboração, ART, exigência, correção em campo) continuam da empresa. **(proposta do Claude; conferir na leitura)**
9. **"Documento enviado" na regra 7** = algum item do checklist da obra já saiu de pendente (arquivo anexado, marcado como entregue ou "não se aplica") ou já existe protocolo. **(proposta do Claude; conferir na leitura)**
10. Configuração por concessionária: quem edita hoje o checklist e os prazos da Engenharia (admin) edita o cadastro das concessionárias.

## Decisões de 26/11/2026 (entrega 3; prévia em https://claude.ai/artifact/BFk2a57EMctEpmB9FLbKwe)

- **Item 8 confirmado:** só os prazos da distribuidora configuráveis hoje (análise, análise em zona rural, vistoria e conexão) passam a ser por concessionária. Os internos (a iniciar, projeto em elaboração, ART, exigência, correção de campo) continuam da empresa. O prazo da obra de rede continua vindo do orçamento de cada obra.
- **Item 9 confirmado:** "já houve envio" = algum item do checklist da obra saiu de pendente por ação de alguém (arquivo anexado, conferido, válido, inválido ou "não se aplica" marcado à mão) ou já existe protocolo. Item que o enquadramento dispensou sozinho ("Fora do enquadramento") não conta.
- **Canais da Copel:** PEW (nova conexão, ampliação, regularização; ligação nova e aumento de carga só em baixa tensão), Site da Copel (troca de titularidade, cadastro de compensação; ligação nova e aumento de carga em média tensão), CAW e Atendimento comercial sem condição, até o engenheiro confirmar se ainda são usados. O canal sugerido é o primeiro, pela ordem, que vale para o tipo e a tensão do enquadramento; canal sem condição nunca é sugerido, só listado. Para a Copel, a sugestão fica idêntica à regra de hoje.
- **Obras sem concessionária ao criar uma nova:** continuam com o aviso até a Engenharia escolher. A tela da nova concessionária mostra quantas obras sem concessionária citam aquela distribuidora no negócio.
- **Escolhas da prévia aprovadas:** faixa "Concessionária" em Configurações › Engenharia; só o admin cria concessionária e edita checklist e canais; os prazos da distribuidora seguem editáveis por quem edita prazos hoje (admin, gestor e coordenador da Engenharia); concessionária não se apaga, só troca de nome (a distribuidora não muda); protocolo lista os canais da concessionária da obra mais "Outro", e protocolos antigos ficam com o canal gravado.

## Entregas (PRs nesta ordem)

1. **Tarifas ANEEL de todas as distribuidoras.** Independente. Migration de carga em `tarifas_gd_aneel` com a mesma rastreabilidade (recurso, linhas, data de extração, hash) e `nomes_aceitos` por distribuidora; o seletor de distribuidora da calculadora passa a listar todas.
2. **Cadastro de concessionárias + Copel migrada + obra com concessionária.** Tabela por empresa (com `empresa_id` e RLS), Copel criada para toda empresa (e para empresas novas), `obras` ganha a concessionária (preenchida na criação pela regra 5, Copel nas existentes), protocolo passa a sugerir o nome da concessionária da obra, aviso da regra 6, correção da regra 7.
3. **Checklist, prazos e canais por concessionária + tela de configuração.** `engenharia_checklist_modelo` e `engenharia_prazos` passam a ser por concessionária; canais viram cadastro; `/configuracoes/engenharia` ganha a escolha da concessionária e "nova concessionária" (cópia da Copel ou vazia). Prévia em canvas antes de codar a tela.

Cada migration segue o fluxo normal: teste de banco local, PR, aplicação em produção só pelo `banco-producao.yml` com aprovação do Evandro.

## Fica com quem implementa

- Nomes de tabelas, colunas e funções; como casar `qualif_distribuidora` com a concessionária (reaproveitar `nomes_aceitos`).
- Como representar "sem concessionária" na obra e onde o aviso aparece (painel da Engenharia e a obra).
- Fonte e formato da carga ANEEL (mesmo recurso já usado para a Copel); o que fazer com distribuidoras com pendência de fonte (seguir o padrão `pendencias_fonte`).
- Ordem exata das migrations da entrega 3, preservando comportamento idêntico para a Copel (testes de banco comparando antes e depois).
