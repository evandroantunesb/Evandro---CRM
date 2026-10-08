import "server-only";
import { z } from "zod";
import { enviarAnexoComCliente, arquivosDoCampo } from "@/lib/anexos-servidor";
import { componentesJsonSchema, nomeKitPersonalizado, potenciaKitPersonalizadoKwp, type ComponenteKit } from "@/lib/calculadora";
import { montarLinhaCalculo } from "@/lib/calculo-servidor";
import { mensagemErro } from "@/lib/erros";
import { completarContato, type AvisoCriacao } from "@/lib/negocio-dados";
import { EDITAR_VALOR_NEGOCIO, ESCOLHER_RESPONSAVEL_NEGOCIO, pode } from "@/lib/permissoes";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { TIPOS_LIGACAO, type CategoriaAnexo, type Papel, type ResultadoAcao } from "@/lib/tipos";

/**
 * Núcleo da gravação do negócio, do kit e do contato. O cliente vem por parâmetro: as ações
 * em `@/lib/acoes/*` cuidam de sessão, papel e revalidação; os testes de banco chamam direto
 * com o cliente de cada usuário (RLS real). Recebe o FormData do formulário, como a ação.
 *
 * Sem transação entre tabelas (cada gravação é uma chamada): toda falha parcial é detectada e
 * devolvida a quem chama — nunca aparece como sucesso.
 */

export type Atual = { empresaId: string; membroId: string; papel: Papel };

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

// Valor é obrigatório nos formulários de negócio (criar e editar); captura
// pública e rodízio continuam criando negócios sem valor.
const valorObrigatorio = z
  .string({ error: "Informe o valor do negócio." })
  .trim()
  .min(1, "Informe o valor do negócio.")
  .transform((v) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
  .pipe(z.number({ error: "Valor inválido" }).positive("Informe um valor maior que zero."));

const numeroBrOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  })
  .pipe(z.number().positive().nullable());

const textoOpcional = (max?: number, mensagem?: string) =>
  (max ? z.string().trim().max(max, mensagem) : z.string().trim()).optional().transform((v) => (v ? v : null));

const ufOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toUpperCase().slice(0, 2) : null));

const esquemaNovo = z.object({
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  funil_id: z.string().uuid(),
  etapa_id: uuidOpcional,
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorObrigatorio,
  descricao: z.string().trim().optional(),
  // Dados de instalação: ficam no negócio, não no contato (que é só dado
  // pessoal/residência do cliente).
  unidade_consumidora: z.string().trim().max(60).optional(),
  padrao_cliente: z.string().trim().max(60).optional(),
  tipo_telhado: z.string().trim().max(60).optional(),
  estrutura_telhado: z.string().trim().max(120).optional(),
  contato_id: uuidOpcional,
  contato_tipo: z.enum(["pf", "pj"]).default("pf"),
  contato_nome: z.string().trim().optional(),
  contato_telefone: z.string().trim().optional(),
  contato_email: z.union([z.literal(""), z.string().trim().email("E-mail do contato inválido")]).optional(),
  // Endereço (rua, número, complemento, bairro, CEP), cidade e UF: do contato novo, ou
  // completam o contato existente só onde ele está vazio (ver `completarContato`).
  contato_endereco: textoOpcional(300, "Endereço muito longo"),
  contato_cidade: textoOpcional(120, "Cidade muito longa"),
  contato_uf: ufOpcional,
  // Calculadora solar: roda no backend a partir do kit personalizado, quando há tarifa.
  tipo_ligacao: z.enum(TIPOS_LIGACAO).optional(),
  consumo_medio_kwh: numeroBrOpcional,
  valor_fatura_medio: numeroBrOpcional,
  tarifa_kwh: numeroBrOpcional,
  componentes: componentesJsonSchema,
});

/** Campos de arquivo do formulário de criação e a categoria de cada um. */
export const ANEXOS_CRIACAO: { campo: string; categoria: CategoriaAnexo }[] = [
  { campo: "anexo_cnh_contato", categoria: "cnh" },
  { campo: "anexo_fatura_gerador", categoria: "fatura_gerador" },
  // Fotos e outros documentos: categoria geral (antes caíam como "fatura do beneficiário").
  { campo: "anexo_geral", categoria: "geral" },
];

export type ResultadoCriacao =
  | { ok: true; negocioId: string; avisos: AvisoCriacao[] }
  | { ok: false; mensagem: string; contatoId?: string };

