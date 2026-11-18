/**
 * Link público e PDF do contrato contra o PostgREST real: `contratos` tem duas chaves para `negocios` (a simples e a
 * composta da migration 20261015100000), então o embed sem nome da relação é ambíguo (PGRST201) e a página caía em
 * 404 para todo contrato. As seleções usadas pela página e pelo PDF precisam funcionar de verdade.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { SELECAO_CONTRATO_PDF, SELECAO_CONTRATO_PUBLICO } from "@/lib/contrato-publico";
import { CLIENTE_CONTRATO, servico, sufixo } from "./ajuda";

let token: string;

beforeAll(async () => {
  const { data: emp } = await servico.from("empresas").insert({ nome: `Contrato público ${sufixo}` }).select("id").single();
  const empresa = emp!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: "Cliente público", documento: "123.456.789-09" }).select("id").single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Sistema 5 kWp", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, valor: 25000 })
    .select("id")
    .single();
  if (error) throw error;
  const { data: ct, error: e2 } = await servico.from("contratos").insert({ empresa_id: empresa, negocio_id: n!.id, conteudo: "## CONTRATO" }).select("token").single();
  if (e2) throw e2;
  token = ct!.token;
});

describe("seleções do contrato público", () => {
  it("página do link: lê texto, status e título do negócio", async () => {
    const { data, error } = await servico.from("contratos").select(SELECAO_CONTRATO_PUBLICO).eq("token", token).maybeSingle();
    expect(error).toBeNull();
    expect(data).toMatchObject({ conteudo: "## CONTRATO", status: "rascunho", negocios: { titulo: "Sistema 5 kWp" } });
  });

  it("PDF: lê texto, empresa e título do negócio", async () => {
    const { data, error } = await servico.from("contratos").select(SELECAO_CONTRATO_PDF).eq("token", token).maybeSingle();
    expect(error).toBeNull();
    expect(data).toMatchObject({ conteudo: "## CONTRATO", negocios: { titulo: "Sistema 5 kWp" } });
  });
});
