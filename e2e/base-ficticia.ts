/**
 * Base FICTÍCIA para os testes de navegador de Obras (OPR 3A). Roda só contra o Supabase LOCAL
 * (a trava de `e2e/global-setup.ts` aborta antes, se não for). Nenhum dado real, nenhuma chave
 * de produção: usuários `@teste.raion`, empresas "E2E", clientes inventados.
 *
 * Usa os mesmos caminhos do banco real: a obra nasce de venda ganha + contrato assinado +
 * pagamento confirmado (`garantir_obra`, #145) e os estados entram pelas RPCs da 3b-3, com a
 * sessão de cada papel. Pausa e cancelamento não têm RPC: entram pelo dono do banco LOCAL, como
 * em tests/obras-escrita-db.test.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "../src/lib/supabase/database.types";

export const SENHA_E2E = "senha-e2e-local-123";

type Cliente = SupabaseClient<Database>;
export type UsuarioE2E = { chave: string; nome: string; email: string; id: string; membroId: string };

export type BaseFicticia = {
  senha: string;
  empresaA: string;
  empresaB: string;
  usuarios: Record<string, UsuarioE2E>;
  /** Obras da empresa A por chave (o01 = obra mais antiga) e as da empresa B. */
  obras: Record<string, string>;
  obrasB: Record<string, string>;
  clientesB: string[];
};

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !servico) throw new Error("Variáveis do Supabase local ausentes (.env.local).");
  return { url, anon, servico };
}

