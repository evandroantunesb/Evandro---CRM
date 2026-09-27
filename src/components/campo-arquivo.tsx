"use client";

import { Paperclip } from "lucide-react";
import { useId, useState } from "react";

/** Input de arquivo com área clicável visível (label + ícone), em vez do <input type="file"> nativo. */
export function CampoArquivo({
  rotulo,
  name,
  accept,
  multiple,
}: {
  rotulo: string;
  name: string;
  accept?: string;
  multiple?: boolean;
}) {
  const id = useId();
  const [nomes, setNomes] = useState<string[]>([]);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{rotulo}</span>
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-400 px-3 py-2 text-zinc-700 hover:border-dourado hover:bg-zinc-50"
      >
        <Paperclip className="h-4 w-4 shrink-0" />
        <span className="truncate">{nomes.length ? nomes.join(", ") : "Toque para escolher o arquivo"}</span>
      </label>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => setNomes(Array.from(e.target.files ?? []).map((f) => f.name))}
      />
    </div>
  );
}
