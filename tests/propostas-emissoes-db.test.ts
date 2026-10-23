/**
 * Emissão preservada da proposta (20261022100000_propostas_emissoes.sql): tabela imutável, RLS (só papel comercial,
 * só a empresa do negócio, só em nome de quem emite), campos conferidos no servidor (token, versão, datas), negócio
 * arquivado somente leitura e bucket privado dos PDFs. Precisa do Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

type Empresa = { id: string; negocio: string; membros: Record<string, string> };
type Linha = ReturnType<typeof montarLinha> extends Promise<infer L> ? L : never;

let vendedor: Usuario, gestor: Usuario, adminEmpresa: Usuario, sdr: Usuario, outro: Usuario, emDuas: Usuario;
let a: Empresa, b: Empresa;

const HASH = "a".repeat(64);
const BUCKET = "propostas-emitidas";
const VALIDADE = "2099-12-31";

async function criarEmpresa(nome: string, vs: { u: Usuario; papel: "admin" | "gestor" | "vendedor" | "sdr" }[], donoDoNegocio: Usuario): Promise<Empresa> {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `${nome} ${sufixo}` }).select("id").single();
  if (error) throw error;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp!.id).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: emp!.id, nome: `Cliente ${nome}` }).select("id").single();
  const { data: ms, error: erroMembros } = await servico
    .from("empresa_membros")
    .insert(vs.map((v) => ({ empresa_id: emp!.id, user_id: v.u.id, papel: v.papel })))
    .select("id, user_id");
  if (erroMembros) throw erroMembros;
  const membros = Object.fromEntries(ms!.map((m) => [m.user_id, m.id]));
  const { data: n, error: erroNegocio } = await servico
    .from("negocios")
    .insert({ empresa_id: emp!.id, titulo: `Negócio ${nome}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membros[donoDoNegocio.id]!, valor: 30000 })
    .select("id")
    .single();
  if (erroNegocio) throw erroNegocio;
  return { id: emp!.id, negocio: n!.id, membros };
}

async function proximaVersao(e: Empresa) {
  const { data } = await servico.from("propostas_emissoes").select("versao").eq("negocio_id", e.negocio).order("versao", { ascending: false }).limit(1);
  return (data?.[0]?.versao ?? 0) + 1;
}

/** Linha como o app a envia: versão = próxima, datas dentro de `dados`, hora de agora, sem token. */
async function montarLinha(e: Empresa, quem: Usuario, extra: Record<string, unknown> = {}) {
  const { sem_pdf: semPdf, ...campos } = extra;
  const id = crypto.randomUUID();
  const versao = await proximaVersao(e);
  const emitidaEm = new Date().toISOString();
  const linha = {
    id,
    empresa_id: e.id,
    negocio_id: e.negocio,
    versao,
    dados: { esquema: 2, emissao: { versao, emitidaEm }, comercial: { validadeAte: VALIDADE } },
    dados_sha256: HASH,
    validade_ate: VALIDADE,
    pdf_caminho: `${e.id}/${e.negocio}/${id}.pdf`,
    pdf_sha256: HASH,
    pdf_bytes: 10,
    renderizador: "simples-v2",
    emitida_em: emitidaEm,
    emitida_por: e.membros[quem.id]!,
    ...campos,
  };
  // Como o app: o PDF (10 bytes) já está no bucket quando a linha é inserida (o banco exige o arquivo).
  if (!semPdf) {
    const { error } = await servico.storage.from(BUCKET).upload(linha.pdf_caminho, new Uint8Array(10), { contentType: "application/pdf", upsert: true });
    if (error) throw error;
  }
  return linha;
}

const inserir = (u: Usuario, l: Linha | Record<string, unknown>) => u.cliente.from("propostas_emissoes").insert(l as never);
const comoServico = (l: Linha | Record<string, unknown>) => servico.from("propostas_emissoes").insert(l as never);

async function emitirComoServico(e: Empresa, quem: Usuario) {
  const l = await montarLinha(e, quem);
  const { error } = await comoServico(l);
  if (error) throw error;
  return l;
}