async function inserirItensKit(supabase: SupabaseServidor, empresaId: string, negocioId: string, componentes: ComponenteKit[]) {
  return supabase
    .from("kit_componentes")
    .insert(
      componentes.map((c, i) => ({
        empresa_id: empresaId,
        negocio_id: negocioId,
        tipo: c.tipo,
        descricao: c.descricao,
        potencia_w: c.potenciaW,
        quantidade: c.quantidade,
        ordem: i,
      })),
    )
    .select("id");
}

/** Cria o negócio (e o contato, se novo). Falha antes do negócio existir = erro; depois = aviso. */
export async function criarNegocioComCliente(supabase: SupabaseServidor, atual: Atual, formData: FormData): Promise<ResultadoCriacao> {
  const dados = esquemaNovo.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  const avisos: AvisoCriacao[] = [];
  const local = { endereco: d.contato_endereco, cidade: d.contato_cidade, uf: d.contato_uf };

  let contatoId = d.contato_id;
  let contatoCriado: string | undefined;
  if (contatoId) {
    const { data: existente } = await supabase.from("contatos").select("id, endereco, cidade, uf").eq("id", contatoId).maybeSingle();
    if (!existente) return { ok: false, mensagem: "Contato não encontrado." };
    const { alteracoes, divergentes } = completarContato(existente, local);
    if (divergentes.length) avisos.push("contato_mantido");
    if (Object.keys(alteracoes).length) {
      const { data, error } = await supabase.from("contatos").update(alteracoes).eq("id", contatoId).select("id");
      if (error || !data?.length) avisos.push("contato");
    }
  } else {
    if (!d.contato_nome || d.contato_nome.length < 2) return { ok: false, mensagem: "Informe o nome do contato." };
    if (!d.contato_telefone) return { ok: false, mensagem: "Informe o telefone do contato." };
    const { data: contato, error } = await supabase
      .from("contatos")
      .insert({
        empresa_id: atual.empresaId,
        tipo: d.contato_tipo,
        nome: d.contato_nome,
        telefone: d.contato_telefone || null,
        email: d.contato_email || null,
        ...local,
      })
      .select("id")
      .single();
    if (error || !contato) return { ok: false, mensagem: "Não foi possível salvar o contato." };
    contatoId = contatoCriado = contato.id;
  }

  // Etapa pré-selecionada (ex.: "Adicionar negócio" numa coluna do Kanban), se pertencer ao funil e estiver ativa;
  // senão cai na etapa inicial do funil, como sempre foi.
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
      titulo: d.titulo,
      funil_id: d.funil_id,
      etapa_id: etapaId,
      origem_id: d.origem_id,
      // Só admin e gestor escolhem o responsável; os demais ficam como responsáveis.
      responsavel_id: pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) ? d.responsavel_id : null,
      valor: d.valor,
      descricao: d.descricao || null,
      contato_id: contatoId,
      unidade_consumidora: d.unidade_consumidora || null,
      padrao_cliente: d.padrao_cliente || null,
      tipo_telhado: d.tipo_telhado || null,
      estrutura_telhado: d.estrutura_telhado || null,
      consumo_medio_kwh: d.consumo_medio_kwh,
      valor_conta_energia: d.valor_fatura_medio,
    })
    .select("id")
    .single();
  if (error || !negocio) {
    // O contato novo já foi gravado: devolve o id para a tela seguir com ele (sem duplicar no reenvio).
    return {
      ok: false,
      mensagem: mensagemErro(error, "Não foi possível criar o negócio. Confira o responsável escolhido."),
      contatoId: contatoCriado,
    };
  }

  // Itens do kit são gravados com ou sem tarifa; o cálculo só quando há tarifa.
  if (d.componentes.length) {
    const { error: erroKit } = await inserirItensKit(supabase, atual.empresaId, negocio.id, d.componentes);
    if (erroKit) {
      avisos.push("kit");
    } else if (d.tipo_ligacao && d.tarifa_kwh != null) {
      const montado = await montarLinhaCalculo(supabase, atual.empresaId, {
        kitNome: nomeKitPersonalizado(d.componentes),
        potenciaKwp: potenciaKitPersonalizadoKwp(d.componentes),
        precoKit: d.valor ?? 0,
        tipoLigacao: d.tipo_ligacao,
        consumoMedioKwh: d.consumo_medio_kwh,
        valorFaturaMedio: d.valor_fatura_medio,
        tarifaKwh: d.tarifa_kwh,
      });
      const erroCalculo = montado.ok
        ? (
            await supabase
              .from("calculos_solares")
              .insert({ ...montado.linha, negocio_id: negocio.id, atualizado_por: atual.membroId, criado_por: atual.membroId })
          ).error
        : true;
      if (erroCalculo) avisos.push("calculo");
    }
  }

  // Anexos escolhidos ainda na criação: só dá para subir depois que o negócio existe (pasta por negócio).
  const envios = await Promise.all(
    ANEXOS_CRIACAO.flatMap(({ campo, categoria }) =>
      arquivosDoCampo(formData, campo).map((arquivo) =>
        enviarAnexoComCliente(supabase, { empresaId: atual.empresaId, negocioId: negocio.id, arquivo, categoria }),
      ),
    ),
  );
  if (envios.some((e) => !e.ok)) avisos.push("anexos");

  return { ok: true, negocioId: negocio.id, avisos };
}

