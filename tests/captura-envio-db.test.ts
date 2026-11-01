/**
 * Envio do formulário público de captura (enviarCaptura, sem login) e as travas contra abuso
 * (20261102160000_captura_limite_envios.sql): até 5 envios por IP a cada 10 minutos em cada formulário, campo-armadilha
 * para robôs, o mesmo telefone em seguida não cria um segundo negócio e campos com tamanho máximo. O IP só é guardado
 * como hash. Precisa do Supabase local (roda no CI).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const rede = vi.hoisted(() => ({ ip: "203.0.113.10" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${rede.ip}, 10.0.0.1` }),
}));

const { enviarCaptura } = await import("@/lib/acoes/captura");
const { servico, sufixo } = await import("./ajuda");
const { novoClienteBanco } = await import("./banco-local");

let empresa: string;
let origem: string;
let tokenA: string;
let tokenB: string;
let formularioA: string;
let seq = 0;

/** Telefone novo a cada chamada (11 dígitos), para o envio não ser tratado como repetido. */
const telefoneNovo = () => `4199${String(Date.now() % 1000).padStart(3, "0")}${String(++seq).padStart(4, "0")}`;

function envio(token: string, extra: Record<string, string> = {}) {
  const dados = new FormData();
  const campos = { token, nome: "Cliente Captura", telefone: telefoneNovo(), valor_conta_energia: "350", ...extra };
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return enviarCaptura(null, dados);
}

async function negociosPorTelefone(telefone: string) {
  const { data } = await servico.from("negocios").select("id, contatos!inner(telefone)").eq("origem_id", origem).eq("contatos.telefone", telefone);
  return data!.length;
}

async function totalNegocios() {
  const { count } = await servico.from("negocios").select("id", { count: "exact", head: true }).eq("origem_id", origem);
  return count!;
}

beforeAll(async () => {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Captura envio ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: o } = await servico.from("origens").insert({ empresa_id: empresa, nome: `Feira ${sufixo}` }).select("id").single();
  origem = o!.id;
  const { data: forms, error: erroForm } = await servico
    .from("formularios")
    .insert([
      { empresa_id: empresa, nome: `Feira A ${sufixo}`, funil_id: f!.id, origem_id: origem },
      { empresa_id: empresa, nome: `Feira B ${sufixo}`, funil_id: f!.id, origem_id: origem },
    ])
    .select("id, token, nome")
    .order("nome");
  if (erroForm) throw erroForm;
  formularioA = forms![0].id;
  tokenA = forms![0].token;
  tokenB = forms![1].token;
});

describe("captura: envio sem login", { concurrent: false, shuffle: false }, () => {
  it("envio válido cria o contato e o negócio na origem do formulário", async () => {
    rede.ip = "203.0.113.1";
    const telefone = telefoneNovo();
    const r = await envio(tokenA, { telefone });
    expect(r).toMatchObject({ ok: true });
    expect(await negociosPorTelefone(telefone)).toBe(1);
  });

  it("o mesmo telefone em seguida no mesmo formulário não cria um segundo negócio, e quem enviou vê sucesso", async () => {
    rede.ip = "203.0.113.2";
    const telefone = telefoneNovo();
    expect(await envio(tokenA, { telefone })).toMatchObject({ ok: true });
    expect(await envio(tokenA, { telefone: `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}` })).toMatchObject({ ok: true });
    expect(await negociosPorTelefone(telefone)).toBe(1);
  });

  it("campo-armadilha preenchido (robô): responde sucesso e não cria nada", async () => {
    rede.ip = "203.0.113.3";
    const antes = await totalNegocios();
    expect(await envio(tokenA, { site: "https://spam.example" })).toMatchObject({ ok: true });
    expect(await totalNegocios()).toBe(antes);
  });

  it("nome e e-mail longos demais são recusados", async () => {
    rede.ip = "203.0.113.4";
    expect(await envio(tokenA, { nome: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(await envio(tokenA, { email: `${"a".repeat(250)}@x.com` })).toMatchObject({ ok: false });
  });

  it("até 5 envios por IP a cada 10 minutos no formulário; o 6º é recusado com aviso e nada é criado", async () => {
    rede.ip = "198.51.100.7";
    for (let i = 0; i < 5; i++) expect(await envio(tokenA)).toMatchObject({ ok: true });
    const antes = await totalNegocios();
    const sexto = await envio(tokenA);
    expect(sexto).toMatchObject({ ok: false });
    expect(sexto!.mensagem).toMatch(/muitos envios/i);
    expect(await totalNegocios()).toBe(antes);

    // Outro IP no mesmo formulário e o mesmo IP em outro formulário seguem normais.
    rede.ip = "198.51.100.8";
    expect(await envio(tokenA)).toMatchObject({ ok: true });
    rede.ip = "198.51.100.7";
    expect(await envio(tokenB)).toMatchObject({ ok: true });
  });

  it("passados 10 minutos, o mesmo IP volta a enviar", async () => {
    const db = novoClienteBanco();
    await db.connect();
    try {
      await db.query(`update public.captura_envios set created_at = created_at - interval '11 minutes' where formulario_id = $1`, [formularioA]);
    } finally {
      await db.end();
    }
    rede.ip = "198.51.100.7";
    expect(await envio(tokenA)).toMatchObject({ ok: true });
  });

  it("o IP não é guardado em texto, e a tabela não é acessível sem o servidor", async () => {
    const db = novoClienteBanco();
    await db.connect();
    try {
      const { rows } = await db.query<{ origem: string }>(`select origem from public.captura_envios where formulario_id = $1`, [formularioA]);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((r) => r.origem.includes("198.51.100") || r.origem.includes("203.0.113"))).toBe(false);
      const { rows: acesso } = await db.query<{ papel: string; ve: boolean; executa: boolean }>(`
        select r as papel, has_table_privilege(r, 'public.captura_envios', 'SELECT') as ve,
               has_function_privilege(r, 'public.registrar_envio_captura(uuid, text)', 'EXECUTE') as executa
        from unnest(array['anon', 'authenticated']) r order by r`);
      expect(acesso).toEqual([
        { papel: "anon", ve: false, executa: false },
        { papel: "authenticated", ve: false, executa: false },
      ]);
    } finally {
      await db.end();
    }
  });
});
