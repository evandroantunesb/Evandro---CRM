"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { esquemaEntradaCondicoes, type EntradaCondicoes } from "@/lib/condicoes-pagamento-proposta";
import { carregarRegrasCondicoes } from "@/lib/condicoes-pagamento-dados";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { NEGOCIOS, PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import { ultimaVersaoDoNegocio } from "@/lib/propostas/emissoes-dados";
import { gravarEmissaoSimples } from "@/lib/propostas/emissoes-gravacao";
import { prepararImagensDaEmissao } from "@/lib/propostas/imagens-emissao";
import { extrairConteudoDoModelo, montarDadosEmissaoSimples, produtividadeConfirmada } from "@/lib/propostas/proposta-simples";
import { carregarSituacaoEconomia } from "@/lib/propostas/economia-servidor";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  negocioId: z.string().uuid(),
  validadeAte: z.string().trim(),
  // JSON com o que o vendedor marcou; o formato e as regras são conferidos na montagem (condicoes-pagamento.ts).
  condicoes: z.string().max(20000),
  // O que o vendedor VIU na tela: se a confirmação da produtividade mudou antes do clique, a emissão é recusada.
  geracaoEsperada: z.enum(["sim", "nao"]),
  // Idem para a economia: se o cálculo do kit ou o modelo mudou e ela passaria a entrar ou sair, o vendedor confere.
  economiaEsperada: z.enum(["sim", "nao"]),
  // Preço que a tela usou nas contas das condições (desconto, parcelas): se mudou, o vendedor revê antes de emitir.
  precoEsperado: z.coerce.number(),
});

/** JSON das condições enviado pela tela; malformado = nenhuma condição (a montagem pede para marcar uma). */
function lerEntradaCondicoes(texto: string): EntradaCondicoes | null {
  try {
    const lida = esquemaEntradaCondicoes.safeParse(JSON.parse(texto));
    return lida.success ? lida.data : null;
  } catch {
    return null;
  }
}

/**
 * Emite a proposta (esquema 7): congela os dados exibidos, gera o
 * PDF UMA vez, guarda no bucket privado e grava a linha imutável com link e arquivo próprios. Emitir de novo cria a
 * próxima versão; nada emitido é alterado.
 *
 * Nada vem do cálculo salvo (`calculos_solares`, legado): potência = módulos do kit atual; geração = potência ×
 * produtividade da empresa, SÓ se o admin confirmou esse valor (senão a proposta sai sem geração); consumo e preço
 * = os do negócio. Ver `proposta-simples.ts`. A economia (conta, retorno e os anos escolhidos no modelo) só entra com o
 * cálculo v2 do kit vigente e algum bloco de economia ativo; senão a proposta sai sem ela (`economia-emissao.ts`). As condições de pagamento são conferidas aqui contra as regras da empresa e
 * o desconto permitido a quem emite (`montarCondicoesPagamento`); o valor do negócio não muda na emissão.
 */
