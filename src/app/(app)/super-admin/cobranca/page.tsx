import Link from "next/link";
import { Cartao, Selo } from "@/components/ui";
import { carregarRelatorioCobranca, referenciaMesAtual, rotuloMesReferencia } from "@/lib/cobranca";
import { exigirSuperAdmin } from "@/lib/sessao";
import { ROTULO_MODELO_COBRANCA, ROTULO_TIPO_PLANO } from "@/lib/tipos";
import { BotaoFecharMes, BotaoMarcarPago } from "./botoes";

function mesAdjacente(referencia: string, delta: number) {
  const [ano, mes] = referencia.split("-").map(Number);
  const data = new Date(ano, mes - 1 + delta, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function Cobranca({ searchParams }: PageProps<"/super-admin/cobranca">) {
  await exigirSuperAdmin();
  const { mes } = await searchParams;
  const referencia = typeof mes === "string" && /^\d{4}-\d{2}-01$/.test(mes) ? mes : referenciaMesAtual();
  const linhas = await carregarRelatorioCobranca(referencia);
  const totalMes = linhas.reduce((s, l) => s + l.valorTotal, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Cobrança</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/super-admin/cobranca?mes=${mesAdjacente(referencia, -1)}`} className="text-zinc-600 hover:underline">
            ← Mês anterior
          </Link>
          <span className="font-medium capitalize">{rotuloMesReferencia(referencia)}</span>
          <Link href={`/super-admin/cobranca?mes=${mesAdjacente(referencia, 1)}`} className="text-zinc-600 hover:underline">
            Próximo mês →
          </Link>
        </div>
      </div>
      <Cartao titulo={`Total do mês: R$ ${totalMes.toFixed(2)}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Empresa</th>
                <th className="py-2 pr-4 font-medium">Admin responsável</th>
                <th className="py-2 pr-4 font-medium">Plano</th>
                <th className="py-2 pr-4 font-medium">Usuários ativos</th>
                <th className="py-2 pr-4 font-medium">Valor fechado</th>
                <th className="py-2 pr-4 font-medium">Valor por acesso</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium">Pago</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.empresaId} className="border-t border-zinc-100 align-top">
                  <td className="py-2 pr-4 font-medium">{l.empresaNome}</td>
                  <td className="py-2 pr-4 text-zinc-600">{l.adminResponsavel ?? "—"}</td>
                  <td className="py-2 pr-4 text-zinc-600">
                    {l.plano && l.plano.tipo === "pago"
                      ? l.plano.modelo_cobranca
                        ? ROTULO_MODELO_COBRANCA[l.plano.modelo_cobranca]
                        : ROTULO_TIPO_PLANO.pago
                      : ROTULO_TIPO_PLANO.gratuito}
                  </td>
                  <td className="py-2 pr-4">{l.usuariosAtivos}</td>
                  <td className="py-2 pr-4">R$ {l.valorFixo.toFixed(2)}</td>
                  <td className="py-2 pr-4">R$ {l.valorPorUsuario.toFixed(2)}</td>
                  <td className="py-2 pr-4 font-medium">R$ {l.valorTotal.toFixed(2)}</td>
                  <td className="py-2 pr-4">
                    {l.fechamentoId ? (
                      <Selo tom={l.pago ? "positivo" : "atencao"}>{l.pago ? "Pago" : "Em aberto"}</Selo>
                    ) : (
                      <Selo>Não fechado</Selo>
                    )}
                  </td>
                  <td className="py-2">
                    {!l.fechamentoId && <BotaoFecharMes empresaId={l.empresaId} referencia={referencia} />}
                    {l.fechamentoId && !l.pago && <BotaoMarcarPago fechamentoId={l.fechamentoId} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
