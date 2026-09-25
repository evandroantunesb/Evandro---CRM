"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Selecao } from "@/components/ui";
import { registrarAnexo } from "@/lib/acoes/anexos";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { CATEGORIAS_ANEXO, ROTULO_CATEGORIA_ANEXO, type CategoriaAnexo } from "@/lib/tipos";

const LIMITE = 20 * 1024 * 1024;

/** Nome seguro para o caminho no Storage (o nome original fica no registro). */
function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
  return `${crypto.randomUUID()}-${limpo || "arquivo"}`;
}

export function EnviarAnexo({ empresaId, negocioId }: { empresaId: string; negocioId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<CategoriaAnexo>("geral");

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro(null);
    setEnviando(true);
    const supabase = criarClienteNavegador();
    for (const arquivo of Array.from(arquivos)) {
      if (arquivo.size > LIMITE) {
        setErro(`"${arquivo.name}" passa de 20 MB.`);
        continue;
      }
      const caminho = `${empresaId}/${negocioId}/${nomeSeguro(arquivo.name)}`;
      const { error } = await supabase.storage.from("anexos").upload(caminho, arquivo, { contentType: arquivo.type || undefined });
      if (error) {
        setErro(`Não foi possível enviar "${arquivo.name}".`);
        continue;
      }
      const r = await registrarAnexo({
        negocioId,
        caminho,
        nome: arquivo.name,
        tamanho: arquivo.size,
        tipoMime: arquivo.type,
        categoria,
      });
      if (!r?.ok) setErro(r?.mensagem ?? "Não foi possível registrar o arquivo.");
    }
    setEnviando(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Selecao
        rotulo="Categoria do arquivo"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value as CategoriaAnexo)}
      >
        {CATEGORIAS_ANEXO.map((c) => (
          <option key={c} value={c}>
            {ROTULO_CATEGORIA_ANEXO[c]}
          </option>
        ))}
      </Selecao>
      <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-400 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
        {enviando ? "Enviando..." : "Anexar arquivo (foto, conta de luz, PDF)"}
        <input
          ref={input}
          type="file"
          multiple
          disabled={enviando}
          className="hidden"
          onChange={(e) => enviar(e.target.files)}
        />
      </label>
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
    </div>
  );
}
