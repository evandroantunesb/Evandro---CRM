"use client";

import { useActionState, useState } from "react";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { arquivarNegocio, desarquivarNegocio } from "@/lib/acoes/negocios";

type Opcao = { id: string; nome: string };

/**
 * Arquivamento do negócio (P1a-0). Arquivado: aviso com data, autor e motivo, e o desarquivamento para admin/gestor
 * (pede o novo responsável quando o atual não está mais ativo). Não arquivado: botão de arquivar para admin/gestor.
 * As regras (papel, motivo, pendências, somente leitura) ficam no banco; aqui só se mostra o resultado.
 */
export function Arquivamento({
  negocioId,
  arquivamento,
  podeArquivar,
  responsavelInativo,
  responsaveis,
}: {
  negocioId: string;
  arquivamento: { quando: string; autor: string | null; motivo: string } | null;
  podeArquivar: boolean;
  responsavelInativo: boolean;
  responsaveis: Opcao[];
}) {
  const [resultadoArquivar, arquivar, arquivando] = useActionState(arquivarNegocio, null);
  const [resultadoDesarquivar, desarquivar, desarquivando] = useActionState(desarquivarNegocio, null);
  // Sem o reset automático: uma recusa (ex.: tarefa aberta) não apaga o motivo nem o novo responsável escolhidos.
  const enviarArquivar = useEnvioSemReset(arquivar);
  const enviarDesarquivar = useEnvioSemReset(desarquivar);
  // Estados separados: depois de arquivar, a ficha volta já no aviso, com o desarquivamento fechado (e vice-versa).
  const [abrirArquivar, setAbrirArquivar] = useState(false);
  const [abrirDesarquivar, setAbrirDesarquivar] = useState(false);

  if (arquivamento) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p>
          <span className="font-medium">Negócio arquivado</span> em {arquivamento.quando}
          {arquivamento.autor && <> por {arquivamento.autor}</>}. Motivo: {arquivamento.motivo}
        </p>
        <p className="text-xs">
          Fica somente leitura: só notas e etiquetas podem mudar. Não aparece nas listas, no funil nem no painel.
        </p>
        {podeArquivar &&
          (abrirDesarquivar ? (
            <form onSubmit={enviarDesarquivar} className="flex flex-col gap-2">
              <input type="hidden" name="negocioId" value={negocioId} />
              <textarea
                name="motivo"
                required
                rows={2}
                placeholder="Motivo do desarquivamento (obrigatório)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
              {responsavelInativo && (
                <Selecao rotulo="Novo responsável (o atual não está mais ativo)" name="novoResponsavelId" required defaultValue="">
                  <option value="" disabled>
                    Escolha o novo responsável
                  </option>
                  {responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </Selecao>
              )}
              <div className="flex flex-wrap gap-2">
                <Botao type="button" variante="secundario" onClick={() => setAbrirDesarquivar(false)}>
                  Voltar
                </Botao>
                <Botao type="submit" disabled={desarquivando}>
                  Confirmar desarquivamento
                </Botao>
              </div>
              <Mensagem resultado={resultadoDesarquivar} />
            </form>
          ) : (
            <Botao type="button" variante="secundario" onClick={() => setAbrirDesarquivar(true)} className="w-fit">
              Desarquivar
            </Botao>
          ))}
      </div>
    );
  }

  if (!podeArquivar) return null;
  if (!abrirArquivar) {
    return (
      <div className="flex flex-col gap-1">
        <Botao type="button" variante="secundario" onClick={() => setAbrirArquivar(true)} className="w-fit">
          Arquivar negócio
        </Botao>
        <Mensagem resultado={resultadoArquivar} />
      </div>
    );
  }
  return (
    <form onSubmit={enviarArquivar} className="flex flex-col gap-2 rounded-md border border-zinc-200 px-3 py-2">
      <input type="hidden" name="negocioId" value={negocioId} />
      <p className="text-sm text-zinc-700">
        O negócio sai das listas, do funil e do painel e fica somente leitura (notas e etiquetas continuam). Nada é
        apagado e é possível desarquivar depois.
      </p>
      <textarea
        name="motivo"
        required
        rows={2}
        placeholder="Motivo do arquivamento (obrigatório)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Botao type="button" variante="secundario" onClick={() => setAbrirArquivar(false)}>
          Voltar
        </Botao>
        <Botao type="submit" disabled={arquivando}>
          Confirmar arquivamento
        </Botao>
      </div>
      <Mensagem resultado={resultadoArquivar} />
    </form>
  );
}
