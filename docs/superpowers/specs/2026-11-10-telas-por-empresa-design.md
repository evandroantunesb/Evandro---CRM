# Telas por empresa (Onboarding, subprojeto 1) — desenho

Data: 10/11/2026. Decisões do Evandro nesta data, a partir dos quadros aprovados do canvas "Raion — Nova interface"
(linha "Onboarding: Solo e PRO": `OnboardingProTelas` passo 4 e `OnboardingSolo`).

## Contexto

O Onboarding Solo e PRO foi dividido em quatro subprojetos, nesta ordem: (1) telas por empresa, (2) cores por empresa,
(3) assistente de primeiro acesso, (4) obra do Solo (checklist, lista de obras e página do cliente) junto com as chaves
de setores. Este documento é só o (1).

Hoje o menu depende apenas do papel da pessoa. O plano Solo/PRO já existe (`planos_empresa.produto`, definido pelo
super-admin), mas só muda o registro manual de pagamento. A única chave por empresa é `empresas.eletroposto_ativo`
(super-admin). Como o dono do Solo é admin, ele vê hoje Compras, Preços de material, Financeiro e Pedidos aos setores.

## Objetivo

O conjunto de telas passa a depender também da empresa:

- **Solo:** lista fechada — Início, Tarefas, Negócios, Contatos, Propostas e contratos e Configurações. O checklist da
  obra entra no subprojeto 4.
- **PRO:** tudo o que o papel permite, menos as telas opcionais que o admin desligou: Painel, Leads a distribuir,
  Forecast, Obras, Engenharia, Gamificação, Eletroposto e Captura de leads.
- **Eletroposto:** o super-admin libera o módulo (como hoje); com ele liberado, o admin liga ou desliga a tela. Sem
  liberação, a chave não aparece.
- **Tela desligada:** some do menu de todo mundo e o endereço mostra um aviso. O que roda sozinho continua (pontos da
  Gamificação, rodízio de leads, formulário de captura já publicado, obras). Nada é apagado.
- A empresa só **tira** telas: nunca dá acesso que o papel não dá.

Fora deste subprojeto: chaves de setores (subprojeto 4), cores (2), assistente (3), mudança de plano pelo admin (segue
só pelo super-admin).

## Banco

Migration nova (prefixo conferido contra as PRs abertas na hora de criar):

- **`empresa_telas`**: `empresa_id` (PK, FK `empresas`), `desligadas text[] not null default '{}'` com check de que
  cada item está em `painel, leads, forecast, obras, engenharia, gamificacao, eletroposto, captura`, `atualizado_por`,
  `created_at`, `updated_at` (`tocar_updated_at`), trigger `auditar()`. RLS: membros da empresa leem; só o admin da
  empresa insere, atualiza e apaga. Sem linha = nada desligado. Padrão de `empresa_tela_entrada` (#326).
- **`produto_da_empresa(p_empresa_id uuid) returns text`**: `security definer`, `stable`, devolve `'solo'` ou `'pro'`
  a quem é membro ativo da empresa (`meu_membro_id`); empresa sem linha em `planos_empresa` ou com produto nulo = `'pro'`;
  não membro = nulo. Sem `EXECUTE` para `anon`.
- O Eletroposto continua lendo `empresas.eletroposto_ativo` como "liberado pelo super-admin".

## Regra única (pura)

`src/lib/telas-empresa.ts`:

- `TELAS_OPCIONAIS` (as oito chaves, com rótulo e descrição do quadro) e `TELAS_SOLO`.
- `telasVisiveis({ produto, desligadas, eletropostoLiberado }): Set<Tela>`: Solo = conjunto fixo; PRO = todas as
  telas, menos as desligadas, e o Eletroposto só se liberado.
- `telaLigada(telas, tela)` para menu, índice de Configurações e travas.

O papel continua decidindo como hoje (`pode(papel, …)`); o menu mostra um item só quando o papel permite **e** a
tela está no conjunto da empresa.

## Sessão, menu e travas

- `obterSessao` passa a trazer `telas` da empresa atual (uma leitura de `empresa_telas`, `produto_da_empresa` e
  `eletroposto_ativo` por requisição, no cache da sessão).
- **Menu lateral e abas do celular** (`src/app/(app)/layout.tsx`, `menu.tsx`): filtram pelos dois critérios.
- **Índice de Configurações:** Captura some com a Captura desligada; Metas, Comissões, Recompensas, Regras de pontos,
  Níveis e conquistas, Perfis de gamificação e Resgates somem com a Gamificação desligada ou no Solo; no Solo também
  Equipes, Tarefas automáticas, Compras, Engenharia, Prazos das etapas, Impostos e comissões e Tipos de fixação.
- **Travas:** cada área ganha um `layout.tsx` que chama `exigirTela(tela)`; desligada, mostra "Esta tela está
  desligada na sua empresa" com link para o Início e, para o admin, para Configurações › Telas da empresa.

| Tela | Endereços travados |
| --- | --- |
| Painel | `/painel` |
| Leads a distribuir | `/leads-a-distribuir` |
| Forecast | `/forecast` |
| Obras | `/obras` |
| Engenharia | `/engenharia` |
| Gamificação | `/gamificacao` inteira, `/configuracoes/{metas,comissoes,resgates}` |
| Captura | `/configuracoes/captura` (a página pública `/captura/[token]` continua) |
| Eletroposto | a opção de criar negócio de eletroposto some; negócios existentes continuam abrindo na ficha |
| Só no Solo | também `/compras`, `/financeiro`, `/pagamentos`, `/tarefas/setores` e `/configuracoes/{equipes,tarefas-automaticas,compras,engenharia,prazos-obras,deducoes-obras,fixacoes}` |

- Avisos do sininho que apontam para tela desligada caem no mesmo aviso.

## Configurações › Telas da empresa

- Item novo no grupo "Empresa", só admin: `/configuracoes/telas`.
- **PRO:** cartão "Telas opcionais" igual ao passo 4 aprovado (ícone, nome, descrição e chave por tela; texto "Início,
  Tarefas, Negócios, Contatos e Propostas e contratos ficam sempre ligados…"). A linha do Eletroposto só aparece se
  liberado. Um "Salvar" grava a lista inteira (ação do servidor com `exigirPapel("admin")`; o RLS confere de novo).
- **Solo:** lista das telas do plano e "Cresceu e contratou alguém? Passe para o PRO e libere equipe, setores, gestão e
  Gamificação." Sem chaves.
- O cartão é um componente próprio (`src/components/telas-empresa.tsx`) para o assistente (subprojeto 3) reaproveitar.

## Erros

- Falha ao ler as telas na sessão: trata como "nada desligado" e plano PRO (o comportamento de hoje), sem quebrar o
  app; o erro vai para o log do servidor.
- Gravação recusada (não admin, valor inválido): mensagem do banco na tela, nada muda.

## Testes

- **Puros** (`tests/telas-empresa.test.ts`): Solo, PRO, desligadas, Eletroposto com e sem liberação, papel + empresa.
- **Banco** (`tests/telas-empresa-db.test.ts`): só admin grava; valor inválido recusado; outra empresa não lê nem
  grava; `produto_da_empresa` só para membros, PRO sem plano, Solo com plano Solo.
- **Navegador:** uma tela desligada mostra o aviso e some do menu.
- lint, typecheck, `pnpm test` e build.
