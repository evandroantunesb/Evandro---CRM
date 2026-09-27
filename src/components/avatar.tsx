export function iniciais(nome: string) {
  return nome
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Avatar circular com as iniciais de uma pessoa, usado onde ainda não há foto. */
export function Avatar({ nome, tamanho = 28 }: { nome: string; tamanho?: number }) {
  return (
    <span
      title={nome}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-dourado/15 font-semibold text-dourado"
    >
      {iniciais(nome) || "?"}
    </span>
  );
}
