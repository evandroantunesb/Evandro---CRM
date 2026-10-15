# Proposta técnica — contratos imutáveis, hash e reabertura excepcional (A + B + C)

> **Status: PROPOSTA.** Não é ADR aprovada nem autorização de implementação. Revisão técnica do Claude Opus em 2026-10-15 a pedido do Evandro; decisões recomendadas abaixo aguardam confirmação. Nada aqui foi implementado ou aplicado em produção.
>
> Depende de: PR #190 (contratos fora do alcance do SDR) e PR #191 (integridade de `contratos`). Interage com o Solo (#186/#188) e com a #189. Correções urgentes de segurança seguem trilha própria e **não** fazem parte desta proposta.

## 1. Objetivo

- **A.** Conteúdo e link do contrato não mudam depois que o contrato sai do rascunho.
- **B.** O texto assinado fica preservado com hash SHA-256 verificável e imutável.
- **C.** Contrato assinado só volta a ser editável por um procedimento excepcional, auditável, que preserva histórico e causalidade.

Hoje: o texto pode ser trocado depois de enviado ou assinado; "voltar para rascunho e assinar de novo" está aberto a quem tem acesso financeiro e não deixa histórico do texto; o mesmo link pode passar a mostrar outro documento.

## 2. Máquina de estados (aplicada no banco)

Para os papéis de API (`authenticated`/`anon`), o banco valida cada transição; exceções só por RPC `security definer`.

| Transição | Quem | Efeito no banco |
| --- | --- | --- |
| rascunho → rascunho (editar/regerar) | admin, gestor, vendedor | livre, sem versão |
| rascunho → aguardando_assinatura (enviar) | idem | trava `conteudo`; grava versão `enviada` com hash e token da versão |
| aguardando_assinatura → assinado | idem | grava versão `assinada`; congela hash, `assinado_em`, `assinado_por`; eventos causais de hoje (`contrato.assinado`, bônus SDR, Obra) |
| rascunho → assinado (sem envio) | idem | igual à linha anterior, criando a versão na assinatura |
| aguardando_assinatura → rascunho (cancelar envio) | idem | grava versão `envio_cancelado`; o texto enviado continua preservado |
| assinado → qualquer outro | **só** RPC `reabrir_contrato_assinado` | ver §5 |

`token` e `conteudo` deixam de ser graváveis pelo cliente fora do rascunho; `token` nunca é escolhido pelo cliente (gerado pelo banco).

## 3. Histórico: `contratos_versoes` (insert-only)

Uma linha imutável por evento do documento:

- `contrato_id`, `empresa_id`, `negocio_id`, `versao` (número do texto: sobe a cada texto novo enviado/assinado), `evento` (`enviada`, `assinada`, `envio_cancelado`, `reaberta`, `legado`), `token` (da versão), `conteudo` (cópia integral), `conteudo_sha256`, `status_anterior`, `status_novo`, `motivo`, `ator_user_id`, `ator_membro_id`, `created_at = now()`.
- Mesmo padrão de `confirmacoes_pagamento`: escrita revogada de `anon`, `authenticated` **e** `service_role`; só os gatilhos/RPCs `security definer` inserem; gatilho impede UPDATE/DELETE (exceto cascata de exclusão da empresa inteira).
- Leitura: `pode_ver_financeiro_negocio(negocio_id)`.
- Custo: texto de contrato tem até 20 mil caracteres; desprezível.

**Proteção de colunas:** feita por **gatilho** (independente de grants), com testes negativos de comportamento — não por revoke de coluna.

## 4. Hash (B)

- `encode(sha256(convert_to(conteudo, 'UTF8')), 'hex')` — função nativa do Postgres, sem extensão, calculada pelo banco na transição.
- Em `contratos`: `conteudo_sha256_assinado`, `assinado_em`, `assinado_por_user_id`, `versao_assinada` — write-once, preenchidos pelo gatilho; o cliente não grava.
- A página pública mostra versão, data e hash, e oferece o texto exato (`.txt`) para conferência independente.
- É prova de integridade do registro no sistema, **não** assinatura eletrônica com validade jurídica (ICP-Brasil/gov.br).

