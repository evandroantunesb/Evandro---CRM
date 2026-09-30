// Cria metas comerciais (receita) do mês atual para os vendedores ativos que
// ainda não têm nenhuma meta ativa cobrindo o período — pra visualizar a
// "Meta comercial do mês" e a visão de metas da equipe na tela Início sem
// depender de cadastro manual (não existe UI de Configurações > Metas ainda).
//
// Idempotente: vendedor que já tem meta ativa no período é pulado.
//
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-metas-vendedores.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "vando12star@gmail.com";
const VALOR_ALVO_MIN = 40_000;
const VALOR_ALVO_MAX = 130_000;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function periodoMesAtual() {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = agora.getUTCMonth();
  const inicio = new Date(Date.UTC(ano, mes, 1));
  const fim = new Date(Date.UTC(ano, mes + 1, 0)); // último dia do mês
  const paraIso = (d) => d.toISOString().slice(0, 10);
  const nomeMes = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return { inicio: paraIso(inicio), fim: paraIso(fim), nomeMes };
}

function valorAleatorio(min, max) {
  const bruto = min + Math.random() * (max - min);
  return Math.round(bruto / 1000) * 1000;
}

async function resolverEmpresaEAdmin() {
  const { data: usuarios, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const admin = usuarios.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  if (!admin) {
    console.error(`Não achei nenhum usuário com e-mail ${ADMIN_EMAIL}.`);
    process.exit(1);
  }

  const { data: membro, error: eMembro } = await db
    .from("empresa_membros")
    .select("id, empresa_id")
    .eq("user_id", admin.id)
    .eq("papel", "admin")
    .limit(1)
    .maybeSingle();
  if (eMembro) throw eMembro;
  if (!membro) {
    console.error(`${ADMIN_EMAIL} não é admin de nenhuma empresa.`);
    process.exit(1);
  }
  return { empresaId: membro.empresa_id, adminMembroId: membro.id };
}

async function main() {
  const { empresaId, adminMembroId } = await resolverEmpresaEAdmin();
  const { inicio, fim, nomeMes } = periodoMesAtual();

  const { data: vendedores, error: eVendedores } = await db
    .from("empresa_membros")
    .select("id, perfis(nome, email)")
    .eq("empresa_id", empresaId)
    .eq("papel", "vendedor")
    .eq("status", "ativo");
  if (eVendedores) throw eVendedores;
  if (!vendedores?.length) {
    console.log("Nenhum vendedor ativo encontrado — nada a fazer.");
    return;
  }

  const { data: metasExistentes, error: eMetas } = await db
    .from("metas")
    .select("membro_id")
    .eq("empresa_id", empresaId)
    .eq("metrica", "receita")
    .eq("ativa", true)
    .lte("periodo_inicio", fim)
    .gte("periodo_fim", inicio);
  if (eMetas) throw eMetas;
  const membrosComMeta = new Set((metasExistentes ?? []).map((m) => m.membro_id));

  const paraCriar = vendedores.filter((v) => !membrosComMeta.has(v.id));
  if (!paraCriar.length) {
    console.log(`Todos os ${vendedores.length} vendedor(es) já têm meta ativa para ${nomeMes}.`);
    return;
  }

  const linhas = paraCriar.map((v) => {
    const nome = v.perfis?.nome || v.perfis?.email || "(sem nome)";
    return {
      empresa_id: empresaId,
      titulo: `Meta comercial de ${nomeMes}`,
      metrica: "receita",
      membro_id: v.id,
      periodo_inicio: inicio,
      periodo_fim: fim,
      valor_alvo: valorAleatorio(VALOR_ALVO_MIN, VALOR_ALVO_MAX),
      ativa: true,
      criado_por: adminMembroId,
      _nome: nome,
    };
  });

  const { error: eInsert } = await db
    .from("metas")
    .insert(linhas.map(({ _nome, ...linha }) => linha));
  if (eInsert) throw eInsert;

  for (const l of linhas) {
    console.log(`  meta criada: ${l._nome} — R$ ${l.valor_alvo.toLocaleString("pt-BR")} (${inicio} a ${fim})`);
  }
  console.log(`${linhas.length} meta(s) criada(s) para ${nomeMes}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
