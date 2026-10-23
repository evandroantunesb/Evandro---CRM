# Checkpoint de retomada — M2 P0 calculadora GD II (Nora, 23/10/2026)

Contrato: `.aurora/contratos/m2-p0-decisao-fio-b-copel.md`. Worktree `R:/wt-m2-p0-calc`, HEAD 2780a53 (não commitado; o worktree já tinha alterações de rodadas anteriores).
Sem commit, push, PR, merge ou produção. D1/D2 (`R:/wt-m2-p0-d1d2`), o visual e o pacote de passagem continuam congelados.

## Implementação (feita, no disco)
- Migration `supabase/migrations/20261023210000_calculo_gd2_fio_b.sql`, que depende de `20261023200000_calculos_estimativa_incompleta.sql`. Ela cria:
  - `tarifas_gd_aneel`, com leitura global e sem escrita para os clientes;
  - o retrato dos parâmetros em `calculos_solares`, com `tarifa_kwh` em `numeric(9,5)`;
  - `calculos_solares_historico`, alimentado por trigger;
  - a marca de desatualização (R6.2).
- Lib:
  - novos `tarifa-gd.ts` e `contexto-estimativa.ts`;
  - `fio-b-hipotese.ts` renomeado para `fio-b-gd2.ts`;
  - `calculadora.ts`, `estimativa-financeira.ts`, `calculo-reproduzivel.ts`, `calculo-servidor.ts`, `calculo-vigencia.ts`, `negocios-gravacao.ts` e `kit-formulario.ts`.
- Tela: `kit-personalizado.tsx` e a ficha `negocios/[id]/page.tsx`.
- Testes de unidade e de banco, entre eles `tests/fio-b-copel-casos.test.ts` e `tests/calculo-gd2-db.test.ts`.

## Validação final (logs em `.aurora/revisao/calc-gd2/logs/`)

- **09:** prova de que a falha de vitest restante vem do CRLF.
  - O mesmo teste falha no HEAD 2780a53 com checkout CRLF (`core.autocrlf=true`) e passa com LF.
  - `formulario.tsx` não foi tocado; o teste não foi alterado.
- **10:** o build do e2e falhou no typecheck; a causa estava num tipo de `tests/calculo-gd2-db.test.ts`.
  - **11:** log do erro. **12:** corrigido com `TablesUpdate<"calculos_solares">`.
- **13:** e2e de cálculo antes das correções: 12 passaram e 7 falharam, com o log completo.
  - **Defeito real:** depois de salvar um resultado completo, a tela dizia "A conta e a economia ainda não foram calculadas". Corrigido em `kit-personalizado.tsx` com `avisoSalvo`: com "Kit e cálculo salvos." aparece a mensagem do servidor.
  - O 06 e o 10 tinham expectativas do contrato antigo. Foram atualizados mantendo a intenção de cada teste:
    - a linha legada vai ao histórico (R6.1);
    - as pendências de qualificação e de base são do vendedor;
    - o caso "só empresa" usa uma distribuidora sem tarifa (Cemig);
    - a mensagem da linha legada na proposta mudou.
- **14:** 18 passaram e 1 falhou. A falha era a asserção do HTML do 13 (comentário do React entre número e unidade); corrigida.
- **15, vitest completo:** 2117 passaram e 1 falhou (a mesma falha de CRLF), exit=1.
- **16, lint:** 0 erros e 3 avisos preexistentes, exit=0.
- **17, typecheck:** exit=0.
- **18, e2e completo com build:** 71 de 71 passaram, exit=0. Inclui o 13: prévia → salvar → reabrir → proposta, entrada nova incompleta → histórico, PDF v1 com o mesmo SHA, isolamento da empresa B e pisos 30/50/100.

## Entregáveis
- Diff revisável da rodada: `.aurora/revisao/calc-gd2/rodada-gd2.diff` (33 arquivos, contra o snapshot base-rodada-gd2, sem `e2e/.estado`).
- Cópia da migration em `.aurora/revisao/calc-gd2/`.

