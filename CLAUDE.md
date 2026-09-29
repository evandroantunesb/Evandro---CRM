@AGENTS.md

# Raion CRM — guia para o Claude

CRM de funil de vendas para empresas de energia solar, multiempresa (SaaS revendável + uso interno do Evandro, gerente comercial). Todo o código é escrito pelo Claude; o Evandro revisa e mescla as PRs. Estado atual e próximos passos: **`PROGRESS.md`**.

## Regras de trabalho (economia de contexto)

1. **Comece por aqui e pelo `PROGRESS.md`.** Não refaça pesquisas sobre o que já está documentado nesses dois arquivos.
2. **Leia trechos, não arquivos inteiros**, quando só uma parte importa: use `grep`/busca para localizar e leia só o intervalo de linhas necessário. `src/lib/supabase/database.types.ts` é enorme — busque a tabela pelo nome em vez de abrir tudo.
3. **Não leia** `node_modules/`, `.next/`, `dist/`, `build/`, `out/`, `coverage/`, `pnpm-lock.yaml`, arquivos gerados ou logs longos, salvo necessidade explícita. Exceção prevista no `AGENTS.md`: a documentação do Next em `node_modules/next/dist/docs/`, só a página relevante.
4. **Mexa só nos arquivos da funcionalidade pedida.** Nada de refatorar, reformatar ou "melhorar" código vizinho sem pedido.
5. **Evite agentes paralelos** e buscas amplas quando o caminho já está descrito aqui; use-os só para trabalho realmente independente.
6. **Ao concluir cada funcionalidade, atualize o `PROGRESS.md`** com: alterações realizadas (com número da PR), arquivos modificados, decisões técnicas e próximas tarefas.
7. **Este `CLAUDE.md` só muda com mudança permanente** de arquitetura ou de regras do projeto — não a cada entrega. Não releia arquivos à toa.
8. **Nunca mescle PR sem aprovação do Evandro.** Nunca peça senhas, tokens ou chaves no chat — ele cadastra secrets direto no GitHub/Vercel/Supabase.
9. Não altere identidade visual, logo ou regras de negócio sem pedido explícito.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. **Esta versão do Next tem mudanças de API** — ver `AGENTS.md`.
- Supabase (Postgres com RLS, Auth, Storage), região São Paulo. Cliente: `@supabase/ssr`.
- Zod 4 (validação), `@react-pdf/renderer` (PDF de proposta/captura), `@dnd-kit/core` (Kanban), `lucide-react` (ícones), `qrcode`.
- Vitest (testes), ESLint, pnpm, Node 22. PWA.
- Deploy: Vercel (automático a cada push na `main`, preview por PR) + GitHub Actions.

## Estrutura de diretórios

```
src/app/(app)/          telas logadas: inicio, negocios (Kanban/lista), contatos, tarefas,
                        painel (gestor), gamificacao (ranking, extrato, jornada, loja, metas, comissoes),
                        configuracoes (funil, origens, usuarios, equipes, calculadora, propostas,
                        contrato, captura, gamificacao, metas, comissoes, resgates, listas),
                        perfil, super-admin (empresas, cobrança); menu.tsx e layout.tsx
src/app/<rota>/[token]  páginas públicas sem login: proposta, captura, contrato
src/app/{login,auth,definir-senha,recuperar-senha,sair,sem-acesso,anexos,api}
src/components/         componentes compartilhados (ui.tsx, marca.tsx, avatar, mover-etapa, etc.)
src/lib/acoes/          server actions ("use server") por domínio: negocios, contatos, tarefas, notas,
                        propostas, calculadora, captura, contratos, anexos, google-agenda…
src/lib/                regras e consultas: crm, calculadora, gamificacao, metas, comissoes, painel,
                        leads-parados, propostas-paradas, notificacoes, sessao, env, cobranca…
src/lib/propostas/      montagem e paginação do PDF de proposta
src/lib/supabase/       clientes (server, navegador, admin), proxy.ts (middleware), database.types.ts (gerado)
supabase/migrations/    schema + RLS (fonte da verdade do banco)
tests/                  Vitest; os testes *-db e rls precisam do Supabase local
scripts/                criar-super-admin, seed-equipe-cascavel
.github/workflows/      ci.yml, banco-producao.yml, seed-equipe-cascavel.yml; dependabot.yml
```

## Arquitetura e segurança

