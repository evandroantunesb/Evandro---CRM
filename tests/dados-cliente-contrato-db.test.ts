/**
 * Dados do cliente obrigatórios para o contrato (20261029190000_dados_cliente_contrato.sql): a trava no banco vale
 * para o usuário do app (JWT `authenticated`), cria e regera; mudança só de status passa; service_role não passa por
 * ela; a função interna não é executável pela API. A gravação da ficha (`salvarDadosClienteComCliente`) salva
 * parcial, valida CPF/CNPJ e monta o endereço em uma linha.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { salvarDadosClienteComCliente } from "@/lib/negocios-gravacao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let vendedor: Usuario;
let empresa: string;
let funil: string;
let etapa: string;
let membroVendedor: string;

beforeAll(async () => {
  vendedor = await criarUsuario("vendedor-dados-cliente");
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Dados do cliente ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  const { data: m, error: e2 } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" })
    .select("id")
    .single();
  if (e2) throw e2;
  membroVendedor = m!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
});

async function negocioCom(contato: Record<string, unknown>) {
  const { data: c, error: e1 } = await servico
    .from("contatos")
    .insert({ empresa_id: empresa, nome: `Cliente ${Math.random().toString(36).slice(2, 7)}`, ...contato })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: n, error: e2 } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Negócio dados do cliente", contato_id: c!.id, funil_id: funil, etapa_id: etapa, responsavel_id: membroVendedor, valor: 20000 })
    .select("id")
    .single();
  if (e2) throw e2;
  return { negocioId: n!.id as string, contatoId: c!.id as string };
}

const inserirComoVendedor = (negocioId: string) =>
  vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato" }).select("id, status").single();

describe("trava no banco: contrato só com os dados do cliente", () => {
  it("usuário do app não cria contrato com dado faltando; a mensagem lista o que falta", async () => {
    const { negocioId } = await negocioCom({ telefone: "(45) 90000-0000", documento: "529.982.247-25" });
    const { data, error } = await inserirComoVendedor(negocioId);
    expect(data).toBeNull();
    expect(error?.message).toBe(
      "Para gerar o contrato, preencha os dados do cliente: RG, data de nascimento, e-mail, CEP, rua, número, bairro, cidade.",
    );
  });

  it("com os dados completos (pessoa física), cria", async () => {
    const { negocioId } = await negocioCom(CLIENTE_CONTRATO);
    const { error } = await inserirComoVendedor(negocioId);
    expect(error).toBeNull();
  });

  it("pessoa jurídica não precisa de RG nem nascimento", async () => {
    const { negocioId } = await negocioCom({ ...CLIENTE_CONTRATO, tipo: "pj", documento: "11.222.333/0001-81", rg: null, data_nascimento: null });
    const { error } = await inserirComoVendedor(negocioId);
    expect(error).toBeNull();
  });

  it("contrato já gerado: mudar só o status passa mesmo com o cliente incompleto; regerar o texto não", async () => {
    const { negocioId, contatoId } = await negocioCom(CLIENTE_CONTRATO);
    const { data: contrato, error } = await inserirComoVendedor(negocioId);
    expect(error).toBeNull();
    await servico.from("contatos").update({ rg: null }).eq("id", contatoId);
    const status = await vendedor.cliente.from("contratos").update({ status: "aguardando_assinatura" }).eq("id", contrato!.id).select("id");
    expect(status.error).toBeNull();
    expect(status.data).toHaveLength(1);
    const regerar = await vendedor.cliente.from("contratos").update({ conteudo: "Outro texto" }).eq("id", contrato!.id).select("id");
    expect(regerar.error?.message).toBe("Para gerar o contrato, preencha os dados do cliente: RG.");
  });

  it("service_role (rotinas de servidor) não passa pela trava", async () => {
    const { negocioId } = await negocioCom({ telefone: "(45) 90000-0000" });
    const { error } = await servico.from("contratos").insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato" });
    expect(error).toBeNull();
  });

  it("a função de pendências não é executável pela API", async () => {
    const { contatoId } = await negocioCom({ telefone: "(45) 90000-0000" });
    const { data, error } = await vendedor.cliente.rpc("pendencias_contrato_contato" as never, { p_contato_id: contatoId } as never);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("gravação dos dados do cliente na ficha", () => {
  const salvar = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return salvarDadosClienteComCliente(vendedor.cliente as unknown as SupabaseServidor, fd);
  };
  const base = {
    tipo: "pf",
    nome: "Maria da Silva",
    documento: "52998224725",
    rg: "12.345.678-9",
    data_nascimento: "1980-05-10",
    email: "maria@exemplo.test",
    telefone: "(45) 90000-0000",
    cep: "85810-000",
    logradouro: "Rua das Flores",
    numero: "100",
    bairro: "Centro",
    complemento: "",
    cidade: "Cascavel",
    uf: "pr",
    inscricao_estadual: "",
  };

  it("salva, formata o CPF, guarda o CEP só com dígitos e monta o endereço em uma linha", async () => {
    const { contatoId } = await negocioCom({ telefone: "(45) 90000-0000" });
    expect(await salvar({ ...base, contatoId })).toEqual({ ok: true, mensagem: "Dados do cliente salvos." });
    const { data } = await servico.from("contatos").select("*").eq("id", contatoId).single();
    expect(data).toMatchObject({
      documento: "529.982.247-25",
      cep: "85810000",
      uf: "PR",
      endereco: "Rua das Flores, 100, Centro, CEP 85810-000",
      rg: "12.345.678-9",
      data_nascimento: "1980-05-10",
    });
  });

  it("recusa CPF inválido e data de nascimento no futuro", async () => {
    const { contatoId } = await negocioCom({ telefone: "(45) 90000-0000" });
    expect(await salvar({ ...base, contatoId, documento: "111.111.111-11" })).toEqual({ ok: false, mensagem: "CPF inválido" });
    expect(await salvar({ ...base, contatoId, data_nascimento: "2999-01-01" })).toEqual({
      ok: false,
      mensagem: "Data de nascimento fora do intervalo",
    });
  });

  it("pessoa jurídica: guarda a inscrição estadual e limpa RG e nascimento", async () => {
    const { contatoId } = await negocioCom(CLIENTE_CONTRATO);
    const r = await salvar({ ...base, contatoId, tipo: "pj", documento: "11222333000181", inscricao_estadual: "123.456.789" });
    expect(r.ok).toBe(true);
    const { data } = await servico.from("contatos").select("tipo, documento, rg, data_nascimento, inscricao_estadual").eq("id", contatoId).single();
    expect(data).toEqual({ tipo: "pj", documento: "11.222.333/0001-81", rg: null, data_nascimento: null, inscricao_estadual: "123.456.789" });
  });

  it("salva parcial: o que faltar só trava o contrato", async () => {
    const { contatoId } = await negocioCom({ telefone: "(45) 90000-0000" });
    const r = await salvar({ contatoId, tipo: "pf", nome: "João", telefone: "(45) 91111-0000", email: "" });
    expect(r.ok).toBe(true);
  });
});