## Ambiente
Restaurado em 23/10:
- `aurora-calc` parada (volume mantido);
- `config.toml` igual ao backup (SHA ff715f8f…a838, sem diff no git);
- `.env.local` removido.

As outras stacks não foram tocadas.

## Pendências para revisão (Opus)
1. `calculos_solares` aceita escrita pela RLS: um cliente consegue forjar uma linha `completo`, porque o CHECK só exige o retrato.
2. O formulário de negócio novo não tem qualificação, então a estimativa feita ali sai sempre incompleta.
3. A configuração de disponibilidade e de percentual do Fio B da empresa ficou sem efeito; a tela de configurações ainda a mostra.
4. São presumidos:
   - a modalidade convencional;
   - bifásico com 3 condutores (50 kWh).
5. A Tabela 4 da REH 3.592 continua não conferida.
6. A proposta emitida não mostra economia (D1/D2 congelados).
7. `proposta.tsx`, card antigo e congelado, ainda diz "a empresa ainda precisa configurar e validar os dados da estimativa". Com a linha legada, o remédio agora é recalcular o kit. O texto não foi alterado.
8. `pendenciasSemDados` e o e2e 13 dependem da data real; o e2e 13 é pulado fora de 2026, dentro da vigência.
9. O casamento da distribuidora usa o texto livre da qualificação.
10. A falha de CRLF do teste "Cancelar montagem" é preexistente e não foi corrigida.

## Revisão 23/10 (tarde): financeiro forjado, relógio do e2e e pendências

### Brecha corrigida (prioridade 1)

**Antes:** as policies "criar cálculo" e "editar cálculo" permitiam INSERT, UPDATE e UPSERT direto pelo PostgREST de qualquer coluna:
- economia, contas, método e percentual;
- fonte tarifária e autoria;
- `completo`, ou uma linha `legado` com economia.

Logs 19 e 19b: os testes negativos falhavam, porque a escrita era aceita.

**Correção:** migration `20261023220000_calculos_solares_gravacao_servidor.sql` e `src/lib/calculo-gravacao.ts`.
- `authenticated` e `anon` perdem INSERT, UPDATE e TRUNCATE. SELECT e DELETE ficam como estavam.
- `autorizar_gravacao_calculo(negocio)`: com a sessão do usuário, só confere três condições e devolve empresa e membro (a autoria). Não grava e não recebe valores.
  - acesso comercial à empresa do negócio;
  - o usuário vê o negócio;
  - o negócio não está arquivado.
- O servidor grava com a service role a linha que ele mesmo montou com o motor compartilhado (`montarLinhaCalculo`), com a referência lida de `tarifas_gd_aneel`. Empresa, negócio e autoria vêm da autorização.
- O trigger `calculos_solares_referencia_oficial` recusa linha `completo` que diverge da linha oficial, para qualquer escritor, inclusive a service role. Ele confere:
  - o método;
  - fonte, Fio B, base e vigência;
  - o enquadramento;
  - o percentual do ano;
  - o piso do art. 291;
  - a tarifa "oficial".

**Provas:**
- Log 20: 12 de 12 testes negativos passam. Cobrem:
  - INSERT, UPDATE, UPSERT e legado;
  - outra empresa;
  - o papel `operacao`;
  - colega que não vê o negócio;
  - autoria adulterada no `atual`;
  - o trigger contra a service role;
  - o salvamento legítimo.
- Log 31: privilégios, policies e triggers finais.

### Relógio do e2e 13 (prioridade 2)
- `scripts/e2e-relogio.mjs` é carregado só no `next start` do e2e (`scripts/e2e-servidor.mjs`, com `--import`). Desloca `Date` pelo arquivo `e2e/.estado/relogio.json`, que o próprio teste grava. Não é carregado em produção nem no build, e nenhum usuário consegue alterá-lo.
- O e2e 13 calcula em 22/10/2026 e emite com o relógio real (o banco exige `emitida_em` perto do `now()`).
- Caso novo em 10/05/2026, fora da vigência: o resultado fica incompleto, com `fio_b_vigencia_fora`.
- Os testes de banco GD II também fixam a data.
- Log 27: a primeira versão (`class extends Date`) quebrou o middleware (`Date.parse is not a function`). Corrigida para uma função com estáticos próprios (log 28).

