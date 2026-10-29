import "server-only";
import { z } from "zod";
import { ANEXOS_CRIACAO, problemaArquivo } from "@/lib/anexos-regras";
import { arquivoMetaSchema } from "@/lib/anexos-servidor";
import { componentesJsonSchema, nomeKitPersonalizado, potenciaKitPersonalizadoKwp, type ComponenteKit } from "@/lib/calculadora";
import { precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { resolverConsumo } from "@/lib/consumo-estimado";
import {
  CASAS_TARIFA,
  consumoComoPersistido,
  mensagemEstimativaIncompleta,
  pendenciasDaEntrada,
  valorComoPersistido,
} from "@/lib/calculo-reproduzivel";
import { carregarVigencia, mensagemDeRecusa, motivosDaAcao } from "@/lib/calculo-vigencia";
import { montarLinhaCalculo } from "@/lib/calculo-servidor";
import { atualizarPrecoDoCalculo, autorizarGravacaoCalculo, gravarLinhaCalculo, marcarCalculoDesatualizado } from "@/lib/calculo-gravacao";
import type { Pendencia } from "@/lib/estimativa-financeira";
import { cnpjValido, cpfValido, formatarDocumento, soDigitos } from "@/lib/dados-cliente-contrato";
import { mensagemErro } from "@/lib/erros";
import { lerNumeroBr, MENSAGEM_NUMERO_BR } from "@/lib/formatacao";
import {
  completarContato,
  montarEndereco,
  MENSAGEM_CALCULO_NAO_CONFERIDO,
  MENSAGEM_REMOCAO_COM_CALCULO,
  MENSAGEM_REMOCAO_SEM_CONFIRMACAO,
  type AvisoCriacao,
} from "@/lib/negocio-dados";
import { EDITAR_VALOR_NEGOCIO, ESCOLHER_RESPONSAVEL_NEGOCIO, pode } from "@/lib/permissoes";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { BASES_TRIBUTARIAS } from "@/lib/tarifa-gd";
import {
  ROTULO_TIPO_CLIENTE_QUALIF,
  TIPOS_CLIENTE_QUALIF,
  TIPOS_LIGACAO,
  type Papel,
  type ResultadoAcao,
  type TipoClienteQualif,
} from "@/lib/tipos";

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
  .transform(lerNumeroBr)
  .pipe(z.number({ error: `Valor do negócio: ${MENSAGEM_NUMERO_BR}` }).positive("Informe um valor maior que zero."));

// Edição: vazio vira null aqui; a obrigatoriedade depende do tipo do negócio (lido do banco), ver `editarNegocioComCliente`.
const valorEdicao = z
  .string()
  .optional()
  .transform(lerNumeroBr)
  .pipe(z.number({ error: `Valor do negócio: ${MENSAGEM_NUMERO_BR}` }).positive("Informe um valor maior que zero.").nullable());

const numeroBrOpcional = z
  .string()
  .optional()
  .transform(lerNumeroBr)
  .pipe(z.number({ error: MENSAGEM_NUMERO_BR }).positive("Informe um valor maior que zero.").nullable());

const textoOpcional = (max?: number, mensagem?: string) =>
  (max ? z.string().trim().max(max, mensagem) : z.string().trim()).optional().transform((v) => (v ? v : null));

const ufOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toUpperCase().slice(0, 2) : null));

/**
 * Dados dos arquivos do cadastro, só para recusar vazio ou grande demais antes de criar qualquer
 * coisa. O conteúdo vai depois, direto do navegador ao Storage, nunca pela ação.
 */
const anexosCriacaoSchema = z
  .string()
  .default("[]")
  .transform((v, ctx) => {
    try {
      const r = z
        .array(arquivoMetaSchema.extend({ campo: z.string().refine((c) => ANEXOS_CRIACAO.some((a) => a.campo === c)) }))
        .max(30, "No máximo 30 arquivos")
        .safeParse(JSON.parse(v));
      if (r.success) return r.data;
    } catch {}
    ctx.addIssue({ code: "custom", message: "Arquivos inválidos" });
    return z.NEVER;
  });

