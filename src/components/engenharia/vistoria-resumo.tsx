import { Selo } from "@/components/ui";
import { ROTULO_STATUS_VISTORIA, type SituacaoVistoria } from "@/lib/engenharia-vistoria-regras";

const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Situação da vistoria da distribuidora para quem vê a obra (Operacional, comercial): só situação e datas. */
export function ResumoVistoria({ situacao }: { situacao: SituacaoVistoria }) {
  const datas: [string, string | null][] = [
    ["Pedida em", situacao.solicitadaEm],
    ["Agendada para", situacao.agendadaPara],
    ["Realizada em", situacao.realizadaEm],
    ["Medidor adequado em", situacao.medidorAdequadoEm],
    ["Conexão confirmada em", situacao.conexaoConfirmadaEm],
  ];
  return (
    <div role="group" aria-label="Vistoria da distribuidora" className="flex w-full flex-col gap-1 border-t border-zinc-100 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-zinc-500">Vistoria da distribuidora</p>
        <Selo tom={situacao.status === "com_nao_conformidade" ? "atencao" : "neutro"}>{ROTULO_STATUS_VISTORIA[situacao.status]}</Selo>
      </div>
      <p className="text-xs text-zinc-700">
        {datas
          .filter(([, d]) => d)
          .map(([r, d]) => `${r} ${dataBr(d!)}`)
          .join(" · ")}
      </p>
    </div>
  );
}