### Demais pendências
- **Configuração:** Fio B e disponibilidade saíram da edição. Ficam visíveis só como valores antigos sem efeito, e a ação os ignora (teste `parametros-regulatorios-db`).
- **Premissas visíveis:** tarifa convencional, bifásico a três condutores e tarifa informada pelo vendedor.
- **Cadastro novo:** mantém o salvamento incompleto, com orientação para completar a Qualificação SDR e recalcular na ficha.
- **Link antigo da proposta (com economia):** continua recusado mesmo com cálculo completo, com a mensagem que manda emitir a proposta simples. Saiu a frase antiga "a empresa precisa configurar e validar".

### Validação
| Etapa | Log | Resultado | Código de saída |
|---|---|---|---|
| testes de banco afetados | 22, 23, 24 | todos passaram | 0 |
| lint | 26 | 0 erros, 3 avisos preexistentes | 0 |
| typecheck | — | limpo | 0 |
| e2e afetados | 28 | 20/20 | 0 |
| vitest completo | 29 | 2131 passaram, 1 falhou (CRLF, log 09) | 1 |
| e2e completo, com build | 30 | 72/72 | 0 |

### Diffs
- `rodada-gd2.diff`: tudo contra a base, inclusive `scripts/` e `playwright.config.ts`.
- `revisao-forja-relogio.diff`: só esta revisão, contra o fim da rodada anterior reconstruído.

### Ambiente
Restaurado de novo:
- `aurora-calc` parada;
- `config.toml` com SHA ff715f8f…;
- `.env.local` removido;
- `relogio.json` removido.

## Revisão final 23/10 (noite)

Escopo: `revisao-forja-relogio.diff`, migration `20261023220000` e `calculo-gravacao.ts`. Delta desta revisão: `revisao-final.diff`.

### Achados e correções

**1. CRLF** (log 32: 34/34)
- O teste "Cancelar montagem" normaliza para LF só o texto que lê.
- As verificações de comportamento são as mesmas, e o recorte agora exige que início e fim sejam encontrados.
- `.gitattributes` e o código funcional não foram tocados.

**2. `SUPABASE_SERVICE_ROLE_KEY`**
- **Produção: NÃO VERIFICADO.** Não há mecanismo autorizado neste ambiente: nem CLI da Vercel, nem `.vercel`, nem `VERCEL_TOKEN`. Não concluí nada por outro ambiente nem pela documentação.
- **Defeito encontrado:** sem a chave, `criarClienteAdmin()` lançava exceção depois de o kit já ter sido substituído, e o kit não era restaurado. Corrigido:
  - `autorizarGravacaoCalculo` recusa antes de qualquer escrita, com uma mensagem clara;
  - os helpers não lançam exceção (devolvem erro, e a restauração existente é acionada).
  - Teste: kit, negócio e cálculo ficam idênticos.
- **Importação só no servidor:** `server-only` em `calculo-gravacao.ts`, `admin.ts`, `negocios-gravacao.ts` e `calculo-servidor.ts`.
- **Bundle do navegador** (log 41): 0 ocorrências do nome da chave, do valor da chave, da RPC e do helper. No servidor, a chave é lida em tempo de execução, não embutida.

**3. Fronteira de confiança**
- **Chamadores:** só `negocios-gravacao.ts`, que é alcançado pelas ações `salvarKitPersonalizado`, `atualizarPrecoCalculo` (exigem `CALCULADORA`) e `criarNegocio` (exige `NEGOCIOS`). A sessão é do servidor, e o cliente Supabase é o do usuário.
- **Empresa, negócio e autoria** vêm da RPC de autorização. As escritas filtram por id, negócio e empresa autorizados.
- **Entrada:** o schema (zod) só aceita entradas; campos desconhecidos são descartados. Parâmetros e tarifa são lidos no servidor. Os números financeiros só saem do motor.
- **Restrições do negócio:** valem também para a service role, porque os triggers não dependem da identidade:
  - arquivado;
  - exige kit;
  - Obra;
  - referência oficial;
  - histórico.
