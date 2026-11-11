import type { ChavePasso } from "@/lib/assistente";

export type PropsPasso = {
  chave: ChavePasso;
  empresaId: string;
  rever: boolean;
  passos: ChavePasso[];
  estados: Record<ChavePasso, "feito" | "pulado" | "pendente">;
  /** Grava a posição e leva ao próximo passo (depois de o passo salvar o que é dele). */
  continuar: () => Promise<void>;
  /** "Começar a usar o Raion" (último passo). */
  concluir: () => Promise<void>;
};

/** Conteúdo de cada passo; cada um grava pelas ações de Configurações e então chama `continuar`. */
export async function ConteudoDoPasso(props: PropsPasso) {
  const ultimo = props.chave === "revisar";
  return (
    <form action={ultimo ? props.concluir : props.continuar} className="flex justify-end">
      <button type="submit" className="inline-flex min-h-[46px] items-center rounded-full bg-[#d4af37] px-6 text-sm font-semibold text-[#0f0f10]">
        {ultimo ? "Começar a usar o Raion" : "Continuar"}
      </button>
    </form>
  );
}
