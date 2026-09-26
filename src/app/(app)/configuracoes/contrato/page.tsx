import { Cartao } from "@/components/ui";
import { PLACEHOLDERS_CONTRATO } from "@/lib/contrato";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioModeloContrato } from "./formularios";

export default async function ConfigContrato() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: modelo } = await supabase
    .from("modelos_contrato")
    .select("conteudo")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Modelo de contrato</h1>
      <p className="text-sm text-zinc-600">
        Escreva o texto do contrato que a empresa usa. Ao gerar o contrato de um negócio, os campos entre chaves duplas
        são preenchidos automaticamente.
      </p>
      <Cartao titulo="Campos disponíveis">
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS_CONTRATO.map((p) => (
            <code key={p.chave} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700" title={p.rotulo}>
              {`{{${p.chave}}}`}
            </code>
          ))}
        </div>
      </Cartao>
      <Cartao titulo="Texto do modelo">
        <FormularioModeloContrato conteudoInicial={modelo?.conteudo ?? ""} />
      </Cartao>
    </div>
  );
}
