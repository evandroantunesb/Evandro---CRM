"use client";

import { useActionState } from "react";
import { Botao, Mensagem, Selo } from "@/components/ui";
import { salvarVistoriaTecnica } from "@/lib/acoes/vistoria-tecnica";
import { EnviarAnexo } from "./enviar-anexo";

type Foto = { id: string; nome: string; categoria: string; disponivel: boolean };
type Vistoria = {
  visita_realizada: boolean;
  medidor_inspecionado: boolean;
  telhado_inspecionado: boolean;
  observacoes: string;
  confirmada_em: string | null;
} | null;

export function VistoriaTecnica({ negocioId, empresaId, vistoria, fotos, podeEditar, obrigatoria }: {
  negocioId: string;
  empresaId: string;
  vistoria: Vistoria;
  fotos: Foto[];
  podeEditar: boolean;
  obrigatoria: boolean;
}) {
  const [resultado, acao, pendente] = useActionState(salvarVistoriaTecnica, null);
  const medidor = fotos.filter((foto) => foto.categoria === "vistoria_medidor");
  const telhado = fotos.filter((foto) => foto.categoria === "vistoria_telhado");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom={vistoria?.confirmada_em ? "positivo" : "atencao"}>
          {vistoria?.confirmada_em ? "Vistoria confirmada" : "Vistoria pendente"}
        </Selo>
        <p className="text-sm text-zinc-600">
          {obrigatoria ? "A vistoria precisa estar confirmada antes de marcar a venda solar como ganha." : "A empresa ainda não exige esta vistoria para marcar a venda como ganha."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ["Medidor", medidor],
          ["Telhado", telhado],
        ] as const).map(([titulo, arquivos]) => (
          <div key={titulo} className="rounded-lg border border-zinc-200 p-3">
            <h3 className="font-semibold text-carvao">Fotos do {titulo.toLowerCase()}</h3>
            {arquivos.length === 0 ? <p className="mt-1 text-sm text-zinc-600">Nenhuma foto anexada.</p> : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {arquivos.map((foto) => <li key={foto.id}>
                  {foto.disponivel ? <a href={`/anexos/${foto.id}`} target="_blank" rel="noreferrer" className="text-amber-700 underline">{foto.nome}</a> : <span className="text-red-700">{foto.nome} (arquivo indisponível)</span>}
                </li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      {podeEditar && <>
        <div>
          <p className="mb-2 text-sm text-zinc-700">Anexe pelo menos uma foto do medidor e uma do telhado. Selecione a categoria correspondente antes de enviar.</p>
          <EnviarAnexo empresaId={empresaId} negocioId={negocioId} categorias={["vistoria_medidor", "vistoria_telhado"]} categoriaInicial="vistoria_medidor" />
        </div>
        <form action={acao} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
          <input type="hidden" name="negocioId" value={negocioId} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visitaRealizada" defaultChecked={vistoria?.visita_realizada} /> Visita técnica realizada</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="medidorInspecionado" defaultChecked={vistoria?.medidor_inspecionado} /> Medidor inspecionado</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="telhadoInspecionado" defaultChecked={vistoria?.telhado_inspecionado} /> Telhado inspecionado</label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Observações técnicas
            <textarea name="observacoes" rows={4} maxLength={3000} defaultValue={vistoria?.observacoes ?? ""} className="rounded-lg border border-zinc-300 p-2 font-normal" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Botao name="confirmar" value="nao" type="submit" variante="secundario" disabled={pendente}>Salvar rascunho</Botao>
            <Botao name="confirmar" value="sim" type="submit" variante="primario" disabled={pendente}>Confirmar vistoria</Botao>
          </div>
          {resultado && <Mensagem resultado={resultado} />}
        </form>
      </>}
      {!podeEditar && !vistoria?.confirmada_em && <p className="text-sm text-zinc-600">O vendedor responsável deve confirmar esta vistoria.</p>}
    </div>
  );
}
