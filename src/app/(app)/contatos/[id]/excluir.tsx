"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { CLASSE_VIDRO_CABECALHO } from "@/components/cabecalho-pagina";
import { CLASSE_ITEM_MENU, MenuSuspenso } from "@/components/menu-suspenso";
import { excluirContato } from "@/lib/acoes/contatos";

/** "Opções" da faixa da ficha do contato (admin e gestor): por enquanto, só excluir. */
export function OpcoesContato({ contatoId }: { contatoId: string }) {
  return (
    <MenuSuspenso
      trigger={({ alternar }) => (
        <button type="button" aria-haspopup="menu" onClick={alternar} className={CLASSE_VIDRO_CABECALHO}>
          Opções
          <ChevronDown size={16} aria-hidden />
        </button>
      )}
    >
      <form
        action={excluirContato}
        onSubmit={(e) => {
          if (!confirm("Excluir este contato? Isso não pode ser desfeito.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="contatoId" value={contatoId} />
        <button type="submit" role="menuitem" className={`${CLASSE_ITEM_MENU} gap-2 text-erro`}>
          <Trash2 size={15} aria-hidden /> Excluir contato
        </button>
      </form>
    </MenuSuspenso>
  );
}
