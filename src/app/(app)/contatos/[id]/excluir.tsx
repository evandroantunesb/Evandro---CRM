"use client";

import { Trash2 } from "lucide-react";
import { excluirContato } from "@/lib/acoes/contatos";

export function ExcluirContato({ contatoId }: { contatoId: string }) {
  return (
    <form
      action={excluirContato}
      onSubmit={(e) => {
        if (!confirm("Excluir este contato? Isso não pode ser desfeito.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="contatoId" value={contatoId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        <Trash2 size={15} /> Excluir contato
      </button>
    </form>
  );
}
