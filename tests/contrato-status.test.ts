/**
 * Status do contrato sem banco: a função só devolve sucesso com a gravação comprovada pelo
 * UPDATE (linha devolvida com o status pedido). Cobre os ramos que a RLS real não produz
 * sozinha (UPDATE com 0 linhas ou status diferente).
 */
import { describe, expect, it } from "vitest";
import { atualizarStatusContratoComCliente } from "@/lib/contratos-geracao";
import type { SupabaseServidor } from "@/lib/supabase/server";

type Resposta = { data: unknown; error: { message: string } | null };

function falso({ leitura, gravacao }: { leitura: Resposta; gravacao: Resposta }) {
  const chamadas: string[] = [];
  const cliente = {
    from(tabela: string) {
      chamadas.push(`from:${tabela}`);
      return {
        select() {
          chamadas.push("select");
          return { eq: () => ({ maybeSingle: async () => leitura }) };
        },
        update(valores: unknown) {
          chamadas.push(`update:${JSON.stringify(valores)}`);
          return { eq: () => ({ select: async (colunas: string) => (chamadas.push(`retorno:${colunas}`), gravacao) }) };
        },
      };
    },
  };
  return { cliente: cliente as unknown as SupabaseServidor, chamadas };
}

const PRONTO = { data: { conteudo: "Contrato completo entre as partes." }, error: null };
const args = { membroId: "m1", negocioId: "n1", status: "assinado" as const };

describe("atualizarStatusContratoComCliente", () => {
  it("sucesso só quando o UPDATE devolve a linha com o status pedido", async () => {
    const { cliente, chamadas } = falso({ leitura: PRONTO, gravacao: { data: [{ id: "c1", status: "assinado" }], error: null } });
    expect(await atualizarStatusContratoComCliente(cliente, args)).toEqual({ ok: true, mensagem: "Status atualizado." });
    expect(chamadas).toContain("retorno:id, status");
  });

  it("UPDATE com 0 linhas (RLS ou contrato sumiu) é erro, nunca 'Status atualizado.'", async () => {
    const { cliente } = falso({ leitura: PRONTO, gravacao: { data: [], error: null } });
    const r = await atualizarStatusContratoComCliente(cliente, args);
    expect(r.ok).toBe(false);
    expect(r.mensagem).not.toBe("Status atualizado.");
  });

  it("linha devolvida com outro status é erro", async () => {
    const { cliente } = falso({ leitura: PRONTO, gravacao: { data: [{ id: "c1", status: "aguardando_assinatura" }], error: null } });
    expect((await atualizarStatusContratoComCliente(cliente, args)).ok).toBe(false);
  });

  it("contrato inexistente: erro sem tentar gravar", async () => {
    const { cliente, chamadas } = falso({ leitura: { data: null, error: null }, gravacao: { data: [], error: null } });
    expect(await atualizarStatusContratoComCliente(cliente, args)).toEqual({ ok: false, mensagem: "Contrato não encontrado." });
    expect(chamadas.some((c) => c.startsWith("update"))).toBe(false);
  });

  it("erro do banco na gravação vira mensagem de erro", async () => {
    const { cliente } = falso({ leitura: PRONTO, gravacao: { data: null, error: { message: "falhou" } } });
    expect((await atualizarStatusContratoComCliente(cliente, args)).ok).toBe(false);
  });
});
