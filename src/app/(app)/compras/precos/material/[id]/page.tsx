import { notFound, redirect } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { FormularioMaterial, FormularioPrecoManual } from "@/components/compras/formularios-preco";
import { CartaoRecolhivel, Selo } from "@/components/ui";
import { acessoPrecos, carregarMargens, carregarMaterial } from "@/lib/compras/dados-precos";
import { DIAS_PRECO_ANTIGO, ROTULO_CATEGORIA_MATERIAL, chaveFornecedor, diasDesde, historicoComMudancas, variacao } from "@/lib/compras/precos";
import { margemEmTexto, vendaSugerida } from "@/lib/compras/margens";
import { formatarMoeda, formatarNumeroBr, hojeEmSaoPaulo } from "@/lib/formatacao";
import { GERIR_OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Material da tabela de preços: preço atual de cada fornecedor e o histórico das mudanças. */

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default async function MaterialPrecos({ params }: PageProps<"/compras/precos/material/[id]">) {
  const { id } = await params;
  const { atual } = await exigirPapel(...GERIR_OBRAS);
  const supabase = await criarClienteServidor();
  const acesso = await acessoPrecos(supabase, atual.empresaId);
  if (!acesso.ver) redirect("/inicio");
  const [dados, margens] = await Promise.all([carregarMaterial(supabase, atual.empresaId, id), carregarMargens(supabase, atual.empresaId)]);
  if (!dados) notFound();
  const { material, precos } = dados;
  const hoje = hojeEmSaoPaulo();
  const historico = historicoComMudancas(dados.historico);

  let fornecedores: string[] = [];
  if (acesso.editar) {
    const { data } = await supabase.from("compras_tabelas_preco").select("fornecedor").eq("empresa_id", atual.empresaId).limit(500);
    const porChave = new Map<string, string>();
    for (const f of [...precos.map((p) => p.fornecedor), ...(data ?? []).map((t) => t.fornecedor)]) {
      if (!porChave.has(chaveFornecedor(f))) porChave.set(chaveFornecedor(f), f);
    }
    fornecedores = [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/compras/precos", rotulo: "Tabela de preços" }}
        sobretitulo={`Compras · ${ROTULO_CATEGORIA_MATERIAL[material.categoria]}`}
        titulo={material.nome}
        descricao={`Preço de custo por ${material.unidade}, em cada fornecedor.${material.potenciaW != null ? ` Potência: ${formatarNumeroBr(material.potenciaW)} W.` : ""}${
          precos[0] ? ` Venda sugerida: ${formatarMoeda(vendaSugerida(precos[0].preco, margens[material.categoria]))} (margem ${margemEmTexto(margens[material.categoria])}%).` : ""
        }`}
      />

      <section className="painel overflow-hidden">
        <h2 className="p-4 pb-2 font-titulo text-lg text-texto md:px-6">Preços atuais</h2>
        {precos.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-texto-2 md:px-6">Sem preço ainda.</p>
        ) : (
          <ul className="divide-y divide-linha border-t border-linha">
            {precos.map((p, i) => {
              const dias = diasDesde(p.dataPreco, hoje);
              return (
                <li key={p.fornecedor} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-texto">{p.fornecedor}</span>
                    <span className="text-xs text-texto-2">
                      {dataBr(p.dataPreco)}
                      {dias > DIAS_PRECO_ANTIGO && (
                        <>
                          {" · "}
                          <Selo tom="atencao">{dias} dias</Selo>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {i === 0 && precos.length > 1 && <Selo tom="atencao">Melhor preço</Selo>}
                    <span className="font-semibold text-texto tabular-nums">{formatarMoeda(p.preco)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="painel overflow-hidden">
        <h2 className="p-4 pb-2 font-titulo text-lg text-texto md:px-6">Histórico</h2>
        {historico.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-texto-2 md:px-6">Nenhum preço registrado.</p>
        ) : (
          <div className="overflow-x-auto border-t border-linha">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-linha text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium md:px-6">Data</th>
                  <th className="px-2 py-2 font-medium">Fornecedor</th>
                  <th className="px-2 py-2 text-right font-medium">Preço</th>
                  <th className="px-2 py-2 text-right font-medium">Mudança</th>
                  <th className="px-4 py-2 font-medium md:px-6">Origem</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={`${h.fornecedor}-${h.criadoEm}`} className="border-b border-linha last:border-b-0">
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums md:px-6">{dataBr(h.dataPreco)}</td>
                    <td className="px-2 py-2">{h.fornecedor}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {h.anterior != null && <span className="mr-1.5 text-xs text-texto-2 line-through">{formatarMoeda(h.anterior)}</span>}
                      {formatarMoeda(h.preco)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{h.anterior != null ? pct(variacao(h.anterior, h.preco)) : "primeiro preço"}</td>
                    <td className="px-4 py-2 text-texto-2 md:px-6">
                      {h.manual ? "Lançado à mão" : "Tabela"}
                      {h.lancadoPor && ` · ${h.lancadoPor}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {acesso.editar && (
        <>
          <CartaoRecolhivel titulo="Lançar preço à mão" resumo="Para fornecedor que não manda tabela">
            <FormularioPrecoManual materialId={material.id} fornecedores={fornecedores} hoje={hoje} />
          </CartaoRecolhivel>
          <CartaoRecolhivel titulo="Editar material" resumo={`${ROTULO_CATEGORIA_MATERIAL[material.categoria]} · ${material.unidade}`}>
            <FormularioMaterial material={material} />
          </CartaoRecolhivel>
        </>
      )}
    </div>
  );
}