- Kit e itens continuam pela RLS do usuário.

**4. Exclusão** (migration `20261023230000_calculos_solares_exclusao_historico.sql`)
- Um BEFORE DELETE grava a linha inteira no histórico, com motivo `apagado`, na mesma transação.
- Novas colunas: `arquivado_por` (membro) e `arquivado_por_papel`.
- Usuário autenticado sem membro identificado é recusado. Nos arquivamentos por UPDATE, a autoria passa a vir da autorização.
- Exceção única: a cascata da exclusão do próprio negócio, cujo histórico também sai pela FK.
- A remoção prevista no produto (`apagarCalculo`: quem criou ou o admin, pela RLS) foi mantida.
- Testes:
  - quem criou apaga direto: histórico com a linha e o autor;
  - admin apaga;
  - outra empresa, `operacao`, colega e anônimo não apagam nada;
  - service role apaga deixando histórico;
  - a cascata do negócio continua funcionando.

**5. Regras repetidas**
- Teste de concordância: para todo ano de `PERCENTUAL_LEGAL_FIO_B_GD2` (2026, 2027) e toda ligação, a linha do motor passa no trigger com os mesmos valores.
- O trigger recusa os demais percentuais e pisos.
- Nenhuma divergência encontrada.

### Validação final
| Etapa | Log | Resultado | Código de saída |
|---|---|---|---|
| segurança | 33 | 18/18 | 0 |
| testes afetados | 34 | 144/144 | 0 |
| lint | 35 | 0 erros, 3 avisos preexistentes | 0 |
| typecheck | 36 | limpo | 0 |
| vitest completo | 37 | 4 arquivos falharam no setup | 1 |
| reexecução isolada dos 4 arquivos | 39 | 151/151 | 0 |
| vitest completo repetido | 40 | 105 arquivos, 2138/2138 | 0 |
| e2e afetados, com build | 38 | 20/20 | 0 |

- **Log 37:** as falhas foram no login do Auth local (`failed SASL auth … i/o timeout`) durante o setup, antes do código testado. Era carga do Docker local.
- **Log 40:** inclui o teste CRLF.
- **e2e completo não repetido:** desde o log 30 (72/72), só mudaram banco, tratamento de erro e testes; nada de tela ou de runtime que afete outras specs.

### Ambiente
Restaurado:
- `aurora-calc` parada;
- `config.toml` com SHA ff715f8f…;
- `.env.local` removido;
- `relogio.json` removido.

As outras stacks não foram tocadas.

### Limitações registradas (não resolvidas por decisão)
- A Tabela 4 da REH 3.592 continua não conferida.
- Escopo tributário: o Fio B é sem tributos; ICMS, PIS/Cofins sobre a energia compensada ficam fora da estimativa.
- A base tributária e a tarifa são declaradas pelo vendedor. A origem fica registrada, e o aviso "tarifa informada" aparece.
- Modalidade convencional e bifásico com 3 condutores são presumidos e ficam visíveis.
- Payback indisponível.
- A proposta com economia (D1/D2) segue congelada.
- O casamento da distribuidora usa o texto livre da qualificação.
- A virada para 2027 e o fim da vigência têm cobertura só nos testes de banco.

### Bloqueador real restante
Confirmar `SUPABASE_SERVICE_ROLE_KEY` no ambiente de produção pelo canal autorizado. Hoje está **não verificado**: sem ela, salvar e atualizar o preço do cálculo são recusados sem alterar nada.

## Encerramento da etapa (23/10)

**Status: implementação e validação local concluídas; configuração de produção pendente de verificação.**