## 5. Reabertura excepcional (C)

RPC `reabrir_contrato_assinado(p_contrato_id, p_motivo)`:

- **Quem:** só admin ativo da empresa do negócio; nunca quem registrou a assinatura (`assinado_por`) nem o beneficiário (`responsavel_assinatura_id`). Exceção Solo, §7.
- **Bloqueios:** pagamento ativo do Pro (`confirmacoes_pagamento` não estornada) **ou** do Solo (`registros_pagamento` ativo) **ou** Obra existente para o negócio. Para reabrir, estornar antes pelos fluxos existentes; com Obra, não reabre.
- **Motivo:** obrigatório (mín. 10 caracteres).
- **Efeitos:** versão `reaberta` com o motivo e o texto assinado; status → rascunho; o `registrar_contrato` atual estorna `contrato.assinado` e `handoff.contrato_assinado` (causalidade real, ledger preserva os dois lados); atividade `contrato_reaberto`.
- **Visibilidade:** atividades `contrato_%` (com motivo) só para acesso financeiro, na mesma regra das `pagamento_%`. Hoje não existe nenhum tipo `contrato_%` gravado, então nada some da linha do tempo de ninguém.
- **Exclusão:** contrato fora do rascunho, ou com versões, não pode ser apagado — nem diretamente nem em cascata ao apagar o negócio. Exceção: exclusão da empresa inteira.

Correção de erro → reabertura. Mudança de escopo depois da venda → aditivo (documento futuro, fora desta proposta).

## 6. Token por versão

- Cada texto enviado/assinado tem seu token. O link de uma versão sempre mostra **aquele** texto; se houver versão posterior, a página informa "substituída pela versão N em …".
- `contratos.token` continua existindo como "link atual" (compatível com a interface de hoje).
- Primeira versão de um contrato (inclusive legados) **reaproveita o token atual**: links já enviados a clientes continuam funcionando e mostrando o mesmo texto.
- Texto diferente enviado depois (após cancelar envio ou reabrir) recebe token novo; o antigo fica preso à versão antiga.

## 7. Implicações avaliadas

### Solo (administrador único)

- **Reabertura:** no Solo autônomo (`empresa_solo_autonoma`) só existe uma pessoa — ela é signatária e beneficiária. A regra "nunca quem assinou" tornaria a reabertura impossível. **Recomendação:** no Solo autônomo, o admin único pode reabrir o próprio contrato, com motivo obrigatório e o mesmo histórico imutável; a segregação é inviável, a auditoria permanece.
- **Bloqueio por pagamento:** registro Solo ativo bloqueia a reabertura; o admin pode estornar o registro (já permitido) e então reabrir.
- **Confirmação ≠ quem assinou:** não afeta o Solo (o Solo registra pagamento sem `confirmar_pagamento`).
- **Dependência:** `registros_pagamento` e `empresa_solo_autonoma` só existem com o Solo mesclado. Implementar esta proposta **depois** do Solo, ou com as checagens condicionais documentadas.

### Pro com equipe pequena

- "Quem confirma ≠ quem registrou a assinatura": se o único admin marcar a assinatura em nome do vendedor, ninguém confirma o pagamento. Orientação de produto: o vendedor/closer registra a assinatura; o admin/gestor confirma. Empresa com um só admin/gestor e que assina pelo vendedor precisará de um segundo aprovador.
- Upgrade Solo → Pro: contratos assinados no Solo têm `assinado_por` = o admin; no Pro, esse admin não confirma esses contratos pelo fluxo do Pro (o registro Solo já existente continua válido).

### Contratos antigos

