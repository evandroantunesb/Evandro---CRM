/**
 * Procuração pelo negócio (src/lib/procuracao.ts), sob a RLS de quem pede: sem modelo, não sai; com modelo, sai
 * preenchida com os dados do negócio e "—" no que falta, e a ficha lista os rótulos que faltam. Precisa do Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { carregarProcuracaoNegocio, montarProcuracaoNegocio } from "@/lib/procuracao";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let outroVendedor: Usuario;
let empresa: string;
let negocio: string;
const membro: Record<string, string> = {};
const agora = new Date("2026-11-17T12:00:00-03:00");

beforeAll(async () => {
  [admin, vendedor, outroVendedor] = await Promise.all(["procn-admin", "procn-vendedor", "procn-vendedor2"].map(criarUsuario));
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Procuração N ${sufixo}`, cnpj: "12.345.678/0001-90" }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: empresa, user_id: outroVendedor.id, papel: "vendedor" },
  ] as never);
  if (e) throw e;
  const { data: ms } = await servico.from("empresa_membros").select("id, user_id").eq("empresa_id", empresa);
  for (const m of ms ?? []) membro[m.user_id] = m.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: "Marcos Pereira" }).select("id").single();
  const { data: neg, error: e2 } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Sistema 8 kWp", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
    .select("id")
    .single();
  if (e2) throw e2;
  negocio = neg!.id;
});

describe("procuração pelo negócio", () => {
  it("sem modelo: sem_modelo, e a ficha diz que não há modelo", async () => {
    expect((await montarProcuracaoNegocio(vendedor.cliente as never, empresa, negocio, agora)).situacao).toBe("sem_modelo");
    expect(await carregarProcuracaoNegocio(vendedor.cliente as never, empresa, negocio, agora)).toEqual({ temModelo: false, faltando: [] });
  });

  it("com modelo e sem UC: sai com — no lugar da UC, e a ficha lista o que falta", async () => {
    const { error } = await admin.cliente.from("modelos_procuracao").upsert({
      empresa_id: empresa,
      conteudo: "OUTORGANTE: {{cliente_nome}}, UC {{negocio_uc}}.\nOUTORGADA: {{empresa_nome}}, CNPJ {{empresa_cnpj}}.",
    });
    expect(error).toBeNull();
    const r = await montarProcuracaoNegocio(vendedor.cliente as never, empresa, negocio, agora);
    expect(r).toEqual({
      situacao: "ok",
      titulo: "Marcos Pereira",
      arquivo: "procuracao-Sistema-8-kWp.pdf",
      conteudo: `OUTORGANTE: Marcos Pereira, UC —.\nOUTORGADA: Procuração N ${sufixo}, CNPJ 12.345.678/0001-90.`,
    });
    expect(await carregarProcuracaoNegocio(vendedor.cliente as never, empresa, negocio, agora)).toEqual({ temModelo: true, faltando: ["Unidade consumidora"] });
  });

  it("vendedor que lê o modelo mas não vê o negócio: nao_encontrado", async () => {
    expect((await montarProcuracaoNegocio(outroVendedor.cliente as never, empresa, negocio, agora)).situacao).toBe("nao_encontrado");
  });
});