const esquemaNovo = z.object({
  // Vazio = gerado pelo servidor ("Residencial — Nome do cliente"); o cadastro mostra a mesma sugestão.
  titulo: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().min(2, "Informe o nome do negócio").nullable()),
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
  tarifa_efetiva_kwh: numeroBrOpcional,
  valor_fatura_medio: numeroBrOpcional,
  tarifa_kwh: numeroBrOpcional,
  // Base declarada da tarifa (TE + TUSD): sem ela o cálculo fica incompleto. O cadastro só a declara ao usar a tarifa oficial.
  tarifa_base_tributaria: z
    .enum([...BASES_TRIBUTARIAS, ""])
    .optional()
    .transform((v) => (v ? v : null)),
  // Qualificação já no cadastro (mesmas regras da ficha): tipo de cliente e distribuidora entram no contexto do cálculo.
  qualif_tipo_cliente: z
    .enum([...TIPOS_CLIENTE_QUALIF, ""])
    .optional()
    .transform((v) => (v ? v : null)),
  qualif_distribuidora: textoOpcional(80, "Distribuidora muito longa"),
  componentes: componentesJsonSchema,
  anexos: anexosCriacaoSchema,
});

/** Título padrão quando o cadastro não traz um: tipo de cliente (ou "Negócio") e o nome do cliente. */
export function tituloPadraoNegocio(tipoCliente: TipoClienteQualif | null, nomeCliente: string): string {
  return `${tipoCliente ? ROTULO_TIPO_CLIENTE_QUALIF[tipoCliente] : "Negócio"} — ${nomeCliente.trim()}`.slice(0, 120);
}

/** Os arquivos vão depois, do navegador direto ao Storage (`enviarArquivos`), para `empresaId/negocioId`. */
export type EstimativaCriacao = { estado: "incompleta"; mensagem: string; pendencias: Pendencia[] };

/**
 * `estimativa` (opcional) = informação de que a estimativa financeira ficou incompleta (não é falha nem aviso de erro):
 * negócio e kit foram salvos e, havendo consumo em kWh, o resultado técnico foi gravado em `calculos_solares` como
 * `incompleto` (sem economia, conta, Fio B nem payback).
 */
