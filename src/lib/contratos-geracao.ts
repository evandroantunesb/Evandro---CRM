import "server-only";
import {
  camposSemDado,
  contratoProntoParaCliente,
  marcadoresPendentes,
  montarDadosContrato,
  preencherModeloContrato,
  validarModeloContrato,
  type FontesContrato,
} from "@/lib/contrato";
import { mensagemErro } from "@/lib/erros";
import { formatarMoeda } from "@/lib/formatacao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { ResultadoAcao, StatusContrato } from "@/lib/tipos";

/**
 * Núcleo da geração e da mudança de status do contrato. O cliente vem por parâmetro (as ações
 * em `@/lib/acoes/contratos` cuidam de sessão, papel e revalidação; os testes de banco chamam
 * direto com o cliente de cada usuário). Tudo sob a RLS de quem chama.
 */

/** Gera (ou regera, enquanto ainda for rascunho) o contrato do negócio a partir do modelo da empresa. */
export async function gerarContratoComCliente(
  supabase: SupabaseServidor,
  { empresaId, membroId, negocioId, agora = new Date() }: { empresaId: string; membroId: string; negocioId: string; agora?: Date },
): Promise<NonNullable<ResultadoAcao>> {
  const [{ data: modelo }, { data: negocio }, { data: calculo }, { data: itensKit }, { data: empresa }, { data: existente }, { data: identidades }] =
    await Promise.all([
      supabase.from("modelos_contrato").select("conteudo").eq("empresa_id", empresaId).maybeSingle(),
      supabase
        .from("negocios")
        .select(
          "titulo, numero, valor, unidade_consumidora, qualif_distribuidora, consumo_medio_kwh, responsavel_id, contatos(nome, documento, endereco, cidade, uf, email, telefone, telefone2)",
        )
        .eq("id", negocioId)
        .maybeSingle(),
      supabase
        .from("calculos_solares")
        .select("kit_nome, kit_potencia_kwp, tipo_ligacao, consumo_medio_kwh, geracao_estimada_kwh_mes")
        .eq("negocio_id", negocioId)
        .maybeSingle(),
      supabase.from("kit_componentes").select("descricao, quantidade, potencia_w").eq("negocio_id", negocioId).order("ordem"),
      supabase.from("empresas").select("nome, cnpj").eq("id", empresaId).maybeSingle(),
      supabase.from("contratos").select("id, status").eq("negocio_id", negocioId).maybeSingle(),
      // Nome do vendedor responsável (só nome; nunca e-mail ou telefone).
      supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
    ]);
  if (!modelo?.conteudo.trim()) return { ok: false, mensagem: "Cadastre o modelo de contrato em Configurações antes." };
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };
  if (existente && existente.status !== "rascunho") {
    return { ok: false, mensagem: "Este contrato já saiu do rascunho — o texto não muda mais automaticamente." };
  }
  // Modelo salvo antes da validação pode ter campo desconhecido: não gera.
  const validacao = validarModeloContrato(modelo.conteudo);
  if (validacao.desconhecidos.length || validacao.chavesSoltas) {
    return { ok: false, mensagem: "O modelo de contrato tem campos inválidos. Peça ao admin para corrigir em Configurações." };
  }

  const dados = montarDadosContrato({
    empresa,
    negocio,
    contato: negocio.contatos as unknown as FontesContrato["contato"],
    calculo,
    itensKit: itensKit ?? [],
    vendedorNome: (identidades ?? []).find((m) => m.membro_id === negocio.responsavel_id)?.nome ?? null,
    agora,
    formatarMoeda: (v) => formatarMoeda(v),
  });
  // Todo campo usado no modelo precisa de dado: o contrato não sai com "—" no lugar de informação.
  const faltando = camposSemDado(modelo.conteudo, dados);
  if (faltando.length) return { ok: false, mensagem: `Para gerar o contrato, preencha: ${faltando.join(", ")}.` };

  const conteudoPreenchido = preencherModeloContrato(modelo.conteudo, dados);
  if (!contratoProntoParaCliente(conteudoPreenchido)) {
    return { ok: false, mensagem: `O contrato ficaria com campos sem resolver: ${marcadoresPendentes(conteudoPreenchido).join(", ") || "chaves sem par"}.` };
  }

  const { error } = await supabase.from("contratos").upsert(
    { empresa_id: empresaId, negocio_id: negocioId, conteudo: conteudoPreenchido, criado_por: membroId, atualizado_por: membroId },
    { onConflict: "negocio_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar o contrato.") };
  return { ok: true, mensagem: "Contrato pronto." };
}

/** Muda o status; enviar para assinatura ou marcar assinado só com o texto completo (contrato antigo pode ter sobra). */
export async function atualizarStatusContratoComCliente(
  supabase: SupabaseServidor,
  { membroId, negocioId, status }: { membroId: string; negocioId: string; status: StatusContrato },
): Promise<NonNullable<ResultadoAcao>> {
  if (status !== "rascunho") {
    const { data: contrato } = await supabase.from("contratos").select("conteudo").eq("negocio_id", negocioId).maybeSingle();
    if (contrato && !contratoProntoParaCliente(contrato.conteudo)) {
      return { ok: false, mensagem: "O contrato tem campos sem resolver. Corrija o modelo e gere o contrato de novo." };
    }
  }
  const { error } = await supabase.from("contratos").update({ status, atualizado_por: membroId }).eq("negocio_id", negocioId);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o status.") };
  return { ok: true, mensagem: "Status atualizado." };
}
