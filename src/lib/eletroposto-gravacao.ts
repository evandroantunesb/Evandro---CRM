import "server-only";
import { z } from "zod";
import { CATALOGO_ELETROPOSTO, normalizarModelos, precosDoCatalogo, whatsappValido, type ModeloEletroposto } from "@/lib/eletroposto";
import { mensagemErro } from "@/lib/erros";
import { completarContato, type AvisoCriacao } from "@/lib/negocio-dados";
import type { Atual, ResultadoCriacao } from "@/lib/negocios-gravacao";
import { ESCOLHER_RESPONSAVEL_NEGOCIO, PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Núcleo da gravação do negócio de eletroposto (como `negocios-gravacao.ts` para o solar): o cliente vem por
 * parâmetro, as ações em `@/lib/acoes/eletroposto.ts` cuidam de sessão e revalidação. Os preços nunca vêm do
 * formulário: são sempre os do catálogo, congelados no registro no momento em que os modelos são escolhidos.
 */

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

const simNao = (rotulo: string) =>
  z.enum(["sim", "nao"], { error: `Informe se o cliente ${rotulo}.` }).transform((v) => v === "sim");

const esquemaNovo = z.object({
  funil_id: z.string().uuid(),
  etapa_id: uuidOpcional,
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  contato_id: uuidOpcional,
  contato_tipo: z.enum(["pf", "pj"]).default("pj"),
  contato_nome: z.string().trim().max(100, "Nome muito longo (máximo de 100 caracteres).").optional(),
  contato_telefone: z.string().trim().optional(),
  contato_endereco: z.string().trim().max(240, "Endereço muito longo (máximo de 240 caracteres).").optional(),
  local_proprio: simNao("tem local próprio para a instalação"),
  usina_fv: simNao("tem usina fotovoltaica para fornecer a energia"),
});

const MENSAGEM_SEM_MODELO = "Escolha pelo menos um modelo de eletroposto.";

/** Modelos marcados no formulário (campo `modelos` repetido), na ordem do catálogo. */
function modelosDoFormulario(formData: FormData): ModeloEletroposto[] {
  return normalizarModelos(formData.getAll("modelos"));
}

/** Com um modelo só, o negócio já tem valor; com vários, fica sem valor até o cliente escolher. */
export function valorDoNegocio(modelos: readonly ModeloEletroposto[]): number | null {
  return modelos.length === 1 ? CATALOGO_ELETROPOSTO[modelos[0]].preco : null;
}

/** Cria o contato (ou completa o existente), o negócio de eletroposto e o registro com os modelos e a proposta. */
export async function criarNegocioEletropostoComCliente(supabase: SupabaseServidor, atual: Atual, formData: FormData): Promise<ResultadoCriacao> {
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "Seu papel não pode criar negócio de eletroposto." };
  const dados = esquemaNovo.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const modelos = modelosDoFormulario(formData);
  if (!modelos.length) return { ok: false, mensagem: MENSAGEM_SEM_MODELO };
  const endereco = d.contato_endereco || null;
  if (!d.contato_id && !endereco) return { ok: false, mensagem: "Informe o endereço do cliente." };

  const avisos: AvisoCriacao[] = [];
  let contatoId = d.contato_id;
  let contatoCriado: string | undefined;
  let nomeCliente = d.contato_nome ?? "";
  if (contatoId) {
    const { data: existente } = await supabase.from("contatos").select("id, nome, endereco, cidade, uf").eq("id", contatoId).maybeSingle();
    if (!existente) return { ok: false, mensagem: "Contato não encontrado." };
    nomeCliente = existente.nome;
    const { alteracoes, divergentes } = completarContato(existente, { endereco, cidade: null, uf: null });
    if (divergentes.length) avisos.push("contato_mantido");
    if (Object.keys(alteracoes).length) {
      const { data, error } = await supabase.from("contatos").update(alteracoes).eq("id", contatoId).select("id");
      if (error || !data?.length) avisos.push("contato");
    }
  } else {
    if (!d.contato_nome || d.contato_nome.length < 2) return { ok: false, mensagem: "Informe o nome do cliente." };
    if (!d.contato_telefone || !whatsappValido(d.contato_telefone)) {
      return { ok: false, mensagem: "WhatsApp inválido. Informe DDD e celular no formato (45) 99999-9999." };
    }
    const { data: contato, error } = await supabase
      .from("contatos")
      .insert({ empresa_id: atual.empresaId, tipo: d.contato_tipo, nome: d.contato_nome, telefone: d.contato_telefone, endereco })
      .select("id")
      .single();
    if (error || !contato) return { ok: false, mensagem: "Não foi possível salvar o contato." };
    contatoId = contatoCriado = contato.id;
  }

  // Etapa pré-selecionada (coluna do Kanban), se for do funil e estiver ativa; senão a etapa inicial do funil.
  let etapaId = d.etapa_id;
  if (etapaId) {
    const { data: etapa } = await supabase.from("etapas").select("id").eq("id", etapaId).eq("funil_id", d.funil_id).eq("ativa", true).maybeSingle();
    etapaId = etapa?.id ?? null;
  }
  if (!etapaId) {
    const { data: etapaInicial } = await supabase
      .from("etapas")
      .select("id")
      .eq("funil_id", d.funil_id)
      .eq("ativa", true)
      .order("inicial", { ascending: false })
      .order("ordem")
      .limit(1)
      .maybeSingle();
    if (!etapaInicial) return { ok: false, mensagem: "O funil não tem etapas ativas.", contatoId: contatoCriado };
    etapaId = etapaInicial.id;
  }

  const { data: negocio, error } = await supabase
    .from("negocios")
    .insert({
      empresa_id: atual.empresaId,
      tipo: "eletroposto",
      titulo: `Eletroposto — ${nomeCliente.trim()}`.slice(0, 120),
      funil_id: d.funil_id,
      etapa_id: etapaId,
      origem_id: d.origem_id,
      // Só admin e gestor escolhem o responsável; os demais ficam como responsáveis.
      responsavel_id: pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) ? d.responsavel_id : null,
      valor: valorDoNegocio(modelos),
      contato_id: contatoId,
    })
    .select("id")
    .single();
  if (error || !negocio) {
    return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar o negócio."), contatoId: contatoCriado };
  }

  const { error: erroEletroposto } = await supabase.from("negocios_eletroposto").insert({
    negocio_id: negocio.id,
    empresa_id: atual.empresaId,
    local_proprio: d.local_proprio,
    usina_fv: d.usina_fv,
    modelos,
    precos: precosDoCatalogo(modelos),
    criado_por: atual.membroId,
    atualizado_por: atual.membroId,
  });
  if (erroEletroposto) avisos.push("eletroposto");

  return { ok: true, negocioId: negocio.id, empresaId: atual.empresaId, avisos };
}