export type ResultadoCriacao =
  | { ok: true; negocioId: string; empresaId: string; avisos: AvisoCriacao[]; estimativa?: EstimativaCriacao }
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
  // Arquivo vazio ou grande demais: recusa antes de gravar qualquer coisa.
  const problema = d.anexos.map(problemaArquivo).find(Boolean);
  if (problema) return { ok: false, mensagem: `${problema} Escolha outro arquivo.` };
  const avisos: AvisoCriacao[] = [];
  const local = { endereco: d.contato_endereco, cidade: d.contato_cidade, uf: d.contato_uf };

  let contatoId = d.contato_id;
  let contatoCriado: string | undefined;
  let nomeCliente = d.contato_nome ?? "";
  if (contatoId) {
    const { data: existente } = await supabase.from("contatos").select("id, nome, endereco, cidade, uf").eq("id", contatoId).maybeSingle();
    if (!existente) return { ok: false, mensagem: "Contato não encontrado." };
    nomeCliente = existente.nome;
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

  const consumoCriacao = resolverConsumo(d.consumo_medio_kwh, d.valor_fatura_medio, d.tarifa_efetiva_kwh);
  const { data: negocio, error } = await supabase
    .from("negocios")
    .insert({
      empresa_id: atual.empresaId,
      titulo: d.titulo ?? tituloPadraoNegocio(d.qualif_tipo_cliente, nomeCliente),
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
      consumo_medio_kwh: consumoCriacao.origem === "informado" ? consumoCriacao.kwh : null,
      consumo_estimado_kwh: consumoCriacao.origem === "estimado" ? consumoCriacao.kwh : null,
      tarifa_efetiva_kwh: consumoCriacao.tarifaEfetiva,
      valor_conta_energia: d.valor_fatura_medio,
      qualif_tipo_cliente: d.qualif_tipo_cliente,
      qualif_distribuidora: d.qualif_distribuidora,
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

  // Itens do kit são gravados com ou sem tarifa; com tarifa, o cálculo usa a qualificação do cadastro (completo quando
  // tipo de cliente, distribuidora, tarifa e base fecham com a referência oficial; senão, incompleto com as pendências).
  let estimativa: EstimativaCriacao | undefined;
  if (d.componentes.length) {
    const { error: erroKit } = await inserirItensKit(supabase, atual.empresaId, negocio.id, d.componentes);
    if (erroKit) {
      avisos.push("kit");
    } else if (d.tipo_ligacao && d.tarifa_kwh != null) {
      // O cálculo só é gravado pelo servidor, depois da autorização da sessão no negócio recém-criado.
      const autorizado = await autorizarGravacaoCalculo(supabase, negocio.id);
      const montado = await montarLinhaCalculo(supabase, autorizado.ok ? autorizado.autorizacao.empresaId : atual.empresaId, {
        kitNome: nomeKitPersonalizado(d.componentes),
        potenciaKwp: potenciaKitPersonalizadoKwp(d.componentes),
        precoKit: d.valor ?? 0,
        tipoLigacao: d.tipo_ligacao,
        consumoMedioKwh: consumoCriacao.kwh,
        valorFaturaMedio: d.valor_fatura_medio,
        tarifaKwh: d.tarifa_kwh,
        tarifaBaseTributaria: d.tarifa_base_tributaria,
      }, { tipoCliente: d.qualif_tipo_cliente, distribuidoraInformada: d.qualif_distribuidora });
      if (montado.ok) {
        const { error: erroCalculo } = autorizado.ok
          ? await gravarLinhaCalculo(autorizado.autorizacao, montado.linha, { substituir: false })
          : { error: true };
        if (erroCalculo) avisos.push("calculo");
      } else if (montado.incompleta) {
        // Informação, não falha: kit e negócio salvos; o resultado técnico (sem parte financeira) é gravado quando
        // há consumo em kWh. Falha ao gravá-lo vira aviso "calculo", como no ramo completo.
        if (montado.linha) {
          const { error: erroCalculo } = autorizado.ok
            ? await gravarLinhaCalculo(autorizado.autorizacao, montado.linha, { substituir: false })
            : { error: true };
          if (erroCalculo) avisos.push("calculo");
        }
        estimativa = { estado: "incompleta", mensagem: montado.mensagem, pendencias: montado.pendencias };
      } else {
        avisos.push("calculo");
      }
    }
  }

  return { ok: true, negocioId: negocio.id, empresaId: atual.empresaId, avisos, ...(estimativa ? { estimativa } : {}) };
}

// A etapa não é editada aqui: mudar de etapa é só pelo "Mover etapa"/Kanban (`moverEtapa`),
// que exige comentário e impede o SDR de cair numa etapa que fecha o negócio.
const esquemaEdicao = z.object({
  negocioId: z.string().uuid(),
  titulo: z.string().trim().min(2, "Informe o nome do negócio").optional(),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorEdicao,
  descricao: z.string().trim().optional(),
  unidade_consumidora: z.string().trim().max(60).optional(),
  padrao_cliente: z.string().trim().max(60).optional(),
  tipo_telhado: z.string().trim().max(60).optional(),
  consumo_medio_kwh: numeroBrOpcional,
  tarifa_efetiva_kwh: numeroBrOpcional,
  valor_conta_energia: numeroBrOpcional,
  // Campo "month" do navegador (AAAA-MM); vazio limpa a previsão. Gravado como 1º dia do mês.
  fechamento_previsto: z
    .union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês previsto inválido"), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? `${v}-01` : null)),
});

/**
 * Salva os dados do negócio. A ficha manda em dois formulários: "Oportunidade" (nome, origem, responsável, valor,
 * previsão, descrição) e "Conta de luz e local" (campos solares). Só a parte presente no formulário é gravada:
 * a outra nunca é apagada por não ter vindo. A fatura vai depois, direto ao Storage (ver `enviarArquivos`).
 */
export async function editarNegocioComCliente(
  supabase: SupabaseServidor,
  atual: Atual,
  formData: FormData,
): Promise<NonNullable<ResultadoAcao> & { negocioId?: string }> {
  const temComercial = formData.has("titulo");
  const temTecnico = formData.has("valor_conta_energia");
  if (!temComercial && !temTecnico) return { ok: false, mensagem: "Nada para salvar." };
  const dados = esquemaEdicao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  // Eletroposto: valor opcional (vários modelos na proposta = sem valor até o cliente escolher) e sem os campos
  // solares, que nem aparecem no formulário. O tipo vem do banco, nunca do formulário.
  const { data: registro } = await supabase.from("negocios").select("tipo").eq("id", d.negocioId).maybeSingle();
  const ehEletroposto = registro?.tipo === "eletroposto";
  if (temComercial && !ehEletroposto && d.valor == null) return { ok: false, mensagem: "Informe o valor do negócio." };

  const consumoEdicao = resolverConsumo(d.consumo_medio_kwh, d.valor_conta_energia, d.tarifa_efetiva_kwh);
  const camposSolares = ehEletroposto || !temTecnico
    ? {}
    : {
        unidade_consumidora: d.unidade_consumidora || null,
        padrao_cliente: d.padrao_cliente || null,
        tipo_telhado: d.tipo_telhado || null,
        consumo_medio_kwh: consumoEdicao.origem === "informado" ? consumoEdicao.kwh : null,
        consumo_estimado_kwh: consumoEdicao.origem === "estimado" ? consumoEdicao.kwh : null,
        tarifa_efetiva_kwh: consumoEdicao.tarifaEfetiva,
        valor_conta_energia: d.valor_conta_energia,
      };

  const { data, error } = await supabase
    .from("negocios")
    .update({
      ...(temComercial
        ? {
            titulo: d.titulo!,
            origem_id: d.origem_id,
            descricao: d.descricao || null,
            ...(d.fechamento_previsto !== undefined ? { fechamento_previsto: d.fechamento_previsto } : {}),
            // SDR não pode alterar o valor financeiro do negócio (spec RAION_SDR_REGRAS_PERMISSOES §39) — só na criação.
            ...(pode(atual.papel, EDITAR_VALOR_NEGOCIO) ? { valor: d.valor } : {}),
            ...(pode(atual.papel, ESCOLHER_RESPONSAVEL_NEGOCIO) && d.responsavel_id ? { responsavel_id: d.responsavel_id } : {}),
          }
        : {}),
      ...camposSolares,
    })
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  return { ok: true, negocioId: d.negocioId, mensagem: "Salvo." };
}

const esquemaKit = z.object({
  negocioId: z.string().uuid(),
  tipoLigacao: z.enum(TIPOS_LIGACAO),
  consumoMedioKwh: numeroBrOpcional,
  valorFaturaMedio: numeroBrOpcional,
  tarifaKwh: numeroBrOpcional,
  // Base tributária declarada da tarifa (contrato, seção 5); vazio = não declarada (estimativa incompleta).
  tarifaBaseTributaria: z
    .enum(["sem_tributos", "com_tributos", ""])
    .optional()
    .transform((v) => (v ? v : null)),
  estruturaTelhado: z.string().trim().max(120).optional(),
  componentes: componentesJsonSchema,
  observacoes: z.string().trim().max(2000, "Máximo de 2.000 caracteres").optional(),
  // Remover um kit salvo (lista vazia) só com confirmação explícita da tela.
  confirmarRemocao: z.literal("sim").optional(),
});


type ItemKitSalvo = {
  id: string;
  empresa_id: string;
  negocio_id: string;
  tipo: ComponenteKit["tipo"];
  descricao: string;
  potencia_w: number | null;
  quantidade: number;
  ordem: number;
};

/**
 * Volta o kit do negócio exatamente para `antigos` (apaga o que sobrou, reinsere o que sumiu, com
 * os mesmos ids). Idempotente. Devolve se conseguiu confirmar o estado anterior.
 */
async function restaurarKit(supabase: SupabaseServidor, negocioId: string, antigos: ItemKitSalvo[]): Promise<boolean> {
  const { data: atuais, error } = await supabase.from("kit_componentes").select("id").eq("negocio_id", negocioId);
  if (error || !atuais) return false;
  const idsAntigos = new Set(antigos.map((a) => a.id));
  const idsAtuais = new Set(atuais.map((a) => a.id));
  const sobrando = atuais.filter((a) => !idsAntigos.has(a.id)).map((a) => a.id);
  const faltando = antigos.filter((a) => !idsAtuais.has(a.id));
  // Reinsere antes de apagar: o kit nunca fica vazio no meio do caminho (com cálculo salvo,
  // o banco recusa kit vazio — kit_com_calculo_nao_esvazia).
  if (faltando.length) {
    const { error: erro } = await supabase.from("kit_componentes").insert(faltando);
    if (erro) return false;
  }
  if (sobrando.length) {
    const { data, error: erro } = await supabase.from("kit_componentes").delete().in("id", sobrando).select("id");
    if (erro || data?.length !== sobrando.length) return false;
  }
  return true;
}

const KIT_INCERTO = "O kit não pôde ser conferido depois da falha: confira os itens e salve de novo (salvar de novo substitui a lista inteira).";

/**
 * Salva os itens do kit (com ou sem tarifa) e, com tarifa, recalcula o cálculo solar. O preço
 * usado no payback é o valor do negócio (o kit personalizado não tem preço por item).
 *
 * Sem transação no banco: o cálculo é montado antes de gravar qualquer coisa; os itens novos
 * entram antes de apagar os antigos; se algo falha depois de mexer nos itens, o kit anterior é
 * restaurado. "Nada foi alterado" só aparece quando a restauração foi confirmada. Reenviar é
 * sempre seguro: cada envio substitui a lista inteira pelo que está na tela.
 */
export async function salvarKitComCliente(
  supabase: SupabaseServidor,
  atual: Atual,
  formData: FormData,
): Promise<NonNullable<ResultadoAcao> & { negocioId?: string; pendencias?: Pendencia[] }> {
  const dados = esquemaKit.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const [{ data: negocio }, { data: calculoAtual, error: erroCalculo }, { data: itensAntigos, error: erroAntigos }] = await Promise.all([
    supabase
      .from("negocios")
      .select("valor, consumo_medio_kwh, consumo_estimado_kwh, tarifa_efetiva_kwh, valor_conta_energia, qualif_tipo_cliente, qualif_distribuidora")
      .eq("id", d.negocioId)
      .maybeSingle(),
    supabase
      .from("calculos_solares")
      .select("id, estado_financeiro, kit_nome, kit_potencia_kwp, tipo_ligacao, consumo_medio_kwh, valor_fatura_medio, tarifa_kwh, tarifa_base_tributaria")
      .eq("negocio_id", d.negocioId)
      .maybeSingle(),
    supabase
      .from("kit_componentes")
      .select("id, empresa_id, negocio_id, tipo, descricao, potencia_w, quantidade, ordem")
      .eq("negocio_id", d.negocioId),
  ]);
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };
  // Autorização real (sessão × empresa × negócio) antes de qualquer escrita; empresa e autoria do cálculo vêm daqui.
  const autorizado = await autorizarGravacaoCalculo(supabase, d.negocioId);
  if (!autorizado.ok) return { ok: false, mensagem: `${autorizado.mensagem} Nada foi alterado.` };
  const autorizacao = autorizado.autorizacao;
  if (erroAntigos || !itensAntigos) return { ok: false, mensagem: "Não foi possível ler o kit atual. Nada foi alterado." };
  // Falha ao ler o cálculo nunca vale como "sem cálculo": abriria a remoção do kit protegido.
  if (erroCalculo) return { ok: false, mensagem: MENSAGEM_CALCULO_NAO_CONFERIDO };
  // kWh e fatura vazios no kit não apagam o que já está no negócio: vale o gravado (estimativa, pendências e gravação).
  // Só "Dados do negócio" limpa esses campos.
  const valorFaturaMedio = d.valorFaturaMedio ?? negocio.valor_conta_energia;
  const consumoDoKit = resolverConsumo(d.consumoMedioKwh ?? negocio.consumo_medio_kwh, valorFaturaMedio, negocio.tarifa_efetiva_kwh);
  const consumoMedioKwh = consumoDoKit.kwh ?? negocio.consumo_estimado_kwh;

  // Lista vazia com kit salvo = remover o kit: nunca com cálculo associado e sempre com confirmação.
  if (!d.componentes.length && itensAntigos.length) {
    if (calculoAtual) return { ok: false, mensagem: MENSAGEM_REMOCAO_COM_CALCULO };
    if (d.confirmarRemocao !== "sim") return { ok: false, mensagem: MENSAGEM_REMOCAO_SEM_CONFIRMACAO };
  }

  let montado: Awaited<ReturnType<typeof montarLinhaCalculo>> | null = null;
  if (d.tarifaKwh != null) {
    montado = await montarLinhaCalculo(supabase, autorizacao.empresaId, {
      kitNome: nomeKitPersonalizado(d.componentes),
      potenciaKwp: potenciaKitPersonalizadoKwp(d.componentes),
      precoKit: negocio.valor ?? 0,
      tipoLigacao: d.tipoLigacao,
      consumoMedioKwh,
      valorFaturaMedio,
      tarifaKwh: d.tarifaKwh,
      tarifaBaseTributaria: d.tarifaBaseTributaria,
    }, { tipoCliente: negocio.qualif_tipo_cliente, distribuidoraInformada: negocio.qualif_distribuidora });
    if (!montado.ok && !montado.incompleta) return { ok: false, mensagem: `${montado.mensagem} Nada foi alterado.` };
  }
  // Com consumo em kWh há sempre linha nova (completa ou resultado técnico incompleto com as novas entradas). Linha
  // `legado`/`completo` substituída vai inteira para `calculos_solares_historico` pelo trigger do banco, na mesma
  // instrução do upsert (R6.1; motivo `desatualizado_por_entradas` se a nova é incompleta, R6.2). Linha `incompleto`
  // anterior é só substituída (R6.4). Sem tarifa, ou com conta em R$ sem kWh, não há linha nova: ver `marcarDesatualizado`.
  const linhaNova = montado ? (montado.ok ? montado.linha : montado.incompleta ? montado.linha : null) : null;
  const anteriorComFinanceiro = calculoAtual?.estado_financeiro === "legado" || calculoAtual?.estado_financeiro === "completo";
  // R6.2 sem linha nova: as entradas do formulário diferem das gravadas na linha com parte financeira.
  const entradasMudaram =
    !!calculoAtual &&
    (calculoAtual.kit_nome !== nomeKitPersonalizado(d.componentes) ||
      Number(calculoAtual.kit_potencia_kwp) !== potenciaKitPersonalizadoKwp(d.componentes) ||
      calculoAtual.tipo_ligacao !== d.tipoLigacao ||
      Number(calculoAtual.consumo_medio_kwh) !== (consumoMedioKwh == null ? null : consumoComoPersistido(consumoMedioKwh)) ||
      (calculoAtual.valor_fatura_medio == null ? null : Number(calculoAtual.valor_fatura_medio)) !==
        (valorFaturaMedio == null ? null : valorComoPersistido(valorFaturaMedio, 2)) ||
      (d.tarifaKwh != null && Number(calculoAtual.tarifa_kwh) !== valorComoPersistido(d.tarifaKwh, CASAS_TARIFA)) ||
      (d.tarifaKwh != null && calculoAtual.tarifa_base_tributaria !== d.tarifaBaseTributaria));
  const marcarDesatualizado = !linhaNova && anteriorComFinanceiro && entradasMudaram;

  // Substitui a lista de itens: novos primeiro (uma inserção, tudo ou nada), antigos depois.
  if (d.componentes.length) {
    const { error } = await inserirItensKit(supabase, autorizacao.empresaId, d.negocioId, d.componentes);
    if (error) return { ok: false, mensagem: "Não foi possível salvar os itens do kit. Nada foi alterado." };
  }
  const antigos = itensAntigos.map((i) => i.id);
  if (antigos.length) {
    const { data: apagados, error } = await supabase.from("kit_componentes").delete().in("id", antigos).select("id");
    if (error || apagados?.length !== antigos.length) {
      const restaurado = await restaurarKit(supabase, d.negocioId, itensAntigos);
      return {
        ok: false,
        negocioId: d.negocioId,
        mensagem: restaurado ? "Não foi possível substituir os itens do kit. Nada foi alterado." : `Não foi possível substituir os itens do kit. ${KIT_INCERTO}`,
      };
    }
  }

  if (linhaNova) {
    const { error } = await gravarLinhaCalculo(autorizacao, linhaNova, { observacoes: d.observacoes || null, substituir: true });
    if (error) {
      // O cálculo anterior continua como estava (o upsert é uma instrução só); volta os itens.
      const restaurado = await restaurarKit(supabase, d.negocioId, itensAntigos);
      const motivo = mensagemErro(error, "Não foi possível salvar o cálculo.");
      return {
        ok: false,
        negocioId: d.negocioId,
        mensagem: restaurado ? `${motivo} Nada foi alterado.` : `${motivo} ${KIT_INCERTO}`,
      };
    }
  }

  // R6.2: sem resultado novo, a linha com parte financeira recebe a marca explícita (bloqueia proposta e preço e deixa
  // de aparecer como resultado atual). Sai quando a linha for regravada (R6.3: toda linha nova zera a marca).
  if (marcarDesatualizado) {
    const { data, error } = await marcarCalculoDesatualizado(autorizacao, calculoAtual!.id);
    if (error || !data?.length) {
      const restaurado = await restaurarKit(supabase, d.negocioId, itensAntigos);
      const motivo = mensagemErro(error, "Não foi possível marcar o cálculo anterior como desatualizado.");
      return { ok: false, negocioId: d.negocioId, mensagem: restaurado ? `${motivo} Nada foi alterado.` : `${motivo} ${KIT_INCERTO}` };
    }
  }

  // Consumo e fatura efetivos vão ao negócio: são a fonte atual que a vigência compara. Campo vazio no kit
  // mantém o já gravado (ver `consumoMedioKwh` e `valorFaturaMedio` acima).
  const { data: estrutura, error: erroEstrutura } = await supabase
    .from("negocios")
    .update({
      // A estrutura do telhado saiu do kit (fica com a obra): sem o campo no formulário, mantém o gravado.
      ...(d.estruturaTelhado !== undefined && { estrutura_telhado: d.estruturaTelhado || null }),
      consumo_medio_kwh: consumoDoKit.origem === "informado" ? consumoDoKit.kwh : null,
      consumo_estimado_kwh: consumoDoKit.origem === "estimado" ? consumoDoKit.kwh : consumoDoKit.origem === "ausente" ? negocio.consumo_estimado_kwh : null,
      tarifa_efetiva_kwh: consumoDoKit.origem === "informado" ? null : negocio.tarifa_efetiva_kwh,
      valor_conta_energia: valorFaturaMedio,
    })
    .eq("id", d.negocioId)
    .select("id");
  if (erroEstrutura || !estrutura?.length) {
    return {
      ok: false,
      negocioId: d.negocioId,
      mensagem: `${montado?.ok ? "Kit e cálculo salvos" : linhaNova ? "Kit e resultado técnico salvos" : "Itens do kit salvos"}, mas a estrutura do telhado não foi gravada. Salve de novo.`,
    };
  }

  if (montado?.ok) return { ok: true, negocioId: d.negocioId, mensagem: "Kit e cálculo salvos." };

  // Estimativa incompleta: itens salvos. Com linha nova, o resultado técnico (com as novas entradas) foi gravado; sem
  // ela, o cálculo anterior (se houver) continua gravado, mas não vale como resultado atual.
  const pendencias =
    montado && !montado.ok && montado.incompleta
      ? montado.pendencias
      : pendenciasDaEntrada({ consumoMedioKwh, valorFaturaMedio, tarifaKwh: d.tarifaKwh ?? null, tarifaBaseTributaria: d.tarifaBaseTributaria });
  let sufixo = "";
  if (linhaNova && anteriorComFinanceiro) sufixo = " O cálculo anterior foi guardado no histórico como desatualizado e não vale como resultado atual.";
  else if (marcarDesatualizado) sufixo = " O cálculo anterior foi marcado como desatualizado: as entradas mudaram e ainda não há resultado novo.";
  else if (!linhaNova && calculoAtual && calculoAtual.estado_financeiro !== "completo") {
    sufixo =
      calculoAtual.estado_financeiro === "legado"
        ? " O cálculo anterior foi mantido, mas foi feito pela fórmula antiga (não validada) e não vale como resultado atual."
        : " O cálculo anterior foi mantido, mas não vale como resultado atual.";
  }
  return {
    ok: true,
    negocioId: d.negocioId,
    pendencias,
    mensagem: `${linhaNova ? "Kit e resultado técnico salvos." : "Itens do kit salvos."} ${mensagemEstimativaIncompleta(pendencias)}${sufixo}`,
  };
}

/**
 * Ação explícita do vendedor: leva o valor atual do negócio ao cálculo salvo (`kit_preco`). A economia não depende do
 * preço e o payback é indisponível no P0 (fica nulo). Nada é feito sozinho ao editar o valor, porque a proposta já
 * enviada passaria a mostrar outro preço sem ninguém decidir isso.
 * "Preço bloqueado" significa só isto: recusar ESTA ação quando o cálculo salvo não vale como atual (legado,
 * incompleto, desatualizado). Editar o valor do negócio ("Dados do negócio") nunca é bloqueado.
 */
export async function atualizarPrecoCalculoComCliente(
  supabase: SupabaseServidor,
  atual: Atual,
  negocioId: string,
): Promise<NonNullable<ResultadoAcao> & { negocioId?: string }> {
  const lido = await carregarVigencia(supabase, negocioId);
  if (!lido.ok) {
    return { ok: false, mensagem: lido.negocioAusente ? "Negócio não encontrado." : "Não foi possível conferir o cálculo. Nada foi alterado." };
  }
  const calculo = lido.calculo;
  if (!calculo) return { ok: false, mensagem: "Este negócio ainda não tem cálculo." };
  // Payback novo sobre economia velha seria inconsistente: com linha legada (fórmula antiga, não validada) ou qualquer
  // OUTRO dado desatualizado (kit, consumo, parâmetros, não comprovado), nada é alterado. O preço é o próprio assunto
  // desta ação e fica de fora (`motivosDaAcao`).
  const motivos = motivosDaAcao(lido.vigencia.motivos, "preco");
  if (motivos.length) return { ok: false, mensagem: mensagemDeRecusa(motivos, "preco") };
  if (!precoDoCalculoDesatualizado(calculo.kit_preco, lido.valorNegocio)) return { ok: true, negocioId, mensagem: "O preço do cálculo já está em dia." };
  // Sem economia (estimativa incompleta) não há payback a recalcular; a vigência já recusa, isto é a trava final.
  if (calculo.economia_mensal == null) return { ok: false, mensagem: mensagemDeRecusa(["incompleta"], "preco") };

  const preco = lido.valorNegocio ?? 0;
  const autorizado = await autorizarGravacaoCalculo(supabase, negocioId);
  if (!autorizado.ok) return { ok: false, mensagem: `${autorizado.mensagem} Nada foi alterado.` };
  // Só grava se o cálculo continua com o preço lido (outra edição no meio não é sobrescrita em silêncio). Só a linha
  // `completo` passa pela vigência; nela o payback é sempre nulo (P0; o banco recusa outro valor).
  const { data, error } = await atualizarPrecoDoCalculo(autorizado.autorizacao, calculo.id, calculo.kit_preco, preco);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o cálculo.") };
  if (!data?.length) return { ok: false, mensagem: "O cálculo mudou enquanto você atualizava. Recarregue a página e tente de novo." };
  return { ok: true, negocioId, mensagem: "Preço do cálculo atualizado." };
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

const esquemaDadosClienteContrato = z
  .object({
    contatoId: z.string().uuid(),
    tipo: z.enum(["pf", "pj"]),
    nome: z.string().trim().min(2, "Informe o nome completo").max(200, "Nome muito longo"),
    documento: textoOpcional(20, "CPF/CNPJ muito longo"),
    rg: textoOpcional(30, "RG muito longo"),
    data_nascimento: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v == null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Data de nascimento inválida")
      .refine((v) => v == null || (v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10)), "Data de nascimento fora do intervalo"),
    email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]).transform((v) => v || null),
    telefone: z.string({ error: "Informe o telefone" }).trim().min(1, "Informe o telefone").max(30, "Telefone muito longo"),
    cep: textoOpcional()
      .transform((v) => (v ? soDigitos(v) : null))
      .refine((v) => v == null || v.length === 8, "CEP deve ter 8 dígitos"),
    logradouro: textoOpcional(200, "Rua muito longa"),
    numero: textoOpcional(20, "Número muito longo"),
    bairro: textoOpcional(120, "Bairro muito longo"),
    complemento: textoOpcional(120, "Complemento muito longo"),
    cidade: textoOpcional(120, "Cidade muito longa"),
    uf: ufOpcional,
    inscricao_estadual: textoOpcional(30, "Inscrição estadual muito longa"),
  })
  .superRefine((d, ctx) => {
    if (!d.documento) return;
    const valido = d.tipo === "pj" ? cnpjValido(d.documento) : cpfValido(d.documento);
    if (!valido) ctx.addIssue({ code: "custom", path: ["documento"], message: d.tipo === "pj" ? "CNPJ inválido" : "CPF inválido" });
  });

