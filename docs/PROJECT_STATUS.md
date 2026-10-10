# Estado do projeto — Raion CRM

Documento vivo. **Última atualização: 2026-10-10 (horário de Brasília).** Código e GitHub prevalecem sobre este arquivo; ao divergir, corrija aqui. `docs/HANDOFF-CLAUDE-2026-10-06.md` é um retrato de 2026-10-05 e está desatualizado em vários pontos (principalmente a Base Demo).

Referência: `main` em `b02e1b0` (merge da PR #165, trava de ambiente) · 77 migrations em `supabase/migrations/` (última `20261010100000_handoff_pontuacao_aceite.sql`).

Histórico: a migration da #139 foi aplicada em produção antes do merge, com autorização explícita; no merge, o workflow Banco de produção #57 retornou `Remote database is up to date` (nada reaplicado). Produção e `main` estão alinhadas. A migration da B1a (#161) também foi aplicada em produção antes do merge, com autorização explícita (`workflow_dispatch` na tag `b1a-migration-5137d22`); no merge, o workflow Banco de produção retornou `Remote database is up to date`.

## Concluído / avançado

- **CRM comercial base:** contatos, negócios, Kanban e lista, tarefas, notas imutáveis, anexos, funil configurável com etapas que fecham o negócio (`fecha_como`), perda com motivo obrigatório, distribuição de leads com aprovação do gestor, leads/propostas parados e leads sem contato, papel SDR completo (qualificação, handoff SDR→closer, tarefa automática), notificações in-app, Google Agenda, painel do gestor, super-admin e cobrança.
- **Super-admin:** botão "Entrar na empresa" (PR #114), reaproveitando a troca de empresa; sem impersonação e sem criar membros.
- **Calculadora, proposta e contrato:** calculadora solar com kit, proposta em PDF com modelos configuráveis e link público, contrato com status e assinatura protegida, confirmação de pagamento via RPC.
- **Gamificação — motor (fechado em 2026-10-02):** motor causal a partir de `eventos`, antifraude, XP e moedas separados, níveis, conquistas com progresso, ranking com histórico e streak, loja com saldo negativo permitido, metas e comissões causais e versionadas (PR #131).
- **Gamificação — interface:**
  - PR #130: redesign da Visão geral e do Extrato.
  - PR #136: Visão geral decidida pelo papel — **gerencial** para admin/gestor (KPIs, Ranking Closer e SDR lado a lado, metas, atividade e conquistas recentes, seletor Este mês / Mês passado; gestor vê só suas equipes) e **pessoal** para participantes. Sem mudança de banco/RLS.
  - PR #137: menu enxuto por papel (Visão geral, Desempenho, Recompensas/Administração) com abas internas (Desempenho = Ranking | Metas | Comissões; Recompensas = Loja | Extrato) e **tema escuro em todo o módulo**, incluindo `/configuracoes/{metas,comissoes,resgates}`. Rotas não mudaram.
  - PR #138: polimento visual de todas as telas do módulo (tipografia, pódio, metas, comissões, loja, extrato, jornada, administração); CSS consolidado em `_compartilhado/gamificacao.css`.
  - PR #139: **imagem opcional nas recompensas.** Storage privado (bucket `recompensas`), até 3 MB, só JPEG/PNG/WebP (SVG recusado), recorte 4:3 no navegador; envio, edição e remoção somente por admin, com policies restritas à pasta da própria empresa e a recompensa existente. Gerenciamento pela própria miniatura: adicionar, editar (reenquadrar a imagem atual), substituir e excluir com confirmação — menu flutuante no desktop e painel inferior no celular. Exibição na Loja e na prévia da Visão geral, com ícone quando não há imagem. Validada na Raion Solar Demo; CI #428 completo aprovado (inclui build). Substituiu a antiga PR #102.
- Outras telas redesenhadas: Início, Tarefas (#80) e Contatos (#82).

## Em andamento

### PR #132 — Base Demo

**A "Raion Solar Demo" está criada, completa e validada em produção.** O script (`scripts/seed-base-demo.mjs`) continua na PR #132, ainda **não mesclada**.

- `scripts/seed-base-demo.mjs` cria uma **empresa separada, "Raion Solar Demo", e não apaga nada** em nenhuma empresa. A empresa de origem (onde `ADMIN_EMAIL` é admin) só é lida, para copiar os parâmetros da calculadora. A demo tem gamificação própria (12 regras só com eventos pontuáveis, 5 níveis, 7 conquistas, 3 recompensas), criada pela sessão do admin.
- Modos: sem variável = dry-run só de leitura; `CRIAR_BASE_DEMO=sim` cria; `RETOMAR_BASE_DEMO=sim` completa uma demo parcial sem duplicar nem apagar.
- **Regra de segurança permanente:** antes de qualquer nova execução (`CRIAR` ou `RETOMAR`), rodar o dry-run e validar o resultado; executar só com **autorização específica** do Evandro.

Estado validado em produção (validação pós-retomada completa):

| Item | Resultado |
| --- | --- |
| Negócios | 35 |
| Ganhos | 12 |
| Perdidos | 5 |
| Em andamento | 18 |
| Pagamentos confirmados | 7 |
| Handoffs SDR→Closer | 5 |
| XP | Lucas 605 · Mariana 420 · Rafael 210 · Bruno 130 · Gabriel (SDR) 355 |

Membros fictícios: Lucas Martins, Mariana Costa, Rafael Almeida e Bruno Ferreira (`vendedor`/closer) e Gabriel Santos (`sdr`).

**Histórico de recuperação (não é pendência):**

1. A estratégia inicial (apagar vendedores/negócios da empresa real, `CONFIRMAR_RESET_DEMO=sim`) foi abandonada depois do dry-run e do diagnóstico de dependências (delete revogado em `eventos`, FKs `restrict` em etapas, confirmações de pagamento sem cascata). Nada foi apagado.
2. A primeira execução real da empresa separada parou no 1º negócio (erro de colunas em `calculos_solares`), corrigido no commit `83d4fbd`, que também criou o modo de retomada.
3. Dry-run de retomada aprovado → retomada real concluída (exit 0) → validação pós-retomada completa, com os números acima.

### Proteção de produção (incidente de 2026-10-09)

- **Incidente contido:** testes rodaram por engano contra produção em 2026-10-09 e criaram 161 contas `@teste.raion` (só Auth e `perfis`; 0 vínculos, 0 empresas, 0 super-admins, 0 contaminação). Em 2026-10-10 as 161 foram **bloqueadas** (ban de 87600h, reversível) pela API administrativa oficial, depois de dry-run e com verificação posterior; nada foi excluído. Script operacional fora do repositório (`scripts/ops/`, ignorado via `.git/info/exclude`). Exclusão definitiva é decisão futura.
- **Environments no GitHub (2026-10-10):** `producao-banco` (refs `main` e tags `migracao-*`) e `producao-seed` (só `main`), ambos com aprovação obrigatória de `evandroantunesb` e bypass de administrador desabilitado; secrets de produção cadastrados neles. Ruleset "Tags de migracao imutaveis" (sem bypass) impede alterar ou apagar tags `migracao-*`. `Production`/`Preview` são da Vercel e não foram tocados.
- **PR da etapa 2:** `banco-producao.yml` só manual (modos `conferir` e `aplicar`, ref + SHA confirmados, aprovação também no dry-run); seeds com `producao-seed`; conferência do destino antes de conectar (project ref, URL do Session Pooler com usuário `postgres.<ref>`, chave JWT do mesmo projeto); actions fixadas por SHA e CLI do Supabase em 2.120.0; regra no `CLAUDE.md`: agentes nunca aprovam deployments. **Depois do merge, migration não é mais aplicada no push da `main`.**
- **Pendências:** (1) testes sem tocar no banco (SHA errado, rejeitar aprovação, ref proibida); (2) **remover do nível do repositório** os secrets de produção — até lá, qualquer job sem environment ainda os lê, inclusive o `banco-producao.yml` antigo que existe em ~158 branches e poderia ser disparado nelas; (3) PR #62 (backup) precisa usar environment antes da remoção; (4) o secret geral `SUPABASE_SERVICE_ROLE_KEY` não é referenciado por nenhum workflow em nenhuma branch — candidato à remoção; (5) bloquear nas permissões do Claude Code as chamadas a `pending_deployments`; (6) as proteções de environment dependem de o repositório continuar público.

### PR #101 — Motor reconciliado do wizard

- Motor de dimensionamento real no wizard de 3 etapas + catálogo técnico de equipamentos.
- **Continua fora da `main`.** 13 migrations pendentes (`20260930150000` … `20261001050000`), com prefixos anteriores a migrations já aplicadas (dependem do `--include-all`).
- **Depende de backup de produção antes de avançar.** Não há backup automático (PR #62 parada por falta de secrets).
- Aplicar as migrations **antes** de o app subir: cadastro/edição de equipamento grava `status_tecnico`.
- PR #101 divergente da `main`: a `main` possui 124 commits que não estão no head da #101, enquanto a #101 mantém 39 commits próprios desde a base comum. Conflito com a `main` em `PROGRESS.md`.

## Outras PRs (estados verificados em 2026-10-06)

| PR | Estado | Observação |
| --- | --- | --- |
| #139 Imagem nas recompensas | mesclada | merge `3b8de5c` |
| #102 Imagem nas recompensas (antiga) | fechada, sem merge | superada pela #139 |
| #133 Handoff técnico | aberta, draft, não mesclada | conteúdo incluído nesta consolidação |
| #134 Docs (`docs/consolidar-contexto`) | fechada, sem merge | superada pela #140 |
| #116 | aberta, draft, não mesclada | sem diferença de arquivos em relação à `main` — candidata a fechar |
| #118 | aberta, draft, não mesclada | aparentemente substituída pela #119 (já na `main`) — candidata a fechar |
| #62 Backup do banco | aberta, não mesclada | bloqueada nos secrets `BACKUP_ENCRYPTION_KEY`/`BACKUP_REPO_TOKEN` |
| #68, #70, #71, #76 | abertas, não mescladas | antigas (29–30/09); #71 conflita; revisar relevância |
| #135 Dependabot (6 atualizações menores) | aberta, não-draft, não mesclada, mergeable | revisar com o Evandro |

## Outras pendências

- Revisar PRs antigas/obsoletas antes de qualquer merge.
- Teste de deadlock `tests/travas-kit-sdr-db.test.ts` (PR #164, mergeada em `0b222a4`): falhava de forma intermitente no CI (`expected undefined to be '40P01'`, linha 508; 3 falhas em 5 execuções após a #162). Agora prova o ciclo por `pg_blocking_pids` e pelo DETAIL do `40P01` (pids de X e T2), exige uma vítima `40P01`, uma operação concluída e integridade dos dados; falha com diagnóstico completo. **Residual:** a causa exata da falha original não foi provada (não reproduzida localmente; 1 falha local não diagnosticada em 36 execuções sob carga, 28 consecutivas sem falha depois; 3 execuções de CI verdes). Se voltar, a mensagem do teste indica a causa. Também há falhas esporádicas de Auth local sob carga em outras suítes (Obras, Gamificação, Blindagem), não investigadas.
- Guard de testes (PR #162, mergeada em `5a44fee`): `globalSetup` do Vitest aborta se o ambiente efetivo (`loadEnv` + variáveis do processo) tiver URL Supabase ausente, inválida ou fora de `127.0.0.1`/`localhost`/`::1`, inclusive `SUPABASE_DB_URL` e qualquer valor com domínio remoto do Supabase. **Pendente:** o `.env.local` de cada desenvolvedor precisa apontar para o Supabase local (o guard impede o teste, não corrige o arquivo); os dados de teste criados pela execução acidental de 2026-10-09 foram auditados e as 161 contas bloqueadas (ver "Proteção de produção"); a trava de ambiente da PR #165 também cobre `pnpm dev`, `start` e `super-admin`; o guard não detecta banco remoto em host próprio informado por variável não prevista; a aprovação obrigatória e a trava de SHA nos workflows de produção estão em "Proteção de produção".
- Validar em navegador real as telas novas (gamificação gerencial/pessoal, tema escuro, Tarefas, Contatos, SDR, Loja).
- Melhorar a UX geral fora da gamificação.
- Consolidar Calculadora + Propostas: importar CSV real de equipamentos/preços e repetir o teste de referência de 1.500 kWh/mês (Cascavel/PR) com o engenheiro.
- Validar produção e migrations (aplicadas × `main` × PRs).
- Deduplicação de contatos e hardening de concorrência em `unica_por_negocio` — sem data.
- `PROGRESS.md` e `HANDOFF.md` (raiz) estão desatualizados; servem só como histórico.
- PR 3b (papel `operacao`/setores de Obras): conferir se a RLS de `tarefas` precisa alinhar com o app da PR 3a (#146) — no app, só admin e gestor atribuem tarefa a outra pessoa e veem tarefas de outros; o SDR cria só para si.
- PR 3b-2 (#148, mesclada em `8ae9b8f`; migration aplicada em produção; CI pós-merge verde): o papel `operacao` passa a ver Obras como participante ativo ou coordenador de setor (`membro_setores_obra`, definida só pelo admin via `definir_setores_membro`), com identidade básica dos colegas (`identidade_membros`, avatar), sem valor vendido e sem acesso comercial. `operacao` não lê a tabela `obras` direto (caminho próprio `pode_ver_obra_operacao` só nas tabelas filhas; `pode_ver_obra` da #145 intacta): lê pela RPC `obras_operacao`, com snapshot sem o bloco `cliente` e dados pessoais só para participante ativo no setor — operacional: endereço + telefones; engenharia: endereço + CPF/CNPJ; compras: nenhum; e-mail: nenhum. `operacao` continua fora do cadastro de usuários e não há tela nova.
- PR 3b-3 (branch `feature/obras-escrita-operacao`, migration `20261008100000_obras_escrita_operacao.sql` não aplicada, sem merge): escritas do papel `operacao` só por RPC — participantes (`atribuir_participante_obra`/`encerrar_participante_obra`: admin em qualquer setor operacional; coordenador só no próprio setor, sem se autoatribuir e sem atribuir outro coordenador; ninguém encerra a própria participação), fluxos (`alterar_status_fluxo_obra`, `marcar_parado_fluxo_obra`, `definir_aguardando_fluxo_obra`: admin, coordenador do setor ou executor participante ativo; qualquer status do setor, retrocesso auditado, datas só no servidor) e marcos (`atualizar_marco_obra`, só setor operacional). Autorização única em `autorizacao_setor_obra`. Obra cancelada bloqueia tudo; pausada bloqueia fluxos/marcos. Nada fica adormecido: setor retirado encerra as participações daquele setor; desativação ou saída do papel `operacao` encerram todas as participações operacionais e removem todos os setores do membro (voltar exige nova configuração pelo admin). Histórico em `obra_historico` (4 tipos novos), com o autor real da ação. Mudanças de setor auditadas em `membro_setores_obra_historico` (admin da empresa e super-admin leem). #145 e leitura da 3b-2 intactas.
- Fluxo comercial (#154), PR 1 (#155, `feature/negocio-gravacao-dados`): corrige perda silenciosa de dados no cadastro/edição do negócio, kit, contato e anexos, sem migration. Arquivos não passam por Server Action (limite de 1 MB): o navegador envia direto ao Storage e só depois registra em `anexos` (linha do tempo fiel; o registro confere que o objeto existe na pasta autorizada e usa tamanho/tipo do Storage, sem limpeza administrativa); a ficha confere a pasta no Storage (arquivo sem registro pode ser registrado; listagem com falha vira aviso). **Ainda não resolvido (exige migration autorizada):** (1) trava no banco para o SDR não fechar negócio (na PR A); (2) pendências de criação que não são deriváveis dos dados (falha de kit/cálculo/contato na criação, arquivo que nunca chegou ao Storage) só aparecem no aviso logo após criar — desenho proposto: criação atômica por RPC e/ou tabela `negocio_pendencias` com RLS.
- PR A — travas de segurança no banco (`feature/travas-kit-fechamento-sdr`, draft, migration `20261009100000_travas_kit_e_fechamento_sdr.sql`): kit com cálculo solar nunca fica vazio, nem pelo Supabase direto, acesso de serviço ou transações concorrentes (trava por negócio); cálculo novo só com kit (fecha a corrida criação do cálculo × exclusão do último item; recálculo e cálculos antigos sem itens seguem iguais, sem correção de dados); SDR não muda status, motivo de perda nem valor (inclusive por etapa que fecha sozinha). `restaurarKit` reinsere antes de apagar. Risco residual aceito: deadlock (40P01) entre excluir o negócio e uma transação que segura um item e apaga outro — o Postgres cancela uma, dados íntegros, basta repetir. `scripts/seed-equipe-cascavel.mjs` já grava os itens antes do cálculo (testado só em banco local isolado). **Pendências:** a `seed-base-demo.mjs` da PR #132 grava o cálculo antes dos itens e precisa da mesma compatibilização antes de qualquer execução; na `seed-equipe-cascavel.mjs`, as regras padrão de gamificação ainda usam a coluna antiga `pontos` (hoje `xp`/`moedas`) e `registrarEvento` insere direto em `eventos` — revisar antes de rodar; `apagarCalculo` (`src/lib/acoes/calculadora.ts`) não tem uso na interface e ignora os erros do Supabase. **Fora da PR A (decididas, sem autorização):** vendedor com envio pendente só com leitura (A2, mexe em ~30 policies via `pode_ver_negocio`); transferência vendedor→vendedor com aceite; PR B do SDR.
- PR S — aceite/devolução de handoff pendente (`feature/handoff-aceite-gestor-equipe`, draft, migration `20261009110000_handoff_resposta_gestor_equipe.sql`): só destinatário, admin ativo ou gestor ativo de equipe ativa do destinatário (função `pode_responder_handoff`, usada também pelos botões da ficha). Resto de `aceitar_handoff`/`devolver_handoff` copiado sem mudança. O gestor do destinatário encontra e responde as pendências no Painel, por `oportunidades_pendentes_equipe` (lista restrita, colunas fixas, sem dados pessoais/financeiros; RLS de negócios/contatos não ampliada). **Futura PR R (redistribuição gerencial; só registrado):** (1) concorrência redistribuição × criação de handoff segura mesmo antes da B1a; (2) transferência de carteira e desligamento sem conclusão parcial (hoje `desligarComTransferencia` faz um update por negócio); (3) proteção contra troca direta de responsável sem quebrar aceite, atribuição de leads e futuras transferências. Sequência aprovada da PR B: S → B1a → B2 → T (transferência com aceite) → B1b.
- OPR (interface de Obras, branch `feature/obras-interface-lista`): camada de visualização; não altera o mecanismo de Obras (banco, RLS, RPCs). Esta etapa: infraestrutura de leitura (`src/lib/obras`) + `/obras` (lista, somente leitura, sem detalhe).
- OPR 2 (branch `feature/obras-detalhe`): detalhe `/obras/[id]` somente leitura; DTOs montados no servidor campo a campo; sem escrita (OPR 3).
- PR B1a — pontuação do repasse SDR → vendedor (**concluída**: PR #161 mergeada em `d0d9e53`; migration `20261010100000_handoff_pontuacao_aceite.sql` aplicada em produção em 2026-10-09 (21:07 de Brasília; 2026-10-10 00:07 UTC) pelo workflow Banco de produção, run 38007668309 (`workflow_dispatch` na tag `b1a-migration-5137d22`, SHA `5137d22`) e validada: histórico 77/77, 4 funções com os hashes esperados, dono `postgres`, 0 handoffs pendentes afetados; no merge o workflow retornou `Remote database is up to date`): decisões D1–D7 do Evandro (2026-10-09). Envio e devolução viram só histórico (motor ignora, inclusive regra antiga ativa; catálogo e ação de criar regra não os oferecem). Só o primeiro aceite do negócio pontua (garantia no motor, com trava por negócio, independente de `unica_por_negocio`). Envio validado no banco: remetente SDR ativo e responsável atual, destinatário vendedor ativo, remetente ≠ destinatário, mesma empresa, executor = o SDR, admin ou gestor de equipe ativa do SDR; negócio e vínculos travados durante o envio. `handoff.created` passa a ser um por envio, com ator (quem executou) e beneficiário/perfil (SDR) separados. Nenhum dado histórico alterado. Aceite desatualizado: se o responsável do negócio mudar depois do envio, `aceitar_handoff` recusa (trava o negócio antes de qualquer escrita); devolução segue permitida e não mexe no responsável. Qualquer troca efetiva de responsável depois do envio também recusa, mesmo que volte ao SDR (A → C → A): comparação pelo id das `atividades` (`responsavel_alterado` posterior ao `handoff_enviado` do próprio handoff). **Reversão (não usada):** migration nova com o texto anterior das 4 funções (`aceitar_handoff` de `20261009110000`, `aplicar_regras_gamificacao` de `20261002180000`, `registrar_handoff` de `20261001200000`, `validar_handoff_empresa` de `20261007100100`); eventos e `point_ledger` já gerados não são tocados. **Residual:** deadlock raro (40P01) entre aceite e desativação de membro, resolvido pelo Postgres sem corromper dados; handoffs pendentes anteriores a `20261001170000` não têm `handoff_enviado` e só poderiam ser devolvidos (produção tinha 0 pendentes na auditoria).

## Próximas prioridades

1. Base Demo (PR #132): revisar e mesclar o script com autorização (a demo já está em produção). Qualquer nova execução exige dry-run antes e autorização específica.
2. Backup do banco de produção → aplicar as 13 migrations da PR #101 → revisar e mesclar com autorização.
3. Fechar/decidir as PRs remanescentes (#116, #118, #133, #135, #62, #68, #70, #71, #76).
4. Consolidar Calculadora + Propostas (CSV real e teste de referência).
5. Validação visual em navegador real e melhorias de UX.
6. Iniciar o roadmap operacional (Pedido → Compras), conforme `docs/ROADMAP.md`, quando o Evandro decidir.