const esquemaEdicao = z.object({
  negocioId: z.string().uuid(),
  local_proprio: simNao("tem local próprio para a instalação"),
  usina_fv: simNao("tem usina fotovoltaica para fornecer a energia"),
});

/**
 * Salva local próprio, usina FV e os modelos da proposta (cria o registro se a criação não o gravou). Modelos
 * diferentes renovam a data da proposta e congelam os preços do catálogo de agora; os mesmos modelos mantêm
 * a data e os preços já congelados. O link da proposta não muda.
 */
export async function salvarEletropostoComCliente(supabase: SupabaseServidor, atual: Atual, formData: FormData): Promise<NonNullable<ResultadoAcao>> {
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "Seu papel não pode editar o eletroposto." };
  const dados = esquemaEdicao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const modelos = modelosDoFormulario(formData);
  if (!modelos.length) return { ok: false, mensagem: MENSAGEM_SEM_MODELO };

  const [{ data: negocio }, { data: registro, error: erroLeitura }] = await Promise.all([
    supabase.from("negocios").select("id, empresa_id, tipo").eq("id", d.negocioId).maybeSingle(),
    supabase.from("negocios_eletroposto").select("modelos").eq("negocio_id", d.negocioId).maybeSingle(),
  ]);
  if (!negocio || negocio.tipo !== "eletroposto") return { ok: false, mensagem: "Negócio de eletroposto não encontrado." };
  if (erroLeitura) return { ok: false, mensagem: "Não foi possível ler o eletroposto. Nada foi alterado." };

  const mudouModelos = !registro || registro.modelos.join() !== modelos.join();
  const base = { local_proprio: d.local_proprio, usina_fv: d.usina_fv, atualizado_por: atual.membroId };
  const novosModelos = { modelos, precos: precosDoCatalogo(modelos), emitida_em: new Date().toISOString() };

  const { error } = registro
    ? await supabase
        .from("negocios_eletroposto")
        .update(mudouModelos ? { ...base, ...novosModelos } : base)
        .eq("negocio_id", d.negocioId)
    : await supabase
        .from("negocios_eletroposto")
        .insert({ negocio_id: d.negocioId, empresa_id: negocio.empresa_id, criado_por: atual.membroId, ...base, ...novosModelos });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o eletroposto.") };
  return { ok: true, mensagem: mudouModelos ? "Salvo. A proposta foi atualizada com os modelos escolhidos." : "Salvo." };
}
