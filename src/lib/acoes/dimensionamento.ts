"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcular, componentesJsonSchema, DISPONIBILIDADE_PADRAO } from "@/lib/calculadora";
import { avaliarCombinacaoEscolhida, paraEquipamentoAtivo } from "@/lib/dimensionamento";
import { CAMPOS_DIMENSIONAMENTO } from "@/lib/dimensionamento-campos";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import type { Database } from "@/lib/supabase/database.types";
import { criarClienteServidor, type SupabaseServidor } from "@/lib/supabase/server";
import { TIPOS_LIGACAO, type ResultadoAcao, type TipoLigacao } from "@/lib/tipos";

type LinhaDimensionamento = Database["public"]["Tables"]["dimensionamentos_solares"]["Insert"];

/**
 * Fonte única de persistência do dimensionamento solar (pedido do Evandro,
 * 2026-09-30, após o diagnóstico apontar 3 motores de cálculo divergentes na
 * mesma tela). Recebe só a escolha do vendedor (módulo, inversor, quantidade,
 * consumo, tarifa) e busca ela mesma, no servidor, tudo que é autoritativo
 * (o equipamento cadastrado, a margem/overload máximo/temperatura da
 * empresa) — nunca confia em quantidade/potência/overload calculados no
 * cliente. Roda o mesmo motor de `src/lib/dimensionamento.ts` usado na
 * sugestão automática, então uma combinação escolhida manualmente passa
 * pelas mesmas validações elétricas.
 *
 * Compartilhada entre a criação do negócio (chamada por `criarNegocio`) e,
 * quando a Etapa B da unificação estiver pronta, a tela de edição do sistema.
 */
