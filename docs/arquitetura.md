# Arquitetura — Raion CRM

Consulte só a seção necessária para a tarefa. Regras permanentes ficam no `CLAUDE.md`.

## Estrutura de diretórios

```
src/app/(app)/          telas logadas: inicio, negocios (Kanban/lista), contatos, tarefas,
                        painel (gestor), gamificacao (visão gerencial/pessoal em _gerencial/_pessoal, ranking,
                        extrato, jornada, loja, metas, comissoes, administracao; tema escuro
                        e componentes em _compartilhado),
                        configuracoes (funil, origens, usuarios, equipes, calculadora, propostas,
                        contrato, captura, gamificacao, metas, comissoes, resgates, listas),
                        perfil, super-admin (empresas, cobrança); menu.tsx e layout.tsx
src/app/<rota>/[token]  páginas públicas sem login: proposta, captura, contrato
src/app/{login,auth,definir-senha,recuperar-senha,sair,sem-acesso,anexos,api}
src/components/         componentes compartilhados (ui.tsx, marca.tsx, avatar, mover-etapa…)
src/lib/acoes/          server actions ("use server") por domínio: negocios, contatos, tarefas, notas,
                        propostas, calculadora, captura, contratos, anexos, google-agenda…
src/lib/                regras e consultas: crm, calculadora, gamificacao, metas, comissoes, painel,
                        leads-parados, propostas-paradas, notificacoes, sessao, env, cobranca…
src/lib/propostas/      montagem e paginação do PDF de proposta
src/lib/supabase/       clientes (server, navegador, admin), proxy.ts (middleware), database.types.ts (gerado)
supabase/migrations/    schema + RLS (fonte da verdade do banco)
tests/                  Vitest; os testes *-db e rls precisam do Supabase local
scripts/                criar-super-admin, seed-equipe-cascavel (legado), seed-metas-vendedores;
                        seed-base-demo.mjs (empresa demo separada) pertence à PR #132 até o merge
.github/workflows/      ci.yml, banco-producao.yml, seed-equipe-cascavel.yml, seed-metas-vendedores.yml; dependabot.yml
```

## Segurança e permissões

- Todo dado operacional tem `empresa_id`; políticas de RLS em `supabase/migrations` isolam cada empresa.
- Perfis: super-admin (tabela `plataforma_admins`) e, por empresa, `admin`, `gestor`, `vendedor` (interno ou representante) e `sdr` em `empresa_membros.papel`. Perfil de gamificação separado em `perfil_gamificacao` (`sdr`, `closer`, `cs_farmer`).
- **Super-admin não fura RLS:** o selo só libera `/super-admin/*`. Para ver negócios de uma empresa é preciso ser admin dela. Um 404 ao abrir negócio costuma ser permissão, não bug de rota.
- Visibilidade de negócios: `pode_ver_responsavel()` — admin da empresa, o próprio responsável ou o gestor da equipe dele.
- Rotas públicas: lista `ROTAS_PUBLICAS` em `src/lib/supabase/proxy.ts`. Página pública nova precisa entrar nela.
- Links públicos usam `env.siteUrl` (`src/lib/env.ts`), resolvido pelas variáveis automáticas do Vercel. `raion-crm.vercel.app` é de terceiros; o app real é `raion-crm-roan.vercel.app`.
- Auditoria em `logs_auditoria` (imutável); gamificação em `eventos`/`point_ledger`.
- Cadastro público desligado: só entra quem é convidado ou cadastrado pelo gestor.

## Banco e migrations

- Arquivo novo: `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`. **Confira as migrations das PRs abertas antes de escolher o prefixo** — versões iguais quebram o `db push`.
- `src/lib/supabase/database.types.ts` é **gerado** por `pnpm db:types` depois de mudar o banco. Nunca edite à mão — o CI compara byte a byte com a saída do gerador. O arquivo é grande: para consultar, busque a tabela pelo nome.
- Produção pode estar à frente da `main` quando uma migration de PR é aplicada antes do merge (ex.: `20261006120000_recompensas_imagem.sql`, PR #139). Confira antes de escolher prefixo ou reaplicar.
- Produção: `banco-producao.yml` roda `supabase db push --include-all` a cada push na `main` que toque migrations (ou manualmente). O preview do Vercel usa o **mesmo** banco de produção: PR com migration nova dá erro no preview até ser aplicada.
- Entrega que depende de tabela de PR não mesclada nasce da branch dessa PR (PR empilhada).

## Deploy e CI

- Vercel: deploy automático da `main`; preview por PR.
- `ci.yml`: sobe Supabase local, confere tipos do banco, lint, typecheck, testes e build.
- Sessões na nuvem não têm Docker: testes `rls`/`*-db` falham localmente por limitação do ambiente. Valide com lint + typecheck + testes puros + build e deixe o CI ser a fonte de verdade.
- Falha "rate limit exceeded" no `supabase/setup-cli` é limite do GitHub, não do código: basta relançar o job.

## Armadilhas conhecidas

- Imagem/logo dentro de `flex-col` sem largura própria estica: use `alignSelf: "flex-start"` (já aplicado em `marca.tsx`).
- A partir do CLI Supabase 2.118, `gen types` sai sem formatação; o script `db:types` formata com `oxfmt`. Fique atento a mudanças parecidas em PRs do Dependabot que atualizem o CLI.
