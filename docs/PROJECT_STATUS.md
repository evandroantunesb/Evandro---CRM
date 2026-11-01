# Estado do projeto — Raion CRM

## Engenharia em Obras — P1 a P1.6 integradas em 2026-10-29; P2 a P5 em 2026-10-30; P6a e P6b em 2026-10-31; P6c e novo fluxo (#270, #271) em 2026-11-01

`main` em `c3870ee` (merge da #278). **Produção e `main` alinhadas** (última `20261102140000_privilegios_tabelas_e_iniciar_atuacao.sql`).

| PR | O que entrou |
| --- | --- |
| #253 | Tela **Engenharia** (`/engenharia`, menu Operação; lista `ENGENHARIA` = admin, gestor, operação que atua no setor). Operação sem Engenharia vê aviso e recebe 404 no card |
| #254 | **Card da obra** para o engenheiro (`/engenharia/[id]`): etapa e gestão do setor, tarefas de Engenharia, dados técnicos com fixação, dados do cliente que a RLS libera, histórico do setor. Blocos do detalhe da obra extraídos para `src/components/obras/detalhe-obra.tsx` |
| #255 | **Central** (abre em `/engenharia`; abas de tarefas em `?ver=`): indicadores; "Precisa de você" (minhas tarefas e as da fila que posso assumir; obras em que sou responsável principal; para admin/coordenador, obra sem responsável → "Definir responsável"); "Aguardando terceiros"; carteira por etapa com tempo na etapa. `carregarObras` passa a ler `status_desde`/`aguardando_desde` e marca `souPrincipal` sem expor id de membro |

**Decisões do Evandro (29/10):** rota própria `/engenharia` (a spec v1.3 sugere "Obras → Minha Engenharia"); obra em `enviado_concessionaria` ou `aguardando_vistoria` conta como aguardando terceiros mesmo sem a marcação; textos da próxima ação por etapa em `PROXIMA_ACAO_ENGENHARIA` (`src/lib/engenharia-regras.ts`); obra sem responsável aparece como "Definir responsável" antes de "aguardando".

**Especificação vigente:** `RAION_OBRAS_ENGENHARIA_COPEL_V1_3_CENTRAL_TRABALHO.md` (v1.3, 29/10, fora do repositório): central diária, fluxo guiado de 8 passos na obra, Kanban de carteira opcional e sem arrastar para aprovar, checklist condicional Copel com selo de confiabilidade, nenhum prazo regulatório sem marco comprovado.

**E2E:** `e2e/18-engenharia-card.spec.ts` escolhe a primeira obra da "Carteira por etapa", porque o 03 troca o responsável da o01 antes dele na suíte completa.

### P2 — checklist de documentos (#257)

**Migration `20261030100000_engenharia_checklist.sql` aplicada em produção em 30/10/2026** pelo `banco-producao.yml` (tag `migracao-pr257-f55d0da`; conferir + aplicar aprovados pelo Evandro; dry-run listou só ela). #257 mesclada em 30/10.

- **Modelo por empresa** (`/configuracoes/engenharia`, só admin; sem DELETE): nasce com 11 itens da spec v1.3 seção 24.2 (padrão Copel, a revisar com o responsável técnico). Aplicar na obra copia os itens ativos; editar o modelo não muda obra já aplicada; "Trazer itens novos do modelo" só acrescenta.
- **Documentos versionados** no bucket privado `engenharia-documentos` (`empresa/obra/objeto`); nada se apaga (arquivo errado = nova versão + item inválido). Download por `/documentos-engenharia/[id]`.
- **Status:** pendente → em conferência (sozinho ao anexar) → válido (exige arquivo) | inválido (motivo); "não se aplica" (motivo). Nova versão de item válido volta para conferência.
- **Regras padrão (ajustáveis):** anexa e confere quem tem `autorizacao_setor_obra(obra, 'engenharia')` (admin, coordenador, participante ativo); obrigatório só admin ou coordenador dispensa; arquivos só para admin e Engenharia da obra (gestor, comercial e outros setores veem só o status); obra pausada aceita, cancelada recusa; sem segundo revisor.
- **Histórico:** checklist aplicado, documento anexado (item e versão), item alterado. Sem nome de arquivo nem motivo (o histórico é visto por quem vê a obra).
- Escrita só pelas RPCs `aplicar_checklist_engenharia`, `registrar_documento_engenharia`, `alterar_item_engenharia` (todas por `preparar_escrita_obra`). Testes: `tests/engenharia-checklist-db.test.ts`, `tests/engenharia-checklist-regras.test.ts`, `e2e/19-engenharia-checklist.spec.ts`.
- **Lição:** ao trocar `MIGRATIONS_AUTORIZADAS` no workflow, atualizar junto `tests/validar-conjunto-migrations.test.ts` (a autorizada nova e a anterior como "já aplicada").

O engenheiro testou o P2 em 30/10.

### P3 — protocolos, exigências e trava de etapa (#258, empilhada sobre a #257)

**Migration `20261030120000_engenharia_protocolos.sql` aplicada em produção em 30/10/2026** (tag `migracao-pr258-ce6a13b`; conferir + aplicar aprovados pelo Evandro; dry-run listou só ela). #258 mesclada em 30/10 (base trocada para `main` antes de apagar a branch da #257). **Produção e `main` alinhadas** (última `20261030120000_engenharia_protocolos.sql`; `main` em `95d7edb`).

- **Protocolo** (canal PEW/CAW/atendimento/outro; um ativo por obra) com eventos imutáveis, arquivos por evento e pacote de documentos (snapshot) a cada envio/reenvio. Situações: protocolado → em análise / com exigência → aprovado / orçamento emitido → encerrado; indeferido e cancelado.
- **Exigências** com categoria e prazo interno; reenvio marca como reenviadas; aprovação, orçamento ou encerramento resolvem todas.
- **G2:** protocolo só com checklist aplicado e obrigatórios válidos ou dispensados; registrar leva a Engenharia para "Enviado à concessionária".
- **G3:** `alterar_status_fluxo_obra` recusa sair de "A iniciar"/"Projeto em elaboração" para etapa posterior sem protocolo válido (cancelado/indeferido não contam). A base E2E protocola antes de avançar as obras.
- **Central:** exigência aberta vira ação da equipe, não espera de terceiros. Histórico sem número do protocolo nem texto da distribuidora.
- Escrita só pelas RPCs `registrar_protocolo_engenharia`, `registrar_evento_protocolo_engenharia`, `registrar_arquivo_protocolo_engenharia`; leitura por `pode_ver_documentos_engenharia`. Testes: `tests/engenharia-protocolos-db.test.ts`, `tests/engenharia-protocolos-regras.test.ts`, `e2e/20-engenharia-protocolo.spec.ts`.

### P4 — vistoria, medição e conexão (#261)

**Migration `20261030140000_engenharia_vistoria.sql` aplicada em produção em 30/10/2026** (tag `migracao-pr261-889186b`; conferir + aplicar aprovados pelo Evandro; dry-run listou só ela). #261 mesclada em 30/10 (`1d77ff2`). **Produção e `main` alinhadas** (última `20261030140000_engenharia_vistoria.sql`).

- **Decisão do Evandro ("os dois"):** Engenharia e Operacional registram, cada um a sua parte. A Engenharia pede a vistoria e registra o resultado (aprovada / não conformidade), o medidor adequado e a conexão confirmada; agendamento e "vistoria realizada" são registrados pela Engenharia se atua na obra, senão pelo Operacional; a correção de campo depois de uma não conformidade é do Operacional. Regra no banco: `setor_registro_vistoria(obra, tipo)`.
- **Situações:** solicitada → agendada → realizada → aprovada ou com não conformidade (exige descrição) → correção de campo → novo pedido. Uma vistoria ativa por obra; as anteriores ficam no histórico. Cancelar exige motivo.
- **G5:** pedido de vistoria só com protocolo aprovado e instalação concluída pelo Operacional (a tela explica o que falta).
- **G6:** Engenharia só conclui com vistoria aprovada e conexão confirmada; o admin pode concluir sem conexão com justificativa (`concluir_engenharia_sem_conexao`).
- **Telas:** card "Vistoria e conexão" em `/engenharia/[id]`; no card do Operacional da obra (`/obras/[id]`), quem atua no Operacional registra a sua parte; os demais veem só situação e datas (sem número do pedido nem texto da distribuidora).
- **Arquivos** por evento no bucket privado `vistoria-arquivos` (20 MB), lidos e enviados por Engenharia e Operacional da obra (`pode_ver_vistoria_obra`); download por `/arquivos-vistoria/[id]`. O envio acontece dentro da ação de registro, antes de a tela atualizar.
- Escrita só pelas RPCs `solicitar_vistoria_engenharia`, `registrar_evento_vistoria_engenharia`, `registrar_arquivo_vistoria_engenharia`. Testes: `tests/engenharia-vistoria-db.test.ts`, `tests/engenharia-vistoria-regras.test.ts`, `e2e/21-engenharia-vistoria.spec.ts`.

### P5 — prazos em dias úteis e indicadores (#263)

Decidido pelo Evandro em 30/10: prazos contam em dias úteis a partir do dia útil seguinte ao marco (sem fins de semana, feriados nacionais — inclusive Carnaval, Sexta-feira Santa e Corpus Christi — e feriados cadastrados pela empresa). Internos com padrão editável pelo admin (A iniciar 2, Projeto em elaboração 5, exigência 3, correção de campo 5); os da distribuidora (análise, vistoria, conexão) nascem vazios e só o engenheiro/Evandro preenche. Prazo vencido só sinaliza. Indicadores (30/90 dias, medianas em dias úteis): tempo em cada etapa, protocolo→aprovação, % protocolos com exigência, % vistorias com não conformidade, vistoria aprovada→conexão.

**Migration `20261030160000_engenharia_prazos_indicadores.sql` aplicada em produção em 30/10/2026** (tag `migracao-pr263-338c513`; conferir + aplicar aprovados pelo Evandro; dry-run listou só ela). #263 mesclada em 30/10 (`d1652b4`), head `338c513` com os ajustes da revisão; CI verde (verificar, navegador, Vercel).

- Pendente: o engenheiro preenche os prazos da Copel/ANEEL em Configurações → Engenharia.

### P6a — Kanban da carteira (#266)

Na central `/engenharia`, a carteira alterna entre Lista e Kanban (`?carteira=kanban`). Sete fases da spec v1.3 (seção 31.2), com a precedência dela: Exigência > Conexão/vistoria > Em análise externa > Pronto para protocolo > Em elaboração > Conferência inicial; Engenharia concluída vence tudo. A fase é derivada (etapa, checklist pelo critério do G2, protocolos válidos, exigências abertas) e nunca gravada; sem arrastar, o cartão abre o card da obra. "Concluída" mostra obras em andamento que já fecharam a Engenharia. Sem migration. #266 mesclada em 31/10 (`bdeb12b`). Quem não lê protocolos (gestor) tem a fase pela etapa e pelo checklist. Testes: `tests/engenharia-regras.test.ts`, `e2e/23-engenharia-kanban.spec.ts`.

### P6b — oito passos guiados no card da obra (#267)

**Migration `20261101100000_engenharia_passos.sql` aplicada em produção em 01/11/2026** (tag `migracao-pr267-cd01ff4`; conferir + aplicar aprovados pelo Evandro; dry-run listou só ela). #267 mesclada em 01/11 (`465ac2b`), head `cd01ff4`; CI verde.

- **Tela:** topo com "Etapa X de 8", próxima ação, pendências, responsável e prazo; barra dos 8 passos com status (A fazer, Em andamento, Concluído, Com pendência, Não se aplica) e navegação livre. Responsável no passo 1, dados técnicos no 3, checklist no 4, protocolo no 6, vistoria no 8.
- **Passos 2, 3, 5 e 7:** confirmação formal em `obra_engenharia_passo_registros` (só inserção; RPC `registrar_passo_engenharia`, mesma porta do checklist: admin, coordenador ou participante ativo). Reabrir e "não se aplica" (só no 7) exigem motivo. Passo 5 exige checklist apto; passo 7 exige protocolo aprovado/orçamento/encerrado. Histórico registra passo e ação, sem a observação.
- **Decisões do Evandro (31/10):** revisão do passo 5 volta a "necessita revisão" quando o checklist muda (comparação na tela, nada gravado); o protocolo **não** exige o passo 5 por enquanto; a central continua com a próxima ação por etapa.
- **Lição:** o disparo do `aplicar` pelo agente foi bloqueado pelo controle de permissões do Claude Code (deploy de produção); o Evandro disparou pelo GitHub. No formulário, `sha` é o hash de 40 caracteres, não o link do run.
- Testes: `tests/engenharia-passos-db.test.ts`, `tests/engenharia-passos-regras.test.ts`, `e2e/24-engenharia-passos.spec.ts`.

### P6c — enquadramento da obra e checklist condicional (#269)

**Migration `20261101120000_engenharia_enquadramento.sql` aplicada em produção em 01/11/2026** (tag `migracao-pr269-46e530a`; conferir + aplicar aprovados pelo Evandro; o aplicar só aplicou ela). #269 mesclada em 01/11 (`9cc7360`), head `46e530a`.

- **Passo 2:** ficha de enquadramento da spec v1.3 (seção 24.1: tipo de solicitação, categoria, faixa, instalação, modalidade SCEE, titularidade, obra de rede, inversor verificado, situação ambiental; potências opcionais), com os dados do kit ao lado. Confirmar o passo exige todas as perguntas de opção respondidas; mudar a ficha depois devolve o passo a "necessita revisão".
- **Checklist condicional:** cada item do modelo tem "Condições" (só admin, em Configurações → Engenharia); sem condição vale sempre. **Nenhuma regra da Copel vem pronta.** Decisões E1–E4 (31/10): aplicar copia só o que vale (sem ficha, tudo); salvar a ficha com checklist aplicado acrescenta o que passou a valer e marca "não se aplica — Fora do enquadramento" os pendentes que deixaram de valer (voltam se valerem de novo); item válido ou dispensado não muda.
- Escrita só pela RPC `salvar_enquadramento_engenharia`. Testes: `tests/engenharia-enquadramento-*`, `e2e/24-engenharia-passos.spec.ts`.

### Novo fluxo da Engenharia (protótipo aprovado em 01/11) — #270 e #271

Protótipo no canvas "Engenharia — novo fluxo" (artifact do Evandro): Central com "Novas obras" e "Iniciar atuação", card curto com passos em cascata. Entregue em duas PRs empilhadas, ambas mescladas em 01/11:

- **#270** (mesclada em `93441c5`, sem migration): card com só o passo atual aberto e os passos seguintes apagados (cascata), dados da venda no topo, histórico recolhido; Central e Configurações › Engenharia no visual novo.
- **#271** (mesclada em `53e4e06`, head `1491fe6`; **migration `20261102100000_engenharia_iniciar_atuacao.sql` aplicada em produção em 01/11/2026**, tag `migracao-pr271-1491fe6`, conferir + aplicar aprovados pelo Evandro, só ela): quem atua na Engenharia vê as obras em curso sem responsável principal ("Novas obras", também na carteira com "Sem responsável") e assume pela RPC `iniciar_atuacao_engenharia` (vira principal; "A iniciar" → "Projeto em elaboração"; obra travada, só um leva). Indicador "Novas obras" próprio, fora de "Precisam de você" (decisão do Evandro, 01/11). Admin e coordenador continuam com "Definir responsável". `MIGRATIONS_AUTORIZADAS` só com ela. E2E 18 e 24 passam a escolher a primeira obra **com responsável**.
- **Lição:** os disparos de produção e os merges feitos pelo agente foram bloqueados pelo controle de permissões do Claude Code na primeira tentativa e passaram depois da autorização explícita do Evandro para aquela execução. A base da #271 foi trocada para `main` antes do merge; o CI não roda de novo na troca, então conferiu-se que a árvore da `main` era idêntica à base testada.
- Sem E2E do clique em "Iniciar atuação" (coberto por `tests/engenharia-iniciar-db.test.ts`).

## Adoção seletiva do vibe-coding-toolkit — Etapas 1 a 4 em 2026-11-01

Só quatro peças do [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit) (commit `21b71b6`, MIT); o processo do Raion (CLAUDE.md, AGENTS.md, Aurora) prevalece. Etapas 1 a 3 sem migration; CI pós-merge verde.

- **Etapa 1 — #273** (`173036d`): regras `quality/max-lines` (350), `quality/no-direct-console` e `quality/no-direct-data-access` em `eslint-rules/` (cópia do toolkit com aviso MIT), todas em **aviso**; o CI não usa `--max-warnings`. Acesso a dados adaptado ao Raion: cliente Supabase cru só em `src/lib/supabase`; `admin` (service_role) em `src/app` só nas rotas por token, `api/` e `(app)/perfil/page.tsx`; `src/components` sem cliente de servidor nem admin. Linha de base: 29 arquivos acima de 350 linhas, 9 `console` diretos, 0 acessos indevidos.
- **Etapa 2 — #274** (`bf013bd`): `negocios/[id]/page.tsx` (1235 linhas) dividido em página (179), `dados-ficha.ts`, `cabecalho.tsx`, `edicao-dados.tsx` e um arquivo por aba, sem mudar comportamento. Novo `e2e/25-ficha-negocio-abas.spec.ts`; testes que liam `page.tsx` como texto usam `tests/fonte-ficha.ts` (normaliza CRLF). Os outros 28 arquivos grandes viram PRs futuras, uma por vez.
- **Etapa 3 — #275** (`e7f62e9`): skill `supabase-postgres-best-practices` (supabase/agent-skills `c9be0e9`, v1.1.1, MIT) no projeto para Claude Code e Codex (`skills@1.7.4 --copy`, `skills-lock.json`, `THIRD_PARTY_NOTICES.md`); linha no AGENTS.md. A cópia global do Evandro foi mantida (decisão dele). Teste: revisão da migration `20261102100000` — achado a corrigir em PR futura: o `exception when unique_violation` de `iniciar_atuacao_engenharia` cobre a função inteira e pode devolver mensagem errada (migration nova, com autorização).
- **Etapa 4** (revisão de segurança de RLS, só leitura; relatório só na conversa com o Evandro, sem issue pública). Correção dos dois achados principais na **#276** (mesclada em `d26a42e`, head `46db124`; **migration `20261102120000_seguranca_funcoes_sem_login.sql` aplicada em produção em 01/11/2026**, tag `migracao-pr276-46db124`, conferir + aplicar aprovados pelo Evandro, só ela): `decidir_atribuicao_lead` e `expirar_atribuicoes_leads` saem da API (decisão só por `aprovar_atribuicao_lead`, que confere admin/gestor, e expiração só pelo pg_cron); nenhuma função do projeto em `public` executa por `PUBLIC`/`anon`, inclusive as que as próximas migrations criarem (privilégios padrão). `authenticated` e `service_role` sem mudança. Teste `tests/seguranca-funcoes-sem-login-db.test.ts`. **Migration nova que precise de função chamável sem login deve conceder `EXECUTE` a `anon` explicitamente.** Depois: **#277** (mesclada em `6648d19`, sem migration): `/auth/confirmar` só redireciona para o próprio site (o filtro por prefixo aceitava barra invertida, tab e quebra de linha); teste `tests/auth-confirmar-redirecionamento.test.ts`. **#278** (mesclada em `c3870ee`, head `6ced2a0`; **migration `20261102140000_privilegios_tabelas_e_iniciar_atuacao.sql` aplicada em produção em 01/11/2026**, tag `migracao-pr278-6ced2a0`, conferir + aplicar aprovados pelo Evandro, só ela): anon e authenticated sem `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` em todas as tabelas de `public` (e nas próximas, por privilégio padrão); service_role sem `TRUNCATE` no histórico imutável (`point_ledger`, `eventos`, `atividades`, `logs_auditoria`, `historico_etapas`, `calculos_solares_historico`, `propostas_emissoes`); `iniciar_atuacao_engenharia` traduz chave duplicada só na inserção do participante, pelo nome do índice. Testes `tests/seguranca-privilegios-tabelas-db.test.ts` e caso novo em `engenharia-iniciar-db`. Restam dois achados de menor gravidade, que dependem de decisão do Evandro antes de virar PR.
- **Ambiente local (Windows):** `pnpm install` em worktree novo pode travar; o Turbopack recusa `node_modules` por junção (o lint aceita). O verify.mjs do toolkit não foi executado (script baixado; bloqueado pelo controle de permissões).

## T3 — tarefas automáticas de setor (#264) — concluída em 2026-10-31

Autorizada pelo Evandro em 30/10 ("comece a T3 direto"). Regras por empresa em **Configurações → Tarefas automáticas** (admin cria, edita e desativa; sem exclusão): quando o setor X da obra chega ao status Y, nasce uma tarefa de setor (`origem = 'automatica'`, sem "quem pediu") para o setor Z, uma vez por obra e regra (nunca de novo, mesmo cancelada ou com o status voltando). Toda empresa nasce com as duas regras do Evandro. Trigger em `obra_fluxos` (pega todas as RPCs que mudam status); obra cancelada não recebe; obras que já passaram do status antes da migration não recebem nada.

- Responsável: o principal ativo do setor de destino na obra (avisado no sininho); sem ele, fila do setor. Prazo: N dias úteis a partir de hoje (padrão 2, por regra). Sem gamificação.
- Cancelar tarefa automática: só coordenador do setor ou admin (não há "quem pediu").
- **Migration `20261031100000_tarefas_automaticas.sql` aplicada em produção em 31/10/2026** (tag `migracao-pr264-02c4598`; conferir + aplicar aprovados pelo Evandro; dry-run listou só ela). #264 mesclada em 31/10 (`9ea1f79`), head `02c4598`; CI verde (verificar, navegador, Vercel). Testes: `tests/tarefas-automaticas-db.test.ts`.

## Entregas de 2026-10-29 — dados do cliente, sigilo na obra e tarefas dos setores

`main` em `fdd7c2e`. Todas as migrations abaixo foram aplicadas em produção pelo `banco-producao.yml` (conferir + aplicar, aprovados pelo Evandro), antes do merge de cada PR; **produção e `main` alinhadas** (última `20261029235000_tarefas_setor_notificacoes.sql`).

| PR | O que entrou | Migration |
| --- | --- | --- |
| #244 | Validade padrão da proposta (Configurações) | `20261029130000_proposta_preferencias.sql` |
| #245 / #246 | Tipo de fixação do telhado escolhido na obra (lista por empresa em `/configuracoes/fixacoes`); a escolha fica no card "Dados técnicos" | `20261029150000_obras_fixacao_telhado.sql` |
| #247 | Dados pessoais do cliente fora da API da obra: `obra_cliente` (sem policy, só RPC); `obras.snapshot` sem `cliente` | `20261029170000_obras_cliente_oculto.sql` |
| #248 | Dados do cliente obrigatórios para gerar contrato (nome, CPF, RG, nascimento, e-mail, telefone, CEP, rua, número, bairro, cidade; CNPJ com IE opcional), card "Dados do cliente" no negócio com ViaCEP. Contratos já existentes não são bloqueados. Na obra: endereço para Operacional, Engenharia e Compras; telefones para Operacional e Engenharia; documentos, RG, nascimento, e-mail e IE só Engenharia | `20261029190000_dados_cliente_contrato.sql` |
| #249 | Tarefas de setor (banco): `tarefas_setor` + histórico, escrita só por RPC, visibilidade por setor/participação | `20261029210000_tarefas_setor.sql` |
| #250 | Telas: **Tarefas** (menu da Operação, `/tarefas/setores`) e **Pedidos aos setores** (comercial); card no negócio (aba Atividades) e na obra; número de abertas nas abas; tarefas abertas no sininho da Operação; "Você atua em" no topo | — |
| #251 | Anexos nas tarefas (bucket privado `tarefas-setor`, separados entre "Enviados no pedido" e "Entregues por <setor>"); rótulos de setor e prazo; notificações no sininho (concluída/cancelada → quem pediu; atribuída/reaberta → responsável) | `20261029230000_tarefas_setor_anexos.sql`, `20261029235000_tarefas_setor_notificacoes.sql` |

**Regras das tarefas de setor (decididas pelo Evandro):** o comercial (inclusive vendedor e SDR) pede a Compras, Engenharia ou Operacional no negócio (ex.: orçamento do kit, projeto 3D); quem atua na obra pede na obra. Prazo padrão de 2 dias úteis. A tarefa nasce na fila do setor; quem atua no setor assume, conclui com resposta (e anexos) e quem pediu vê a resposta no negócio. Coordenador e admin atribuem; quem pediu, o coordenador e o admin cancelam com motivo; quem pediu ou o setor reabrem. Sem gamificação. Na obra, tarefa da fila só aparece para coordenador do setor ou participante da obra naquele setor (no negócio, para todo o setor).

**Lição do teste em produção:** um pedido criado num negócio de outra empresa (admin com acesso a mais de uma) não aparece para a Operação da Raion Solar Demo — conferir a empresa embaixo da logo antes de testar. Teste E2E `e2e/17-tarefas-setor.spec.ts` cobre o caminho admin → Engenharia com anexo.

**Próximos passos (aguardam comando do Evandro):**
1. **T3 — tarefas automáticas:** entregue e em produção (seção "T3" acima).
2. **Engenharia em Obras:** P1 a P1.6, P2 (checklist e documentos), P3 (protocolos, exigências e trava de etapa) e P4 (vistoria, medição e conexão) entregues e em produção (seção "Engenharia em Obras" acima). Já decidido no P2: item obrigatório só é dispensado por admin ou coordenador; sem segundo revisor por enquanto; o modelo Copel de 11 itens ainda deve ser revisado com o responsável técnico. **P5** (prazos em dias úteis e indicadores) entregue na #263 e em produção. **P6a** (Kanban da carteira, #266), **P6b** (oito passos guiados, #267) e **P6c** (enquadramento e checklist condicional, #269) em produção. **Novo fluxo** do protótipo de 01/11 (#270 e #271) em produção. Pendências e agenda da Engenharia continuam reutilizando `tarefas_setor`.
3. CNH com preenchimento automático dos dados do cliente (3b); endereço estruturado na ficha do contato (junto da #239).
4. PRs #234 e #239 precisam de rebase na `main`.

## Usuários operacionais — PR #229 integrada e conferida em 2026-10-28

PR #229 (`feat/usuarios-operacionais`) integrada na `main` em `46bf650`: cadastro do papel Operação e configuração por administrador dos setores de Obras e das capacidades executar/coordenar pela RPC existente. A tela informa que coordenadores veem todas as obras e que remover setor encerra participações; operação não recebe leads nem perfil de gamificação no cadastro. Sem migration nesta etapa. CI pós-merge aprovada ([run 40611162841](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/40611162841)); deploy Vercel de produção do mesmo SHA em estado `READY`, com o alias `raion-crm-roan.vercel.app`; `/login` respondeu HTTP 200. Testes direcionados de cadastro, permissões, acesso e escrita em Obras foram aprovados na stack Supabase local; as suítes de banco criaram dados fictícios locais. As demais etapas do fluxo de pós-vendas ainda não foram implementadas.

Conferência pós-merge de produção, somente leitura, em 28/10: o histórico de migrations do projeto `raion-crm` em `sa-east-1` contém `20261006220000_obras_base`, `20261007100000_papel_operacao`, `20261007200000_obras_acesso_operacao` e `20261008100000_obras_escrita_operacao`. As funções `definir_setores_membro`, `obras_operacao` e `autorizacao_setor_obra` existem; as duas primeiras permitem execução por `authenticated` e não por `anon`, e a terceira é interna, sem execução por ambos. Há **zero** membros com papel `operacao` e **zero** atribuições de setor para outros papéis; portanto, não há usuários existentes desse papel a migrar. Nenhum dado foi alterado. A checagem da interface autenticada em produção e uma atribuição real pelo admin ainda não foram feitas; não inferir aceite funcional de produção do HTTP 200 em `/login`.

Decisão de produto confirmada em 27/10: os setores são uma estrutura do produto, não departamentos fixos da IBS. O admin pode definir, para cada usuário de Operação, um ou vários setores (Compras, Engenharia, Operacional) e a capacidade em cada um. Uma mesma pessoa pode acumular Engenharia, Compras e acompanhamento operacional; Vinícius foi citado como caso de atuação apenas no Operacional, sem alteração de Engenharia. A ausência de atuação em um setor bloqueia escrita nele, mas não oculta o andamento dos demais setores de uma obra que a pessoa já pode consultar. A configuração usa o formulário por pessoa e a RPC `definir_setores_membro`; nenhuma atribuição a uma pessoa real foi feita nesta etapa.

Validação desta decisão: 7/7 testes direcionados de cadastro/setores, typecheck e ESLint dos arquivos alterados aprovados. O teste de navegador `e2e/16-usuarios-operacionais.spec.ts` passou (2/2) em worktree temporário no disco C:, com build do app e Supabase local: conferiu no celular o usuário que atua só no Operacional e confirmou que um admin salva três setores com capacidades diferentes para a mesma pessoa, persistidos após recarregar. Na unidade R:, o build de E2E não avançou; o teste foi concluído no C: com os mesmos arquivos. Nenhum usuário real foi alterado.

## Calculadora GD II — revisão de 2026-10-23

`main` em `3ee53b8`: cálculo GD II já integrado (#214–#216), limitado ao enquadramento Copel B1 residencial e ao período oficial disponível (2026/27). Sem economia financeira comprovada, a proposta com economia continua bloqueada; payback segue indisponível. A antiga PR draft #209 conflita com a linha atual e não deve ser mesclada integralmente.

Branch `fix/consumo-efetivo-separado` em revisão: o consumo estimado pela fatura usa uma tarifa efetiva informada separadamente da tarifa base TE + TUSD; registra a origem nas colunas já existentes `negocios.consumo_estimado_kwh` e `tarifa_efetiva_kwh`, preserva a estimativa ao reabrir e recalcular o kit e compara esse consumo na vigência. Nenhuma migration nova. Lint, typecheck e build com variáveis locais fictícias passaram; testes de banco exigem stack local verificada e ficam para a CI. Merge e produção dependem da revisão e autorização do Evandro para a PR específica.

Documento vivo. **Atualizações de backups e arquitetura Pedido + Obra: 2026-10-14 (Brasília).** As demais seções comerciais são principalmente um retrato de 2026-10-10; verifique estados atuais no GitHub antes de agir. Código e GitHub prevalecem sobre este arquivo; ao divergir, corrija aqui. `docs/HANDOFF-CLAUDE-2026-10-06.md` é um retrato de 2026-10-05 e está desatualizado em vários pontos (principalmente a Base Demo).

Referência: `main` em `b02e1b0` (merge da PR #165, trava de ambiente) · 77 migrations em `supabase/migrations/` (última `20261010100000_handoff_pontuacao_aceite.sql`).

Histórico: a migration da #139 foi aplicada em produção antes do merge, com autorização explícita; no merge, o workflow Banco de produção #57 retornou `Remote database is up to date` (nada reaplicado). Produção e `main` estão alinhadas. A migration da B1a (#161) também foi aplicada em produção antes do merge, com autorização explícita (`workflow_dispatch` na tag `b1a-migration-5137d22`); no merge, o workflow Banco de produção retornou `Remote database is up to date`.

## Handoff Pedido + Obra — decisões consolidadas em 2026-10-14

**Fonte de decisões de produto aprovada pelo Evandro:** [ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md](ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md). **D1–D12 confirmadas; implementação ainda NÃO autorizada.** O Claude realizou somente análises de leitura; nenhum código, migration ou dado de produção foi alterado nesta rodada.

**Regra:** venda ganha + contrato assinado + pagamento confirmado → Pedido sempre; Obra na mesma transação **somente** com módulo Obras habilitado e escopo contratado `com_execucao`. Módulo opcional por empresa no onboarding, empresas novas começam desligadas; empresas existentes preservam habilitação e histórico. Desativar impede **novas** Obras, mas mantém **edição** das existentes dentro das permissões atuais. Ativar posteriormente não gera Obras antigas automaticamente: admin escolhe Pedidos elegíveis. Gestão e Apresentação são duas vistas da mesma Obra. Acesso SDR ao andamento do Pedido sem finanças; separar custo estimado histórico, orçamento e custo real.

**Próximos passos:** revisão técnica da ADR com Claude **Opus** (somente leitura), reconciliar PR #167/roadmap e definir P0 documental. Migrations M1/E1/P1, backfill e auditoria de produção exigem aprovação específica; primeira validação de backups agendados prevista para **15/10/2026 às 05h45 Cascavel**. A auditoria D10 foi aprovada como requisito, **não como autorização para executar acesso em produção**.

**Migração de estação de trabalho:** no notebook, confirmar `git status`, branch, remotes e fazer `git fetch origin`; nunca apagar trabalho local. Só em worktree limpa e branch `main`, `git pull --ff-only origin main`. `CLAUDE.md` já aponta para este status. A ADR entra na `main` somente depois da revisão e do merge autorizado de sua PR.

## Backups e continuidade operacional — atualização de 2026-10-14

**Situação:** rotinas **diárias habilitadas por autorização do Evandro em 2026-10-14**, segundo confirmação de que as três variáveis do repositório foram definidas como `true` (os valores **não puderam ser relidos via integração GitHub**). **Primeiro ciclo de evento `schedule` ainda NÃO validado**; isso deve ser conferido na madrugada seguinte. Documentação operacional detalhada: [BACKUPS-DIARIOS-PRODUCAO.md](BACKUPS-DIARIOS-PRODUCAO.md).

- **PostgreSQL:** `.github/workflows/backup-producao.yml` — `23 3 * * *` UTC / **00h23 Cascavel (UTC−3)**. Backup lógico Supabase (`roles.sql`, `schema.sql`, `data.sql`, `info.txt`), compactado em `backup.tar.gz`, mais `sha256.txt`. Run manual posterior à integração Healthchecks: [38540411558](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38540411558), concluído com sucesso em 14/10/2026 às 06h13 de Cascavel.
- **Storage físico:** `.github/workflows/backup-storage-producao.yml` — `41 4 * * *` UTC / **01h41 Cascavel**. Captura bytes de objetos privados, inventário/manifesto e SHA-256 por objeto; publica `storage.tar.gz` e `sha256.txt`. Run manual [38500063581](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38500063581) validou novo upload sob Object Lock; após integração Healthchecks, usuário confirmou primeiro ping do Storage às 06h20 de 14/10/2026 (a execução GitHub desse último teste não foi registrada aqui).
- **Restauração isolada anteriormente comprovada:** dump restaurado num Supabase local completo, com 59 tabelas `public`, 172 pares Auth/perfis, 182 FKs sem órfãos, 59 tabelas com RLS e 153 políticas; objetos físicos do Storage restaurados em ambiente isolado, **7/7 HTTP 200 com SHA-256 válido**. Não é snapshot simultâneo, PITR, nem recuperação integral de toda a plataforma.
- **Destino B2:** bucket privado `raion-crm-backups`, prefixos `postgres/` e `storage/`. Object Lock **Compliance, retenção padrão de 30 dias** conferida nos **dois arquivos** de novo backup de cada tipo (PostgreSQL: run [38500844122](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38500844122); Storage: run 38500063581). A regra vale para **novos objetos**, não retroativamente; **não apaga automaticamente** objetos após 30 dias. Lifecycle está em **manter todas as versões**; custos/crescimento e eventual política de expiração segura precisam de projeto separado, **sem deleção agora**.
- **Alertas GitHub:** `.github/scripts/alertar-falha-backup.mjs` registra Issue em falha. Fluxo de falha simulada e notificação por e-mail validado em [run 38503323578](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38503323578) (job de falha proposital vermelho, job de alerta verde). Não houve falha de produção nesse teste.
- **Monitoramento externo Healthchecks.io:** monitores `Raion CRM - PostgreSQL` e `Raion CRM - Storage`, mesmo cron UTC de cada backup e **grace de 3 horas**. Environment secrets `HEALTHCHECKS_POSTGRES_PING_URL` e `HEALTHCHECKS_STORAGE_PING_URL`; **nunca imprimir, colar ou versionar URLs de ping**. Ping somente após upload dos dois arquivos no B2 e confirmação de tamanho; pings manuais validados em ambos, e-mail de teste do Healthchecks recebido. Falhas no ping tornam o job vermelho e acionam o alerta GitHub, mesmo se os arquivos já tiverem sido publicados no B2.
- **Controle de ativação:** variáveis de **repositório** `BACKUP_DIARIO_HABILITADO`, `BACKUP_RETENCAO_VERIFICADA`, `BACKUP_ALERTAS_VERIFICADOS`, todas relatadas como `true` pelo Evandro. Job de autorização permite execução agendada somente se as três forem literalmente `true`. Environment `backup-producao`: apenas branch `main`, sem required reviewers; secrets de produção no environment. Execuções manuais continuam exigindo confirmação exata. **Não alterar environments, credenciais, retenção nem variáveis sem nova autorização explícita.**
- **PRs concluídas:** #172 (backup Storage), #173 (agendamento controlado), #174 (resumo do Storage), #176 (notificação bot), #178 (simulação de falha), #180 (Healthchecks). `CLAUDE.md` aponta para este status; ao retomar, consultar também a documentação operacional e o código da `main`.

**PENDENTE antes de considerar a operação recorrente comprovada:** conferir as **duas primeiras execuções disparadas por `schedule`** (não apenas sinal verde do job de validação), os respectivos `tar.gz` + `sha256.txt` no B2, Object Lock Compliance/30 dias e os dois pings no Healthchecks; ajustar incidentes somente com aprovação. Agendar teste periódico de restauração e definir política de armazenamento/custos separadamente. Em emergência, `BACKUP_DIARIO_HABILITADO=false` pausa novos backups agendados (não cancela job já iniciado).

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

### Obras: tipo de fixação do telhado — concluído em 2026-10-29

Integrado (#245; ajuste visual #246) e migration `20261029150000_obras_fixacao_telhado.sql` aplicada em produção. Ver a seção "Entregas de 2026-10-29" no topo.

### Eletroposto — segundo tipo de negócio (2026-10-26)

- **Decisões do Evandro (26/10/2026):** "Novo negócio" abre um pop-up **obrigatório** de escolha entre Energia solar (fluxo atual) e Eletroposto (carregador DC 80 kW, modelos IBS Basic R$ 99.900, Full R$ 119.900 e Full Screen R$ 149.900, preços fixos de catálogo, sem edição). Cadastro: nome, WhatsApp, endereço do cliente, local próprio (sim/não) e usina FV (sim/não) — os dois últimos só para o vendedor, não mudam a proposta. Vários modelos = negócio sem valor até o cliente escolher. Proposta fiel ao modelo de 4 páginas da IBS, na identidade visual do Raion por enquanto; consultor = responsável pelo negócio.
- **Migration `20261026120000_eletroposto.sql`:** `empresas.eletroposto_ativo` (padrão desligado; o super-admin liga em Super-admin › empresa › Módulos), `negocios.tipo` (`solar` | `eletroposto`, imutável) e `negocios_eletroposto` (modelos, preços congelados, token do link; RLS como a proposta emitida: SDR não lê). Testes em `tests/eletroposto.test.ts` e `tests/eletroposto-db.test.ts`.
- **App:** `src/lib/eletroposto.ts` (catálogo e simulação; números conferidos com o modelo: R$ 6.412/mês, payback 16/19/17 meses), `/negocios/novo?tipo=eletroposto`, aba Eletroposto na ficha, proposta pública em `/proposta/eletroposto/[token]` (imprimir / salvar PDF pelo navegador).
- **Pendências:** ligar o módulo para a IBS em produção (pelo super-admin, depois da migration aplicada); ("Dados do negócio" com valor opcional e sem campos solares no eletroposto: resolvido em 27/10/2026); sem registro de abertura do link; contrato, pagamento e comissão do eletroposto fora desta entrega.

### Eletroposto: SDR e pontuação (2026-10-27, branch `feat/eletroposto-sdr-pontuacao`)

- **Decisões do Evandro (26/10/2026):** o SDR também abre negócio de eletroposto, só cadastrando o lead (sem modelo, preço nem proposta); o eletroposto ganha pontuação própria, editável pelo admin.
- **Migration `20261027100000_eletroposto_sdr_pontuacao.sql`:** `negocios_eletroposto.modelos` aceita lista vazia; policies do SDR só para o registro sem modelos; token do link gerado pelo banco e trocado na primeira escolha de modelos (o token que o SDR leu nunca vira o link com preços); `gamification_rules.tipo_negocio` (padrão `solar`, todas as regras existentes ficam solares); gatilho `eventos_registrar_tipo_negocio` grava o tipo no payload; motor filtra a regra pelo tipo; regras do eletroposto copiadas das ativas do solar ao ligar o módulo (`semear_regras_eletroposto`).
- **App:** pop-up de tipo também para o SDR; formulário e aba Eletroposto sem modelos para o SDR; campo "Tipo de negócio" nas regras de pontos.
- **Testes:** `tests/eletroposto-db.test.ts` (fluxo do SDR, token) e `tests/eletroposto-pontuacao-db.test.ts` (regras por tipo, cópia ao ligar). Suíte completa local: falhas só por CRLF no Windows (`fechamento-marcos`) e concorrência no banco (as 7 suítes passam isoladas).
- **Ainda fora:** metas e comissões não foram revisadas para o eletroposto (não separam por tipo de negócio).

### Temperatura do negócio — PR 1 de 3 (2026-10-24)

- **Spec aprovada pelo Evandro em 24/10/2026:** temperatura calculada na leitura por um cardápio fixo de regras (`regras_temperatura`) que admin **e** gestor configuram (liga/desliga, parâmetros, Quente/Frio, ordem; 1ª que bate = "porquê"; nenhuma = Morno). Padrões: contrato gerado (desde rascunho) Quente 1º; sem atividade 7 dias Frio; só pesquisando Frio; prazo imediato/até 30 dias + decisor Quente; demais desligadas. Abertura de proposta ficou **fora** (PDF baixado não é rastreável e as versões emitidas não registram abertura).
- **Migration `20261024100000_temperatura_negocio.sql`** (aditiva: tabela + RLS, `salvar_regras_temperatura`, `temperatura_negocios`, `negocios.fechamento_previsto`, campo obrigatório "fechamento_previsto" por gatilho próprio; não reescreve função do M1). Testes em `tests/temperatura-negocio-db.test.ts`.
- **App:** selo no Kanban, na Lista e na ficha (com o porquê); mês previsto no "Dados do negócio"; Configurações > Temperatura (link também na tela de Negócios para o gestor).
- **Produção:** migration aplicada em 24/10/2026 pela tag `migracao-pr222-e8eab39` (conferir e aplicar com aprovação do Evandro), antes do merge.
- **Próximas:** PR 2 forecast (3ª visão no seletor Kanban/Lista + resumo na Início; Comprometido = contrato aguardando assinatura ou assinado); PR 3 tarefas automáticas ("mês chegando" a partir do dia 20 e "parado"), que **não** geram pontos.

### P1a-0 — Arquivamento de negócio (PR draft, 2026-10-16)

- **Migration `20261016200000_negocios_arquivamento.sql`** (1ª de 2; a P1a-1, versões imutáveis de proposta, fica para outra PR e exige esta). Arquivar/desarquivar (admin/gestor, motivo obrigatório, registro em `logs_auditoria`); arquivado é somente leitura por qualquer caminho (notas e etiquetas livres); arquivar recusa tarefa aberta (informa quantas), distribuição de lead ou repasse pendentes, contrato, pagamento, obra e responsável inativo. Concorrência: gatilhos travam o negócio em `FOR KEY SHARE` e serializam com o `FOR UPDATE` do arquivar (testado com duas sessões reais). Distribuição de lead, contrato e obra também não entram no arquivado por UPDATE (troca de `negocio_id`, volta a pendente) — brecha de `service_role`/dono encontrada na revisão de liberação e fechada; pagamentos já eram imutáveis no M1. Na 2ª revisão: arquivar/desarquivar só pelas funções também para o dono (marca de transação exigida pelo gatilho), negócio não nasce arquivado, e linha arquivada recusa UPDATE só de `updated_at` ou sem mudança (o `ON DELETE SET NULL` continua aceito).
- **Efeito no M1:** o deadlock residual aceito na PR A (excluir o negócio × transação que segura um item do kit e apaga outro) deixa de ocorrer — a escrita no kit já trava o negócio, então a exclusão espera e termina íntegra. O teste correspondente em `tests/travas-kit-sdr-db.test.ts` passou a exigir esse comportamento.
- **App:** ação na ficha, filtro "Arquivados" na lista; arquivados fora do Kanban, do painel, dos indicadores de carteira e do desligamento com transferência. Validado visualmente em stack Supabase descartável (19/19, sem acesso fora de localhost); a validação corrigiu dois defeitos de tela (escolhas apagadas após recusa; editor de dados com responsável antigo após desarquivar).
- **Ordem obrigatória:** a migration precisa estar aplicada em produção (fluxo `banco-producao.yml`, com aprovação do Evandro) **antes** do merge — o código já lê as colunas novas e o preview da Vercel usa o banco de produção. Nada aplicado até agora. Plano: último commit da PR troca `MIGRATIONS_AUTORIZADAS` só para esta migration, tag `migracao-pr198-<sha7>`, `conferir` e `aplicar` na tag, validação só de leitura e então o merge (precedente das #190–#192 e #189) — commit da lista e tag dependem de aprovação específica.
- **Pacote de revisão** (fora do repositório): SQLs, suíte fail-closed e evidências em `revisao-P1-v8/` e `revisao-P1-v9/` no ambiente local do Evandro.

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
- **Backups de produção:** novo fluxo de PostgreSQL/Storage foi implantado e ativado por variáveis em 2026-10-14 (ver seção acima), com primeiro ciclo agendado ainda pendente de confirmação. A PR #62 é um fluxo legado distinto; aplicar migrations da #101 continua exigindo autorização própria e revisão específica do risco.
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
2. Confirmar o primeiro ciclo de backups agendados e, em etapa separada, reavaliar a aplicação das 13 migrations da PR #101 (somente com autorização específica, revisão técnica e backup recente verificado).
3. Fechar/decidir as PRs remanescentes (#116, #118, #133, #135, #62, #68, #70, #71, #76).
4. Consolidar Calculadora + Propostas (CSV real e teste de referência).
5. Validação visual em navegador real e melhorias de UX.
6. Iniciar o roadmap operacional (Pedido → Compras), conforme `docs/ROADMAP.md`, quando o Evandro decidir.