export async function salvarDimensionamento(
  supabase: SupabaseServidor,
  empresaId: string,
  membroId: string,
  entrada: {
    negocioId: string;
    moduloEquipamentoId: string;
    inversorEquipamentoId: string;
    quantidadeModulos: number;
    tipoLigacao: TipoLigacao;
    consumoMedioKwh: number | null;
    valorFaturaMedio: number | null;
    tarifaKwh: number;
    origemTarifa: "manual" | "aneel";
    produtividadeKwhKwpMes?: number | null;
    origemProdutividade?: "pvgis" | "nasa";
    precoNegocio: number;
    // Origem da escolha de módulo/inversor (Fase 5 da reconciliação, Evandro, 2026-10-01):
    // "automatico" (opção sugerida pelo motor, o padrão) ou "manual" (vendedor trocou pelo
    // seletor manual do painel, fora da sugestão). Decide a `origem` gravada em `kit_componentes`
    // e, via o trigger `registrar_override_manual_componente`, se um override fica registrado na
    // linha do tempo do negócio.
    origemEscolha?: "automatico" | "manual";
  },
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  if (entrada.consumoMedioKwh == null && entrada.valorFaturaMedio == null) {
    return { ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura." };
  }

  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!parametros) return { ok: false, mensagem: "Parâmetros da calculadora não configurados." };

  const { data: equipamentos } = await supabase
    .from("equipamentos_empresa")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .in("id", [entrada.moduloEquipamentoId, entrada.inversorEquipamentoId]);
  const moduloRow = equipamentos?.find((e) => e.id === entrada.moduloEquipamentoId && e.tipo === "modulo");
  const inversorRow = equipamentos?.find((e) => e.id === entrada.inversorEquipamentoId && e.tipo === "inversor");
  if (!moduloRow || !inversorRow) {
    return { ok: false, mensagem: "Módulo ou inversor não encontrado no catálogo ativo da empresa." };
  }

  const opcao = avaliarCombinacaoEscolhida(
    paraEquipamentoAtivo(moduloRow),
    paraEquipamentoAtivo(inversorRow),
    entrada.quantidadeModulos,
    parametros.overload_maximo_pct,
    parametros.overload_critico_pct,
    parametros.temperatura_minima_projeto_c,
  );
  // `avaliarCombinacaoEscolhida` retorna `null` só pra quantidade inválida; quando o arranjo
  // elétrico não é seguro, devolve a opção com `validacaoEletrica: "incompativel"` e um motivo
  // (ver src/lib/dimensionamento.ts) — aqui ainda tratamos os dois casos como erro de salvamento,
  // só usando a mensagem específica quando ela existe.
  if (!opcao || opcao.validacaoEletrica === "incompativel") {
    return {
      ok: false,
      mensagem:
        opcao?.motivoIncompatibilidade ??
        "Essa quantidade de módulos não forma um arranjo eletricamente compatível com o inversor escolhido.",
    };
  }

  const origemEscolha = entrada.origemEscolha ?? "automatico";
  const consumoMedioKwh = entrada.consumoMedioKwh ?? entrada.valorFaturaMedio! / entrada.tarifaKwh;
  const produtividadeValida = entrada.produtividadeKwhKwpMes != null && entrada.produtividadeKwhKwpMes > 0;
  const produtividadeKwhKwpMes = produtividadeValida ? entrada.produtividadeKwhKwpMes! : parametros.produtividade_kwh_kwp_mes;
  const origemProdutividade = produtividadeValida ? (entrada.origemProdutividade ?? "pvgis") : "padrao";

  const disponibilidadeKwh = parametros[DISPONIBILIDADE_PADRAO[entrada.tipoLigacao]] as number;
  const resultado = calcular({
    potenciaKwp: opcao.potenciaDcKwp,
    precoKit: entrada.precoNegocio,
    tipoLigacao: entrada.tipoLigacao,
    consumoMedioKwh,
    tarifaKwh: entrada.tarifaKwh,
    produtividadeKwhKwpMes,
    percentualFioB: parametros.percentual_fio_b,
    disponibilidadeKwh,
  });

  const linha: LinhaDimensionamento = {
    empresa_id: empresaId,
    negocio_id: entrada.negocioId,
    modulo_equipamento_id: moduloRow.id,
    inversor_equipamento_id: inversorRow.id,
    quantidade_modulos: opcao.quantidadeModulos,
    potencia_dc_kwp: opcao.potenciaDcKwp,
    potencia_ac_kw: opcao.potenciaAcKw,
    dc_ac_ratio: opcao.dcAcRatio,
    overload_pct: opcao.overloadPct,
    validacao: opcao.validacao,
    validacao_eletrica: opcao.validacaoEletrica,
    margem_dimensionamento_pct: parametros.margem_dimensionamento_pct,
    overload_maximo_pct: parametros.overload_maximo_pct,
    overload_critico_pct: parametros.overload_critico_pct,
    temperatura_minima_projeto_c: parametros.temperatura_minima_projeto_c,
    consumo_medio_kwh: consumoMedioKwh,
    valor_fatura_medio: entrada.valorFaturaMedio,
    produtividade_kwh_kwp_mes: produtividadeKwhKwpMes,
    origem_produtividade: origemProdutividade,
    tarifa_kwh: entrada.tarifaKwh,
    origem_tarifa: entrada.origemTarifa,
    origem_selecao_equipamentos: origemEscolha,
    tipo_ligacao: entrada.tipoLigacao,
    disponibilidade_kwh: disponibilidadeKwh,
    preco_negocio: entrada.precoNegocio,
    geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
    economia_mensal: resultado.economiaMensal,
    payback_meses: entrada.precoNegocio > 0 ? resultado.paybackMeses : null,
    criado_por: membroId,
    atualizado_por: membroId,
  };

  const { error } = await supabase.from("dimensionamentos_solares").upsert(linha, { onConflict: "negocio_id" });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o dimensionamento.") };

  // Ponte temporária (Etapa A): `calculos_solares`/`kit_componentes` ainda são a fonte que a
  // proposta (`negocios/[id]/proposta.tsx`) e a tela de edição (`kit-personalizado.tsx`) leem.
  // Copia o MESMO resultado já calculado acima — não recalcula por uma segunda implementação.
  // Sai quando a Etapa C apontar a proposta direto pra `dimensionamentos_solares`.
  await supabase.from("calculos_solares").upsert(
    {
      empresa_id: empresaId,
      negocio_id: entrada.negocioId,
      kit_id: null,
      kit_nome: `${moduloRow.fabricante} ${moduloRow.modelo} (${opcao.quantidadeModulos}x) + ${inversorRow.fabricante} ${inversorRow.modelo}`,
      kit_potencia_kwp: opcao.potenciaDcKwp,
      kit_preco: entrada.precoNegocio,
      tipo_ligacao: entrada.tipoLigacao,
      consumo_medio_kwh: consumoMedioKwh,
      valor_fatura_medio: entrada.valorFaturaMedio,
      tarifa_kwh: entrada.tarifaKwh,
      produtividade_kwh_kwp_mes: produtividadeKwhKwpMes,
      percentual_fio_b: parametros.percentual_fio_b,
      disponibilidade_kwh: disponibilidadeKwh,
      geracao_estimada_kwh_mes: resultado.geracaoEstimadaKwhMes,
      kwh_faturado: resultado.kwhFaturado,
      kwh_compensado: resultado.kwhCompensado,
      custo_fio_b: resultado.custoFioB,
      conta_sem_solar: resultado.contaSemSolar,
      conta_com_solar: resultado.contaComSolar,
      economia_mensal: resultado.economiaMensal,
      payback_meses: entrada.precoNegocio > 0 ? resultado.paybackMeses : null,
      atualizado_por: membroId,
      criado_por: membroId,
    },
    { onConflict: "negocio_id" },
  );
  // Slot do núcleo do motor (`eh_nucleo_motor = true`): no máximo 1 módulo principal ATIVO e 1
  // inversor principal ATIVO por negócio, sempre — nunca duas linhas ativas concorrentes pro mesmo
  // papel (módulo ou inversor), seja a origem automática ou manual. Trocar o módulo/inversor
  // principal (automático→manual, manual→automático, ou manual→outro manual) marca a linha
  // anterior como `ativo = false` em vez de apagá-la (DELETE), preservando o histórico pra
  // auditoria — o índice único parcial `kit_componentes_nucleo_ativo_unico` garante que só uma
  // linha de cada papel fique ativa. Nunca toca nos itens que o vendedor adicionou/editou
  // manualmente (bateria, estrutura, outros — `eh_nucleo_motor = false`, sempre preservados,
  // múltiplos permitidos). Risco de duplicata identificado na Fase 5, corrigido na Fase 6 — Evandro,
  // 2026-10-01 (ver migration 20261001040000_kit_componentes_nucleo_motor.sql). A troca em si fica
  // auditada na linha do tempo do negócio pelo trigger `registrar_override_manual_componente`
  // (dispara no UPDATE de `dimensionamentos_solares` feito acima, antes desta troca de kit).
  await supabase
    .from("kit_componentes")
    .update({ ativo: false })
    .eq("negocio_id", entrada.negocioId)
    .eq("eh_nucleo_motor", true)
    .eq("ativo", true);
  await supabase.from("kit_componentes").insert([
    {
      empresa_id: empresaId,
      negocio_id: entrada.negocioId,
      tipo: "modulo" as const,
      descricao: `${moduloRow.fabricante} ${moduloRow.modelo}`,
      potencia_w: moduloRow.potencia_w,
      quantidade: opcao.quantidadeModulos,
      ordem: 0,
      origem: origemEscolha,
      eh_nucleo_motor: true,
      ativo: true,
    },
    {
      empresa_id: empresaId,
      negocio_id: entrada.negocioId,
      tipo: "inversor" as const,
      descricao: `${inversorRow.fabricante} ${inversorRow.modelo}`,
      potencia_w: inversorRow.potencia_w,
      quantidade: 1,
      ordem: 1,
      origem: origemEscolha,
      eh_nucleo_motor: true,
      ativo: true,
    },
  ]);

  return { ok: true };
}

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

const numeroBrOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  })
  .pipe(z.number().positive().nullable());

// Campos do painel de dimensionamento (hidden inputs simples, sem formatação BR) — mesmo padrão
// de src/lib/acoes/negocios.ts (criarNegocio), que lê os mesmos nomes de CAMPOS_DIMENSIONAMENTO.
const numeroOpcional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? Number(v) : null))
  .pipe(z.number().positive().nullable());

const inteiroOpcional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? Number(v) : null))
  .pipe(z.number().int().positive().nullable());

const esquemaKitNegocio = z.object({
  negocioId: z.string().uuid(),
  estruturaTelhado: z.string().trim().max(120).optional(),
  tipoLigacao: z.enum(TIPOS_LIGACAO).optional(),
  consumoMedioKwh: numeroBrOpcional,
  valorFaturaMedio: numeroBrOpcional,
  tarifaKwh: numeroBrOpcional,
  origemTarifa: z.enum(["manual", "aneel"]).optional().default("manual"),
  // Itens avulsos do kit (bateria, estrutura, acessórios ou módulo/inversor fora do núcleo do
  // motor) — nunca inclui o módulo/inversor que o painel de dimensionamento administra, que chega
  // pelos campos CAMPOS_DIMENSIONAMENTO abaixo.
  componentes: componentesJsonSchema,
  observacoes: z.string().trim().max(2000, "Máximo de 2.000 caracteres").optional(),
  [CAMPOS_DIMENSIONAMENTO.moduloId]: uuidOpcional,
  [CAMPOS_DIMENSIONAMENTO.inversorId]: uuidOpcional,
  [CAMPOS_DIMENSIONAMENTO.quantidadeModulos]: inteiroOpcional,
  [CAMPOS_DIMENSIONAMENTO.produtividadeKwhKwpMes]: numeroOpcional,
  [CAMPOS_DIMENSIONAMENTO.origemProdutividade]: z.enum(["pvgis", "nasa"]).optional(),
  [CAMPOS_DIMENSIONAMENTO.origemEscolha]: z.enum(["automatico", "manual"]).optional(),
});