### Pacote de integração (`.aurora/revisao/calc-gd2/integracao/`)
- `pacote-consolidado.diff`: HEAD 2780a53 → worktree.
  - 84 arquivos, 42 novos.
  - Ficam de fora `.aurora/` e `supabase/config.toml`.
  - `git apply --check --reverse` = 0.
- `INVENTARIO.md`: cada arquivo com situação, linhas e SHA-256.
- `SEQUENCIA-IMPLANTACAO.md`: migrations, dependências, ordem, sequência, recuperação e limitações.
- `reverter-20261023240000.sql`: reversão de emergência da contração. Não é migration.
- `verificar-transicao.mjs`: só para banco local.

### Mudança desta etapa: transição banco × app
A revogação da escrita direta saiu da `20261023220000`, que agora só acrescenta coisas: a RPC e o trigger. Foi para uma migration nova, a `20261023240000` (contração), aplicada só com o app novo servindo todo o tráfego.

Verificação no banco descartável:

| Log | O que foi feito | Resultado |
|---|---|---|
| 42 | cadeia aplicada do zero até `20261023230000` | exit 0 |
| 43 | fase de expansão | app antigo grava direto, RPC autoriza, `completo` forjado recusado; exit 0 |
| 44 | contração aplicada | escrita direta recusada (42501); exit 0 |
| 45 | reversão de emergência | o app antigo volta a gravar; reaplicada, a contração recusa de novo; exit 0 |
| 46 | estado final | privilégios, policies e triggers iguais ao validado, mais o trigger de exclusão |
| 47 | testes de segurança | 18/18, exit 0 |

### Confirmação externa pendente
Registrar só três itens, sem o valor da chave:
- o projeto da Vercel que serve produção (nome exato; a documentação cita `raion-crm.vercel.app` e `raion-crm-roan.vercel.app`);
- o ambiente `Production`;
- a presença de `SUPABASE_SERVICE_ROLE_KEY` (sim/não).

### Também não verificado
- Quais migrations estão aplicadas em produção. A leitura de `schema_migrations` é o pré-requisito P3.
- O efeito das migrations 3 e 4 sobre os dados reais. O ensaio numa cópia restaurada é o pré-requisito P4.

## Fechamento da rodada (23/10) — entrega congelada

Decisão do Evandro: rodada da calculadora GD II **encerrada: implementação e validação local concluídas**. Entrega congelada; o pacote e as evidências existentes ficam como estão (`.aurora/revisao/calc-gd2/integracao/` e `logs/`). Nenhuma alteração nova de código e nenhum teste repetido.

### O que ficou registrado para a futura implantação (nada resolvido nesta etapa)
- **Vercel:** projeto, ambiente `Production` e presença de `SUPABASE_SERVICE_ROLE_KEY` seguem **não verificados**. Sem consulta, sem valor da chave.
- **Recuperação:** a revisão pedida sobre retorno do app (migrations 1–6 + app novo gravando `incompleto`/`completo`, volta à versão anterior por SHA, abrir/editar/salvar e propostas emitidas) **não foi ensaiada**. Consequências a manter em `SEQUENCIA-IMPLANTACAO.md` até haver ensaio:
  - "basta voltar o deployment" **não está comprovado**; a seção 5 já traz o risco como não validado e a preferência por corrigir para frente;
  - a reversão `reverter-20261023240000.sql` reabre a brecha conhecida: contingência, não recuperação padrão;
  - o alvo real de produção não é conhecido (HEAD `2780a53` não está provado como a versão em produção; a `main` atual é `d960703`, ancestral do pacote);
  - execução de migrations em produção só pelo `banco-producao.yml` (hoje `MIGRATIONS_AUTORIZADAS` lista só `20261021100000_negocio_consumo_estimado.sql`; o `--include-all` e a trava exigem dois lotes por commit/tag revisados, o lote 2 contendo a migration 7 só depois do app novo no ar). Workflow não alterado nem disparado.
- Limitações, D1/D2 e visual: sem mudança, congelados.