/** Postgres local (para pausa/cancelamento). Recusa qualquer host que não seja local. */
async function noBancoLocal(sql: string, params: unknown[]) {
  // Definida só por e2e/global-setup.ts, depois de comprovar que o banco é o da mesma stack da API.
  const urlBanco = process.env.SUPABASE_DB_URL;
  if (!urlBanco) throw new Error("Banco não verificado: e2e/global-setup.ts não definiu a URL. Recusado.");
  const host = new URL(urlBanco).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Banco recusado: host "${host}" não é local.`);
  const banco = new Client({ connectionString: urlBanco });
  await banco.connect();
  try {
    await banco.query(sql, params);
  } finally {
    await banco.end();
  }
}

/** Consulta que PRECISA devolver dados: erro ou resposta vazia interrompem a criação da base. */
function ok<R extends { data: unknown; error: { message: string } | null }>(r: R, contexto: string): NonNullable<R["data"]> {
  feito(r, contexto);
  if (r.data == null) throw new Error(`${contexto}: resposta vazia`);
  return r.data as NonNullable<R["data"]>;
}

/** Escrita sem retorno (RPC `returns void`, update sem select): `data` nulo é sucesso; só o erro conta. */
function feito(r: { error: { message: string } | null }, contexto: string): void {
  if (r.error) throw new Error(`${contexto}: ${r.error.message}`);
}

export async function criarBaseFicticia(): Promise<BaseFicticia> {
  const { url, anon, servico: chaveServico } = ambiente();
  const servico = createClient<Database>(url, chaveServico, { auth: { persistSession: false } });
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  // --- Usuários (fictícios) ---------------------------------------------------
  const pessoas: [chave: string, nome: string][] = [
    ["admin", "Ana Admin (fictícia)"],
    ["gestor", "Gustavo Gestor (fictício)"],
    ["vendedor", "Vera Vendedora (fictícia)"],
    ["sdr", "Sérgio SDR (fictício)"],
    ["coordEng", "Carla Coordenadora Eng. (fictícia)"],
    ["execEng", "Eduardo Executor Eng. (fictício)"],
    ["execOp", "Olívia Executora Op. (fictícia)"],
    ["apoioEng", "Paulo Apoio Eng. (fictício)"],
    ["execCompras", "Bruno Compras (fictício)"],
    ["adminB", "Beatriz Admin B (fictícia)"],
    ["vendedorB", "Vitor Vendedor B (fictício)"],
  ];
  const clientes: Record<string, Cliente> = {};
  const usuarios: Record<string, UsuarioE2E> = {};
  for (const [chave, nome] of pessoas) {
    const email = `e2e-${chave.toLowerCase()}-${sufixo}@teste.raion`;
    const criado = ok(
      await servico.auth.admin.createUser({ email, password: SENHA_E2E, email_confirm: true, user_metadata: { nome } }),
      `criar usuário ${chave}`,
    );
    const cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
    ok(await cliente.auth.signInWithPassword({ email, password: SENHA_E2E }), `login ${chave}`);
    clientes[chave] = cliente;
    if (!criado.user) throw new Error(`criar usuário ${chave}: sem usuário na resposta`);
    usuarios[chave] = { chave, nome, email, id: criado.user.id, membroId: "" };
  }

  // --- Empresas e vínculos -------------------------------------------------------
  const empresas = ok(
    await servico
      .from("empresas")
      .insert([{ nome: `Solar Fictícia A (E2E ${sufixo})` }, { nome: `Solar Fictícia B (E2E ${sufixo})` }])
      .select("id, nome")
      .order("nome"),
    "criar empresas",
  );
  const [empresaA, empresaB] = [empresas[0].id, empresas[1].id];

  const closer = { papel: "vendedor", perfil_gamificacao: "closer" };
  const operacao = { papel: "operacao" };
  const vinculos: [string, string, object][] = [
    ["admin", empresaA, { papel: "admin" }],
    ["gestor", empresaA, { papel: "gestor" }],
    ["vendedor", empresaA, closer],
    ["sdr", empresaA, { papel: "sdr", perfil_gamificacao: "sdr" }],
    ["coordEng", empresaA, operacao],
    ["execEng", empresaA, operacao],
    ["execOp", empresaA, operacao],
    ["apoioEng", empresaA, operacao],
    ["execCompras", empresaA, operacao],
    ["adminB", empresaB, { papel: "admin" }],
    ["vendedorB", empresaB, closer],
  ];
  const linhas = ok(
    await servico
      .from("empresa_membros")
      .insert(vinculos.map(([chave, emp, extra]) => ({ empresa_id: emp, user_id: usuarios[chave].id, ...extra })) as never)
      .select("id, user_id"),
    "criar vínculos",
  );
  for (const l of linhas) {
    const u = Object.values(usuarios).find((x) => x.id === l.user_id);
    if (u) u.membroId = l.id;
  }

  // Equipe comercial: o gestor só enxerga vendas de quem é da equipe dele (pode_ver_responsavel).
  const equipe = ok(await servico.from("equipes").insert({ empresa_id: empresaA, nome: "Equipe Fictícia Oeste" }).select("id").single(), "equipe");
  feito(
    await servico.from("equipe_membros").insert([
      { equipe_id: equipe.id, empresa_id: empresaA, membro_id: usuarios.gestor.membroId, e_gestor: true },
      { equipe_id: equipe.id, empresa_id: empresaA, membro_id: usuarios.vendedor.membroId, e_gestor: false },
    ]),
    "membros da equipe",
  );

  // Setores (pelo admin, via RPC real).
  const setores: [string, unknown][] = [
    ["coordEng", [{ setor: "engenharia", capacidade: "coordenar" }]],
    ["execEng", [{ setor: "engenharia", capacidade: "executar" }]],
    ["apoioEng", [{ setor: "engenharia", capacidade: "executar" }]],
    ["execOp", [{ setor: "operacional", capacidade: "executar" }]],
    ["execCompras", [{ setor: "compras", capacidade: "executar" }]],
  ];
  for (const [chave, s] of setores) {
    feito(await clientes.admin.rpc("definir_setores_membro", { p_membro_id: usuarios[chave].membroId, p_setores: s as never }), `setores ${chave}`);
  }

  // --- Obras pelo mecanismo real -------------------------------------------------
  async function criarObra(emp: string, vendedor: string, confirmador: string, cliente: string, cidade: string, valor: number) {
    const funil = ok(await servico.from("funis").select("id").eq("empresa_id", emp).single(), "funil");
    const etapa = ok(await servico.from("etapas").select("id").eq("funil_id", funil.id).order("ordem").limit(1).single(), "etapa");
    const contato = ok(
      await servico
        .from("contatos")
        .insert({ empresa_id: emp, nome: cliente, cidade, uf: "PR", telefone: "(45) 90000-0000", endereco: "Rua Fictícia, 100", documento: "000.000.000-00" })
        .select("id")
        .single(),
      "contato",
    );
    const negocio = ok(
      await servico
        .from("negocios")
        .insert({
          empresa_id: emp,
          titulo: `Sistema solar — ${cliente}`,
          contato_id: contato.id,
          funil_id: funil.id,
          etapa_id: etapa.id,
          responsavel_id: usuarios[vendedor].membroId,
          valor,
        })
        .select("id")
        .single(),
      "negócio",
    );
    feito(await clientes[vendedor].from("negocios").update({ status: "ganho" }).eq("id", negocio.id), "ganho");
    const contrato = ok(
      await clientes[vendedor].from("contratos").insert({ empresa_id: emp, negocio_id: negocio.id, conteudo: "Contrato fictício (E2E)" }).select("id").single(),
      "contrato",
    );
    feito(await clientes[vendedor].from("contratos").update({ status: "assinado" }).eq("id", contrato.id), "assinado");
    feito(await clientes[confirmador].rpc("confirmar_pagamento", { p_contrato_id: contrato.id }), "pagamento");
    const obra = ok(await servico.from("obras").select("id").eq("negocio_id", negocio.id).single(), "obra");
    return obra.id;
  }

  const nomesA = [
    ["Família Almeida (fictícia)", "Cascavel"],
    ["Mercado Bom Preço (fictício)", "Toledo"],
    ["Sítio Boa Vista (fictício)", "Cascavel"],
    ["Clínica Vida (fictícia)", "Foz do Iguaçu"],
    ["Padaria Pão Quente (fictícia)", "Cascavel"],
    ["Usina Solar Fazenda Modelo (fictícia)", "Toledo"],
    ["Oficina Motor Bom (fictícia)", "Toledo"],
    ["Escola Aprender (fictícia)", "Cascavel"],
    ["Granja Ovo Feliz (fictícia)", "Palotina"],
    ["Residência Souza (fictícia)", "Cascavel"],
    ["Farmácia Saúde (fictícia)", "Medianeira"],
    ["Condomínio Sol Nascente (fictício)", "Cascavel"],
  ] as const;
  const obras: Record<string, string> = {};
  // Em sequência: a ordem de criação define o número da obra (o01 = #menor).
  for (const [i, [cliente, cidade]] of nomesA.entries()) {
    obras[`o${String(i + 1).padStart(2, "0")}`] = await criarObra(empresaA, "vendedor", "admin", cliente, cidade, 20000 + i * 1500);
  }
  const clientesB = ["Empresa B Cliente Secreto Um (fictício)", "Empresa B Cliente Secreto Dois (fictício)"];
  const obrasB: Record<string, string> = {};
  for (const [i, cliente] of clientesB.entries()) {
    obrasB[`b${i + 1}`] = await criarObra(empresaB, "vendedorB", "adminB", cliente, "Curitiba", 50000);
  }

  // --- Estados pelas RPCs reais (como admin) --------------------------------------
  const admin = clientes.admin;
  const status = async (obra: string, setor: "compras" | "engenharia" | "operacional", novo: string) =>
    feito(await admin.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: setor, p_status: novo }), `status ${setor}`);
  const parado = async (obra: string, setor: "compras" | "engenharia" | "operacional", motivo: string) =>
    feito(await admin.rpc("marcar_parado_fluxo_obra", { p_obra_id: obra, p_setor: setor, p_parado: true, p_motivo: motivo }), "parado");
  const aguardando = async (obra: string, setor: "compras" | "engenharia" | "operacional", quem: "cliente" | "fornecedor" | "concessionaria") =>
    feito(await admin.rpc("definir_aguardando_fluxo_obra", { p_obra_id: obra, p_setor: setor, p_aguardando: quem }), "aguardando");
  const marco = async (obra: string, qual: "nf_cliente" | "garantia", novo: "concluido" | "nao_se_aplica", motivo?: string) =>
    feito(await admin.rpc("atualizar_marco_obra", { p_obra_id: obra, p_marco: qual, p_status: novo, ...(motivo ? { p_motivo: motivo } : {}) }), "marco");
  const atribuir = async (obra: string, chave: string, setor: "compras" | "engenharia" | "operacional", funcao: "responsavel" | "apoio", principal = false) =>
    feito(
      await admin.rpc("atribuir_participante_obra", {
        p_obra_id: obra,
        p_membro_id: usuarios[chave].membroId,
        p_setor: setor,
        p_funcao: funcao,
        p_principal: principal,
      }),
      `atribuir ${chave}`,
    );

  // o01: obra principal dos testes de Gestão (participantes, etapas intermediárias).
  await status(obras.o01, "compras", "cotando");
  await status(obras.o01, "engenharia", "projeto_em_elaboracao");
  await atribuir(obras.o01, "execEng", "engenharia", "responsavel", true);
  await atribuir(obras.o01, "execOp", "operacional", "apoio");
  // o02: compras adiantado, engenharia aguardando concessionária.
  await status(obras.o02, "compras", "pedido_realizado");
  await status(obras.o02, "engenharia", "enviado_concessionaria");
  await aguardando(obras.o02, "engenharia", "concessionaria");
  await atribuir(obras.o02, "execCompras", "compras", "responsavel", true);
  // o03: engenharia parada.
  await status(obras.o03, "engenharia", "projeto_em_elaboracao");
  await parado(obras.o03, "engenharia", "Documentação do cliente incompleta (fictício)");
  // o04: operacional agendado, aguardando cliente.
  await status(obras.o04, "compras", "faturado_fornecedor");
  await status(obras.o04, "engenharia", "aprovado");
  await status(obras.o04, "operacional", "agendada");
  await aguardando(obras.o04, "operacional", "cliente");
  await atribuir(obras.o04, "execOp", "operacional", "responsavel", true);
  // o05: concluída (3 setores finais + marcos resolvidos).
  await status(obras.o05, "compras", "faturado_fornecedor");
  await status(obras.o05, "engenharia", "concluido");
  await status(obras.o05, "operacional", "concluido");
  await marco(obras.o05, "nf_cliente", "concluido");
  await marco(obras.o05, "garantia", "nao_se_aplica", "Garantia direta do fabricante (fictício)");
  // o06: Usina Solar Fazenda Modelo — obra principal da Apresentação (instalação em andamento, NF concluída).
  await status(obras.o06, "compras", "faturado_fornecedor");
  await status(obras.o06, "engenharia", "aprovado");
  await status(obras.o06, "operacional", "em_instalacao");
  await marco(obras.o06, "nf_cliente", "concluido");
  await atribuir(obras.o06, "execEng", "engenharia", "responsavel", true);
  await atribuir(obras.o06, "execOp", "operacional", "responsavel", true);
  await atribuir(obras.o06, "execCompras", "compras", "responsavel", true);
  // o07: será pausada (com participante, para testar gestão de participantes em pausa).
  await status(obras.o07, "engenharia", "projeto_em_elaboracao");
  await atribuir(obras.o07, "execEng", "engenharia", "apoio");
  // o08: será cancelada.
  await status(obras.o08, "compras", "cotando");
  // o09: operacional parado + compras aguardando fornecedor.
  await status(obras.o09, "compras", "cotando");
  await aguardando(obras.o09, "compras", "fornecedor");
  await status(obras.o09, "operacional", "liberada_agendamento");
  await parado(obras.o09, "operacional", "Chuva forte na região (fictício)");
  // o10–o12: estado inicial, sem participantes.

  // Potência (kWp): a base não cria cálculo solar; entra pelo dono do banco LOCAL, como pausa/cancelamento.
  const potencias: [string, number][] = [["o06", 75], ["o01", 8.2], ["o02", 32.4], ["o03", 12.6], ["o04", 18], ["o05", 6.5], ["o09", 24.3], ["o12", 54]];
  for (const [chave, kwp] of potencias) await noBancoLocal("update public.obras set potencia_kwp = $1 where id = $2", [kwp, obras[chave]]);
  await noBancoLocal("update public.obras set pausada_em = now(), pausa_motivo = 'Cliente pediu para aguardar (fictício)' where id = $1", [obras.o07]);
  await noBancoLocal("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência do cliente (fictício)' where id = $1", [obras.o08]);

  return { senha: SENHA_E2E, empresaA, empresaB, usuarios, obras, obrasB, clientesB };
}