beforeAll(async () => {
  [vendedor, gestor, adminEmpresa, sdr, outro, emDuas] = await Promise.all(
    ["emi-vend", "emi-gestor", "emi-admin", "emi-sdr", "emi-outro", "emi-duas"].map(criarUsuario),
  );
  a = await criarEmpresa(
    "Emissões A",
    [
      { u: vendedor, papel: "vendedor" },
      { u: gestor, papel: "gestor" },
      { u: adminEmpresa, papel: "admin" },
      { u: sdr, papel: "sdr" },
      { u: emDuas, papel: "vendedor" },
    ],
    vendedor,
  );
  // `emDuas` é vendedor na empresa A e também SDR dono de um negócio da empresa B.
  b = await criarEmpresa(
    "Emissões B",
    [
      { u: outro, papel: "vendedor" },
      { u: emDuas, papel: "sdr" },
    ],
    emDuas,
  );
});

describe("propostas_emissoes: emitir", () => {
  it("o vendedor emite em nome dele", async () => {
    const { error } = await inserir(vendedor, await montarLinha(a, vendedor));
    expect(error).toBeNull();
  });

  it("recusa emitir em nome de outro membro", async () => {
    const { error } = await inserir(vendedor, await montarLinha(a, vendedor, { emitida_por: a.membros[gestor.id] }));
    expect(error).not.toBeNull();
  });

  it("o SDR não emite", async () => {
    const { error } = await inserir(sdr, await montarLinha(a, sdr));
    expect(error).not.toBeNull();
  });

  it("quem é de outra empresa não emite para o negócio", async () => {
    const { error } = await inserir(outro, await montarLinha(a, outro, { emitida_por: b.membros[outro.id] }));
    expect(error).not.toBeNull();
  });

  it("quem é membro das DUAS empresas não grava uma emissão da empresa A para o negócio da B", async () => {
    // Vendedor em A (pode emitir lá) e SDR dono do negócio de B: empresa_id = A com negocio_id da B.
    const l = await montarLinha(b, emDuas, { empresa_id: a.id, emitida_por: a.membros[emDuas.id], pdf_caminho: `${a.id}/${b.negocio}/x.pdf` });
    const { error } = await inserir(emDuas, { ...l, pdf_caminho: `${a.id}/${b.negocio}/${l.id}.pdf` });
    expect(error).not.toBeNull();
    const { data } = await servico.from("propostas_emissoes").select("id").eq("negocio_id", b.negocio);
    expect(data).toEqual([]);
  });

  it("o SDR dono do negócio da empresa B também não emite lá", async () => {
    const { error } = await inserir(emDuas, await montarLinha(b, emDuas));
    expect(error).not.toBeNull();
  });

  it("recusa empresa que não é a do negócio", async () => {
    const l = await montarLinha(a, vendedor, { empresa_id: b.id });
    expect((await inserir(vendedor, l)).error).not.toBeNull();
  });

  it("não repete a versão do mesmo negócio", async () => {
    const primeira = await emitirComoServico(a, vendedor);
    const { error } = await comoServico(await montarLinha(a, vendedor, { versao: primeira.versao }));
    expect(error).not.toBeNull();
  });

  it("o caminho do PDF precisa ser <empresa>/<negócio>/<id>.pdf", async () => {
    const { error } = await comoServico(await montarLinha(a, vendedor, { pdf_caminho: "qualquer/coisa.pdf" }));
    expect(error).not.toBeNull();
  });
});

describe("propostas_emissoes: a linha só nasce amarrada ao PDF guardado", () => {
  it("recusa linha sem arquivo no bucket ou com tamanho diferente (POST direto na API)", async () => {
    expect((await inserir(vendedor, await montarLinha(a, vendedor, { sem_pdf: true }))).error?.message).toMatch(/PDF/);
    const l = await montarLinha(a, vendedor, { pdf_bytes: 11 });
    expect((await inserir(vendedor, l)).error?.message).toMatch(/PDF/);
  });

  it("quem não enxerga o negócio alheio não ganha pista nem contagem de versões", async () => {
    await emitirComoServico(b, outro);
    // Versão errada de propósito: antes da correção, o erro dizia qual seria a próxima versão do negócio alheio.
    const l = await montarLinha(b, outro, { emitida_por: a.membros[vendedor.id], empresa_id: a.id, versao: 99 });
    const { error } = await inserir(vendedor, { ...l, dados: { ...l.dados, emissao: { ...l.dados.emissao, versao: 99 } } });
    expect(error).not.toBeNull();
    expect(error!.message).not.toMatch(/\d/);
    expect(error!.message).not.toMatch(/arquivado|versão/i);
  });
});

