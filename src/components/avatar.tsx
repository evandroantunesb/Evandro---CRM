import { FotoAvatar } from "@/components/foto-avatar";

export function iniciais(nome: string) {
  return nome
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Avatar circular de uma pessoa: a foto (`src`, URL assinada) quando houver; senão — ou se a
 * imagem falhar ao carregar — as iniciais. Sem `src`, o resultado é o mesmo de sempre.
 */
export function Avatar({ nome, tamanho = 28, src }: { nome: string; tamanho?: number; src?: string | null }) {
  const comIniciais = (
    <span
      title={nome}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-dourado/15 font-semibold text-dourado"
    >
      {iniciais(nome) || "?"}
    </span>
  );
  if (!src) return comIniciais;
  return <FotoAvatar src={src} alt={nome} tamanho={tamanho} fallback={comIniciais} />;
}
