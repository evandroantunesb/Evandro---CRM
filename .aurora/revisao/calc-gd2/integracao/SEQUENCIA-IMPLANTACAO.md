# Integração M2 P0 — calculadora GD II: sequência de implantação e recuperação

Estado: **implementação e validação local concluídas; configuração de produção pendente de verificação.**
Nada aqui foi executado em produção. Base: HEAD `2780a53`, worktree `R:/wt-m2-p0-calc` (sem commit).

## 1. Pacote

| Item | Arquivo |
|---|---|
| Diff consolidado (HEAD → worktree, 84 arquivos, 42 novos; sem `.aurora/` e `supabase/config.toml`) | `pacote-consolidado.diff` (`git apply --check --reverse` = 0) |
| Inventário com situação, linhas e SHA-256 | `INVENTARIO.md` |
| Reversão de emergência da contração (não é migration) | `reverter-20261023240000.sql` |
| Verificador da transição (só banco local) | `verificar-transicao.mjs` |
| Checkpoint | `.aurora/checkpoints/m2-p0-calc-gd2-nora.md` |
| Logs | `.aurora/revisao/calc-gd2/logs/` (finais: 33–41, transição: 42–47) |

## 2. Migrations, dependências e ordem

Todas novas em relação ao HEAD. As três primeiras são de rodadas anteriores do M2 P0, que a mesma versão do app usa.

| # | Migration | Fase | Depende de | Compatível com o app ANTIGO? |
|---|---|---|---|---|
| 1 | `20261022100000_propostas_emissoes` | expansão | HEAD | sim: tabela, bucket e policies novos |
| 2 | `20261022110000_produtividade_confirmada` | expansão | HEAD | sim: colunas e trigger novos em `parametros_calculadora` |
| 3 | `20261023200000_calculos_estimativa_incompleta` | expansão | HEAD | sim: o app antigo grava `legado` com todos os números (o CHECK aceita); `drop not null` só afrouxa |
| 4 | `20261023210000_calculo_gd2_fio_b` | expansão | 3 (estado e CHECK) | sim: tarifas, retrato e histórico novos; `tarifa_kwh` passa para 5 casas (reescreve a tabela; trava `calculos_solares` durante a alteração) |
| 5 | `20261023220000_calculos_solares_gravacao_servidor` | expansão | 4 (tarifas e retrato) | sim: só cria a RPC de autorização e o trigger de referência (vale só para `completo`, que o app antigo não grava) |
| 6 | `20261023230000_calculos_solares_exclusao_historico` | expansão | 4 (histórico) | sim: o DELETE pelo usuário continua, agora com histórico e autoria |
| 7 | `20261023240000_calculos_solares_revogar_escrita_direta` | **contração** | 5 e app novo no ar | **não**: o app antigo grava direto e deixaria de salvar o cálculo |

**Transição.** O app novo precisa das migrations 1 a 5: tabelas, colunas, RPC e emissões. O app antigo precisa de que a 7 ainda não tenha sido aplicada. Por isso a revogação foi separada em uma migration própria.
- Com 1 a 6 aplicadas, os dois apps funcionam juntos (log 43):
  - o app antigo grava direto;
  - o app novo autoriza pela RPC e grava pelo servidor;
  - um `completo` forjado é recusado.
- A 7 só entra depois que o app novo estiver servindo todo o tráfego (log 44).

O estado final é idêntico ao validado (logs 46 e 47). A cadeia completa aplica do zero sem erro (log 42).

Fora do escopo desta sequência: as migrations do HEAD (`≤ 20261021100000`) precisam estar aplicadas em produção. Isso também está **não verificado**.

## 3. Sequência proposta

**Pré-requisitos (bloqueiam a sequência)**
- P1. Confirmação externa da variável (seção 4).
- P2. Autorização explícita do Evandro para produção: commit/PR/merge, migrations e deploy.
- P3. Leitura, só leitura, de `supabase_migrations.schema_migrations` em produção. Confirma que todas as do HEAD estão aplicadas e nenhuma das 7 acima.
- P4. Ensaio em uma cópia descartável restaurada do backup de produção:
  - aplicar 1 a 6;
  - `verificar-transicao.mjs expansao`;
  - aplicar a 7;
  - `verificar-transicao.mjs contracao`.

  Isso confere os CHECKs da 3 e da 4 sobre os dados reais. Este ensaio foi feito só com a base fictícia.

