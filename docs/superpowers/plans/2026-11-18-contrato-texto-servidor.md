# Contrato: texto só pelo servidor — plano (18/11/2026)

Decisão do Evandro (18/11/2026, opção A do diagnóstico): fechar a gravação do texto do contrato pela API. Contexto na
seção "Contrato: conferir, editar e enviar" de `docs/PROJECT_STATUS.md` (revisão final, I2).

## Problema

O app monta o texto do contrato (modelo, valor por extenso, kit, vigência do cálculo, condição) e o banco não tem como
saber se o texto veio do modelo. Quem tem a RLS "editar contrato" (`pode_ver_financeiro_negocio`) consegue gravar um
texto qualquer no rascunho sem marca nem histórico: `update`/`insert` direto em `contratos` ou
`gerar_contrato_com_condicao(negócio, texto, condição, valor, motivo)` com texto próprio (o que também apaga a marca
"editado à mão"). A condição de pagamento tem o mesmo problema.

## Desenho

- O servidor continua montando o texto em TypeScript (fonte única do modelo). Montado e conferido, guarda texto,
  condição, valor e motivo em `contratos_geracoes` com a service role. Usuário do app não lê nem escreve nessa tabela.
- `gerar_contrato_com_condicao(p_negocio_id, p_geracao_id)` roda na sessão de quem pediu (`security invoker`): consome
  a linha (`consumir_geracao_contrato`: uma vez, só o membro de quem chama, só o negócio dela, até 10 minutos) e grava
  como antes. RLS, rascunho, correção de valor do negócio ganho (admin/gestor, gamificação) e autoria não mudam.
- Variação sobre o que foi descrito na aprovação: em vez de o servidor gravar "com a identidade de quem pediu", a
  gravação continua de fato na sessão de quem pediu; só o texto passa pelo servidor. Nada de imitar usuário no banco.
- Edição à mão continua por `editar_texto_contrato` (marca e histórico).

## Etapas (duas PRs, sem janela em que gerar contrato falhe em produção)

1. **Compatível (esta PR).** Migration `20261214100000_contrato_geracao_servidor.sql`: tabela, consumo e a nova
   assinatura da geração; a antiga fica. App passa a usar o caminho novo. Teste
   `tests/contrato-geracao-servidor-db.test.ts`. Ordem: aplicar a migration, mesclar.
2. **Trava (PR seguinte, depois do deploy da 1).** Tirar `gerar_contrato_com_condicao(uuid, text, jsonb, numeric,
   text)`; para usuários do app, recusar `insert` em `contratos` e mudança de `conteudo` ou `condicao_pagamento` fora
   das duas funções (geração e edição). Status, assinatura e pagamento seguem como hoje. Testes de banco que criam
   contrato com o usuário logado (cerca de 29 arquivos) passam a criar pela service role; testes novos provam a recusa
   pela API. Ordem: mesclar a 1, conferir o deploy, aplicar a migration da 2, mesclar.
