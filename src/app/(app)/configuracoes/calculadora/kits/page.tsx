import { Cartao } from "@/components/ui";
import { carregarConfiguracao } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { LinhaKit, NovoKit } from "../formularios";

/**
 * Kits comerciais prontos (`kits_solares`): pacote fechado com potência e preço que o vendedor
 * escolhe direto. Não confundir com o Catálogo (módulos e inversores avulsos que o motor
 * combina sozinho a partir do consumo).
 */
export default async function KitsCalculadora() {
  const { atual } = await exigirPapel("admin");
  const { kits } = await carregarConfiguracao(atual.empresaId);

  return (
    <Cartao titulo={`Kits comerciais (${kits.length})`}>
      <p className="mb-3 text-sm text-zinc-600">
        Pacotes prontos, com potência e preço fechados. O vendedor escolhe um deles na calculadora do negócio. Para os
        módulos e inversores que o sistema combina sozinho a partir do consumo, use a aba Catálogo.
      </p>
      {kits.length === 0 && <p className="text-sm text-zinc-400">Nenhum kit cadastrado ainda.</p>}
      {kits.map((k) => (
        <LinhaKit key={k.id} item={k} />
      ))}
      <div className="mt-3">
        <NovoKit />
      </div>
    </Cartao>
  );
}
