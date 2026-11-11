# Assistente de primeiro acesso (Onboarding, subprojeto 3) — desenho

Data: 11/11/2026. Decisões do Evandro de 10–11/11/2026; quadros aprovados do canvas "Raion — Nova interface", linha
"Onboarding: Solo e PRO": `OnboardingEmpresa` (passo 1), `OnboardingProMarca` (2), `OnboardingProImagens` (3),
`OnboardingProTelas` (telas), `OnboardingSolo` (pagamento), `OnboardingEquipe` e `OnboardingRevisar`. Subprojetos 1
(telas, #365) e 2 (marca, #367) em produção.

## Objetivo

Um caminho guiado, no primeiro acesso do admin de empresa nova, que grava nas mesmas configurações de sempre:

- **Quando:** abre sozinho para o **admin** de empresa criada pelo super-admin depois desta entrega, até concluir.
  Empresas de hoje não veem. "Pular por agora" pula o passo; sair e voltar retoma de onde parou. Em Configurações ›
  Empresa, "Abrir o assistente" reabre a qualquer hora (rever, sem obrigar).
- **Passos** (o PRO fica com 7 até o subprojeto 4 trazer "Setores" como passo 5):

| # | Solo | PRO | Grava em |
| --- | --- | --- | --- |
| 1 | Sua empresa | Sua empresa | `proposta_identidades.nome_exibicao`, `.whatsapp`; `empresas.cnpj` (função nova) |
| 2 | Marca e cores | Marca e cores | `proposta_identidades` (logos e cores; `CamposMarcaCores`) |
| 3 | Tela de entrada e faixa | Tela de entrada e faixa | `empresa_tela_entrada` (foto, frase; **faixa nova**) |
| 4 | Formas de pagamento | Telas que a equipe usa | Solo: condições de pagamento · PRO: `empresa_telas` |
| 5 | Revisar e começar | Formas de pagamento | condições de pagamento de hoje (decisão de 11/11) |
| 6 | — | Equipe | cadastro de Usuários (pessoa criada com senha temporária) |
| 7 | — | Revisar e começar | marca o assistente como concluído |

- **Faixa do topo por empresa (nova):** foto própria na faixa escura de cada tela, ou a mesma da tela de entrada; sem
  foto, a paisagem do Raion. Também editável em Configurações › Tela de entrada.
- **Formas de pagamento:** o passo mostra a configuração que já existe (limites de desconto do vendedor e do gestor,
  Personalizado, parcelas e taxas do cartão e do boleto), no visual do quadro. Nenhuma regra nova na proposta.
- **Equipe:** o passo usa o mesmo cadastro de Configurações › Usuários (`convidarMembro`): a pessoa é criada com senha
  temporária, que o assistente mostra ao admin para repassar ("Pessoa cadastrada"). O quadro `OnboardingEquipe` é
  ajustado nesse texto (não há convite por e-mail hoje).

## Banco

Migration `supabase/migrations/20261205100000_assistente_primeiro_acesso.sql`:

- **`empresa_onboarding`**: `id` pk, `empresa_id` unique → `empresas`, `passo_atual smallint not null default 1`,
  `pulados smallint[] not null default '{}'`, `concluido_em timestamptz`, `created_at`, `updated_at`; auditoria.
  RLS: o admin da empresa lê e atualiza; o super-admin (`e_plataforma_admin()`) insere. Sem linha = assistente não se
  aplica (empresas de hoje). `concluido_em` só passa de nulo para preenchido.
- **`empresa_tela_entrada`**: colunas `faixa_caminho text` (mesma pasta da empresa, mesmo check de pasta) e
  `faixa_usa_entrada boolean not null default true`.
- **`salvar_cnpj_empresa(p_empresa_id uuid, p_cnpj text)`**: `security definer`, só admin da empresa
  (`tem_papel(…,'{admin}')`); grava `empresas.cnpj` (14 dígitos ou vazio = nulo). Sem `EXECUTE` para `anon`.

## App

- **Regra pura `src/lib/assistente.ts`:** `PASSOS_SOLO`, `PASSOS_PRO` (chaves `empresa`, `marca`, `imagens`, `telas`,
  `pagamento`, `equipe`, `revisar`, com título e rótulo do quadro), `passosDoPlano(solo)`, `proximoPasso`,
  `passoAnterior`, `estadoDoPasso(onboarding, chave)` (`feito` | `pulado` | `pendente`).
- **Rota `/primeiro-acesso`** (fora do grupo `(app)`, tela cheia do quadro: coluna escura com o plano, a frase "Vamos
  deixar o Raion com a cara da …", os passos e "Tudo aqui pode ser mudado depois…"), `?passo=<chave>`; só admin.
  Cada passo é um componente que reaproveita os de Configurações e grava pela mesma ação; "Continuar" grava e avança
  (`avancarAssistente`), "Pular por agora" marca pulado e avança, "←" volta. O último passo resume (feito/pulado, com
  "Editar"/"Fazer agora") e "Começar a usar o Raion" conclui e leva ao Início.
- **Redirecionamento:** o layout `(app)` leva o admin para `/primeiro-acesso` enquanto a empresa tem
  `empresa_onboarding` sem `concluido_em`. Outros papéis não são levados.
- **Super-admin:** `criarEmpresa` cria a linha de `empresa_onboarding` junto com a empresa.
- **Faixa:** o `CabecalhoPagina` usa `var(--faixa-imagem, url(/marca/paisagem.jpg))`; o invólucro `tema-app` recebe
  `--faixa-imagem` quando a empresa tem faixa (URL pública do bucket `tela-entrada`).
- **Configurações:** "Abrir o assistente" (grupo Empresa) → `/primeiro-acesso?rever=1` (não reabre a obrigação);
  Configurações › Tela de entrada ganha o cartão "Faixa do topo".

## Erros

- Falha ao ler o estado do assistente: não redireciona (o app segue normal).
- Cada passo mostra o erro da ação que já existe e não avança.

## Testes

- Puros: passos por plano, próximo/anterior, estado feito/pulado/pendente.
- Banco: só admin lê/atualiza `empresa_onboarding`; super-admin cria; outra empresa não; `concluido_em` não volta a
  nulo; `salvar_cnpj_empresa` só admin; faixa com caminho de outra empresa recusada.
- Navegador: empresa nova → admin cai no assistente, pula tudo, conclui e cai no Início; vendedor da mesma empresa não
  é levado; faixa própria aparece no cabeçalho.
- lint, typecheck, `pnpm test`, build.