- **Multiempresa:** todo dado operacional tem `empresa_id`; as políticas de RLS em `supabase/migrations` isolam cada empresa. O código nunca é a única barreira.
- **Perfis:** super-admin (dono da plataforma, tabela `plataforma_admins`), e dentro de cada empresa `admin`, `gestor`, `vendedor` (interno ou representante), via `empresa_membros.papel`.
- **Super-admin não fura RLS:** o selo de plataforma só libera `/super-admin/*`; para ver negócios de uma empresa é preciso ser admin dela. Um 404 ao abrir negócio geralmente é permissão, não bug de rota.
- Visibilidade de negócios: `pode_ver_responsavel()` — admin da empresa, o próprio responsável ou o gestor da equipe dele.
- Rotas públicas ficam em `ROTAS_PUBLICAS` de `src/lib/supabase/proxy.ts`; página pública nova precisa entrar nessa lista.
- Links públicos usam `env.siteUrl` (`src/lib/env.ts`), que resolve pelas variáveis automáticas do Vercel. O domínio `raion-crm.vercel.app` é de terceiros; o app real é `raion-crm-roan.vercel.app`.
- Auditoria em `logs_auditoria` (imutável); eventos de gamificação em `eventos`/`point_ledger`.
- Cadastro público desligado: só entra quem é convidado ou cadastrado pelo gestor.

## Regras de negócio

- **Funil padrão:** Novo lead → Contato feito → Visita agendada → Proposta enviada → Ganho/Perdido (configurável só por admin).
- **Distribuição de leads:** rodízio automático entre vendedores ativos, com fila de aprovação do gestor; prazo de auto-aprovação configurável por origem (padrão 1h). Expiração via `pg_cron` a cada 5 min.
- **Status do vendedor:** Ativo / Inativo / Desligado; só ativos entram no rodízio.
- **Leads parados:** negócio aberto sem mudar de etapa nem ganhar nota há mais que `empresas.dias_considerado_parado` (padrão 7). **Propostas paradas:** proposta gerada sem o cliente abrir de novo nem mudar etapa no mesmo prazo. Aparecem no Painel (com botão Reatribuir), na Início e no sininho.
- **Gamificação (pontos padrão):** negócio criado 5, etapa avançada 2, negócio ganho 50, tarefa concluída 3, nota 1. Tem níveis, conquistas, ranking, loja de recompensas, metas e comissões.
- **WhatsApp:** só botão `wa.me` + registro manual (sem API oficial).
- **Cobrança:** super-admin define plano/valor por empresa; sem gateway de pagamento.
- **Proposta e contrato** "fotografam" o modelo no momento da geração; editar o modelo depois não muda o documento já gerado.
- CNH e documentos pessoais são dado sensível (LGPD): acesso restrito.

## Padrões de interface

- Paleta (aplicada em `src/app/globals.css`, substituindo as escalas amber/zinc do Tailwind): Carvão Profundo `#0F0F10`, Dourado Solar `#D4AF37`, Off-white Quente `#FAF8F3`, Cinza Neutro `#6B7280`, Cinza Claro `#E5E7EB`.
- Fontes: Manrope (títulos), Inter (textos).
- **Verde só no WhatsApp; vermelho só para perda e erro.**
- Logo: `src/components/marca.tsx` com os PNGs oficiais em `public/marca/`. Dentro de `flex-col`, imagem precisa de `alignSelf: "flex-start"` para não esticar.
- Interface, rotas, nomes de arquivos, variáveis e mensagens de commit em **português**.
- Mobile é prioridade (vendedores usam no celular); reutilize `src/components/ui.tsx` antes de criar componente novo.

## Banco e migrations

- Migration nova em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`. **Antes de escolher o prefixo, confira as migrations das PRs abertas** — prefixos iguais quebram o `db push`.
- Depois de mudar o banco, rode `pnpm db:types`. Se precisar editar `database.types.ts` à mão, siga o formato do gerador (ordem alfabética, unions quebradas em linhas, `SetofOptions`) — o CI compara byte a byte.
- Produção: `banco-producao.yml` roda `supabase db push --include-all` a cada push na `main` que toque migrations (ou manualmente). O preview do Vercel usa o **mesmo** banco de produção, então PR com migration nova dá erro no preview até ser aplicada.
- Entrega que depende de tabela de PR ainda não mesclada: nasce da branch dessa PR (PR empilhada).

## Comandos e validação

`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm db:reset` · `pnpm db:types` · `pnpm super-admin <email> <senha> "<nome>"`

Nas sessões na nuvem não há Docker: testes de banco (`rls`, `*-db`) falham localmente por limitação do ambiente. Valide com `lint` + `typecheck` + testes puros + `build` e deixe o CI (que sobe o Supabase local) ser a fonte de verdade.

## Dados de teste

Equipe Cascavel em produção (Camila, Rafael, Bruno; e-mails `*.teste@raioncrm-demo.com.br`; o repositório é público, então senhas não ficam aqui), criada por `scripts/seed-equipe-cascavel.mjs`.
