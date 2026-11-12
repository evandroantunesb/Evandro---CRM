# Marca e cores da empresa no app (Onboarding, subprojeto 2) — desenho

Data: 10/11/2026. Decisões do Evandro nesta data; quadro aprovado "Onboarding PRO · passo 2, marca e cores" do canvas
"Raion — Nova interface". Subprojeto 1 (telas por empresa) já em produção (#365/#366).

## Objetivo

O app passa a usar a marca da empresa — a mesma da proposta:

- **Fonte única:** a identidade da proposta (`proposta_identidades`: `cor_primaria`, `cor_destaque`, `logo_url`,
  `logo_escuro_url`, editada em Configurações › Propostas › Identidade). A cor primária vira a cor da barra lateral e da
  faixa do topo; a de destaque substitui o dourado do app (botões, aba ativa, gráficos, marcações). O PDF e a página da
  proposta já usam essas cores: app e proposta seguem sempre o mesmo esquema.
- **Logo:** a barra lateral e o cabeçalho do celular mostram só a logo de fundo escuro (`logo_escuro_url`); sem ela, a
  do Raion (revisão de 10/11/2026: a logo de fundo claro ficaria ilegível na barra).
- **Não mudam:** verde (WhatsApp e energia), vermelho (erro), avisos de atenção (escala âmbar e o token fixo `atencao`,
  usado no amarelo do semáforo de Obras e nos atrasos), a Gamificação inteira
  (tema próprio; a barra lateral segue a cor da empresa), a tela de login e as páginas do cliente além do que a proposta
  já faz.
- **Contraste:** cor ilegível não salva. Combinação antiga ilegível já salva: o app usa o padrão Raion para ela (o PDF
  continua como está).

## Banco

Migration `supabase/migrations/20261204100000_marca_da_empresa.sql` (prefixo conferido contra as PRs abertas):

- `marca_da_empresa(p_empresa_id uuid) returns table (cor_primaria text, cor_destaque text, logo_url text,
  logo_escuro_url text)`: `security definer`, `stable`, `search_path = ''`; devolve a linha de `proposta_identidades`
  só para membro ativo da empresa (`meu_membro_id`); senão nenhuma linha. Sem `EXECUTE` para `public`/`anon`. O resto da
  identidade continua só para quem tem acesso comercial.
- Nenhuma tabela nova; nenhuma política alterada. A política "marca: ler" do Storage é só do comercial (blindagem de
  07/10): a logo é assinada no servidor com a chave de serviço, só para o caminho que `marca_da_empresa` devolveu.

## Regra pura (`src/lib/marca-cores.ts`)

- `contraste(a, b)`: razão WCAG 2 entre duas cores `#RRGGBB` (luminância relativa sRGB).
- `textoSobre(cor)`: `#0F0F10` ou `#FFFFFF`, o de maior contraste.
- `validarMarca({ barra, destaque })` → lista de problemas em português:
  - barra: `contraste(barra, "#FAF8F3") >= 7` (decisão de 10/11/2026: os itens apagados do menu, branco a 60%,
    continuam legíveis) ("A cor da barra é clara demais: o texto do menu fica ilegível.");
  - destaque: `contraste(destaque, textoSobre(destaque)) >= 4.5` ("A cor de destaque não deixa o texto dos botões
    legível, nem em preto nem em branco.");
  - destaque contra a barra e contra `#0F0F10`: `>= 3` (ícones, filetes e botões) ("A cor de destaque some sobre a barra
    ou no fundo escuro: escolha uma cor mais clara ou mais viva.").
- `variaveisMarca({ barra, destaque })` → `Record<string, string>` com `--color-dourado`, `--color-acao` (= destaque),
  `--color-acao-forte` (destaque escurecido ~13%), `--color-sobre-acao` (= `textoSobre`), `--color-dourado-texto`
  (`light-dark(<destaque escurecido até 4,5:1 sobre #FAF8F3>, <destaque clareado até 4,5:1 sobre #0F0F10>)`) e
  `--cor-barra` (= barra). Cor nula usa o padrão Raion (`#0F0F10` / `#D4AF37`).
- `marcaDoApp(linha)`: nula quando não há cor própria ou quando `validarMarca` falha (padrão Raion).

## Aplicação no app

- `obterMarcaEmpresa()` (`src/lib/marca-servidor.ts`, `cache` por requisição): `rpc("marca_da_empresa")` +
  URL assinada da logo de fundo escuro (bucket `proposta-marca`, chave de serviço depois do RPC). Falha = padrão Raion,
  sem quebrar.
- `src/app/(app)/layout.tsx`: o invólucro `tema-app` recebe `style={variaveisMarca(...)}` e `data-marca` quando há marca;
  a barra lateral e o cabeçalho do celular mostram a logo da empresa (`<img>` com altura igual à do `LogoRaion`) ou o
  `LogoRaion`.
- `src/app/globals.css`:
  - `.tema-app .barra-lateral, .tema-app .faixa-marca { --color-carvao: var(--cor-barra, #0f0f10); }` — dentro da barra,
    do cabeçalho do celular e da faixa, o carvão (fundo e degradê) vira a cor da empresa;
  - `.tema-app[data-marca] :is(.bg-dourado, .bg-acao).text-carvao { color: var(--color-sobre-acao); }` — texto dos
    botões de destaque segue o preto/branco calculado;
  - `.tema-gamificacao` volta `--color-dourado`, `--color-acao`, `--color-acao-forte`, `--color-sobre-acao` e
    `--color-dourado-texto` aos valores do Raion.
- `src/components/cabecalho-pagina.tsx`: a `<section>` da faixa ganha a classe `faixa-marca`.

## Configuração

- Configurações › Propostas › Identidade continua sendo o lugar da logo e das cores. Rótulos: "Cor da barra e da faixa
  (e títulos da proposta)" e "Cor de destaque (botões, abas, gráficos e proposta)".
- Componente `src/components/marca-cores.tsx` (`CamposMarcaCores`): as duas cores, a prévia do quadro (barra com logo,
  faixa, botão e barras de gráfico, ao vivo), "✓ Contraste bom" ou os problemas de `validarMarca`, e "Voltar ao padrão
  Raion". Usado no formulário da identidade e, depois, no assistente.
- `src/lib/acoes/proposta-identidade.ts`: recusa com a mensagem de `validarMarca` quando as cores salvas não passam.
- Índice de Configurações, grupo "Empresa": item "Marca e cores" → `/configuracoes/propostas/identidade`.

## Testes

- Puros (`tests/marca-cores.test.ts`): contraste preto/branco = 21; dourado × carvão ≥ 9 (o padrão Raion passa nas duas regras); `textoSobre`; tons
  derivados com contraste ≥ 4,5; `validarMarca` recusa barra clara e destaque ilegível; `marcaDoApp` nula sem cores e
  com combinação ilegível; `variaveisMarca` com os nomes certos.
- Banco (`tests/marca-da-empresa-db.test.ts`): membro de qualquer papel (inclusive `operacao`) lê; outra empresa não.
- Navegador (`e2e/34-marca-cores.spec.ts`): admin troca as cores, salva, a barra e um botão de destaque mudam; barra
  clara demais não salva; volta ao padrão no fim.
- lint, typecheck, `pnpm test`, build.