/**
 * Dados do cliente para o contrato, preenchidos na ficha do negócio. Salva o que vier (pode ser parcial): a trava
 * fica na geração do contrato (`pendenciasDadosContrato` aqui e `pendencias_contrato_contato` no banco). Pessoa
 * jurídica não guarda RG nem nascimento. `endereco` continua em uma linha, montada a partir dos campos novos.
 */
export async function salvarDadosClienteComCliente(supabase: SupabaseServidor, formData: FormData): Promise<NonNullable<ResultadoAcao>> {
  const dados = esquemaDadosClienteContrato.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const { contatoId, ...d } = dados.data;
  const pj = d.tipo === "pj";
  const campos = {
    ...d,
    documento: d.documento ? formatarDocumento(d.documento) : null,
    rg: pj ? null : d.rg,
    data_nascimento: pj ? null : d.data_nascimento,
    inscricao_estadual: pj ? d.inscricao_estadual : null,
    endereco:
      montarEndereco({
        rua: d.logradouro ?? undefined,
        numero: d.numero ?? undefined,
        complemento: d.complemento ?? undefined,
        bairro: d.bairro ?? undefined,
        cep: d.cep ? d.cep.replace(/(\d{5})(\d{3})/, "$1-$2") : undefined,
      }) || null,
  };

  const { data, error } = await supabase.from("contatos").update(campos).eq("id", contatoId).select("id");
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar os dados do cliente.") };
  if (!data?.length) return { ok: false, mensagem: "Não foi possível salvar os dados do cliente." };
  return { ok: true, mensagem: "Dados do cliente salvos." };
}
