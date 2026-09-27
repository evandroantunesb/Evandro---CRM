import { Cartao } from "@/components/ui";
import { carregarConfiguracao, formatarMoeda } from "@/lib/crm";
import { carregarIndicadores } from "@/lib/painel";
import { exigirPapel } from "@/lib/sessao";

export default async function Painel() {
  const { atual } = await exigirPapel("admin", "gestor");
  const config = await carregarConfiguracao(atual.empresaId);
  const indicadores = await carregarIndicadores(atual.empresaId, config);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Painel</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Estatistica rotulo="Negócios ganhos" valor={indicadores.ganhos.total} destaque="positivo" />
        <Estatistica rotulo="Valor ganho" valor={formatarMoeda(indicadores.ganhos.valor)} destaque="positivo" />
        <Estatistica rotulo="Negócios perdidos" valor={indicadores.perdidos.total} destaque="negativo" />
        <Estatistica rotulo="Tarefas atrasadas" valor={indicadores.tarefasAtrasadas} destaque={indicadores.tarefasAtrasadas ? "negativo" : "neutro"} />
      </div>

      <Cartao titulo="Leads por origem">
        {indicadores.porOrigem.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum negócio cadastrado ainda.</p>
        ) : (
          <Tabela
            cabecalho={["Origem", "Negócios"]}
            linhas={indicadores.porOrigem.map((o) => [o.nome, String(o.total)])}
          />
        )}
      </Cartao>

      <Cartao titulo="Negócios em aberto por etapa">
        {indicadores.porEtapa.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum negócio em aberto.</p>
        ) : (
          <Tabela
            cabecalho={["Funil", "Etapa", "Negócios", "Valor"]}
            linhas={indicadores.porEtapa.map((e) => [e.funil, e.etapa, String(e.total), formatarMoeda(e.valor)])}
          />
        )}
      </Cartao>

      <Cartao titulo="Desempenho por vendedor">
        {indicadores.porVendedor.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum negócio com responsável definido ainda.</p>
        ) : (
          <Tabela
            cabecalho={["Vendedor", "Em aberto", "Ganhos", "Perdidos", "Valor ganho", "Tarefas atrasadas"]}
            linhas={indicadores.porVendedor.map((v) => [
              v.nome,
              String(v.abertos),
              String(v.ganhos),
              String(v.perdidos),
              formatarMoeda(v.valorGanho),
              String(v.atrasadas),
            ])}
          />
        )}
      </Cartao>
    </div>
  );
}

function Estatistica({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque: "positivo" | "negativo" | "neutro" }) {
  const cor = { positivo: "text-green-700", negativo: "text-red-700", neutro: "text-zinc-900" }[destaque];
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
      <p className={`text-2xl font-semibold ${cor}`}>{valor}</p>
      <p className="text-sm text-zinc-600">{rotulo}</p>
    </div>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-zinc-500">
            {cabecalho.map((c) => (
              <th key={c} className="py-1.5 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-t border-zinc-100">
              {linha.map((valor, j) => (
                <td key={j} className="py-1.5 pr-4 text-zinc-800">
                  {valor}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
