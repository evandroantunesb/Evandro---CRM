# Contrato: conferir, editar e enviar (18/11/2026)

Substitui o item 2 do roadmap ("assinatura eletrônica real"). Decisão do Evandro em 18/11/2026: a assinatura eletrônica fica de fora; o cliente assina como conseguir (gov.br, cartório). O foco é o vendedor conferir, ajustar e enviar o contrato.

## Por quê

Hoje o vendedor gera o contrato e só consegue ler o texto pronto abrindo o link público; não há como ajustar o texto (a única saída seria baixar e editar fora, o que deixaria o CRM e o link com outra versão). O Evandro pediu Word para editar à mão, mas, com edição dentro do CRM, o Word não faz falta.

Nenhuma integração de assinatura cobre gov.br para empresa privada (a API de assinatura do gov.br não é aberta ao setor privado), o que pesou na decisão.

## Objetivos

1. **Conferir:** depois de gerar, o texto completo do contrato aparece no cartão "Contrato" do negócio (aba "Proposta e contrato"), sem abrir o link.
2. **Editar:** enquanto o contrato é rascunho, "Editar texto" transforma o texto num campo editável; salvar grava o texto, e link, PDF e WhatsApp passam a usar o texto editado.
3. **Enviar:** "Enviar no WhatsApp" abre a conversa com o número do cliente (contato do negócio); sem número válido, abre sem destinatário, como hoje.

## Fora do escopo (não-objetivos)

- Assinatura eletrônica (ZapSign, Clicksign, gov.br).
- Download em Word.
- Procuração (segue só com "Baixar procuração").
- Editor com formatação: o texto continua texto simples, como o modelo.

## Anti-objetivos

- O texto que o cliente recebe divergir do que fica guardado no CRM.
- Edição sem rastro: toda edição fica no histórico do negócio.
- Texto editado mudar pontos, metas ou comissão: eles continuam vindo do valor do negócio e dos eventos, nunca do texto.

## Regras (decididas pelo Evandro)

- **Quem edita:** o vendedor que gerou o contrato, o gestor e o admin. O SDR não (já não gera contrato).
- **Quando:** só com o contrato em rascunho. Em "aguardando assinatura" ou "assinado" o texto trava, como hoje.
- **Histórico:** cada edição registra quem e quando na linha do tempo do negócio; o cartão mostra a marca "texto editado à mão".

## Abordagens consideradas

- **A. Editar dentro do CRM (escolhida):** uma versão só do contrato; sem dependência nova.
- **B. Baixar em Word:** CRM e link ficariam com o texto antigo, sem rastro, e o WhatsApp mandaria a versão errada; exigiria biblioteca de .docx.
- **C. As duas:** mantém o risco da B e aumenta o trabalho sem ganho claro.

## Decisões minhas (para o Evandro conferir)

- **"Vendedor que gerou"** = quem gerou o contrato pela primeira vez (`contratos.criado_por`). "Gerar novamente" por outra pessoa não muda isso. Ele também precisa continuar vendo o negócio (RLS atual).
- **"Gerar novamente" apaga a edição:** refaz o texto a partir do modelo; com texto editado, o botão pede confirmação ("Você perde as edições feitas à mão") e a marca "editado à mão" sai.
- **Validação do texto editado:** não pode ficar vazio, nem com `{{`/`}}` (mesma regra `contratoProntoParaCliente` de hoje), com limite de tamanho. A trava acontece no banco, não só na tela.
- **Gravação:** RPC `security definer` que confere empresa, papel/autor, status rascunho e o texto, grava `conteudo`, quem e quando editou, e registra a atividade na mesma transação. Nunca grava em `eventos` nem `point_ledger`.
- **Conferência:** texto exibido com as quebras de linha do modelo, numa área com rolagem, no próprio cartão (mobile primeiro).

## Riscos

- O vendedor pode escrever no texto um valor ou condição diferente do negócio. Mitigação: histórico + marca "editado à mão"; o gestor vê. Comparar o texto com o valor fica para depois, se o Evandro pedir.
- Migration nova: o preview da Vercel usa o banco de produção; a migration precisa ser aplicada pelo `banco-producao.yml` antes do merge (fluxo de sempre, com aprovação do Evandro).

## Antes do código

Prévia no canvas (antes × depois do cartão "Contrato": conferir, editar, enviar) para o OK do Evandro, depois o plano em `docs/superpowers/plans/`.
