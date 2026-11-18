/**
 * Texto do contrato só pelo servidor (etapas 1 e 2, 18/11/2026) com Supabase local e RLS real: o servidor guarda o texto
 * montado em `contratos_geracoes` (service role) e `gerar_contrato_com_condicao(negócio, geração)` consome a linha na
 * sessão de quem pediu. O usuário não lê nem escreve na tabela; a linha vale uma vez, só para quem pediu, só para o
 * negócio dela e por até 10 minutos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { gerarContratoComCliente } from "@/lib/contratos-geracao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { CLIENTE_CONTRATO, anexarDocumentosContrato, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapa: string;

const MODELO = "## CONTRATO\n**CONTRATANTE:** {{cliente_nome}}\nValor: {{negocio_valor}}.";

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["gs-admin", "gs-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Geração servidor ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: v, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  if (error) throw error;
  for (const l of v!) membro[l.user_id] = l.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { error: erroModelo } = await admin.cliente.from("modelos_contrato").upsert({ empresa_id: empresa, conteudo: MODELO });
  if (erroModelo) throw erroModelo;
});

/** Negócio do vendedor, pronto para gerar contrato. */
async function negocio(titulo: string) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}`, documento: "123.456.789-09" })
    .select("id")
    .single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapa, responsavel_id: membro[vendedor.id], valor: 25000 })
    .select("id")
    .single();
  if (error) throw error;
  await anexarDocumentosContrato(n!.id);
  return n!.id;
}

/** Linha montada "pelo servidor" (service role), como o app faz. */
async function geracao(negocioId: string, membroId: string, conteudo: string, extra: { created_at?: string } = {}) {
  const { data, error } = await servico
    .from("contratos_geracoes")
    .insert({ empresa_id: empresa, negocio_id: negocioId, membro_id: membroId, conteudo, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

const gerar = (u: Usuario, negocioId: string, geracaoId: string) =>
  u.cliente.rpc("gerar_contrato_com_condicao" as never, { p_negocio_id: negocioId, p_geracao_id: geracaoId } as never);

const textoDoContrato = async (negocioId: string) =>
  (await servico.from("contratos").select("conteudo").eq("negocio_id", negocioId).maybeSingle()).data?.conteudo ?? null;

const linhaExiste = async (id: string) => !!(await servico.from("contratos_geracoes").select("id").eq("id", id).maybeSingle()).data;

describe("geração pelo servidor", () => {
  it("o app gera o contrato e não deixa sobra em contratos_geracoes", async () => {
    const n = await negocio("App gera");
    const r = await gerarContratoComCliente(vendedor.cliente as unknown as SupabaseServidor, {
      empresaId: empresa,
      membroId: membro[vendedor.id],
      negocioId: n,
    });
    expect(r).toEqual({ ok: true, mensagem: "Contrato pronto." });
    expect(await textoDoContrato(n)).toContain("**CONTRATANTE:** Cliente App gera");
    const { count } = await servico.from("contratos_geracoes").select("id", { count: "exact", head: true }).eq("negocio_id", n);
    expect(count).toBe(0);
  });

  it("o contrato recebe exatamente o texto guardado pelo servidor, uma vez só", async () => {
    const n = await negocio("Uso único");
    const id = await geracao(n, membro[vendedor.id], "Texto montado pelo servidor.");
    expect((await gerar(vendedor, n, id)).error).toBeNull();
    expect(await textoDoContrato(n)).toBe("Texto montado pelo servidor.");
    expect(await linhaExiste(id)).toBe(false);
    const deNovo = await gerar(vendedor, n, id);
    expect(deNovo.error?.message).toBe("O contrato montado expirou. Gere de novo.");
  });
});

describe("o usuário não fura a geração", () => {
  it("não lê nem grava em contratos_geracoes", async () => {
    const n = await negocio("Sem acesso");
    const id = await geracao(n, membro[vendedor.id], "Guardado.");
    const leitura = await vendedor.cliente.from("contratos_geracoes" as never).select("id").eq("id", id);
    expect(leitura.data ?? []).toEqual([]);
    const escrita = await vendedor.cliente
      .from("contratos_geracoes" as never)
      .insert({ empresa_id: empresa, negocio_id: n, membro_id: membro[vendedor.id], conteudo: "Texto meu." } as never);
    expect(escrita.error).not.toBeNull();
    const adminLe = await admin.cliente.from("contratos_geracoes" as never).select("id").eq("id", id);
    expect(adminLe.data ?? []).toEqual([]);
  });

  it("linha de outra pessoa é recusada e continua lá", async () => {
    const n = await negocio("Outra pessoa");
    const id = await geracao(n, membro[admin.id], "Texto do admin.");
    const r = await gerar(vendedor, n, id);
    expect(r.error?.message).toBe("O contrato montado expirou. Gere de novo.");
    expect(await textoDoContrato(n)).toBeNull();
    expect(await linhaExiste(id)).toBe(true);
  });

  it("linha de outro negócio é recusada", async () => {
    const [a, b] = [await negocio("Negócio A"), await negocio("Negócio B")];
    const id = await geracao(a, membro[vendedor.id], "Texto do A.");
    expect((await gerar(vendedor, b, id)).error?.message).toBe("O contrato montado expirou. Gere de novo.");
    expect(await textoDoContrato(b)).toBeNull();
  });

  it("linha com mais de 10 minutos é recusada e some na próxima geração de quem pediu", async () => {
    const n = await negocio("Vencida");
    const velha = await geracao(n, membro[vendedor.id], "Texto antigo.", { created_at: new Date(Date.now() - 11 * 60_000).toISOString() });
    expect((await gerar(vendedor, n, velha)).error?.message).toBe("O contrato montado expirou. Gere de novo.");
    expect(await textoDoContrato(n)).toBeNull();

    const nova = await geracao(n, membro[vendedor.id], "Texto novo.");
    expect((await gerar(vendedor, n, nova)).error).toBeNull();
    expect(await textoDoContrato(n)).toBe("Texto novo.");
    expect(await linhaExiste(velha)).toBe(false);
  });
});

/*
 * Etapa 2 (20261215100000_contrato_texto_trava.sql): fora da geração e do "Editar texto", usuário do app não cria
 * contrato nem muda texto ou condição pela API. Status e o resto seguem; a service role (manutenção) também.
 */
describe("o usuário não grava texto nem condição pela API", () => {
  it("a assinatura antiga, com texto vindo de quem chama, não existe mais", async () => {
    const n = await negocio("Assinatura antiga");
    const { error } = await vendedor.cliente.rpc(
      "gerar_contrato_com_condicao" as never,
      { p_negocio_id: n, p_conteudo: "Texto do usuário", p_condicao: null, p_valor: null, p_motivo: "" } as never,
    );
    expect(error).not.toBeNull();
    expect(await textoDoContrato(n)).toBeNull();
  });

  it("insert direto é recusado, para vendedor e admin", async () => {
    const n = await negocio("Insert direto");
    for (const u of [vendedor, admin]) {
      const { error } = await u.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: n, conteudo: "Texto do usuário" });
      expect(error?.code).toBe("42501");
    }
    expect(await textoDoContrato(n)).toBeNull();
  });

  it("texto e condição não mudam por update direto, nem no rascunho; o status muda", async () => {
    const n = await negocio("Update direto");
    expect((await gerar(vendedor, n, await geracao(n, membro[vendedor.id], "Texto do servidor"))).error).toBeNull();

    for (const u of [vendedor, admin]) {
      const texto = await u.cliente.from("contratos").update({ conteudo: "Texto do usuário" }).eq("negocio_id", n);
      expect(texto.error?.code).toBe("42501");
      const condicao = await u.cliente.from("contratos").update({ condicao_pagamento: { forma: "avista" } }).eq("negocio_id", n);
      expect(condicao.error?.code).toBe("42501");
    }
    const { data } = await servico.from("contratos").select("conteudo, condicao_pagamento, texto_editado_em").eq("negocio_id", n).single();
    expect(data).toEqual({ conteudo: "Texto do servidor", condicao_pagamento: null, texto_editado_em: null });

    expect((await vendedor.cliente.from("contratos").update({ status: "aguardando_assinatura" }).eq("negocio_id", n)).error).toBeNull();
  });

  it("o \"Editar texto\" continua mudando o texto, com a marca de editado", async () => {
    const n = await negocio("Editar texto");
    expect((await gerar(vendedor, n, await geracao(n, membro[vendedor.id], "Texto do servidor"))).error).toBeNull();
    expect((await vendedor.cliente.rpc("editar_texto_contrato", { p_negocio_id: n, p_conteudo: "Texto ajustado" })).error).toBeNull();
    const { data } = await servico.from("contratos").select("conteudo, texto_editado_por").eq("negocio_id", n).single();
    expect(data).toEqual({ conteudo: "Texto ajustado", texto_editado_por: membro[vendedor.id] });
  });

  it("a marca da geração não sobra para o resto da transação", async () => {
    // Gerar de novo depois de editar apaga a marca de editado: o texto volta a ser o do servidor.
    const n = await negocio("Marca local");
    expect((await gerar(vendedor, n, await geracao(n, membro[vendedor.id], "Primeiro"))).error).toBeNull();
    expect((await vendedor.cliente.rpc("editar_texto_contrato", { p_negocio_id: n, p_conteudo: "Editado" })).error).toBeNull();
    expect((await gerar(vendedor, n, await geracao(n, membro[vendedor.id], "Segundo"))).error).toBeNull();
    const { data } = await servico.from("contratos").select("conteudo, texto_editado_em").eq("negocio_id", n).single();
    expect(data).toEqual({ conteudo: "Segundo", texto_editado_em: null });
  });

  it("a service role (manutenção) continua podendo corrigir o texto", async () => {
    const n = await negocio("Manutenção");
    expect((await gerar(vendedor, n, await geracao(n, membro[vendedor.id], "Texto do servidor"))).error).toBeNull();
    expect((await servico.from("contratos").update({ conteudo: "Corrigido" }).eq("negocio_id", n)).error).toBeNull();
    expect(await textoDoContrato(n)).toBe("Corrigido");
  });
});
