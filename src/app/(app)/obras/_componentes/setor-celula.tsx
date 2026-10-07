import { Avatar } from "@/components/avatar";
import { Selo } from "@/components/ui";
import { ROTULO_ESTADO_SETOR, estadoSetor, type EstadoSetor } from "@/lib/obras/derivados";
import type { SetorResumoVM } from "@/lib/obras/dados";
import { ROTULO_AGUARDANDO, rotuloStatus, type SetorOperacional } from "@/lib/obras/rotulos";

export const TOM_ESTADO_SETOR: Record<EstadoSetor, "neutro" | "positivo" | "atencao"> = {
  concluido: "positivo",
  parado: "atencao",
  aguardando: "atencao",
  nao_iniciado: "neutro",
  em_andamento: "neutro",
};

/** Status do setor + estado factual + responsável principal (se houver). Somente leitura. */
export function SetorCelula({
  setor,
  dados,
  urlsAvatar,
}: {
  setor: SetorOperacional;
  dados: SetorResumoVM;
  urlsAvatar: Record<string, string>;
}) {
  const estado = estadoSetor(setor, dados);
  const nome = dados.principal ? (dados.principal.nome ?? "Ex-colaborador") : null;
  const foto = dados.principal?.avatarCaminho
    ? (urlsAvatar[dados.principal.avatarCaminho] ?? null)
    : null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-zinc-800">{rotuloStatus(setor, dados.status)}</span>
      <div className="flex flex-wrap items-center gap-1">
        <Selo tom={TOM_ESTADO_SETOR[estado]}>{ROTULO_ESTADO_SETOR[estado]}</Selo>
        {dados.aguardando && (
          <span className="text-xs text-zinc-500">
            de {ROTULO_AGUARDANDO[dados.aguardando] ?? dados.aguardando}
          </span>
        )}
      </div>
      {dados.parado && dados.paradoMotivo && (
        <span className="text-xs text-zinc-500">{dados.paradoMotivo}</span>
      )}
      {nome && (
        <span className="flex items-center gap-1.5 text-xs text-zinc-600">
          <Avatar nome={nome} tamanho={18} src={foto} />
          {nome}
        </span>
      )}
    </div>
  );
}