// A etapa não é editada aqui: mudar de etapa é só pelo "Mover etapa"/Kanban (`moverEtapa`),
// que exige comentário e impede o SDR de cair numa etapa que fecha o negócio.
const esquemaEdicao = z.object({
  negocioId: z.string().uuid(),
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorObrigatorio,
  descricao: z.string().trim().optional(),
  unidade_consumidora: z.string().trim().max(60).optional(),
  padrao_cliente: z.string().trim().max(60).optional(),
  tipo_telhado: z.string().trim().max(60).optional(),
  consumo_medio_kwh: numeroBrOpcional,
  valor_conta_energia: numeroBrOpcional,
});

/** Salva "Dados do negócio" e, se escolhida, anexa a fatura de energia. */
export async function editarNegocioComCliente(
  supabase: SupabaseServidor,
  atual: Atual,
  formData: FormData,
): Promise<NonNullable<ResultadoAcao> & { negocioId?: string }> {
  const dados = esquemaEdicao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const { data, error } = await supabase
    .from("negocios")
    .update({
      titulo: d.titulo,
      origem_id: d.origem_id,
      descricao: d.descricao || null,
      unidade_consumidora: d.unidade_consumidora || null,
      padrao_cliente: d.padrao_cliente || null,
      tipo_telhado: d.tipo_telhado || null,
      consumo_medio_kwh: d.consumo_medio_kwh,
      valor_conta_energia: d.valor_conta_energia,
      // SDR não pode alterar o valor financeiro do negócio (spec RAION_SDR_REGRAS_PERMISSOES §39) — só na criação.
      ...(pode(atual.papel, EDITAR_VALOR_NEGOCIO) ? { valor: d.valor } : {}),
      ...(pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) && d.responsavel_id ? { responsavel_id: d.responsavel_id } : {}),
    })
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  const [fatura] = arquivosDoCampo(formData, "anexo_fatura_energia");
  if (fatura) {
    const envio = await enviarAnexoComCliente(supabase, {
      empresaId: atual.empresaId,
      negocioId: d.negocioId,
      arquivo: fatura,
      categoria: "fatura_gerador",
    });
    if (!envio.ok) {
      return { ok: false, negocioId: d.negocioId, mensagem: `Dados salvos, mas a fatura não foi anexada (${envio.motivo}). Envie de novo.` };
    }
  }
  return { ok: true, negocioId: d.negocioId, mensagem: "Salvo." };
}

const esquemaKit = z.object({
  negocioId: z.string().uuid(),
  tipoLigacao: z.enum(TIPOS_LIGACAO),
  consumoMedioKwh: numeroBrOpcional,
  valorFaturaMedio: numeroBrOpcional,
  tarifaKwh: numeroBrOpcional,
  estruturaTelhado: z.string().trim().max(120).optional(),
  componentes: componentesJsonSchema,
  observacoes: z.string().trim().max(2000, "Máximo de 2.000 caracteres").optional(),
});

/**
 * Salva os itens do kit (com ou sem tarifa) e, com tarifa, recalcula o cálculo solar. O preço
 * usado no payback é o valor do negócio (o kit personalizado não tem preço por item).
 *
 * Ordem segura: o cálculo é montado antes de gravar qualquer coisa; os itens novos entram antes
 * de apagar os antigos (se a inserção falha, o kit anterior continua inteiro).
 */