export async function emitirPropostaSimples(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "SDR não pode emitir proposta." };
  const dados = esquema.safeParse({
    negocioId: formData.get("negocioId"),
    validadeAte: formData.get("validadeAte") ?? "",
    condicoes: formData.get("condicoes") ?? "",
    geracaoEsperada: formData.get("geracaoEsperada"),
    economiaEsperada: formData.get("economiaEsperada"),
    precoEsperado: formData.get("precoEsperado") ?? "",
  });
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };
  const { negocioId } = dados.data;

  const supabase = await criarClienteServidor();

  const [negocioR, componentesR, parametrosR, identidadeR, modeloR, ultima, regrasCondicoes] = await Promise.all([
    supabase
      .from("negocios")
      .select("empresa_id, valor, consumo_medio_kwh, consumo_mensal_kwh, arquivado_em, contatos(nome, endereco, cidade, uf)")
      .eq("id", negocioId)
      .maybeSingle(),
    supabase.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade").eq("negocio_id", negocioId).order("ordem"),
    supabase
      .from("parametros_calculadora")
      .select("produtividade_kwh_kwp_mes, produtividade_confirmada_valor, produtividade_confirmada_em, produtividade_confirmada_fonte, produtividade_confirmada_responsavel, curva_geracao_mensal")
      .eq("empresa_id", atual.empresaId)
      .maybeSingle(),
    supabase.from("proposta_identidades").select("nome_exibicao, cor_primaria, cor_destaque, whatsapp, logo_url, logo_escuro_url, foto_capa_url").eq("empresa_id", atual.empresaId).maybeSingle(),
    // Só leitura: conteúdo que a empresa escreveu no modelo padrão publicado. O modelo nunca é alterado.
    supabase
      .from("proposta_modelos")
      .select("proposta_modelo_blocos(tipo, ativo, config)")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "publicado")
      .eq("padrao", true)
      .maybeSingle(),
    ultimaVersaoDoNegocio(supabase, negocioId),
    carregarRegrasCondicoes(supabase, atual.empresaId, negocioId),
  ]);
  if (negocioR.error || componentesR.error || parametrosR.error || identidadeR.error || modeloR.error || ultima.erro || !regrasCondicoes) {
    return { ok: false, mensagem: "Não foi possível ler os dados do negócio. Tente de novo." };
  }
  const negocio = negocioR.data;
  if (!negocio || negocio.empresa_id !== atual.empresaId) return { ok: false, mensagem: "Negócio não encontrado." };
  if (negocio.arquivado_em) return { ok: false, mensagem: "Negócio arquivado: não é possível emitir proposta." };
  const contato = negocio.contatos as unknown as { nome: string; endereco: string | null; cidade: string | null; uf: string | null } | null;
  const identidade = identidadeR.data;
  const conteudo = extrairConteudoDoModelo(modeloR.data?.proposta_modelo_blocos);

  const geracaoAgora = produtividadeConfirmada(parametrosR.data) != null;
  if ((dados.data.geracaoEsperada === "sim") !== geracaoAgora) {
    revalidatePath(`/negocios/${negocioId}`);
    return { ok: false, mensagem: "A confirmação da produtividade mudou desde que a tela abriu. Confira o aviso de geração e emita de novo. Nada foi emitido." };
  }

  // Economia: só com bloco de economia ativo no modelo e o cálculo v2 do kit vigente; senão a proposta sai sem ela.
  const economia = await carregarSituacaoEconomia(supabase, negocioId, modeloR.data?.proposta_modelo_blocos);
  if ((dados.data.economiaEsperada === "sim") !== economia.entra) {
    revalidatePath(`/negocios/${negocioId}`);
    return { ok: false, mensagem: "O cálculo do kit ou o modelo de proposta mudou desde que a tela abriu. Confira o aviso de economia e emita de novo. Nada foi emitido." };
  }

  if (Math.round((negocio.valor ?? 0) * 100) !== Math.round(dados.data.precoEsperado * 100)) {
    revalidatePath(`/negocios/${negocioId}`);
    return { ok: false, mensagem: "O valor do negócio mudou desde que a tela abriu. Confira as condições de pagamento e emita de novo. Nada foi emitido." };
  }

  const versao = ultima.versao + 1;
  const emitidaEm = new Date().toISOString();
  const montagem = montarDadosEmissaoSimples({
    contatoNome: contato?.nome ?? null,
    contatoEndereco: contato ? [contato.endereco, contato.cidade, contato.uf].filter(Boolean).join(" · ") : null,
    valorNegocio: negocio.valor,
    consumoMedioKwhNegocio: negocio.consumo_medio_kwh,
    // Gráfico mês a mês (proposta completa, PR 4): curva da empresa e consumo dos 12 meses do negócio, congelados aqui.
    curvaGeracao: parametrosR.data?.curva_geracao_mensal?.map(Number) ?? null,
    consumoMensalKwhNegocio: negocio.consumo_mensal_kwh?.map(Number) ?? null,
    componentes: componentesR.data ?? [],
    // Sem confirmação do admin para o valor ATUAL da produtividade, a proposta sai sem o número de geração.
    produtividadeConfirmada: produtividadeConfirmada(parametrosR.data),
    validadeAte: dados.data.validadeAte || null,
    condicoes: { entrada: lerEntradaCondicoes(dados.data.condicoes), regras: regrasCondicoes },
    conteudo,
    identidade: {
      nomeExibicao: identidade?.nome_exibicao ?? "",
      corPrimaria: identidade?.cor_primaria ?? "",
      corDestaque: identidade?.cor_destaque ?? "",
      whatsapp: identidade?.whatsapp ?? "",
    },
    versao,
    emitidaEm,
    hoje: hojeEmSaoPaulo(),
    economia: economia.entra ? economia.economia : null,
  });
  if (!montagem.ok) return { ok: false, mensagem: montagem.pendencias.join(" ") };

  // PDF único: as imagens são lidas AGORA e embutidas no arquivo. Logo configurado que não carrega recusa a emissão;
  // foto de capa ausente ou que não carrega usa o fundo sólido definido (ver imagens-emissao.ts).
  const admin = criarClienteAdmin();
  const imagensR = await prepararImagensDaEmissao(
    async (caminho) => {
      // Acesso do usuário que emite (política "marca: ler"), não a service role.
      const { data } = await supabase.storage.from("proposta-marca").download(caminho);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
    // Fundo escuro: usa o logo para fundo escuro quando houver.
    { logo: identidade?.logo_escuro_url ?? identidade?.logo_url, foto: identidade?.foto_capa_url },
    atual.empresaId,
  );
  if (!imagensR.ok) return { ok: false, mensagem: imagensR.mensagem };

  const gravada = await gravarEmissaoSimples({
    supabase,
    admin,
    empresaId: atual.empresaId,
    negocioId,
    membroId: atual.membroId,
    dados: montagem.dados,
    imagens: imagensR.imagens,
  });
  if (!gravada.ok) return { ok: false, mensagem: gravada.mensagem };

  revalidatePath(`/negocios/${negocioId}`);
  return { ok: true, mensagem: `Proposta v${gravada.versao} emitida.` };
}