describe("propostas_emissoes: o servidor não confia nos campos enviados pela API", () => {
  it("o token enviado é ignorado: sempre sorteado pelo banco (sem sequestrar link de outra empresa)", async () => {
    const forjado = crypto.randomUUID();
    const l = await montarLinha(a, vendedor, { token: forjado });
    expect((await inserir(vendedor, l)).error).toBeNull();
    const { data } = await servico.from("propostas_emissoes").select("token").eq("id", l.id).single();
    expect(data!.token).not.toBe(forjado);
  });

  it("a versão precisa ser a próxima (nada de saltar para um número enorme que trave o negócio)", async () => {
    const enorme = await montarLinha(a, vendedor, { versao: 2147483647 });
    expect((await inserir(vendedor, { ...enorme, dados: { ...enorme.dados, emissao: { ...enorme.dados.emissao, versao: 2147483647 } } })).error).not.toBeNull();
    const pulada = await montarLinha(a, vendedor);
    const p2 = { ...pulada, versao: pulada.versao + 1, dados: { ...pulada.dados, emissao: { ...pulada.dados.emissao, versao: pulada.versao + 1 } } };
    expect((await inserir(vendedor, p2)).error).not.toBeNull();
    // e o negócio continua emitindo normalmente
    expect((await inserir(vendedor, await montarLinha(a, vendedor))).error).toBeNull();
  });

  it("a versão dentro de `dados` precisa bater com a da linha", async () => {
    const l = await montarLinha(a, vendedor);
    expect((await inserir(vendedor, { ...l, dados: { ...l.dados, emissao: { ...l.dados.emissao, versao: l.versao + 5 } } })).error).not.toBeNull();
  });

  it("validade e hora da emissão precisam bater com `dados` e com o relógio do servidor", async () => {
    const l = await montarLinha(a, vendedor);
    expect((await inserir(vendedor, { ...l, validade_ate: "2098-01-01" })).error).not.toBeNull();
    const retroativa = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    expect((await inserir(vendedor, { ...l, emitida_em: retroativa, dados: { ...l.dados, emissao: { ...l.dados.emissao, emitidaEm: retroativa } } })).error).not.toBeNull();
    expect((await inserir(vendedor, { ...l, validade_ate: "2020-01-01", dados: { ...l.dados, comercial: { validadeAte: "2020-01-01" } } })).error).not.toBeNull();
    expect((await inserir(vendedor, { ...l, dados: { ...l.dados, comercial: {} } })).error).not.toBeNull();
  });
});

describe("propostas_emissoes: negócio arquivado", () => {
  it("não recebe emissão nova (somente leitura no banco)", async () => {
    const c = await criarEmpresa("Emissões Arquivo", [{ u: vendedor, papel: "vendedor" }, { u: adminEmpresa, papel: "admin" }], vendedor);
    const ok = await montarLinha(c, vendedor);
    expect((await inserir(vendedor, ok)).error).toBeNull();
    const { error: erroArquivar } = await adminEmpresa.cliente.rpc("arquivar_negocio", { p_negocio_id: c.negocio, p_motivo: "Cliente desistiu" });
    expect(erroArquivar).toBeNull();
    const { error } = await inserir(vendedor, await montarLinha(c, vendedor));
    expect(error?.message).toMatch(/arquivado/i);
    expect((await comoServico(await montarLinha(c, vendedor))).error?.message).toMatch(/arquivado/i);
  });
});