/**
 * Salva o sistema (módulo/inversor via o motor de dimensionamento) e os itens avulsos do kit
 * (bateria, estrutura, etc.) de um negócio já existente — a tela "Editar sistema"
 * (`negocios/[id]/kit-personalizado.tsx`, Fase 6 da reconciliação, Evandro, 2026-10-01), que
 * reusa o MESMO `<PainelDimensionamento>`/`useDimensionamento` da Etapa 2 do wizard de criação em
 * vez de ter um caminho de cálculo próprio. Substitui `salvarKitPersonalizado`
 * (`src/lib/acoes/calculadora.ts`), que calculava por fora do motor real.
 */
export async function salvarKitNegocio(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaKitNegocio.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;
  if (d.consumoMedioKwh == null && d.valorFaturaMedio == null) {
    return { ok: false, mensagem: "Informe o consumo médio ou o valor médio da fatura." };
  }
  if (!d.tipoLigacao || d.tarifaKwh == null || !d.dimensionamento_modulo_id || !d.dimensionamento_inversor_id || !d.dimensionamento_quantidade_modulos) {
    return {
      ok: false,
      mensagem: "Confirme a rede elétrica, a tarifa e escolha um módulo/inversor do catálogo ativo pra calcular o sistema.",
    };
  }

  const supabase = await criarClienteServidor();
  const { data: negocio } = await supabase.from("negocios").select("valor").eq("id", d.negocioId).maybeSingle();
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };

  const resultado = await salvarDimensionamento(supabase, atual.empresaId, atual.membroId, {
    negocioId: d.negocioId,
    moduloEquipamentoId: d.dimensionamento_modulo_id,
    inversorEquipamentoId: d.dimensionamento_inversor_id,
    quantidadeModulos: d.dimensionamento_quantidade_modulos,
    tipoLigacao: d.tipoLigacao,
    consumoMedioKwh: d.consumoMedioKwh,
    valorFaturaMedio: d.valorFaturaMedio,
    tarifaKwh: d.tarifaKwh,
    origemTarifa: d.origemTarifa,
    produtividadeKwhKwpMes: d.dimensionamento_produtividade_kwh_kwp_mes,
    origemProdutividade: d.dimensionamento_origem_produtividade,
    origemEscolha: d.dimensionamento_origem_escolha,
    precoNegocio: negocio.valor ?? 0,
  });
  if (!resultado.ok) return resultado;

  await supabase.from("negocios").update({ estrutura_telhado: d.estruturaTelhado || null }).eq("id", d.negocioId);

  if (d.observacoes !== undefined) {
    await supabase.from("calculos_solares").update({ observacoes: d.observacoes || null }).eq("negocio_id", d.negocioId);
  }

  // Itens avulsos (bateria, estrutura, acessórios, ou módulo/inversor extra fora do núcleo do
  // motor) — substitui só `eh_nucleo_motor = false`; o núcleo já foi tratado por
  // `salvarDimensionamento` acima, que nunca toca nessas linhas.
  await supabase.from("kit_componentes").delete().eq("negocio_id", d.negocioId).eq("eh_nucleo_motor", false);
  if (d.componentes.length) {
    const { error: erroComponentes } = await supabase.from("kit_componentes").insert(
      d.componentes.map((c, i) => ({
        empresa_id: atual.empresaId,
        negocio_id: d.negocioId,
        tipo: c.tipo,
        descricao: c.descricao,
        potencia_w: c.potenciaW,
        quantidade: c.quantidade,
        ordem: 100 + i,
        origem: "manual" as const,
        eh_nucleo_motor: false,
      })),
    );
    if (erroComponentes) {
      return { ok: false, mensagem: "Sistema salvo, mas não foi possível salvar os itens avulsos do kit." };
    }
  }

  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Sistema salvo." };
}
