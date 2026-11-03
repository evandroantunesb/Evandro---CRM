# D1/D2 — condições comerciais da proposta simples (entrega própria, para revisão)

Worktree: `R:/wt-m2-p0-d1d2` = versão validada (pacote `R:\trocapc\passagem-m2-p0`, COINCIDE na criação) + esta entrega.
Diff contra a versão validada: `d1d2-condicoes-comerciais.patch` (15 arquivos). Sem commit, push, PR, merge ou produção.

## Regras implementadas (propostas pelo Evandro em 22/10/2026)
- Gestor e admin configuram: validade de 7, 15 ou 30 dias e os textos de à vista, cartão e financiamento.
- Sem a configuração, sem o prazo ou sem qualquer uma das três condições: emissão bloqueada, com a mensagem dizendo o que falta.
- O vendedor não edita o vencimento nem escolhe a forma de pagamento: a tela só mostra a prévia.
- A emissão calcula a validade (dia da emissão em São Paulo + prazo) e congela prazo, vencimento, as três condições e o PDF (formato de dados v5).
- Se a configuração mudar entre abrir a tela e clicar, a emissão é recusada ("mudaram desde que a tela abriu").
- Leitura: v4 (já emitidas) e v5 convivem; um helper único entrega o pagamento ao PDF e à página (v4 sem rótulo, v5 com rótulo).

## Migration `20261023100000_proposta_condicoes_comerciais.sql` (aditiva)
Tabela `proposta_condicoes_comerciais`: `empresa_id` (PK, cascade), `validade_dias` (7/15/30 ou nulo), `pagamento_avista`, `pagamento_cartao`, `pagamento_financiamento` (1–80 caracteres ou nulo), `atualizado_por`, `created_at`, `updated_at` (gatilho `tocar_updated_at`).
RLS: SELECT para membro ativo; INSERT/UPDATE só admin e gestor; sem DELETE. Nenhuma linha existente muda; `propostas_emissoes` e o gatilho de emissão ficam intactos.

## Decisões técnicas a revisar
1. **Limite de 80 caracteres por condição** (não 120): três textos de 120 levaram o pior caso a 4 páginas; 3 × 80 = 240, o mesmo total já validado em 3 páginas.
2. **Fuso:** não existe fuso por empresa no banco; usa `America/Sao_Paulo`, o mesmo do gatilho de emissão.
3. **Garantia no app, não no banco:** como já acontece com preço e kit, o gatilho de emissão não valida o conteúdo de `dados`. Um vendedor com acesso direto à API poderia gravar uma emissão com outros textos. Fechar isso exige o gatilho comparar `dados.comercial` com a configuração (mudança maior, que quebra os testes de RLS das emissões). Recomendo tratar junto da revisão de segurança antes de produção.
4. **Tela de configuração:** `/configuracoes/condicoes-proposta` (admin e gestor), fora do layout de Propostas, que é só do admin. Ainda sem item no menu: o bloqueio da emissão aponta o caminho.

## Validação (banco descartável `aurora-d1d2`, parado no fim; config restaurado, `.env.local` removido)
88 migrations aplicadas; tipos gerados (só a tabela nova); typecheck ok; lint 0 erros (3 avisos conhecidos); testes afetados 81/81 (`proposta-simples`, `imagens-emissao`, `proposta-condicoes-comerciais-db` novo, `propostas-emissoes-fluxo-db`, `propostas-emissoes-db`); build ok; e2e 12 4/4. Suíte completa e e2e completo NÃO rodados nesta fase.

## Fora desta entrega (pedidos do Evandro registrados)
Redistribuição visual: capa sem foto com vazio excessivo; página 2 quase livre; página 3 concentrada; etapas e próximos passos antes da oferta; investimento e as três formas de pagamento no fechamento. Nova renderização das 3 páginas para revisão visual depois disso. Nenhum dado da Amostra A (112,7 kWh/kWp/mês, garantias, condições) é dado real.