describe("propostas_emissoes: leitura", () => {
  it("vendedor (dono do negócio) e admin leem; SDR e outra empresa não", async () => {
    const l = await emitirComoServico(a, vendedor);
    const ler = async (u: Usuario) => {
      const { data, error } = await u.cliente.from("propostas_emissoes").select("id").eq("id", l.id);
      expect(error).toBeNull();
      return (data as unknown[]).length;
    };
    expect(await ler(vendedor)).toBe(1);
    expect(await ler(adminEmpresa)).toBe(1);
    expect(await ler(sdr)).toBe(0);
    expect(await ler(outro)).toBe(0);
  });
});

describe("propostas_emissoes: imutável", () => {
  it("usuário não altera nem apaga", async () => {
    const l = await emitirComoServico(a, vendedor);
    await vendedor.cliente.from("propostas_emissoes").update({ validade_ate: "2030-01-01" }).eq("id", l.id);
    await vendedor.cliente.from("propostas_emissoes").delete().eq("id", l.id);
    const { data } = await servico.from("propostas_emissoes").select("validade_ate").eq("id", l.id).single();
    expect(data!.validade_ate).toBe(VALIDADE);
  });

  it("nem a service role altera ou apaga diretamente", async () => {
    const l = await emitirComoServico(a, vendedor);
    const alterar = await servico.from("propostas_emissoes").update({ pdf_bytes: 99 }).eq("id", l.id);
    expect(alterar.error?.message).toMatch(/não pode ser alterada/);
    const apagar = await servico.from("propostas_emissoes").delete().eq("id", l.id);
    expect(apagar.error?.message).toMatch(/não pode ser alterada/);
  });

  it("apagar o negócio é bloqueado enquanto houver proposta emitida (só arquivar)", async () => {
    const c = await criarEmpresa("Emissões Sem Apagar", [{ u: vendedor, papel: "vendedor" }], vendedor);
    const l = await emitirComoServico(c, vendedor);
    const { error } = await servico.from("negocios").delete().eq("id", c.negocio);
    expect(error).not.toBeNull();
    const { data } = await servico.from("propostas_emissoes").select("id").eq("id", l.id);
    expect(data).toHaveLength(1);
  });

  it("apagar a EMPRESA continua possível e leva as emissões junto (cascata)", async () => {
    const c = await criarEmpresa("Emissões Cascata", [{ u: vendedor, papel: "vendedor" }], vendedor);
    const l = await emitirComoServico(c, vendedor);
    const { error } = await servico.from("empresas").delete().eq("id", c.id);
    expect(error).toBeNull();
    const { data } = await servico.from("propostas_emissoes").select("id").eq("id", l.id);
    expect(data).toEqual([]);
    // Efeito conhecido (registrado no contrato): o banco não apaga o objeto do bucket junto; o PDF fica órfão.
    expect((await servico.storage.from(BUCKET).download(l.pdf_caminho)).error).toBeNull();
  });
});

describe("bucket propostas-emitidas", () => {
  it("só quem emite lê o PDF; ninguém envia, troca ou apaga pela API de usuário", async () => {
    const l = await emitirComoServico(a, vendedor);
    const envio = await servico.storage.from(BUCKET).upload(l.pdf_caminho, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf", upsert: true });
    expect(envio.error).toBeNull();

    expect((await vendedor.cliente.storage.from(BUCKET).download(l.pdf_caminho)).error).toBeNull();
    expect((await sdr.cliente.storage.from(BUCKET).download(l.pdf_caminho)).error).not.toBeNull();
    expect((await outro.cliente.storage.from(BUCKET).download(l.pdf_caminho)).error).not.toBeNull();

    const sobrescrever = await vendedor.cliente.storage.from(BUCKET).upload(l.pdf_caminho, new Uint8Array([1]), { contentType: "application/pdf", upsert: true });
    expect(sobrescrever.error).not.toBeNull();
    const apagar = await vendedor.cliente.storage.from(BUCKET).remove([l.pdf_caminho]);
    expect(apagar.data ?? []).toEqual([]);
  });

  it("o bucket é privado e só aceita PDF", async () => {
    const { data, error } = await servico.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
    expect(data?.allowed_mime_types).toEqual(["application/pdf"]);
  });
});
