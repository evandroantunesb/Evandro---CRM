import {
  CATEGORIA_DO_DOCUMENTO,
  DICA_DOCUMENTO_CLIENTE,
  ROTULO_DOCUMENTO_CLIENTE,
  documentosExigidos,
} from "@/lib/documentos-cliente";
import { EnviarAnexo } from "./enviar-anexo";

type AnexoDoc = { id: string; nome: string; categoria: string; created_at: string };

/**
 * Documentos do cliente na ficha (prévia aprovada "Negócio: documentos para o contrato"): documento com foto,
 * comprovante de residência e, para cliente empresa, cartão CNPJ. Pedidos para gerar o contrato e usados por Compras
 * para faturar o kit no nome do cliente. O arquivo fica nos anexos do negócio, na categoria do documento.
 */
export function DocumentosCliente({
  empresaId,
  negocioId,
  tipoCliente,
  anexos,
  podeAnexar,
}: {
  empresaId: string;
  negocioId: string;
  tipoCliente: string | null | undefined;
  anexos: readonly AnexoDoc[];
  podeAnexar: boolean;
}) {
  const exigidos = documentosExigidos(tipoCliente);
  // Mais recente de cada categoria (a lista vem mais nova primeiro).
  const doCategoria = (c: string) => anexos.find((a) => a.categoria === c) ?? null;
  const faltam = exigidos.filter((d) => !doCategoria(CATEGORIA_DO_DOCUMENTO[d])).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-2">Pedidos para gerar o contrato e usados por Compras para faturar o kit no nome do cliente.</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${faltam ? "bg-dourado/20 text-dourado-texto" : "bg-zinc-100 text-zinc-700"}`}>
          {faltam ? `Falta ${faltam}` : "Completo"}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-linha">
        {exigidos.map((d) => {
          const anexo = doCategoria(CATEGORIA_DO_DOCUMENTO[d]);
          return (
            <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-texto">{ROTULO_DOCUMENTO_CLIENTE[d]}</p>
                <p className="text-xs text-texto-2">{DICA_DOCUMENTO_CLIENTE[d]}</p>
              </div>
              {anexo ? (
                <>
                  <a href={`/anexos/${anexo.id}`} className="min-w-0 text-xs font-medium break-all text-dourado-texto underline-offset-2 hover:underline">
                    {anexo.nome}
                  </a>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">Anexado</span>
                </>
              ) : (
                <span className="rounded-full bg-dourado/20 px-2.5 py-0.5 text-xs font-medium text-dourado-texto">Falta</span>
              )}
              {podeAnexar && (
                <div className="w-full sm:w-auto">
                  <EnviarAnexo empresaId={empresaId} negocioId={negocioId} categoriaFixa={CATEGORIA_DO_DOCUMENTO[d]} rotulo={anexo ? "Trocar" : "Anexar"} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