### Estado do ambiente ao fechar
- Sem commit, push, PR, merge, migrations ou deploy. HEAD do worktree `2780a53`, alterações só no working tree.
- Stack `aurora-calc` parada; `config.toml` no SHA original; `.env.local` removido.
- Worktree auxiliar `R:/wt-m2-p0-retorno` (criado e abandonado ao receber o fechamento) removido; sem outras mudanças.

## PR B (app) — recorte e separação para a PR C (24/10/2026)

- Base: #213 (código sem schema) + #214 (lote 1 do banco, 6 migrations). A `20261023240000` (revogação da escrita direta) NÃO está nesta PR.
- Testes que exigem a revogação final foram tirados daqui e ficam para a PR C (o original completo está no pacote `R:/trocapc/passagem-calc-gd2`):
  - `tests/calculo-gravacao-confiavel-db.test.ts`: bloco "vendedor autenticado não grava financeiro direto (PostgREST)" (INSERT/UPDATE/UPSERT recusados com 42501);
  - `tests/calculadora-db.test.ts`: INSERT direto do vendedor recusado (42501);
  - `tests/travas-kit-sdr-db.test.ts`: as asserções de INSERT/UPDATE/UPSERT direto do vendedor recusado (R3, "levar um cálculo", "criação normal", "cálculo existente" e "cálculo antigo sem itens").
- Material de revisão (`.aurora/revisao/`, logs e PDFs) não foi incluído; segue no pacote.

## PR C (lote 2 do banco) — 24/10/2026

- Só a `20261023240000_calculos_solares_revogar_escrita_direta` + as asserções de segurança restauradas (`calculo-gravacao-confiavel-db`, `calculadora-db`, `travas-kit-sdr-db`, idênticas às do pacote) + lista autorizada com um único item e testes da trava.
- Pré-requisitos antes de aplicar em produção: lote 1 (#214) aplicado e **confirmação de que o app novo (PR B) atende a produção**; a versão anterior do app grava direto com o cliente do usuário e deixaria de salvar o cálculo. Reversão de emergência (reabre a brecha): `reverter-20261023240000.sql` no pacote, contingência e não padrão.

## PR C — diferença em relação ao pacote original (23/10/2026)

- `20261023240000` passa a revogar também `references`, `trigger` e `maintain` de `anon` e `authenticated` (pacote: só `insert, update, truncate`). Ficam só SELECT e DELETE (os oito privilégios de tabela do PG 17 conferidos).
  Motivo: vinham só dos privilégios padrão do Supabase; nenhuma FK aponta para `calculos_solares`, os gatilhos são do `postgres`
  (executá-los não exige TRIGGER) e o app não roda DDL com esses papéis. SELECT, DELETE, policies "ver cálculo"/"apagar cálculo",
  os 7 gatilhos e a gravação pelo `service_role` (os oito privilégios) ficam iguais. Privilégios padrão e outras tabelas não mudam.
- Teste novo em `calculo-gravacao-confiavel-db`: privilégios efetivos (`has_table_privilege`) e PUBLIC sem nada.
- Ensaio no banco restaurado de produção (isolado, sem portas; lote 1 já aplicado): INSERT, UPDATE, UPSERT, TRUNCATE, criar FK e criar
  trigger recusados (42501); SELECT e DELETE do admin ok, com histórico `apagado` e autoria; RPC de autorização ok (anon recusado);
  UPDATE do servidor ok com `updated_at`; `exige_kit` recusa até o servidor; 49 cálculos com o mesmo hash. Tudo em transações revertidas.
- A reversão de emergência do pacote (`reverter-20261023240000.sql`) não precisa devolver `references`/`trigger`: o app antigo não os usa.
- Delta `maintain` aplicado só no banco restaurado isolado: ACL `anon=rd`, `authenticated=rd`; REINDEX recusado (42501) e ANALYZE pulado
  para os dois; `service_role` mantém. LOCK TABLE continua possível para eles porque o PG 17 o aceita também com DELETE (preservado de
  propósito); pelo PostgREST não há como emitir LOCK. 49 cálculos com o mesmo hash; roteiro revertido repetido sem diferença.
