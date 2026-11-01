import { Cartao, Selo } from "@/components/ui";
import { apagarAnexo } from "@/lib/acoes/anexos";
import { ROTULO_CATEGORIA_ANEXO, type CategoriaAnexo } from "@/lib/tipos";
import { EnviarAnexo } from "./enviar-anexo";
import { RegistrarArquivo } from "./registrar-arquivo";
import type { Ficha } from "./dados-ficha";

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Aba Arquivos: anexos do negócio, envios incompletos para registrar e o envio de novos arquivos. */
export function AbaArquivos({ ficha }: { ficha: Ficha }) {
  const { atual, negocio, anexos, semArquivo, conferencia, souAdmin, arquivado } = ficha;
  return (
    <div className="max-w-3xl">
      <Cartao titulo={`Arquivos (${anexos?.length ?? 0})`}>
        <ul className="mb-3 flex flex-col">
          {(anexos ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 border-t border-zinc-100 py-2 text-sm first:border-t-0"
            >
              {semArquivo.has(a.id) ? (
                <span className="min-w-0 flex-1 truncate text-zinc-500">
                  {a.nome} <Selo tom="negativo">não recebido</Selo>
                </span>
              ) : (
                <a
                  href={`/anexos/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-amber-700 hover:underline"
                >
                  {a.nome}
                </a>
              )}
              {a.categoria !== "geral" && <Selo tom="atencao">{ROTULO_CATEGORIA_ANEXO[a.categoria as CategoriaAnexo]}</Selo>}
              <span className="text-xs text-zinc-500">{tamanhoLegivel(a.tamanho)}</span>
              {(souAdmin || a.enviado_por === atual.membroId) && (
                <form action={apagarAnexo}>
                  <input type="hidden" name="anexoId" value={a.id} />
                  <button className="text-xs text-zinc-400 hover:text-red-700">Apagar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {conferencia.conferido && conferencia.semRegistro.length > 0 && (
          <div className="mb-3 flex flex-col gap-1 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
            <p className="text-xs">Arquivos que chegaram mas não foram registrados (o envio parou no meio):</p>
            <ul className="flex flex-col">
              {conferencia.semRegistro.map((o) => (
                <li key={o.caminho} className="flex items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                  <span className="text-xs text-zinc-500">{tamanhoLegivel(o.tamanho)}</span>
                  <RegistrarArquivo negocioId={negocio.id} arquivo={o} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {!arquivado && <EnviarAnexo empresaId={atual.empresaId} negocioId={negocio.id} />}
      </Cartao>
    </div>
  );
}