- **A:** legados em `aguardando_assinatura`/`assinado` ficam travados ao aplicar. Legado aguardando com texto a corrigir: cancelar envio (versão preservada), corrigir e reenviar.
- **B:** legados assinados **não** ganham hash de assinatura. A migration grava uma versão `legado` com o texto vigente, marcada como retroativa: preserva o texto dali em diante, mas **não** prova que foi o texto assinado.
- **C:** legado reaberto passa pela mesma RPC; a versão `legado` já guarda o texto anterior.
- `assinado_por` é nulo em legados: a regra "confirmação ≠ quem assinou" não se aplica a eles (vale só a regra atual do beneficiário).
- O token do legado vira o token da versão 1 (links preservados).

## 8. Compatibilidade

- **#189:** recria a policy `ver atividades` com o filtro `pagamento_%`. Esta proposta recria a mesma policy acrescentando `contrato_%`. Se a #189 for aplicada **depois**, apagará o filtro novo. Ordem obrigatória: #189 antes desta, ou a #189 já incluir `contrato_%`.
- **#190/#191:** base desta proposta. As funções `pode_ver_financeiro_negocio`/`tem_acesso_financeiro` e o gatilho `contratos_integridade` são reaproveitados.
- **Solo:** ver §7.
- **Gatilhos BEFORE em `contratos`** disparam em ordem alfabética: `contratos_integridade` → (novo gatilho de transição) → `contratos_travar_com_pagamento` → `contratos_updated_at`. A ordem precisa ser coberta por teste.
- **Interface:** o seletor de status (`negocios/[id]/contrato.tsx`) oferece todos os status; passa a oferecer só transições válidas, com "Cancelar envio" e "Reabrir (admin, com motivo)". Página pública `/contrato/[token]` passa a resolver versão. Geração de contrato já recusa regerar fora do rascunho (sem mudança).
- **Testes existentes:** 6 testes de gamificação/pagamento voltam assinado → rascunho por UPDATE direto e passam a usar a RPC de reabertura (a lógica causal que protegem não muda).

## 9. Testes obrigatórios

1. Cada transição da §2, permitida e negada, por papel (admin, gestor, vendedor, SDR, outra empresa).
2. `conteudo` e `token` imutáveis fora do rascunho; token nunca vindo do cliente (INSERT e UPDATE).
3. Hash igual ao SHA-256 do texto; colunas de assinatura write-once; tentativa do cliente de gravá-las recusada.
4. `contratos_versoes`: nenhuma escrita direta (cliente e `service_role`); UPDATE/DELETE recusados; versões preservadas após reabrir e reassinar; token antigo mostra o texto antigo.
5. Reabertura: só admin; não por quem assinou nem pelo beneficiário; motivo obrigatório; recusada com pagamento Pro ativo, registro Solo ativo e Obra; estorno e reemissão de eventos exatamente uma vez.
6. Solo autônomo: admin único reabre com motivo; Solo com mais de um vínculo segue a regra do Pro.
7. `confirmar_pagamento` recusado para quem registrou a assinatura; legados (`assinado_por` nulo) seguem a regra antiga.
8. Exclusão: contrato assinado não some ao apagar o negócio; exclusão da empresa inteira funciona.
9. SDR não vê atividade `contrato_reaberto`; financeiro vê, com motivo.
10. Legados: versão `legado` criada sem hash de assinatura; links antigos preservados.
11. Regressão: geração/upsert, envio, assinatura, confirmação/estorno, bônus SDR, Obra, ranking e conquistas.

## 10. Decisões recomendadas (aguardando confirmação)

1. Cancelar envio antes da assinatura: permitido ao financeiro, com versão enviada preservada integralmente.
2. Reabertura de contrato assinado: só admin, com motivo e histórico imutável; exceção do admin único no Solo autônomo.
3. Reabertura bloqueada com pagamento ativo (Pro ou Solo) ou Obra.
4. No Pro, quem registrou a assinatura não confirma o pagamento, além da regra atual do beneficiário; não retroativo.
5. Texto de legado preservado como versão retroativa, **nunca** tratado como prova de documento assinado.
6. Token por versão, com a primeira versão reaproveitando o token atual.
7. Atividade detalhada de reabertura restrita ao financeiro.