**Implantação**
1. Backup de produção (banco e Storage) com o procedimento de `docs/BACKUP-STORAGE-PRODUCAO.md`. Anote o deployment atual da Vercel, que é o ponto de retorno do app.
2. Aplicar as migrations 1 a 6, em ordem, uma por vez (cada uma em transação). Se uma falhar, pare: o app antigo continua funcionando com o que já entrou.
3. Verificação só leitura:
   - versões em `schema_migrations`;
   - a RPC `autorizar_gravacao_calculo` existe;
   - os triggers `calculos_solares_referencia_oficial` e `calculos_solares_historico_exclusao` existem;
   - `authenticated` ainda tem INSERT/UPDATE em `calculos_solares`.
4. Deploy do app novo.
5. Fumaça no app novo, num negócio de teste autorizado para isso:
   - salvar kit Copel residencial dá "Kit e cálculo salvos.";
   - a linha fica `completo`, com `criado_por` = membro da sessão;
   - emitir a proposta simples funciona.
6. Confirmar que todo o tráfego está no deployment novo, sem deployment antigo servindo.
7. Aplicar a migration 7 (contração).
8. Verificação final:
   - privilégios iguais ao log 46: `authenticated` só com SELECT/DELETE; policies "ver cálculo" e "apagar cálculo";
   - repetir a fumaça do passo 5;
   - com o token da sessão de teste, um INSERT direto em `calculos_solares` é recusado com 42501.

## 4. Confirmação externa que falta

Registrar somente:
- **projeto** da Vercel que serve produção (nome exato);
- **ambiente** `Production`;
- **presença** de `SUPABASE_SERVICE_ROLE_KEY` nesse ambiente (sim/não).

Não registrar o valor. A documentação cita `raion-crm.vercel.app` e `raion-crm-roan.vercel.app`; qual delas é a produção também não foi verificado.

Sem a variável, o app novo recusa salvar e atualizar o preço do cálculo sem alterar nada (testado). Convites, propostas emitidas, anexos e agenda, que já usam a mesma chave, também falhariam.

## 5. Recuperação em caso de falha

| Momento | Falha | Ação |
|---|---|---|
| Passo 2 | uma migration falha | Parar. A migration que falhou é desfeita pela própria transação; as anteriores são compatíveis com o app antigo e podem ficar. Corrigir e reaplicar a partir dela. |
| Passos 4–5 | app novo com erro | Voltar ao deployment anotado no passo 1. As migrations 1 a 6 ficam (compatíveis). **Risco:** linhas `incompleto`/`completo` gravadas pelo app novo nesse intervalo não são conhecidas pelo app antigo, que espera os números financeiros. Isso não foi validado. Antes de voltar, contar `select estado_financeiro, count(*) from calculos_solares group by 1`. Prefira corrigir para frente. |
| Passo 7 | contração falha | Nada muda (transação). O app novo segue funcionando; investigar e reaplicar. |
| Depois do passo 7 | é preciso voltar o app | **Antes** de voltar o deployment, rodar `reverter-20261023240000.sql`: recria as policies e os privilégios antigos e reabre a brecha (log 45: o app antigo volta a gravar). Assim que a versão nova voltar, reaplicar o conteúdo da migration 7 (log 45: recusa de novo). |
| Qualquer momento | dados | Restaurar do backup do passo 1 só em último caso: perde o que foi gravado depois. |

## 6. Limitações registradas (não mudam nesta integração)

- A Tabela 4 da REH 3.592 continua não conferida.
- Escopo tributário: o Fio B é sem tributos; ICMS e PIS/Cofins ficam fora.
- A tarifa e a base tributária são declaradas pelo vendedor, com a origem registrada.
- São presumidos a modalidade convencional e o bifásico com 3 condutores (ficam visíveis).
- Payback indisponível.
- A distribuidora é casada pelo texto livre da qualificação.
- A virada para 2027 e o fim da vigência são cobertos só nos testes de banco.
- A proposta com economia (D1/D2) e o visual continuam congelados.
