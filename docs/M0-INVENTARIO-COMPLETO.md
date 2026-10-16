# M0 — Inventário funcional integral (64 frentes) — Raion CRM
Base: `origin/main` = 515b68b (15/10/2026). Somente leitura. 31 PRs abertas (lista no fim). Plano Mestre: PR #193 (55ec601).
**Evidência:** [C] código lido · [T] teste automatizado existente (NÃO rodado nesta rodada) · [N] navegador = **nenhuma frente foi verificada em navegador**. "Funcional" = código completo + teste existente; não é aceite funcional.
Itens por frente: 1 Funcionalidades · 2 Situação · 3 Onde · 4 PRs/dependências · 5 Problemas/lacunas · 6 Falta · 7 Como comprovar.

# A. PLATAFORMA

**A01 Multiempresa/isolamento** — 2 FUNCIONAL (código + teste de banco; segurança pendente).
1 empresa_id em tudo, RLS, empresa atual por cookie validado no servidor, empresa suspensa perde acesso, criação de empresa só pelo super-admin.
3 sessao.ts, supabase/*, acoes/empresa-atual.ts, migrations fundacao e blindagem_comercial; tests rls, blindagem-comercial-db. 4 #190/#191/#192.
5 contratos.empresa_id só é amarrado ao negócio na #191; a varredura "toda tabela filha ↔ pai ↔ empresa_id" nunca foi feita (só amostra); não há cadastro self-service.
6 auditoria sistemática de integridade e teste de varredura de RLS.
7 duas empresas/dois usuários: pela API direta, o usuário B nunca lê/escreve dados da A; suspender A derruba o acesso na hora.

**A02 Identidade e acesso** — 2 PARCIAL.
1 login, recuperação, definir senha, /auth/confirmar, convite (super-admin), criação direta com senha temporária (admin). 3 login/, recuperar-senha/, definir-senha/, auth/confirmar, proxy, convites.ts. 4 depende de SMTP no Supabase.
5 ZERO teste automatizado de autenticação; senha temporária gerada com Math.random e exibida em tela, sem troca forçada; sem rate limit/captcha/MFA na aplicação (produção desconhecida); conta existente de outra empresa é vinculada sem consentimento.
6 testes, CSPRNG, troca obrigatória, decisão de MFA. 7 convite → /definir-senha → /inicio; e-mail inexistente na recuperação mostra a mesma mensagem; `next` externo em /auth/confirmar é recusado.

**A03 Papéis, equipes, setores** — 2 PARCIAL.
1 admin/gestor/vendedor/sdr/operacao, equipes, status ativo/inativo/desligado, trava "empresa nunca sem admin", listas positivas de permissão. 3 permissoes.ts, tipos.ts, configuracoes/{usuarios,equipes}; tests permissoes, rls, blindagem-comercial-db.
5 **operacao NÃO é cadastrável pela UI** (PAPEIS_CADASTRAVEIS = admin, gestor, vendedor, sdr — verificado); desligar com transferência só move negócios ABERTOS para vendedor, em loop sem transação, com Math.random, sem tarefas/handoffs/leads; ações de equipe sem tratamento de erro; super-admin pode se vincular como admin e ler tudo (diverge de AGENTS.md). Engenharia/Administrativo: planejados.
6 caminho para criar operacao, transferência atômica, decisão sobre super-admin. 7 admin desliga vendedor com 3 negócios: os 3 mudam de responsável; o único admin não pode ser desligado.

**A04 Planos Solo/Pro** — 2 PARCIAL.
1 na main só planos_empresa gratuito/pago (cobrança manual); Solo/Pro só nas PRs. 4 #186 → #188 → #189 (ordem obrigatória).
5 limite_usuarios é gravado e NUNCA imposto; nenhuma UI define produto='solo'; a "PR 3" não foi aberta; sem downgrade; a empresa não vê o próprio plano.
6 PR 3, impor limite, módulos opcionais, UX por plano. 7 empresa solo com 1 admin registra pagamento; o 2º usuário bloqueia novos registros sem suspender ninguém.

**A05 Billing/assinaturas** — 2 PARCIAL.
1 cobrança manual (fechar mês imutável, marcar pago). 3 cobranca.ts, super-admin/cobranca.
5 sem gateway/checkout/webhook/fatura/inadimplência; sem testes de calcularValoresPlano/fecharMes; valores sem validação numérica no zod.
6 decidir gateway, modelo de fatura, política de inadimplência, tela da empresa. 7 plano por usuário × 3 usuários = prévia 3X; fechar mês; alterar plano; o fechamento não muda.

**A06 Super-admin/suporte** — 2 FUNCIONAL (código).
1 criar empresa + convidar admin, suspender/reativar, editar plano, "Entrar na empresa" (sem impersonação).
5 alterarSituacao ignora erro; criarEmpresa não é atômico; sem trilha de intervenção, reset de senha, busca/paginação, exportação.
7 criar empresa, suspender, o admin perde acesso, conferir registro em logs_auditoria.

**A07 Onboarding guiado** — 2 PLANEJADA / INEXISTENTE (ROADMAP: 15%).
1 nada. Empresa nova (criada só pelo super-admin) recebe por trigger: funil "Vendas" com 4 etapas, 9 origens, motivos de perda e parametros_calculadora padrão.
5 **NÃO recebe:** modelo de contrato, identidade/modelo de proposta publicado, catálogo/kits, regras de gamificação (nenhum trigger em empresas → zero pontos até criarem regras; a confirmar), equipe, usuários. Gerar contrato exige "cadastre o modelo"; proposta cai no PDF legado sem modelo padrão publicado.
6 fluxo Solo e Pro, módulos opcionais, identidade, catálogo, modelos, primeira venda. 7 empresa nova faz a primeira venda completa sem o desenvolvedor.

**A08 Infra/CI/CD** — 2 FUNCIONAL.
1 ci.yml (db:types, lint, typecheck, test, build), banco-producao.yml manual (conferir/aplicar, environment com aprovação), navegador-obras.yml (Playwright só Obras), Dependabot, trava local fail-closed.
5 **o preview da Vercel usa o banco de produção**; a trava não cobre build/CI/seeds; Vercel não verificável (sem vercel.json). 6 política preview × produção; e2e além de Obras. 7 PR com CI verde; dry-run lista as pendentes; `pnpm dev` com .env remoto falha.

**A09 Backups/recuperação** — 2 PARCIAL.
1 backup PG (03:23 UTC) e Storage (04:41 UTC) com SHA-256, B2, Object Lock 30d, Healthchecks, alertas por Issues.
5 API do GitHub: schedule de 14/10 = job SKIPPED (variáveis ainda não valiam); schedule de 15/10 = executado com sucesso (PG ~2m35s às 03:56 UTC; Storage ~25s às 05:08 UTC). Os docs ainda tratam o 1º ciclo como pendente. **Não comprovado por ninguém:** arquivos do dia 15 no B2, SHA-256, Object Lock, pings. Sem PITR/snapshot simultâneo; cadência de restauração indefinida.
6 conferir painéis, cadência de restauração, custos. 7 B2 com postgres/<data> e storage/<data>, retenção 30d, ping no horário, restauração em banco isolado.

**A10 Observabilidade** — 2 PARCIAL.
1 só alertas de backup. 5 sem Sentry/uptime/métricas; **sem error.tsx / not-found.tsx / loading.tsx / global-error.tsx na main** (verificado). 6 ferramenta de erros/uptime, páginas de estado. 7 erro provocado em staging aparece com alerta.

**A11 Segurança/LGPD/governança** — 2 PARCIAL.
1 RLS ampla e testada; ledger/eventos/atividades imutáveis; logs_auditoria. 4 #190/#191/#192.
5 auditoria só em 9 tabelas (não em contratos/negócios/contatos/planos/fechamentos); /proposta, /contrato e /captura são públicas via service role com token uuid sem expiração/revogação (/contrato expõe o texto integral); captura sem captcha/rate limit; LGPD operacional inexistente (consentimento, exportação, retenção, anonimização); incidente de 09/10 (161 contas @teste.raion) contido; preview usa produção.
6 liberar as PRs, tokens expiráveis, antiabuso, ampliar auditoria, programa LGPD. 7 SDR tenta contratos/confirmações pela API (falha após #190); 50 envios em /captura são limitados.

**A12 Experiência transversal** — 2 PARCIAL.
1 paleta carvão/dourado/off-white, Manrope/Inter, sidebar + mobile, manifest PWA. 5 sem service worker, sem auditoria de contraste/acessibilidade, sem páginas de 404/erro/loading, e2e só Obras. 7 Lighthouse/axe, celular real, instalação do PWA.

**A13 Documentação/suporte** — 2 PLANEJADA.
5 sem ajuda, termos, privacidade ou LGPD no app (o login não tem links legais). 6 termos, política, ajuda por papel, canal de suporte.

# B. CRM COMERCIAL

**B01 Captura** — 2 PARCIAL.
1 formulário público /captura/[token], QR/PDF, wa.me, origens (9 padrão). 3 acoes/captura.ts, configuracoes/{captura,origens}, pdf-captura.tsx.
5 **sem teste automático**; sem rate limit/honeypot/captcha; contato inserido antes do negócio sem atomicidade (órfão); sem checagem de duplicidade; lead sem membro elegível fica sem responsável e FORA da fila "Leads a distribuir"; sem UTM/gclid/fbclid (campanha/indicação = só rótulo de origem).
6 testes, RPC atômica, antispam, UTM, fila para lead sem sugerido. 7 QR → envio → contato + negócio + pendência; repetir sem vendedor elegível e ver onde o lead cai.

**B02 Contatos** — 2 PARCIAL.
1 lista (busca nome/e-mail/telefone, limit 200), ficha, exclusão admin/gestor, aviso de duplicado no wizard (RPC buscar_contato_duplicado, com teste).
5 deduplicação PARCIAL (o doc diz pendente; já há aviso; falta mesclagem, unicidade e checagem na captura); **excluirContato retorna mudo em erro** (verificado; negocios.contato_id é on delete restrict); sem paginação; sem criação avulsa.
7 contato A + novo negócio com o mesmo telefone mostra aviso; excluir contato com negócio mostra mensagem.

**B03 Negócios/funil** — 2 FUNCIONAL (núcleo), com mock no wizard.
1 Kanban/lista, filtros, wizard de 3 passos, ficha, mover etapa com comentário, perda com motivo, campos obrigatórios por etapa (gatilho SQL), funis/etapas configuráveis. 4 #70 (travamento ao mudar cor; correção real, 1 arquivo), #71 (empilhada na #70; conflita com a main), #101.
5 **o passo 2 do wizard mostra "Sistema recomendado" por estimativa fixa (kWp × 1,24; módulo de 620 W "exemplo") e "alertas (exemplo)"**; limites silenciosos 500/5000; criação não transacional; valor obrigatório inclusive para SDR.
7 funil com 3 etapas, negócio pelo wizard, mover até a etapa de perda e ver o motivo.

**B04 Atribuição/distribuição** — 2 PARCIAL.
1 rodízio (4 modos), fila de aprovação, auto-aprovação por pg_cron (5 min), reatribuição, desligamento com transferência.
5 **falha provável (não reproduzida):** expirar_atribuicoes_leads faz loop sem tratamento de exceção por item (verificado no SQL); decidir_atribuicao_lead recusa responsável inativo → UM lead pendente com sugerido desligado pode travar a auto-aprovação de todos; nada cancela pendências ao desativar o membro. Só o rodízio puro tem teste (nada de RPC/cron). "Inativo" com carteira passa sem transferir.
6 tratar exceção por item, cancelar pendências, testes de banco. 7 2 leads pendentes, desligar o sugerido do 1º, vencer o prazo: o 2º ainda é distribuído.

**B05 Qualificação/SDR/handoff** — 2 FUNCIONAL (forte em testes).
1 qualificação (12 campos), envio, aceite/devolução (inclui delegação por gestor), feedback, origem causal write-once, travas do SDR. 4 #192.
5 handoff_origem_id sem trava na main até a #192; critérios de qualificação fixos (a spec pedia configuráveis).
7 SDR qualifica → envia → closer aceita → ganha → assina: um único crédito ao SDR; gravação direta da origem é recusada (após #192).

**B06 Tarefas/agenda/follow-up** — 2 PARCIAL.
1 tarefas com resultado obrigatório (ligação/WhatsApp/reunião/visita), atribuição por admin/gestor com notificação, Google Agenda (OAuth), sininho (5 tipos), leads/propostas parados, sem contato.
5 sem editar/reagendar tarefa; concluir não atualiza a Agenda; refresh_token em texto puro e "desconectar" não revoga; leads parados/sem contato usam `.in()` com até 2000 ids e ignoram erro (subestima em silêncio; inferência); "atividade" = só etapa/nota; sem lembrete ativo; Google Agenda sem teste.
7 tarefa para outro vendedor gera notificação; concluir sem resultado é recusado; o evento aparece no Google.

**B07 Documentos/arquivos** — 2 FUNCIONAL.
1 anexos por negócio (bucket privado, 20 MB, registro conferido no Storage), notas imutáveis, linha do tempo.
5 bucket sem allowed_mime_types; órfãos tolerados; sem log de download (CNH); contato sem anexos próprios. 7 anexar, ver na linha do tempo, abrir sem acesso e ver o bloqueio.

**B08 Indicadores/gestão** — 2 PARCIAL.
1 Início (pessoal/equipe), Painel, metas.
5 **"Receita do mês" da Início soma negocios.valor por fechado_em com responsável ATUAL e mês em UTC; a meta usa eventos causais → os números podem divergir na mesma tela**; Painel por vendedor sem período (limit 10000 silencioso); sem conversão por etapa/motivos/equipe; nada testa carregarIndicadores.
7 meta de receita, fechar, reatribuir; Início, meta e Painel coincidem.

**B09 Comunicação** — 2 PARCIAL.
1 só WhatsApp wa.me; sem e-mail, API de WhatsApp, Meta/Google Ads.
5 **FALHA confirmada:** `startsWith("55") ? w : "55"+w` trata telefone nacional com DDD 55 (RS) como se já tivesse código do país — (55) 99999-9999 vira wa.me/55999999999 (verificado); o clique não registra na linha do tempo. 7 contato (55) 99999-9999 e conferir a URL gerada.
# C. MOTOR TÉCNICO E OFERTA SOLAR (prioridade; diagnóstico próprio)

**C01 Calculadora solar** — 2 FALHA CONFIRMADA no código (causa provável da "soma errada"); modelo simplificado por desenho.
1 calcular(): geração = kWp × produtividade única da empresa; kWh faturado = max(consumo − geração, disponibilidade) limitado ao consumo; Fio B sobre a energia compensada; conta com/sem solar; economia; payback = preço do kit ÷ economia. Sem sazonalidade, banco de créditos nem simulação horária (declarado no código). potenciaKitPersonalizadoKwp soma só módulos (Wp × quantidade; ignora módulo sem potência).
3 lib/calculadora.ts, calculo-servidor.ts, acoes/calculadora.ts, negocios-gravacao.ts (salvarKitComCliente), kit-formulario.ts, negocios/[id]/kit-personalizado.tsx, configuracoes/calculadora; tabela calculos_solares (1 por negócio) e parametros_calculadora; tests calculadora.test.ts (calcular, potência, sugestão, custos), calculadora-db, kit-componentes-db.
4 #101 reescreve o motor (fora da main).
5 **Defeito demonstrável (reproduzido com cópias literais dos parsers, só lógica pura):** o servidor só interpreta o formato brasileiro quando o texto contém vírgula. "1.200" → 1,2; "15.000" → 15 (consumo, fatura, valor do negócio, preço do kit, custos). O cliente também: "12.345,67" → inválido. **Ida e volta:** o formulário do kit reabre os números com toLocaleString pt-BR ("1.200"); reabrir um kit salvo e salvar de novo sem editar regrava consumo 1200 → 1,2 kWh e fatura 1500 → 1,5 (qualquer valor ≥ 1000). A edição do negócio (String(valor).replace) não sofre. Nenhum teste cobre isso. Outros: preço do kit = negocios.valor digitado (kit personalizado não tem preço por item); produtividade é única por empresa (sem localização); payback e kit_preco ficam congelados no momento do cálculo.
6 um único parser pt-BR no cliente e no servidor + testes de ida e volta; casos de referência aprovados com tolerâncias (M2); regras técnicas por localização (decisão do responsável).
7 salvar kit com consumo 1.200 kWh, reabrir, salvar, conferir 1.200 e geração/economia idênticas; casos de referência conferidos à mão.

**C02 Dados solares e distribuidoras** — 2 PLANEJADA / só em PR.
1 na main: apenas parametros_calculadora (produtividade kWh/kWp·mês única, Fio B, disponibilidade por ligação, custos internos). Nada de PVGIS/NASA, ANEEL, municípios/distribuidoras.
4 #101 (geodados.ts, aneel.ts, distribuidoras.ts, municipios_distribuidoras, tarifa_aneel_cache, dados_solares_cache). 5 depende de #101. 6 integrar. 7 cidade/UF resolve distribuidora, tarifa e irradiância com origem indicada.

**C03 Catálogo técnico** — 2 PARCIAL.
1 na main: busca opcional na API OpenSolar (OPENSOLAR_API_TOKEN/ORG_ID; sem as variáveis devolve lista vazia em silêncio) e kits_solares (nome, potência, preço) cadastrados à mão. Preço de referência por R$/W (módulo 1,6; inversor 0,65) marcado como "estimado (teste)" e nunca salvo. Sem catálogo interno, fornecedores, importação CSV, status técnico.
3 lib/opensolar.ts, acoes/opensolar.ts, components/kit-componentes.tsx, configuracoes/calculadora; tests opensolar. 4 #101 (equipamentos_empresa, CSV, status técnico) REMOVE o opensolar.ts.
5 PR #101: 39 commits próprios (até 01/10), +9.687/−713, 71 arquivos; a main está 237 commits à frente; **merge tem 8 conflitos** (.gitignore, PROGRESS.md, kit-personalizado.tsx, negocios/novo/formulario.tsx, acoes/calculadora.ts, acoes/negocios.ts, database.types.ts e modify/delete de acoes/opensolar.ts); **13 migrations** (20260930150000…20261001050000) não estão na main e, até 01/10, não foram aplicadas em produção (aplicação posterior: não verificada). Prefixos anteriores a migrations já aplicadas → `--include-all` aplica fora de ordem; exige revisão.
6 decidir: reconciliar #101 (rebase manual) ou refazer por partes. 7 cadastrar módulo/inversor com dados completos, importar CSV, usar no kit.

**C04 Compatibilidade/engenharia pré-venda** — 2 PLANEJADA / só em PR.
1 nada na main (sem Voc frio, MPPT, corrente, overload). #101 traz dimensionamento.ts (615 linhas) e testes. 5 regras técnicas dependem de aprovação do responsável (IA não define parâmetro). 7 combinações válidas/inválidas rejeitadas conforme regras aprovadas.

**C05 Kit solar e composição** — 2 FALHA REPORTADA (fluxo kit → proposta não fecha); no código há partes funcionais e defeitos confirmados.
1 kit personalizado por componentes (módulo/inversor/bateria/outro; quantidade; potência), salvar e reabrir, recalcular com tarifa, remover com confirmação, sugerir quantidade de módulos; kits_solares como catálogo simples. Gerar proposta exige só que exista cálculo.
3 kit-componentes.tsx, kit-personalizado.tsx, negocios-gravacao.ts, kit_componentes (migration kit_personalizado), travas_kit_e_fechamento_sdr; tests kit-componentes-db, travas-kit-sdr-db.
5 o defeito de C01 corrompe o kit ao reabrir/salvar; sem preço por item (o preço do kit é o valor do negócio digitado); componentes de tipo bateria/outro não entram em nenhum cálculo; kit_preco (usado pela proposta) é gravado no momento do cálculo e não acompanha mudanças do valor do negócio.
6 corrigir C01; definir a fonte única de preço; fechar o percurso calculadora → kit → preço → proposta com teste de ponta a ponta. 7 montar, salvar, reabrir, editar e gerar a proposta com os mesmos números do kit.

**C06 Precificação e condições** — 2 PARCIAL.
1 custos internos configuráveis (instalação por módulo, material CA por kWp, engenharia, comissão %) só SUGEREM o valor do negócio em tela; modo de preço da proposta (sem_preco/parcelado/avista/completo); "parcelado" mostra "consulte condições com o vendedor". Nada persiste (margem, desconto, impostos, frete, snapshot).
6 definir parâmetros comerciais com o responsável. 7 preço sugerido bate com os parâmetros; alterar parâmetros não muda vendas antigas.

**C07 Tipos de solução** — 2 PLANEJADA. 1 só monofásico/bifásico/trifásico; "bateria" existe como componente sem efeito no cálculo; sem híbrido/BESS. 6 decidir prioridades técnicas.

**C08 Rastreabilidade do cálculo/kit** — 2 PARCIAL.
1 calculos_solares guarda um snapshot dos parâmetros usados (produtividade, Fio B, disponibilidade, tarifa). 5 é 1 cálculo por negócio (negocio_id UNIQUE), sobrescrito a cada salvar; sem versões; cálculo apagável; custo estimado histórico não existe (D11 do ADR). 7 alterar parâmetros depois não muda o cálculo salvo; histórico de versões consultável.

# D. PROPOSTAS, CONTRATOS, VENDA E PAGAMENTOS

**D01 Modelos de proposta** — 2 FUNCIONAL (código + teste); sem prova visual.
1 construtor de modelos com 42 tipos de bloco (todos implementado:true), capas (foto/minimalista/técnica), identidade visual, duplicar, publicar (exige o bloco "Valor total"), definir padrão, ordenar/quebra de página, PDF por modelo.
3 configuracoes/propostas/*, acoes/proposta-modelos.ts, lib/propostas/{blocos,pdf,pdf-dados,pdf-paginacao}; tests propostas-blocos, propostas-pdf, propostas-pdf-dados, proposta-db.
5 modelo novo nasce rascunho; sem identidade configurada as cores caem em padrão e o nome vira "Proposta comercial"; blocos sem dado são omitidos (ver D02). 7 criar modelo, publicar, marcar padrão, gerar PDF e conferir cada bloco.

**D02 Proposta comercial real** — 2 FALHA REPORTADA ("em branco"); não reproduzida; causas candidatas confirmadas no código.
1 gerar/reaproveitar proposta com link público e PDF; escolher modo de preço e quais seções aparecer; registrar aberturas.
3 acoes/propostas.ts, proposta/[token]/{page,pdf/route}, lib/pdf-proposta.tsx, lib/propostas/pdf.tsx, negocios/[id]/proposta.tsx; tests acima.
5 **(a)** a página pública /proposta/[token] NÃO usa o construtor de modelos: mostra um layout fixo (O sistema / Sua economia / Investimento) e só o PDF usa os blocos; **(b)** o PDF usa o motor de blocos só se modelo_id, blocos_emitidos e capa_variante existirem; senão sai o PDF "legado"; **(c)** gerarLinkProposta faz upsert com ignoreDuplicates: regerar NÃO atualiza modelo/blocos; se a 1ª geração foi sem modelo padrão publicado, a proposta fica no PDF legado para sempre; **(d)** ModeloPdfDocument filtra blocos com blocoTemConteudo: modelo cujos blocos dependem de dado ausente (ex.: investimento com modo sem_preco ou kit_preco 0) gera páginas quase vazias, sem aviso ao usuário; **(e)** os números são lidos ao vivo do cálculo a cada abertura: editar o kit depois de enviar altera a proposta já enviada (sem versão/snapshot); 404 se faltar cálculo ou contato.
6 reproduzir a falha em cenário real (M4); unificar página pública e PDF; snapshot/versão da proposta; validar na publicação/geração que o documento não sai vazio. 7 gerar proposta a partir do kit e comparar numericamente (kWp, geração, economia, preço) com o kit; editar o kit e ver que a proposta enviada não muda.

**D03 Documentos configuráveis** — 2 PARCIAL.
1 só dois documentos configuráveis: modelo de proposta (blocos, inclui "anexo PDF externo") e modelo de contrato (texto livre com 24 campos {{...}}). Sem outros documentos comerciais/operacionais, assinatura/versões. 6 definir o catálogo de documentos (M5/M9).

**D04 Contrato comercial** — 2 FALHA REPORTADA (não estruturado); confirmada em parte.
1 um único texto livre por empresa (modelos_contrato), preenchido por 24 campos do negócio/contato/kit/empresa; valida campos desconhecidos e não deixa sair com campo pendente; contrato por negócio com token público e status.
3 lib/contrato.ts, contratos-geracao.ts, acoes/contratos.ts, configuracoes/contrato, contrato/[token]; migrations contrato, travas; tests contrato, contrato-db, contrato-status.
5 sem cláusulas, escopo, etapas, condições de pagamento ou itens estruturados; sem vínculo com a proposta; **o preço do contrato vem de negocios.valor (ao gerar) e o da proposta de calculos_solares.kit_preco (gravado no cálculo) → podem divergir** (editar o valor do negócio não recalcula o cálculo); empresa nova não tem modelo de contrato; o link público expõe o contrato integral sem expiração.
6 estrutura aprovada pelo responsável (cláusulas, escopo, valores, etapas, pagamento), coerência com a proposta, regras jurídicas. 7 contrato gerado a partir da venda, idêntico à proposta em valores/itens, sem campo em branco.

**D05 Assinatura e versões** — 2 PARCIAL.
1 status manual rascunho → aguardando → assinado pelo vendedor; sem assinatura eletrônica real. 4 proposta técnica A+B+C (docs/PROPOSTA-CONTRATOS-VERSIONAMENTO-2026-10-15.md, branch docs/proposta-contratos-versionamento; não é ADR). 5 conteúdo/token editáveis após enviar/assinar; assinado → rascunho livre sem pagamento confirmado (sem histórico do texto); #191 não resolve isso. 6 aprovar a proposta e implementar (M5). 7 texto assinado preservado com hash; reabertura só excepcional e auditada.

**D06 Pagamento Pro** — 2 FUNCIONAL (código + teste), com correções de segurança em PR.
1 confirmar/estornar (admin/gestor; estorno com motivo), beneficiário congelado na assinatura, não confirma quem é o beneficiário, evento de gamificação, atividade na linha do tempo. 4 #190, #191 (#113 obsoleta). 5 leitura de contratos/confirmações por SDR até a #190; o estorno não bloqueia o responsável de estornar o próprio negócio (decisão assumida); contratos antigos sem responsavel_assinatura_id seriam recusados (não verificado). 7 admin cria contrato, closer assina, outro gestor confirma; closer não confirma o próprio; SDR não vê.

**D07 Pagamento Solo** — 2 PARCIAL (só em PRs).
1 plano 'solo' explícito + exatamente 1 vínculo ativo (admin); registro manual por negócio, insert-only, estorno/correção, sem gamificação, mantido após upgrade; não liga Pedido/Obra. 4 #186 (banco) → #188 (interface) → #189 (RLS financeiro; tem_acesso_financeiro idêntica à da #190). 5 nada define produto='solo' fora de SQL; #188 relatada sem validação em navegador; preview usa banco de produção sem essas migrations. 7 empresa solo com 1 admin registra, estorna e corrige; 2º usuário bloqueia novos registros; SDR não vê.

**D08 Estado comercial e passagem operacional** — 2 PARCIAL.
1 cartão "Fechamento da venda" com 3 marcos (ganho, contrato assinado, pagamento confirmado); garantir_obra acionada pelos 3 gatilhos. 5 Pedido não existe; sem escopo (com_execucao) nem módulo por empresa: toda venda concluída gera Obra. 6 ADR D1–D12 (M8). 7 venda concluída gera exatamente 1 Pedido; Obra só com módulo ligado e escopo contratado.
# E. GAMIFICAÇÃO, METAS E INCENTIVOS

**Pilha de PRs #104–#118:** o conteúdo JÁ ESTÁ NA MAIN (13 de 15 branches com 0 commits à frente; #116 só traz o merge da #117; #118 é versão antiga de uma tela já redesenhada). São PRs abertas só por falta de fechamento administrativo — candidatas a fechar após confirmação humana (não fazer merge).

**E01 Motor causal** — 2 FUNCIONAL (SQL + testes de integração). 1 gatilho aplicar_regras_gamificacao (eventos → point_ledger), antifraude, deduplicação (unica_por_negocio, advisory lock), tetos, snapshot da condição, reversões simétricas, origem SDR/closer write-once. 3 ~20 migrations *gamificacao*; lib/gamificacao.ts; tests gamificacao-* (12 arquivos), handoff-*. 4 #192. 5 sem gamification_rules ativa por empresa = zero pontos (nenhum seed ao criar empresa — a confirmar); evento novo sem simétrico não é revertido (não verificado); AGENTS.md diz ledger/eventos imutáveis até para service_role, mas os testes inserem eventos via service_role. 7 SDR envia, vendedor aceita (SDR pontua uma vez), segundo aceite não pontua, deal.won, corrigir valor, reabrir tarefa; conferir extrato e point_ledger (estornado = true, nada apagado).
**E02 Experiência dos participantes** — 2 FUNCIONAL (código + testes; sem prova visual). 1 XP e moedas separados, níveis, conquistas com progresso, streak, ranking por perfil com histórico, jornada, extrato. 5 cs_farmer não tem aba de ranking; carregarDadosGerencial sem teste. 7 logar como SDR e closer e conferir nível/XP/moedas/ranking.
**E03 Recompensas e loja** — 2 FUNCIONAL (concorrência testada). 1 catálogo com imagem, solicitar_resgate (estoque, limite, saldo, travas), aprovação admin, cancelar estorna, saldo negativo permitido por decisão. 5 sem notificação ao participante na mudança de status (não verificado). 7 admin cria recompensa, vendedor resgata, admin aprova/entrega, cancelar devolve moedas.
**E04 Metas e comissões** — 2 PARCIAL. 1 metas causais (5 métricas), comissões versionadas por vigência, fechar_comissao imutável. 5 **metas.membro_id NOT NULL → só metas por pessoa (o Plano pede empresa/equipe/pessoa)**; sem contestação/"paga"; fechar_comissao congela o valor já gravado sem recalcular (pode ficar defasado); planos legados com vigência fixa 2026-10-01. 7 criar plano e meta, fechar deal, calcular comissão, trocar responsável (valor não muda), fechar e tentar recalcular (recusa).
**E05 Painéis/UX da gamificação** — 2 PARCIAL. 1 tema escuro, visão gerencial × pessoal, abas, administração. 5 só funções puras testadas; Playwright só para Obras; nada visto em navegador. 6 specs de navegador em 3 larguras e 2 papéis.

# F. PEDIDO, PÓS-VENDA, ENGENHARIA, COMPRAS E OBRAS

**Resumo (por que "Obras não foi concluído"):** o motor existe e é bem testado no banco, mas a Gestão é só fluxo por setor, a Apresentação não tem dados reais e há três falhas estruturais confirmadas: (1) **ninguém escreve obras.pausada_em/cancelada_em** (verificado: só leituras e CHECKs; os únicos UPDATE em obras tratam alerta de estorno e venda_alterada) → pausar/cancelar/retomar são inatingíveis; (2) **o papel operacao não é cadastrável** e não há UI para setores (definir_setores_membro só é chamada por e2e/base-ficticia.ts) → ninguém vira operacao com setor pela interface; (3) Pedido não existe.

**F01 Pedido** — 2 PLANEJADA (ADR D1–D12 aprovada; implementação não autorizada). 1 nada no código (sem pedidos/empresa_modulos). 6 P0 documental, M1, E1, P1; antes, auditoria de produção (D10, depende de backup e autorização). 7 venda elegível gera exatamente 1 Pedido (idempotente, numeração por empresa, teste de concorrência).
**F02 Módulos opcionais/escopo** — 2 PLANEJADA. 5 hoje TODA venda gera Obra, para qualquer empresa (o oposto da ADR); conflito potencial com D3/D5 (legado). 6 M1/E1 inteiros. 7 empresa sem módulo não gera Obra; com módulo e sem_execucao gera só Pedido.
**F03 Pós-venda administrativo** — 2 PARCIAL. 1 só marcos NF do cliente e garantia (binários) dentro da Obra. 5 sem documentos/NF real/pendências; pela ADR D8 isso pertence ao Pedido; não existe setor administrativo no enum. 7 marcar NF com arquivo/número e ver quem marcou.
**F04 Engenharia** — 2 PARCIAL. 1 só máquina de estados do setor (a_iniciar … concluido) com parado/aguardando concessionária. 5 sem projeto/protocolo/arquivos; status sem regra entre setores (aprovado não libera o Operacional). 7 engenheiro registra protocolo com anexo e o Operacional é liberado.
**F05 Compras/estoque/logística** — 2 PARCIAL. 1 só status do setor compras. 5 sem lista de materiais, fornecedores, cotações, NF, estoque; sem custo real. 7 pedido de compra a partir do kit, receber NF, custo consolidado.
**F06 Obras — motor** — 2 PARCIAL (falhas confirmadas). 1 obras, obra_dados_comerciais, obra_fluxos (3 setores), obra_marcos, obra_participantes, obra_historico imutável, membro_setores_obra; garantir_obra idempotente (negócio ganho + contrato assinado + pagamento não estornado, qualquer ordem); escrita só por RPC; RLS comercial × operacao. 3 migrations 20261006220000, 20261007200000, 20261008100000; tests obras-db (21), obras-acesso-db (40), obras-escrita-db (44), obras-detalhe-db (9). 5 as 3 falhas acima; Operacional nasce aguardando_liberacao sem liberação automática; sem backfill de vendas antigas; aplicação das migrations em produção NÃO verificada. 6 RPCs pausar/cancelar/retomar com motivo e auditoria, UI de setores e criação de operacao, regra entre setores, conclusão explícita. 7 em base de teste: ganhar + assinar + confirmar (qualquer ordem) gera 1 obra; admin pausa com motivo, vê o bloqueio e retoma (hoje impossível).
**F07 Obras — Gestão** — 2 PARCIAL. 1 lista e detalhe, status por setor, parado/aguardando, marcos, participantes, histórico. 5 NÃO existem tarefas, atribuições, orçamento, custo, riscos nem intervenções; sem botões de pausar/cancelar; atribuir participante inviável pela UI (sem usuários operacao). 7 admin + usuário operacao com setor operam todo o fluxo e o histórico registra.
**F08 Obras — Apresentação/OPR** — 2 PARCIAL. 1 telas de apresentação, Gantt, custos, margem, cálculos puros. 5 **prazo, avanço, cronograma, custos e margem ficam SEMPRE vazios em produção** (só demo fictícia local); sem PDF; derivados.ts proíbe progresso/SLA/semáforo, em oposição ao Plano Mestre; PR #167 (roadmap) desatualizada. 7 obra real com cronograma e custos exibe Gantt e margem só a quem pode ver dinheiro; PDF gerado.
**F09 Execução de campo** — 2 PARCIAL. só status do setor operacional; sem agendamento, fotos, diário, terceiros.
**F10 Vistoria/homologação/entrega** — 2 PLANEJADA. só rótulo de status; sem checklist, aceite, garantia da instalação.
**F11 Agenda operacional** — 2 PLANEJADA. o Google Agenda existente é comercial (tarefas); nada por equipe/obra.
**F12 Custos e controles operacionais** — 2 PLANEJADA. custosInternosEstimados só em tela, não persistido; alterar parâmetros muda a referência silenciosamente (o que a D11 proíbe).
**F13 Múltiplas obras/escopos futuros** — 2 PLANEJADA. obras.negocio_id é UNIQUE; remover o UNIQUE não basta (ADR).

# G. PRODUTO SAAS, CANAIS E OPERAÇÃO

**G01 Landing e pré-cadastro** — 2 NÃO VERIFICADA (projeto externo ao repositório). o repo só redireciona / → /inicio; sem Netlify Forms nem links de "criar conta".
**G02 Jornada de aquisição SaaS** — 2 PLANEJADA. só existe o fim (confirmar, definir senha, super-admin cria empresa); sem checkout, webhook ou gateway.
**G03 Estratégia de preços** — 2 PARCIAL. mecanismo de cobrança manual existe; preços são hipóteses; limite_usuarios não é imposto; sem testes.
**G04 Ambiente demo** — 2 PARCIAL. PR #132 (draft): seed-base-demo.mjs (1.547 linhas, empresa "Raion Solar Demo", 90 dias, só mecanismos reais). **Riscos verificados:** ADMIN_EMAIL com e-mail pessoal como padrão; SENHA_DEMO = "123456"; aceita SUPABASE_SERVICE_ROLE_KEY_PROD; não passa pela trava local → precisa de governança (environment aprovado). Sem teste do script; a demo "em produção" não foi verificada.
**G05 Relatórios/BI/exports** — 2 PARCIAL. Painel, propostas-contratos, gamificação; exports só PDF de captura e de proposta; sem CSV; sem relatório de faturamento/funil com conversão.
**G06 Integrações/automações** — 2 PARCIAL. Google Agenda (sem teste; configuração em produção desconhecida) e OpenSolar; sem assinatura eletrônica, e-mail, API de WhatsApp, Meta/Google Ads, IA documental.
**G07 Móvel e acessibilidade** — 2 PARCIAL. responsivo, manifest; sem service worker/push; auditoria WCAG não feita.
**G08 Suporte e manutenção** — 2 PLANEJADA. Dependabot, alertas e runbook de backup; sem SLA, canal, incidentes, custos.

# PRs abertas (31) e estado
- Segurança/contratos: #190 (base main), #191 (sobre #190), #192 (base main) — drafts, CI verde.
- Solo: #186 → #188 → #189 (empilhadas).
- Plano/docs: #193 (Plano Mestre), #167 (roadmap de Obras, desatualizada), #133 (handoff 06/10).
- Motor/catálogo: #101 (divergente, 8 conflitos, 13 migrations).
- Demo: #132.
- Funil: #70 (corrige travamento ao mudar cor), #71 (empilhada na #70, conflita).
- Gamificação (#104–#108, #110–#113, #115, #116, #118): conteúdo já na main — candidatas a fechar após confirmação humana.
- Obsoletas/perigosas: #62 (adiciona backup-producao.yml antigo; sobrescreveria o workflow atual se mesclada), #68 e #76 (só PROGRESS.md).
- Dependabot: #182, #183, #184.

# Divergências documentação × código
1. PROJECT_STATUS/HANDOFF: "deduplicação sem solução" — existe aviso no wizard (RPC + teste); faltam mesclagem, unicidade e a captura.
2. BACKUPS-DIARIOS-PRODUCAO.md: 1º ciclo agendado "pendente" — a API do GitHub mostra o ciclo de 15/10 executado com sucesso; falta a conferência no B2/Healthchecks.
3. AGENTS.md: "super-admin não fura RLS" — o super-admin pode se vincular como admin a qualquer empresa e então ler tudo.
4. AGENTS.md: ledger/eventos "imutáveis até para service_role" — testes inserem eventos via service_role.
5. ADR: "Gestão e Apresentação mescladas" — a Gestão é só fluxo e a Apresentação não tem dados reais.
6. ADR (Obra condicional por módulo/escopo) × código (Obra sempre).
7. Plano Mestre E04 (metas por empresa/equipe/pessoa, contestação) × código (só pessoa; sem contestação).
8. Plano Mestre F08 (progresso fundado, semáforo/SLA) × derivados.ts (proíbe progresso/SLA).
9. ROADMAP: percentuais (Calculadora 72%, Catálogo 75%, Onboarding 15%, Gamificação 88%) sem critério verificável; PROJECT_STATUS cita a main em b02e1b0 (hoje 515b68b).
10. PROJECT_STATUS: branches de Obras "em andamento" — já são ancestrais da main.

# SOBRE O QUE NÃO SABEMOS
- Nada foi visto em navegador; nenhum teste foi rodado nesta rodada (só existência). O CI de Obras roda Chromium no runner, mas ninguém confirmou ter olhado os resultados.
- Quais migrations estão aplicadas em produção (incl. Obras e as 13 da #101); se existem Obras, contratos e leads reais com os problemas descritos.
- Configuração real de produção: Supabase Auth (rate limit, captcha, SMTP), Vercel (preview apontando para produção), Google Agenda, OpenSolar, pg_cron.
- Conteúdo real do B2 e pings do Healthchecks (ciclo de 15/10).
- Se a falha "proposta em branco" reproduz e em qual cenário; se a "soma errada" relatada é exatamente a do parser (a hipótese é forte, falta o cenário do responsável).
- Conteúdo integral de ~30 arquivos de teste e de telas grandes (ficha do negócio, Kanban); RLS de tarefas/contatos por papel sem auditoria linha a linha.
- Se a lacuna do cron de distribuição (B04) ocorre com dados reais.
- G01 (landing externa) e o estado da demo em produção.