export async function salvarKitComCliente(
  supabase: SupabaseServidor,
  atual: Atual,
  formData: FormData,
): Promise<NonNullable<ResultadoAcao> & { negocioId?: string }> {
  const dados = esquemaKit.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const [{ data: negocio }, { data: calculoAtual }, { data: itensAntigos }] = await Promise.all([
    supabase.from("negocios").select("valor").eq("id", d.negocioId).maybeSingle(),
    supabase.from("calculos_solares").select("id").eq("negocio_id", d.negocioId).maybeSingle(),
    supabase.from("kit_componentes").select("id").eq("negocio_id", d.negocioId),
  ]);
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };

  let montado: Awaited<ReturnType<typeof montarLinhaCalculo>> | null = null;
  if (d.tarifaKwh != null) {
    montado = await montarLinhaCalculo(supabase, atual.empresaId, {
      kitNome: nomeKitPersonalizado(d.componentes),
      potenciaKwp: potenciaKitPersonalizadoKwp(d.componentes),
      precoKit: negocio.valor ?? 0,
      tipoLigacao: d.tipoLigacao,
      consumoMedioKwh: d.consumoMedioKwh,
      valorFaturaMedio: d.valorFaturaMedio,
      tarifaKwh: d.tarifaKwh,
    });
    if (!montado.ok) return { ok: false, mensagem: `${montado.mensagem} Nada foi alterado.` };
  } else if (calculoAtual) {
    return { ok: false, mensagem: "Informe a tarifa para recalcular — sem ela o cálculo salvo ficaria desatualizado. Nada foi alterado." };
  }

  // Substitui a lista de itens: novos primeiro, antigos depois.
  let novos: string[] = [];
  if (d.componentes.length) {
    const { data: inseridos, error } = await inserirItensKit(supabase, atual.empresaId, d.negocioId, d.componentes);
    if (error || !inseridos) return { ok: false, mensagem: "Não foi possível salvar os itens do kit. Nada foi alterado." };
    novos = inseridos.map((i) => i.id);
  }
  const antigos = (itensAntigos ?? []).map((i) => i.id);
  if (antigos.length) {
    const { error } = await supabase.from("kit_componentes").delete().in("id", antigos);
    if (error) {
      if (novos.length) await supabase.from("kit_componentes").delete().in("id", novos);
      return { ok: false, mensagem: "Não foi possível substituir os itens do kit. Nada foi alterado." };
    }
  }

  if (montado?.ok) {
    const { error } = await supabase.from("calculos_solares").upsert(
      {
        ...montado.linha,
        negocio_id: d.negocioId,
        observacoes: d.observacoes || null,
        atualizado_por: atual.membroId,
        criado_por: atual.membroId,
      },
      { onConflict: "negocio_id", ignoreDuplicates: false },
    );
    if (error) {
      return { ok: false, negocioId: d.negocioId, mensagem: mensagemErro(error, "Itens do kit salvos, mas o cálculo não foi atualizado. Salve de novo.") };
    }
  }

  const { data: estrutura, error: erroEstrutura } = await supabase
    .from("negocios")
    .update({ estrutura_telhado: d.estruturaTelhado || null })
    .eq("id", d.negocioId)
    .select("id");
  if (erroEstrutura || !estrutura?.length) {
    return { ok: false, negocioId: d.negocioId, mensagem: "Kit salvo, mas a estrutura do telhado não foi gravada. Salve de novo." };
  }

  return {
    ok: true,
    negocioId: d.negocioId,
    mensagem: montado ? "Kit e cálculo salvos." : "Itens do kit salvos. Informe a tarifa para calcular geração e economia.",
  };
}

const esquemaContato = z.object({
  contatoId: z.string().uuid(),
  tipo: z.enum(["pf", "pj"]),
  nome: z.string().trim().min(2, "Informe o nome"),
  telefone: z.string({ error: "Informe o telefone" }).trim().min(1, "Informe o telefone"),
  telefone2: textoOpcional(),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]).transform((v) => v || null),
  documento: textoOpcional(),
  endereco: textoOpcional(300, "Endereço muito longo"),
  cidade: textoOpcional(),
  uf: ufOpcional,
});

/** Salva a ficha do contato (inclui o endereço, que antes não era editável). */
export async function editarContatoComCliente(supabase: SupabaseServidor, formData: FormData): Promise<NonNullable<ResultadoAcao>> {
  const dados = esquemaContato.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const { contatoId, ...campos } = dados.data;

  const { data, error } = await supabase.from("contatos").update(campos).eq("id", contatoId).select("id");
  if (error || !data?.length) return { ok: false, mensagem: "Não foi possível salvar o contato." };
  return { ok: true, mensagem: "Contato salvo." };
}
