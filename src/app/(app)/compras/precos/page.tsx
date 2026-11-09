import { CalendarClock, FileSpreadsheet, Package, TrendingUp, Upload, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Indicadores, type Indicador } from "@/app/(app)/negocios/indicadores";
import { AbasCompras } from "@/components/compras/abas-compras";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO } from "@/components/cabecalho-pagina";
import { FOCO, Selo } from "@/components/ui";
import { acessaCompras } from "@/lib/compras/dados";
import { acessoPrecos, carregarTelaPrecos } from "@/lib/compras/dados-precos";
import { CATEGORIAS_MATERIAL, DIAS_PRECO_ANTIGO, ROTULO_CATEGORIA_MATERIAL, diasDesde, ehCategoriaMaterial, normalizar } from "@/lib/compras/precos";
import { formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Preços de material (desenho aprovado "Tabela de preços (/compras/precos)"): preço de custo de cada material por
 * fornecedor, atualizado pelas tabelas que os fornecedores mandam. Veem admin, gestor, quem atua em Compras e o
 * Administrativo; alteram admin, gestor e Compras. Margem e venda sugerida ficam para a P4.
 */

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

export default async function PrecosMaterial({ searchParams }: PageProps<"/compras/precos">) {
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  const [acesso, veCompras] = await Promise.all([acessoPrecos(supabase, atual.empresaId), acessaCompras(supabase, atual.empresaId, atual.papel)]);
  if (!acesso.ver) redirect("/inicio");
  const params = await searchParams;
  const categoria = ehCategoriaMaterial(params.categoria) ? params.categoria : null;
  const busca = typeof params.q === "string" ? params.q.trim() : "";
  const hoje = hojeEmSaoPaulo();
  const dados = await carregarTelaPrecos(supabase, atual.empresaId, hoje);
  const k = dados.kpis;

  const indicadores: Indicador[] = [
    { Icone: Package, legenda: "Materiais cadastrados", valor: k.materiais.toLocaleString("pt-BR"), rodape: `em ${plural(k.categorias, "categoria", "categorias")}` },
    {
      Icone: FileSpreadsheet,
      legenda: "Fornecedores com tabela",
      valor: String(k.fornecedores),
      rodape: k.ultima ? `última: ${k.ultima.fornecedor}, ${dataCurta(k.ultima.data)}` : "nenhuma tabela ainda",
    },
    { Icone: CalendarClock, legenda: `Preços com mais de ${DIAS_PRECO_ANTIGO} dias`, valor: String(k.antigos), rodape: k.antigos > 0 ? "pedir tabela nova" : "tudo em dia" },
    {
      Icone: TrendingUp,
      legenda: "Mudaram na última tabela",
      valor: String(k.mudaram ? k.mudaram.subiram + k.mudaram.baixaram : 0),
      rodape: k.mudaram ? `${k.mudaram.subiram} subiram · ${k.mudaram.baixaram} baixaram` : "sem tabela",
    },
  ];

  const categoriasUsadas = CATEGORIAS_MATERIAL.filter((c) => dados.materiais.some((m) => m.categoria === c));
  const termo = normalizar(busca);
  const materiais = dados.materiais.filter(
    (m) => (!categoria || m.categoria === categoria) && (!termo || normalizar(`${m.nome} ${m.precos.map((p) => p.fornecedor).join(" ")}`).includes(termo)),
  );
  const href = (c: string | null) => {
    const q = new URLSearchParams({ ...(c ? { categoria: c } : {}), ...(busca ? { q: busca } : {}) }).toString();
    return `/compras/precos${q ? `?${q}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Operação · Compras"
        titulo="Preços de material"
        descricao="Preço de custo de cada material por fornecedor, atualizado pelas tabelas que os fornecedores mandam. O pedido de compra já vem com o preço da tabela preenchido."
        acoes={
          acesso.editar ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/compras/precos/enviar" className={CLASSE_ACAO_CABECALHO}>
                <Upload size={16} aria-hidden />
                Enviar tabela de preços
              </Link>
              <Link
                href="/compras/precos/material/novo"
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-offwhite/30 px-5 text-sm font-semibold text-offwhite transition-colors hover:border-dourado ${FOCO}`}
              >
                <Plus size={16} aria-hidden />
                Material
              </Link>
            </div>
          ) : undefined
        }
      />

      {veCompras && <AbasCompras atual="precos" />}

      <Indicadores itens={indicadores} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Materiais" className="painel min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:px-6">
            <nav aria-label="Categoria" className="flex flex-wrap gap-1.5">
              {[null, ...categoriasUsadas].map((c) => (
                <Link
                  key={c ?? "todos"}
                  href={href(c)}
                  aria-current={categoria === c ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors ${FOCO} ${
                    categoria === c ? "border-dourado bg-dourado/15 font-semibold text-texto" : "border-linha text-texto-2 hover:text-texto"
                  }`}
                >
                  {c ? ROTULO_CATEGORIA_MATERIAL[c] : "Todos"}
                </Link>
              ))}
            </nav>
            <form role="search" action="/compras/precos" className="flex gap-2">
              {categoria && <input type="hidden" name="categoria" value={categoria} />}
              <input
                type="search"
                name="q"
                defaultValue={busca}
                aria-label="Buscar material ou fornecedor"
                placeholder="Buscar material ou fornecedor"
                className="min-h-10 w-full rounded-lg border border-linha bg-superficie px-3 text-sm md:w-64"
              />
            </form>
          </div>

          {materiais.length === 0 ? (
            <p className="border-t border-linha px-4 py-6 text-sm text-texto-2 md:px-6">
              {dados.materiais.length === 0
                ? acesso.editar
                  ? "Nenhum material ainda. Envie a tabela de um fornecedor ou cadastre um material."
                  : "Nenhum material ainda."
                : "Nenhum material encontrado."}
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-linha">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-linha text-left text-xs text-texto-2">
                    <th className="px-4 py-2 font-medium md:px-6">Material</th>
                    <th className="px-2 py-2 font-medium">Melhor preço de custo</th>
                    <th className="px-2 py-2 font-medium">Outros fornecedores</th>
                    <th className="px-2 py-2 font-medium">Atualizado</th>
                    <th className="px-4 py-2 md:px-6">
                      <span className="sr-only">Histórico</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materiais.map((m) => {
                    const [melhor, ...outros] = m.precos;
                    const dias = m.atualizado ? diasDesde(m.atualizado, hoje) : null;
                    return (
                      <tr key={m.id} className="border-b border-linha align-top last:border-b-0">
                        <td className="px-4 py-3 md:px-6">
                          <Link href={`/compras/precos/material/${m.id}`} className={`font-medium text-texto hover:underline ${FOCO}`}>
                            {m.nome}
                          </Link>
                          <span className="block text-xs text-texto-2">
                            {ROTULO_CATEGORIA_MATERIAL[m.categoria]} · {m.unidade}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          {melhor ? (
                            <>
                              <span className="font-semibold text-texto tabular-nums">{formatarMoeda(melhor.preco)}</span>
                              <span className="block text-xs text-texto-2">{melhor.fornecedor}</span>
                            </>
                          ) : (
                            <span className="text-texto-2">Sem preço</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-xs text-texto-2">
                          {outros.length === 0
                            ? "—"
                            : outros.slice(0, 2).map((p) => (
                                <span key={p.fornecedor} className="block">
                                  {p.fornecedor} · <span className="tabular-nums">{formatarMoeda(p.preco)}</span>
                                </span>
                              ))}
                          {outros.length > 2 && <span className="block">+{outros.length - 2}</span>}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          {m.atualizado == null ? (
                            "—"
                          ) : dias! > DIAS_PRECO_ANTIGO ? (
                            <Selo tom="atencao">{dias} dias</Selo>
                          ) : (
                            <span className="tabular-nums">{dataCurta(m.atualizado)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right md:px-6">
                          <Link href={`/compras/precos/material/${m.id}`} className={`text-sm font-medium text-dourado-texto hover:underline ${FOCO}`}>
                            Histórico
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="painel p-4 md:p-5">
            <p className="text-xs font-medium text-texto-2">Por fornecedor</p>
            <h2 className="font-titulo text-lg text-texto">Tabelas recebidas</h2>
            {dados.tabelas.length === 0 ? (
              <p className="mt-2 text-sm text-texto-2">Nenhuma tabela enviada ainda.</p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-linha">
                {dados.tabelas.map((t) => (
                  <li key={t.id} className="flex flex-col gap-0.5 py-2.5">
                    <a href={`/compras/precos/tabela/${t.id}`} className={`text-sm font-medium text-texto hover:underline ${FOCO}`}>
                      {t.fornecedor}
                    </a>
                    <span className="text-xs text-texto-2">
                      {dataCurta(t.dataTabela)} · {plural(t.itens, "item", "itens")}
                      {t.validoAte && !t.vencida && ` · vale até ${dataCurta(t.validoAte)}`}
                      {t.vencida && (
                        <>
                          {" · "}
                          <Selo tom="atencao">vencida</Selo>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
            Cada mudança de preço fica no histórico do material (data, fornecedor, preço antigo e novo, quem enviou). Pedidos já salvos não mudam quando
            chega uma tabela nova. Quem atua em Compras, o gestor e o admin alteram esta tela; o Administrativo consulta.
          </p>
        </aside>
      </div>
    </div>
  );
}
